import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { Type } from "typebox";
import { WORKER_STALE_SECONDS } from "../kernel/execution/workers.js";
import { mayDecide } from "../kernel/flows/approvers.js";
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
  approvalsWaitingMine: Type.Optional(
    Type.Union([Type.Integer({ minimum: 0 }), Type.Null()], {
      description:
        "Of the approvals waiting, those the caller may decide: the same ones `approvals?mine=true` lists.",
    }),
  ),
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
  scripts: Type.Optional(Count),
  flows: Type.Optional(Count),
  everRan: Type.Optional(
    Type.Union([Type.Boolean(), Type.Null()], {
      description: "Whether anything has run here, ever: for a first run's checklist.",
    }),
  ),
  workersOnline: Type.Optional(Count),
});

const TenantSummary = Type.Object({
  workspaces: Count,
  approvalsWaiting: Count,
  approvalsWaitingMine: Type.Optional(
    Type.Union([Type.Integer({ minimum: 0 }), Type.Null()], {
      description:
        "Of the approvals waiting in the tenant's workspaces, those the caller may decide, by the same rule as a workspace's.",
    }),
  ),
  domainsToFix: Count,
  workersOnline: Count,
  operatorAccessActive: Count,
  members: Count,
  promotionRequests: Count,
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

        const [
          readResources,
          readRuns,
          readFlowRuns,
          readConnections,
          readApprovals,
          readGit,
          readWorkers,
        ] = await Promise.all([
          may("resource:read"),
          may("run:read"),
          may("flow_run:read"),
          may("connection:read"),
          may("approval:read"),
          may("git:read"),
          ctx.allowed("worker:read", { tenantId: params.t }),
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

        const waiting = readApprovals
          ? await db
              .selectFrom("step_run")
              .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
              .select("step_run.detail")
              .where("flow_run.workspace_id", "=", params.w)
              .where("flow_run.status", "=", "running")
              .where("step_run.status", "=", "waiting")
              .where(sql<boolean>`step_run.detail ? 'title'`)
              .execute()
          : null;
        const approvals = waiting ? waiting.length : null;
        let approvalsMine: number | null = null;
        if (waiting) {
          approvalsMine = 0;
          for (const row of waiting)
            if (await mayDecide(db, ctx, at, row.detail)) approvalsMine += 1;
        }

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

        // What a first run's checklist needs: is there code, has it run, can it run.
        const written = async (kind: "script" | "flow") =>
          count(
            sql<{ n: string }>`
              select count(*) as n from (
                select path from resource where workspace_id = ${params.w} and kind = ${kind}
                union
                select path from resource_draft
                where workspace_id = ${params.w} and kind = ${kind} and not deleted
              ) as written
            `
              .execute(db)
              .then((result) => result.rows[0]),
          );
        const [scripts, flows, everRan, workersOnline] = await Promise.all([
          readResources ? written("script") : null,
          readResources ? written("flow") : null,
          readRuns || readFlowRuns
            ? sql<{ ran: boolean }>`
                select exists (select 1 from run where workspace_id = ${params.w})
                  or exists (select 1 from flow_run where workspace_id = ${params.w}) as ran
              `
                .execute(db)
                .then((result) => Boolean(result.rows[0]?.ran))
            : null,
          readWorkers
            ? count(
                db
                  .selectFrom("worker")
                  .select((eb) => eb.fn.countAll().as("n"))
                  .where("tenant_id", "=", params.t)
                  .where("last_seen_at", ">", new Date(Date.now() - WORKER_STALE_SECONDS * 1000))
                  .executeTakeFirst(),
              )
            : null,
        ]);

        return {
          scripts,
          flows,
          everRan,
          workersOnline,
          drafts,
          failedRuns: { count: failed, since: since.toISOString() },
          unboundConnections: unbound,
          approvalsWaiting: approvals,
          approvalsWaitingMine: approvalsMine,
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
        /** Requests waiting on the caller: those to workspaces they may promote to. */
        const waitingRequests = async () => {
          const pending = await db
            .selectFrom("promotion_request")
            .select("target_workspace_id")
            .where("tenant_id", "=", params.t)
            .where("status", "=", "pending")
            .execute();
          let decides = false;
          let waiting = 0;
          const targets = new Set(pending.map((row) => row.target_workspace_id));
          const allowed = new Map<string, boolean>();
          for (const target of targets) {
            allowed.set(
              target,
              await ctx.allowed("promotion:write", { tenantId: params.t, workspaceId: target }),
            );
          }
          for (const row of pending) {
            if (allowed.get(row.target_workspace_id)) {
              decides = true;
              waiting += 1;
            }
          }
          // Null when the caller decides none: neither a number to watch nor a zero to trust.
          if (!decides && !(await ctx.allowed("promotion:write", { tenantId: params.t })))
            return null;
          return waiting;
        };
        /** Of the approvals waiting in every workspace, those this caller may decide. */
        const waitingForMe = async () => {
          const rows = await db
            .selectFrom("step_run")
            .innerJoin("flow_run", "flow_run.id", "step_run.flow_run_id")
            .select(["step_run.detail", "flow_run.workspace_id"])
            .where("flow_run.tenant_id", "=", params.t)
            .where("flow_run.status", "=", "running")
            .where("step_run.status", "=", "waiting")
            .where(sql<boolean>`step_run.detail ? 'title'`)
            .execute();
          let mine = 0;
          for (const row of rows) {
            const here = { tenantId: params.t, workspaceId: row.workspace_id };
            if (await mayDecide(db, ctx, here, row.detail)) mine += 1;
          }
          return mine;
        };
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
          approvalsWaitingMine: approvals ? await waitingForMe() : null,
          domainsToFix: domains
            ? await count(
                db
                  .selectFrom("app_domain")
                  .select((eb) => eb.fn.countAll().as("n"))
                  .where("tenant_id", "=", params.t)
                  // A hostname needs looking at when its last check failed, or when it is not
                  // serving yet for want of proof. One an operator turned on unproven still serves.
                  .where((eb) =>
                    eb.or([
                      eb("check_error", "is not", null),
                      eb.and([eb("verified_at", "is", null), eb("enabled", "=", false)]),
                    ]),
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
          promotionRequests: await waitingRequests(),
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
            drafts: Type.Optional(
              Type.Boolean({
                description:
                  "Also what drafts would use once deployed: a draft speaks for its path, and is marked.",
              }),
            ),
          }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  target: Type.Object({ kind: Type.String(), name: Type.String() }),
                  by: Type.Object({ kind: Type.String(), path: Type.String() }),
                  how: Type.String(),
                  draft: Type.Optional(Type.Boolean()),
                }),
              ),
            }),
          },
        },
      },
      async ({ params, query }) => {
        await findWorkspace(kernel, params.t, params.w);
        const all = await workspaceReferences(db, params.w, { drafts: query.drafts === true });
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
