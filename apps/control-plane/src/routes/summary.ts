import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import { Type } from "typebox";
import { WORKER_STALE_SECONDS } from "../kernel/execution/workers.js";
import { access, findWorkspace } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { workspaceReferences } from "../kernel/references.js";
import { Id, TenantParams, WorkspaceParams } from "./shared.js";

/** A count the caller may not see is null, never zero: zero would claim something. */
const Count = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
const Version = Type.Union([Type.Integer(), Type.Null()]);

const WorkspaceSummary = Type.Object({
  drafts: Count,
  failedRuns: Type.Object({
    count: Count,
    since: Type.String({ format: "date-time" }),
  }),
  unboundConnections: Count,
  approvalsWaiting: Count,
  git: Type.Union([
    Type.Object({
      state: Type.String({ description: "never, synced, ahead, behind, conflict or error." }),
    }),
    Type.Null(),
  ]),
  version: Version,
  linked: Type.Union([
    Type.Object({
      id: Id,
      name: Type.String(),
      type: Type.Union([Type.Literal("production"), Type.Literal("dev")]),
      version: Version,
      same: Type.Boolean({ description: "Whether it runs the same bundle as this workspace." }),
    }),
    Type.Null(),
  ]),
});

const TenantSummary = Type.Object({
  workspaces: Count,
  approvalsWaiting: Count,
  domainsToFix: Count,
  workersOnline: Count,
  operatorAccessActive: Count,
  members: Count,
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counts for the console's navigation and header: what needs attention, in one
 * request instead of one per list. Each count is given only to whoever may read
 * what it counts.
 */
export function summaryRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    const count = async (query: Promise<{ n: string | number | bigint } | undefined>) =>
      Number((await query)?.n ?? 0);

    app.get(
      "/tenants/:t/workspaces/:w/summary",
      {
        config: { access: access.workspace("workspace:read") },
        schema: {
          summary: "What needs attention in a workspace",
          description:
            "Drafts, failed runs over the last 24 hours, connections with nothing bound, " +
            "approvals waiting, git state and the version that runs here and where it promotes to. " +
            "A count the caller may not read is null.",
          tags: ["workspaces"],
          params: WorkspaceParams,
          response: { 200: WorkspaceSummary },
        },
      },
      async ({ ctx, params }) => {
        await findWorkspace(kernel, params.t, params.w);
        const workspace = await db
          .selectFrom("workspace")
          .select(["active_bundle_id", "linked_workspace_id"])
          .where("id", "=", params.w)
          .executeTakeFirstOrThrow();
        const at = { tenantId: params.t, workspaceId: params.w };
        const may = async (permission: string) => ctx.allowed(permission, at);
        const since = new Date(Date.now() - DAY_MS);

        const [readResources, readRuns, readFlowRuns, readConnections, readApprovals, readGit] =
          await Promise.all([
            may("resource:read"),
            may("run:read"),
            may("flow_run:read"),
            may("connection:read"),
            may("approval:read"),
            may("git:read"),
          ]);

        const drafts = readResources
          ? await count(
              db
                .selectFrom("resource_draft")
                .select((eb) => eb.fn.countAll().as("n"))
                .where("workspace_id", "=", params.w)
                .executeTakeFirst(),
            )
          : null;

        let failed: number | null = null;
        if (readRuns || readFlowRuns) {
          failed = 0;
          if (readRuns)
            failed += await count(
              db
                .selectFrom("run")
                .select((eb) => eb.fn.countAll().as("n"))
                .where("workspace_id", "=", params.w)
                .where("status", "=", "failed")
                // A step of a flow fails its flow run too: count the flow run, once.
                .where("flow_run_id", "is", null)
                .where("created_at", ">=", since)
                .executeTakeFirst(),
            );
          if (readFlowRuns)
            failed += await count(
              db
                .selectFrom("flow_run")
                .select((eb) => eb.fn.countAll().as("n"))
                .where("workspace_id", "=", params.w)
                .where("status", "=", "failed")
                .where("created_at", ">=", since)
                .executeTakeFirst(),
            );
        }

        const unbound = readConnections
          ? await count(
              db
                .selectFrom("resource")
                .select((eb) => eb.fn.countAll().as("n"))
                .where("resource.workspace_id", "=", params.w)
                .where("resource.kind", "=", "connection")
                .where(({ not, exists, selectFrom }) =>
                  not(
                    exists(
                      selectFrom("connection_binding")
                        .select(sql`1`.as("one"))
                        .whereRef("connection_binding.workspace_id", "=", "resource.workspace_id")
                        .whereRef("connection_binding.path", "=", "resource.path"),
                    ),
                  ),
                )
                .executeTakeFirst(),
            )
          : null;

        const approvals = readApprovals
          ? await count(
              db
                .selectFrom("step_run")
                .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
                .select((eb) => eb.fn.countAll().as("n"))
                .where("flow_run.workspace_id", "=", params.w)
                .where("flow_run.status", "=", "running")
                .where("step_run.status", "=", "waiting")
                .where(sql<boolean>`step_run.detail ? 'title'`)
                .executeTakeFirst(),
            )
          : null;

        const git = readGit
          ? await db
              .selectFrom("workspace_git")
              .select("state")
              .where("workspace_id", "=", params.w)
              .executeTakeFirst()
          : undefined;

        const bundleOf = (id: string | null) =>
          id
            ? db
                .selectFrom("bundle")
                .select(["version", "digest"])
                .where("id", "=", id)
                .executeTakeFirst()
            : Promise.resolve(undefined);
        const here = await bundleOf(workspace.active_bundle_id);
        const linkedRow = workspace.linked_workspace_id
          ? await db
              .selectFrom("workspace")
              .select(["id", "name", "type", "active_bundle_id"])
              .where("id", "=", workspace.linked_workspace_id)
              .where("tenant_id", "=", params.t)
              .executeTakeFirst()
          : undefined;
        const there = linkedRow ? await bundleOf(linkedRow.active_bundle_id) : undefined;

        return {
          drafts,
          failedRuns: { count: failed, since: since.toISOString() },
          unboundConnections: unbound,
          approvalsWaiting: approvals,
          git: git ? { state: git.state } : null,
          version: here?.version ?? null,
          linked: linkedRow
            ? {
                id: linkedRow.id,
                name: linkedRow.name,
                type: linkedRow.type,
                version: there?.version ?? null,
                same: Boolean(here && there && here.digest === there.digest),
              }
            : null,
        };
      },
    );

    app.get(
      "/tenants/:t/summary",
      {
        config: { access: access.tenant("tenant:read") },
        schema: {
          summary: "What needs attention in a tenant",
          description:
            "Counts for the tenant's navigation: workspaces, approvals waiting, hostnames not " +
            "yet working, workers online, operator access open now and members. A count the " +
            "caller may not read is null.",
          tags: ["tenants"],
          params: TenantParams,
          response: { 200: TenantSummary },
        },
      },
      async ({ ctx, params }) => {
        const at = { tenantId: params.t };
        const may = async (permission: string) => ctx.allowed(permission, at);
        const [workspaces, approvals, domains, workers, grants, members] = await Promise.all([
          may("workspace:read"),
          may("approval:read"),
          may("domain:read"),
          may("worker:read"),
          may("access_grant:read"),
          may("member:read"),
        ]);
        const now = new Date();
        const total = (table: "workspace" | "tenant_member") =>
          count(
            db
              .selectFrom(table)
              .select((eb) => eb.fn.countAll().as("n"))
              .where("tenant_id", "=", params.t)
              .executeTakeFirst(),
          );
        return {
          workspaces: workspaces ? await total("workspace") : null,
          approvalsWaiting: approvals
            ? await count(
                db
                  .selectFrom("step_run")
                  .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
                  .select((eb) => eb.fn.countAll().as("n"))
                  .where("flow_run.tenant_id", "=", params.t)
                  .where("flow_run.status", "=", "running")
                  .where("step_run.status", "=", "waiting")
                  .where(sql<boolean>`step_run.detail ? 'title'`)
                  .executeTakeFirst(),
              )
            : null,
          domainsToFix: domains
            ? await count(
                db
                  .selectFrom("app_domain")
                  .select((eb) => eb.fn.countAll().as("n"))
                  .where("tenant_id", "=", params.t)
                  .where((eb) =>
                    eb.or([eb("verified_at", "is", null), eb("check_error", "is not", null)]),
                  )
                  .executeTakeFirst(),
              )
            : null,
          workersOnline: workers
            ? await count(
                db
                  .selectFrom("worker")
                  .select((eb) => eb.fn.countAll().as("n"))
                  .where("tenant_id", "=", params.t)
                  .where("last_seen_at", ">", new Date(now.getTime() - WORKER_STALE_SECONDS * 1000))
                  .executeTakeFirst(),
              )
            : null,
          operatorAccessActive: grants
            ? await count(
                db
                  .selectFrom("access_grant")
                  .select((eb) => eb.fn.countAll().as("n"))
                  .where("tenant_id", "=", params.t)
                  .where("revoked_at", "is", null)
                  .where("expires_at", ">", now)
                  .executeTakeFirst(),
              )
            : null,
          members: members ? await total("tenant_member") : null,
        };
      },
    );

    app.get(
      "/tenants/:t/workspaces/:w/references",
      {
        config: { access: access.workspace("resource:read") },
        schema: {
          summary: "Who uses what in a workspace",
          description:
            "Worked out from what is deployed: the connections, secrets, variables and tables " +
            "scripts declare, the scripts and flows that flows and triggers start, the events " +
            "flows listen for, and the interfaces apps serve. Narrow it with `kind` and `name`.",
          tags: ["workspaces"],
          params: WorkspaceParams,
          querystring: Type.Object({
            kind: Type.Optional(Type.String({ maxLength: 40 })),
            name: Type.Optional(Type.String({ maxLength: 255 })),
          }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  target: Type.Object({ kind: Type.String(), name: Type.String() }),
                  by: Type.Object({ kind: Type.String(), path: Type.String() }),
                  how: Type.String(),
                }),
              ),
            }),
          },
        },
      },
      async ({ params, query }) => {
        await findWorkspace(kernel, params.t, params.w);
        const all = await workspaceReferences(db, params.w);
        return {
          items: all.filter(
            (one) =>
              (!query.kind || one.target.kind === query.kind) &&
              (!query.name || one.target.name === query.name),
          ),
        };
      },
    );
  };
}
