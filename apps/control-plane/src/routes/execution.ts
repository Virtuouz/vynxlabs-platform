import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { newId, sql } from "@vynxlabs/db";
import { PATH_PATTERN, validateJson } from "@vynxlabs/manifest";
import { procProbe } from "@vynxlabs/worker";
import type { FastifyReply } from "fastify";
import { Type } from "typebox";
import { keepConsoleManaged } from "../kernel/authoring.js";
import { forgetHealth } from "../kernel/data/health.js";
import { badRequest, HttpError, notFound } from "../kernel/errors.js";
import { bindConnection, bindGroupMember } from "../kernel/execution/bindings.js";
import {
  AuthorizationRefused,
  beginAuthorization,
  callbackAddress,
  finishAuthorization,
} from "../kernel/execution/oauth.js";
// A Test's result is kept as the connection's health, by whichever replica sees it end.
import "../kernel/execution/connection-health.js";
import { loadBundle, MAX_BUNDLE_BYTES, storeBundle } from "../kernel/execution/bundles.js";
import { BUILTIN_CONFIG_SCHEMAS, connectorSchema } from "../kernel/execution/connectors.js";
import { deployBundle } from "../kernel/execution/deploy.js";
import { previewPromotion, promote, promotionOf } from "../kernel/execution/promote.js";
import { cancelRun, readPayload, type ScriptBody, startRun } from "../kernel/execution/runs.js";
import {
  flowStateSql,
  type RunState,
  RunStateSchema,
  runState,
  runStateSql,
} from "../kernel/execution/state.js";
import { queueTask, type TaskRow, toTask } from "../kernel/execution/tasks.js";
import {
  fireScheduleNow,
  fireWebhook,
  kickStarted,
  nextFireTimes,
  webhookToken,
} from "../kernel/execution/triggers.js";
import { createWorkerCredential, WORKER_STALE_SECONDS } from "../kernel/execution/workers.js";
import { awaitResponse } from "../kernel/flows/engine.js";
import { publishPlatformEvent } from "../kernel/flows/events.js";
import { pushRelease } from "../kernel/git.js";
import { access, findWorkspace, guestLimit, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { labelText } from "../kernel/metrics.js";
import { PageQuery, pageOf } from "../pagination.js";
import { describeRequests, PromotionRequest } from "./promotion-requests.js";
import {
  AnyObject,
  Id,
  iso,
  isoOrNull,
  Name,
  NoContent,
  NullableId,
  NullableString,
  NullableTime,
  pageArgs,
  TenantParams,
  Time,
  toPage,
  WorkspaceParams,
} from "./shared.js";

const pathPattern = new RegExp(PATH_PATTERN);

/** The worker version that first takes tasks. An older one is shown as needing an update. */
const TASKS_SINCE = "0.6.0";
/** Whether a version is older than another, or unknown. */
function olderThan(version: string | null, than: string): boolean {
  if (!version) return true;
  const parts = (text: string) =>
    text
      .split(/[.-]/)
      .slice(0, 3)
      .map((part) => Number(part) || 0);
  const [a, b] = [parts(version), parts(than)];
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
const WildParams = Type.Object({ t: Id, w: Id, "*": Type.String() });
function wildPath(params: { "*": string }): string {
  const path = params["*"];
  if (!pathPattern.test(path) || path.length > 255) throw badRequest("The path is not valid.");
  return path;
}

/** Something a worker does for the platform, as the console follows it. */
const Task = Type.Object({
  id: Id,
  kind: Type.String(),
  subject: NullableString,
  status: Type.Union([
    Type.Literal("queued"),
    Type.Literal("running"),
    Type.Literal("succeeded"),
    Type.Literal("failed"),
  ]),
  result: Type.Unknown({ description: "What it found, in the shape its kind gives." }),
  error: Type.Union([Type.Object({ message: Type.String() }), Type.Null()]),
  createdAt: Time,
  finishedAt: NullableTime,
});

const Bundle = Type.Object({
  id: Id,
  version: Type.Integer(),
  digest: Type.String(),
  sdkVersion: Type.String(),
  sizeBytes: Type.Integer(),
  manifestCount: Type.Integer(),
  active: Type.Boolean({ description: "Whether the workspace is running this bundle." }),
  createdAt: Time,
});
interface BundleRow {
  id: string;
  version: number;
  digest: string;
  sdk_version: string;
  size_bytes: number;
  manifest_count: number;
  created_at: Date;
}
const toBundle = (row: BundleRow, activeId: string | null) => ({
  id: row.id,
  version: row.version,
  digest: row.digest,
  sdkVersion: row.sdk_version,
  sizeBytes: row.size_bytes,
  manifestCount: row.manifest_count,
  active: row.id === activeId,
  createdAt: iso(row.created_at),
});

const Summary = Type.Object({
  created: Type.Integer(),
  updated: Type.Integer(),
  unchanged: Type.Integer(),
  deleted: Type.Integer(),
  warnings: Type.Optional(
    Type.Array(Type.Object({ path: Type.String(), message: Type.String() }), {
      description:
        "In a dev workspace, what the bundle needs that is not bound here yet. The deploy went ahead; a run that reaches one fails.",
    }),
  ),
  data: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "What the deploy did to the workspace's tables, one sentence each. A deploy never drops data.",
    }),
  ),
  changes: Type.Optional(
    Type.Array(
      Type.Object({
        change: Type.Union([
          Type.Literal("created"),
          Type.Literal("updated"),
          Type.Literal("deleted"),
        ]),
        kind: Type.String(),
        path: Type.String(),
      }),
      { description: "The resources the deploy changed. At most 500 are listed." },
    ),
  ),
});
const Deployment = Type.Object({
  id: Id,
  bundleId: Id,
  bundleVersion: Type.Integer(),
  previousBundleId: NullableId,
  promotedFromWorkspaceId: NullableId,
  summary: AnyObject,
  createdByType: Type.String(),
  createdById: NullableId,
  createdAt: Time,
  message: Type.Optional(NullableString),
  createdBy: Type.Optional(
    Type.String({
      description: "Who deployed it: an email, a service account's name, or the platform.",
    }),
  ),
  digest: Type.Optional(Type.String()),
  runningIn: Type.Optional(
    Type.Array(Type.Object({ id: Id, name: Type.String(), type: Type.String() }), {
      description: "The workspaces of the tenant running this bundle now, compared by digest.",
    }),
  ),
});

const RunStatus = Type.Union([
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);
const Run = Type.Object({
  id: Id,
  script: Type.String(),
  status: RunStatus,
  state: RunStateSchema,
  attempt: Type.Integer(),
  maxAttempts: Type.Integer(),
  trigger: AnyObject,
  startedBy: Type.Object({ type: Type.String(), id: NullableId }),
  bundleId: Id,
  bundleVersion: Type.Integer(),
  error: Type.Union([Type.Object({ message: Type.String() }), Type.Null()]),
  errorSummary: NullableString,
  tags: Type.Array(Type.String()),
  rerunOf: Type.Union([Id, Type.Null()], { description: "The run this one runs again." }),
  createdAt: Time,
  startedAt: NullableTime,
  finishedAt: NullableTime,
});
const RunDetail = Type.Object({
  ...Run.properties,
  reruns: Type.Array(Type.Object({ id: Id, state: RunStateSchema, createdAt: Time }), {
    description: "Runs started again from this one, newest first.",
  }),
  pool: Type.Union([Type.String(), Type.Null()], {
    description: "The worker pool the run is for. Null for the default pool.",
  }),
  waitingFor: Type.Union([Type.String(), Type.Null()], {
    description:
      "For a queued run: what it is waiting for, when it is not simply its turn. No worker connected that could take it, or a run with the same concurrency key still going.",
  }),
  concurrency: Type.Union(
    [
      Type.Object({
        key: Type.String({ description: "Where the value is read from: `input.customerId`." }),
        value: Type.String({
          description:
            "This run's value. Empty when its input had none. A long value is shown as its hash.",
        }),
        limit: Type.Integer({ description: "How many runs with the same value may go at once." }),
      }),
      Type.Null(),
    ],
    { description: "Set when the script limits its runs per value of a key in their input." },
  ),
  input: Type.Unknown(),
  output: Type.Unknown(),
  alert: Type.Union([AnyObject, Type.Null()]),
  idempotencyKey: Type.String(),
});
interface RunRow {
  id: string;
  script_path: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  attempt: number;
  max_attempts: number;
  trigger_type: string;
  trigger_detail: Record<string, unknown>;
  started_by_type: string;
  started_by_id: string | null;
  bundle_id: string;
  error: { message: string } | null;
  error_summary: string | null;
  tags: string[];
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}
const toRun = (row: RunRow, bundleVersion: number) => ({
  id: row.id,
  script: row.script_path,
  status: row.status,
  state: runState(row.status),
  attempt: row.attempt,
  maxAttempts: row.max_attempts,
  trigger: { type: row.trigger_type, ...row.trigger_detail },
  startedBy: { type: row.started_by_type, id: row.started_by_id },
  bundleId: row.bundle_id,
  bundleVersion,
  error: row.error ? { message: row.error.message } : null,
  errorSummary: row.error_summary,
  tags: row.tags,
  rerunOf:
    row.trigger_type === "rerun" && typeof row.trigger_detail.of === "string"
      ? row.trigger_detail.of
      : null,
  createdAt: iso(row.created_at),
  startedAt: isoOrNull(row.started_at),
  finishedAt: isoOrNull(row.finished_at),
});

const WorkerCredential = Type.Object({
  id: Id,
  name: Type.String(),
  prefix: Type.String(),
  workspaceId: NullableId,
  managed: Type.Boolean(),
  pool: Type.Union([Type.String(), Type.Null()], {
    description: "The pool its workers serve. Null for the default pool.",
  }),
  expiresAt: NullableTime,
  revokedAt: NullableTime,
  createdAt: Time,
});
interface CredentialRow {
  id: string;
  name: string;
  prefix: string;
  workspace_id: string | null;
  managed: boolean;
  pool: string | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}
const toCredential = (row: CredentialRow) => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  workspaceId: row.workspace_id,
  managed: row.managed,
  pool: row.pool,
  expiresAt: isoOrNull(row.expires_at),
  revokedAt: isoOrNull(row.revoked_at),
  createdAt: iso(row.created_at),
});

export function executionRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";
    /**
     * The schema a connection's configuration must fit: its connector's.
     *
     * A connection is bound before the bundle that declares it is deployed, so
     * what it is declared as is looked for where it may be: among what is
     * deployed, then among the drafts, then in the bundles uploaded to the
     * workspace, newest first. One that nothing declares is taken to be HTTP,
     * which is what a connection is unless it says otherwise. A deploy checks
     * every binding again against the bundle it activates.
     */
    /** The workspace's own connectors, as deployed. */
    const deployedConnectors = (workspaceId: string) =>
      db
        .selectFrom("resource")
        .select(["path", "body"])
        .where("workspace_id", "=", workspaceId)
        .where("kind", "=", "connector")
        .execute();

    const configSchemaOf = async (
      workspaceId: string,
      kind: "connection" | "connection_group",
      path: string,
    ): Promise<object> => {
      const named = (body: unknown) => (body as { connector?: string } | undefined)?.connector;
      const [deployed, drafted] = await Promise.all([
        db
          .selectFrom("resource")
          .select(["kind", "path", "body"])
          .where("workspace_id", "=", workspaceId)
          .where("kind", "in", [kind, "connector"])
          .execute(),
        db
          .selectFrom("resource_draft")
          .select(["kind", "path", "body"])
          .where("workspace_id", "=", workspaceId)
          .where("kind", "in", [kind, "connector"])
          .where("deleted", "=", false)
          .execute(),
      ]);
      const from = (rows: { kind: string; path: string; body: unknown }[]) => {
        const name = named(rows.find((row) => row.kind === kind && row.path === path)?.body);
        return name === undefined
          ? undefined
          : { name, connectors: rows.filter((row) => row.kind === "connector") };
      };
      let found = from(deployed) ?? from([...drafted, ...deployed]);
      if (!found) {
        const uploaded = await db
          .selectFrom("bundle")
          .select(["id", "storage_key"])
          .where("workspace_id", "=", workspaceId)
          .orderBy("id", "desc")
          .limit(5)
          .execute();
        for (const stored of uploaded) {
          found = from((await loadBundle(kernel, stored)).manifests);
          if (found) break;
        }
      }
      if (!found) return BUILTIN_CONFIG_SCHEMAS.http as object;
      const schema = connectorSchema(found.name, found.connectors);
      if (!schema) {
        throw new HttpError(
          409,
          "connector_missing",
          `This uses the connector "${found.name}", which is not in this workspace.`,
        );
      }
      return schema;
    };
    const activeBundle = async (workspaceId: string) =>
      (
        await db
          .selectFrom("workspace")
          .select("active_bundle_id")
          .where("id", "=", workspaceId)
          .executeTakeFirstOrThrow()
      ).active_bundle_id;

    // ----- Bundles and deployments -----

    app.get(
      `${base}/bundles`,
      {
        config: { access: access.workspace("bundle:read") },
        schema: {
          summary: "Bundles uploaded to a workspace, newest first",
          tags: ["deploys"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(Bundle) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("bundle")
          .selectAll()
          .where("workspace_id", "=", params.w)
          // A bundle made to try a draft out was never offered for deploying.
          .where("origin", "<>", "preview")
          .orderBy("version", "desc")
          .limit(100)
          .execute();
        const active = await activeBundle(params.w);
        return { items: rows.map((row) => toBundle(row, active)) };
      },
    );

    app.post(
      `${base}/bundles`,
      {
        bodyLimit: MAX_BUNDLE_BYTES,
        config: { access: access.workspace("bundle:write") },
        schema: {
          summary: "Upload a bundle",
          description:
            "Stores the bundle as the workspace's next version. It does not run until it is " +
            "deployed. With `preview`, it is stored to be tried with a test run and never " +
            "offered for deploying: the workspace's console resources are kept on it, and it " +
            "is removed after a week, as the console's own tries are.",
          tags: ["deploys"],
          params: WorkspaceParams,
          querystring: Type.Object({ preview: Type.Optional(Type.Boolean()) }),
          body: AnyObject,
          response: { 200: Bundle, 201: Bundle },
        },
      },
      async ({ ctx, params, query, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const result = await ctx.mutate(async (trx, audit) => {
          if (!query.preview)
            return storeBundle(kernel, trx, audit, workspace, ctx.principal, body);
          const stored = await storeBundle(
            kernel,
            trx,
            audit,
            workspace,
            ctx.principal,
            body,
            "preview",
          );
          const kept = await keepConsoleManaged(
            kernel,
            trx,
            audit,
            workspace,
            ctx.principal,
            stored.bundle.id,
            "preview",
          );
          if (kept === stored.bundle.id) return stored;
          const composed = await trx
            .selectFrom("bundle")
            .selectAll()
            .where("id", "=", kept)
            .executeTakeFirstOrThrow();
          return { created: true, bundle: composed };
        });
        return reply
          .code(result.created ? 201 : 200)
          .send(toBundle(result.bundle, await activeBundle(params.w)));
      },
    );

    app.get(
      `${base}/deployments`,
      {
        config: { access: access.workspace("deployment:read") },
        schema: {
          summary: "Deployments to a workspace, newest first",
          tags: ["deploys"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(Deployment) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("deployment")
          .innerJoin("bundle", "bundle.id", "deployment.bundle_id")
          .select([
            "deployment.id",
            "deployment.bundle_id",
            "deployment.previous_bundle_id",
            "deployment.promoted_from_workspace_id",
            "deployment.summary",
            "deployment.created_by_type",
            "deployment.created_by_id",
            "deployment.created_at",
            "deployment.message",
            "bundle.version",
            "bundle.digest",
          ])
          .where("deployment.workspace_id", "=", params.w)
          .orderBy("deployment.id", "desc")
          .limit(100)
          .execute();
        const members = new Map(
          (
            await db
              .selectFrom("member")
              .select(["id", "email", "name"])
              .where("id", "in", [
                ...new Set(
                  rows
                    .filter((row) => row.created_by_type === "member" && row.created_by_id)
                    .map((row) => row.created_by_id as string),
                ),
                "00000000-0000-0000-0000-000000000000",
              ])
              .execute()
          ).map((member) => [member.id, member.email ?? member.name ?? "A member"]),
        );
        const accounts = new Map(
          (
            await db
              .selectFrom("service_account")
              .select(["id", "name"])
              .where("tenant_id", "=", params.t)
              .execute()
          ).map((account) => [account.id, account.name]),
        );
        // Which of the tenant's workspaces run each bundle now, by digest: a promoted bundle
        // runs in production under a bundle row of its own.
        const running = await db
          .selectFrom("workspace")
          .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
          .select(["workspace.id", "workspace.name", "workspace.type", "bundle.digest"])
          .where("workspace.tenant_id", "=", params.t)
          .execute();
        return {
          items: rows.map((row) => ({
            message: row.message ?? null,
            createdBy:
              row.created_by_type === "member" && row.created_by_id
                ? (members.get(row.created_by_id) ?? "A member")
                : row.created_by_type === "service_account" && row.created_by_id
                  ? (accounts.get(row.created_by_id) ?? "A service account")
                  : "The platform",
            digest: row.digest,
            runningIn: running
              .filter((one) => one.digest === row.digest)
              .map((one) => ({ id: one.id, name: one.name, type: one.type })),
            id: row.id,
            bundleId: row.bundle_id,
            bundleVersion: row.version,
            previousBundleId: row.previous_bundle_id,
            promotedFromWorkspaceId: row.promoted_from_workspace_id,
            summary: row.summary,
            createdByType: row.created_by_type,
            createdById: row.created_by_id,
            createdAt: iso(row.created_at),
          })),
        };
      },
    );

    app.post(
      `${base}/deployments`,
      {
        config: { access: access.workspace("deployment:write") },
        schema: {
          summary: "Activate a bundle",
          description:
            "Atomic. Runs in progress finish on the bundle they started with. To roll back, " +
            "deploy an earlier bundle.",
          tags: ["deploys"],
          params: WorkspaceParams,
          body: Type.Object({
            bundleId: Id,
            message: Type.Optional(
              Type.String({ maxLength: 500, description: "What changed, in a few words." }),
            ),
            settleDrafts: Type.Optional(
              Type.Array(
                Type.Object({ path: Type.String({ maxLength: 255 }), revision: Type.Integer() }),
                {
                  maxItems: 1000,
                  description:
                    "Drafts this bundle carries, as `platform pull` took them: each is removed " +
                    "if it is still at that revision. A draft changed in the console since is kept.",
                },
              ),
            ),
          }),
          response: {
            201: Type.Object({
              id: Id,
              bundleId: Id,
              bundleVersion: Type.Integer(),
              summary: Summary,
              draftsSettled: Type.Array(Type.String(), {
                description: "The drafts the deploy made true, and so removed.",
              }),
            }),
          },
        },
      },
      async ({ ctx, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const result = await ctx.mutate(async (trx, audit) =>
          deployBundle(
            kernel,
            trx,
            audit,
            workspace,
            ctx.principal,
            // A bundle that says nothing about console-managed resources keeps the workspace's.
            await keepConsoleManaged(kernel, trx, audit, workspace, ctx.principal, body.bundleId),
            {
              ...(body.message ? { message: body.message } : {}),
              ...(body.settleDrafts ? { settle: body.settleDrafts } : {}),
            },
          ),
        );
        await publishPlatformEvent(kernel, {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
          name: "platform/deployment-created",
          payload: { deploymentId: result.deployment.id, bundleVersion: result.bundle.version },
          sourceId: result.deployment.id,
          depth: 0,
        }).catch((error) =>
          kernel.log.error({ err: error }, "a platform event could not be published"),
        );
        return reply.code(201).send({
          id: result.deployment.id,
          bundleId: result.bundle.id,
          bundleVersion: result.bundle.version,
          summary: result.summary,
          draftsSettled: result.draftsSettled,
        });
      },
    );

    // ----- Promotion -----

    const PromotionTarget = Type.Object({
      id: Id,
      slug: Type.String(),
      name: Type.String(),
      type: Type.String(),
    });

    app.get(
      `${base}/promotion-preview`,
      {
        config: { access: access.workspace("deployment:read") },
        schema: {
          summary: "What promoting this workspace's bundle to its linked workspace would do",
          description:
            "Found by carrying the promotion out and taking it all back, so it is exactly what " +
            "the promotion would do: the resources and tables it would change, or why it would be refused.",
          tags: ["deploys"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              target: PromotionTarget,
              bundle: Type.Object({ digest: Type.String(), version: Type.Integer() }),
              possible: Type.Boolean(),
              refusal: Type.Union([
                Type.Object({
                  code: Type.String(),
                  detail: Type.String(),
                  errors: Type.Array(Type.Object({ path: Type.String(), message: Type.String() })),
                }),
                Type.Null(),
              ]),
              summary: Type.Union([Summary, Type.Null()]),
              tried: Type.Object(
                {
                  runs: Type.Integer(),
                  failed: Type.Integer(),
                  flowRuns: Type.Integer(),
                  flowRunsFailed: Type.Integer(),
                },
                { description: "How the bundle has done here, in this workspace, before it goes." },
              ),
              triggers: Type.Integer({
                description: "Triggers that stay running in the workspace promoted to.",
              }),
              canPromote: Type.Boolean({
                description:
                  "Whether the caller may promote it. One who may not can ask: promotion-requests.",
              }),
              request: Type.Union([PromotionRequest, Type.Null()], {
                description: "This workspace's latest request for a promotion, of anyone's.",
              }),
            }),
          },
        },
      },
      async ({ ctx }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const { target } = await promotionOf(db, workspace);
        await ctx.authorize("deployment:read", {
          tenantId: target.tenantId,
          workspaceId: target.id,
        });
        const preview = await previewPromotion(kernel, ctx.actor, workspace);
        const active = await db
          .selectFrom("workspace")
          .select("active_bundle_id")
          .where("id", "=", workspace.id)
          .executeTakeFirst();
        const tally = async (table: "run" | "flow_run") => {
          if (!active?.active_bundle_id) return { all: 0, failed: 0 };
          const row = await db
            .selectFrom(table)
            .select((eb) => [
              eb.fn.countAll<string>().as("all"),
              sql<string>`count(*) filter (where status = 'failed')`.as("failed"),
            ])
            .where("bundle_id", "=", active.active_bundle_id)
            .executeTakeFirst();
          return { all: Number(row?.all ?? 0), failed: Number(row?.failed ?? 0) };
        };
        const [runs, flowRuns] = [await tally("run"), await tally("flow_run")];
        const triggers = await db
          .selectFrom("trigger_state")
          .select((eb) => eb.fn.countAll<string>().as("n"))
          .where("workspace_id", "=", target.id)
          .where("enabled", "=", true)
          .executeTakeFirst();
        return {
          ...preview,
          tried: {
            runs: runs.all,
            failed: runs.failed,
            flowRuns: flowRuns.all,
            flowRunsFailed: flowRuns.failed,
          },
          triggers: Number(triggers?.n ?? 0),
          canPromote: await ctx.allowed("promotion:write", {
            tenantId: target.tenantId,
            workspaceId: target.id,
          }),
          request: await (async () => {
            const latest = await db
              .selectFrom("promotion_request")
              .selectAll()
              .where("source_workspace_id", "=", workspace.id)
              .where("target_workspace_id", "=", target.id)
              .where("status", "<>", "superseded")
              .orderBy("created_at", "desc")
              .limit(1)
              .execute();
            return (await describeRequests(kernel, ctx, latest))[0] ?? null;
          })(),
        };
      },
    );

    app.post(
      `${base}/promotions`,
      {
        config: { access: access.workspace("deployment:read") },
        schema: {
          summary: "Promote this workspace's active bundle to its linked workspace",
          description:
            "Deploys the same bundle, by digest, in the workspace this one is linked to. Nothing " +
            "is rebuilt. Needs `promotion:write` in the workspace promoted to.",
          tags: ["deploys"],
          params: WorkspaceParams,
          response: {
            201: Type.Object({
              id: Id,
              workspaceId: Id,
              bundleId: Id,
              bundleVersion: Type.Integer(),
              digest: Type.String(),
              summary: Summary,
              release: Type.Optional(
                Type.Object(
                  {
                    status: Type.String({ description: "done, nothing, failed, or off." }),
                    branch: NullableString,
                    problem: Type.Optional(Type.String()),
                  },
                  { description: "The commit of what production now runs to its release branch." },
                ),
              ),
            }),
          },
        },
      },
      async ({ ctx }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const { target } = await promotionOf(db, workspace);
        await ctx.authorize("promotion:write", {
          tenantId: target.tenantId,
          workspaceId: target.id,
        });
        const result = await ctx.mutate((trx, audit) =>
          promote(kernel, trx, audit, workspace, ctx.principal),
        );
        await publishPlatformEvent(kernel, {
          tenantId: target.tenantId,
          workspaceId: target.id,
          name: "platform/deployment-created",
          payload: { deploymentId: result.deployment.id, bundleVersion: result.bundle.version },
          sourceId: result.deployment.id,
          depth: 0,
        }).catch((error) =>
          kernel.log.error({ err: error }, "a platform event could not be published"),
        );
        // What production now runs is committed to its release branch. A failure is shown in
        // git sync with a retry, and never undoes the promotion.
        const release = await pushRelease(kernel, ctx.actor, target, {
          version: result.bundle.version,
        }).catch((error: Error) => ({
          status: "failed" as const,
          branch: null,
          problem: error.message,
        }));
        return reply.code(201).send({
          id: result.deployment.id,
          workspaceId: target.id,
          bundleId: result.bundle.id,
          bundleVersion: result.bundle.version,
          digest: result.bundle.digest,
          summary: result.summary,
          release,
        });
      },
    );

    // ----- Scripts and runs -----

    app.get(
      `${base}/scripts`,
      {
        config: { access: access.workspace("script:read") },
        schema: {
          summary: "Scripts deployed to a workspace, each with its latest run",
          tags: ["runs"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  description: Type.String(),
                  timeoutSeconds: Type.Integer(),
                  inputSchema: AnyObject,
                  node: Type.Union([
                    Type.Object(
                      {
                        label: Type.String(),
                        icon: Type.Optional(Type.String()),
                        category: Type.Optional(Type.String()),
                        takes: Type.Optional(Type.Array(Type.String())),
                      },
                      {
                        description:
                          "Set when the script is a step people can pick in the flow editor.",
                      },
                    ),
                    Type.Null(),
                  ]),
                  lastRun: Type.Union([
                    Type.Object({
                      id: Id,
                      status: RunStatus,
                      state: RunStateSchema,
                      createdAt: Time,
                      error: NullableString,
                    }),
                    Type.Null(),
                  ]),
                  failedInARow: Type.Integer({
                    description: "How many of its latest runs failed, one after another.",
                  }),
                  ownership: Type.String({
                    description: "`code` for the repository, `ui` for the console.",
                  }),
                  retries: Type.Integer(),
                  uses: Type.Object({
                    connections: Type.Array(Type.String()),
                    secrets: Type.Array(Type.String()),
                    variables: Type.Array(Type.String()),
                    tables: Type.Array(Type.String()),
                  }),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const scripts = await db
          .selectFrom("resource")
          .select(["path", "body", "ownership"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "script")
          .orderBy("path")
          .execute();
        const latest = await sql<{
          script_path: string;
          id: string;
          status: RunRow["status"];
          created_at: Date;
          error: string | null;
        }>`
          select distinct on (script_path) script_path, id, status, created_at, error->>'message' as error
          from run where workspace_id = ${params.w}
          order by script_path, id desc
        `.execute(db);
        // The failures since each script last did not fail, among its latest twenty runs.
        const streaks = await sql<{ script_path: string; failed: string }>`
          select script_path, count(*) as failed from (
            select script_path, status,
              bool_and(status = 'failed') over (partition by script_path order by id desc) as still
            from (
              select script_path, status, id,
                row_number() over (partition by script_path order by id desc) as n
              from run where workspace_id = ${params.w} and status in ('succeeded', 'failed')
            ) as recent where n <= 20
          ) as ordered where still group by script_path
        `.execute(db);
        const streakOf = new Map(streaks.rows.map((row) => [row.script_path, Number(row.failed)]));
        const byScript = new Map(latest.rows.map((row) => [row.script_path, row]));
        return {
          items: scripts.map((script) => {
            const body = script.body as unknown as ScriptBody & { description?: string };
            const last = byScript.get(script.path);
            return {
              path: script.path,
              description: body.description ?? "",
              timeoutSeconds: body.timeoutSeconds,
              inputSchema: body.input as Record<string, unknown>,
              node: (body as { node?: { label: string } }).node ?? null,
              lastRun: last
                ? {
                    id: last.id,
                    status: last.status,
                    state: runState(last.status),
                    createdAt: iso(last.created_at),
                    error: last.error,
                  }
                : null,
              failedInARow: streakOf.get(script.path) ?? 0,
              ownership: script.ownership,
              retries: body.retries?.limit ?? 0,
              uses: {
                connections: body.uses?.connections ?? [],
                secrets: body.uses?.secrets ?? [],
                variables: body.uses?.variables ?? [],
                tables: body.uses?.tables ?? [],
              },
            };
          }),
        };
      },
    );

    app.get(
      `${base}/runs`,
      {
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "Runs in a workspace, newest first",
          tags: ["runs"],
          params: WorkspaceParams,
          querystring: Type.Object({
            ...PageQuery.properties,
            script: Type.Optional(Type.String()),
            status: Type.Optional(RunStatus),
          }),
          response: { 200: pageOf(Run) },
        },
      },
      async ({ params, query }) => {
        const args = pageArgs(query);
        let select = db
          .selectFrom("run")
          .innerJoin("bundle", "bundle.id", "run.bundle_id")
          .selectAll("run")
          .select("bundle.version as bundle_version")
          .where("run.workspace_id", "=", params.w);
        if (query.script) select = select.where("run.script_path", "=", query.script);
        if (query.status) select = select.where("run.status", "=", query.status);
        if (args.after) select = select.where("run.id", "<", args.after);
        const rows = await select
          .orderBy("run.id", "desc")
          .limit(args.limit + 1)
          .execute();
        return toPage(
          rows,
          args,
          (row) => row.id,
          (row) => toRun(row, row.bundle_version),
        );
      },
    );

    app.post(
      `${base}/runs`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Start a run of a script",
          description:
            "Starting again with the same `idempotencyKey` for the same script returns the first run. " +
            "Needs `run:write` at the workspace or at the script itself, which is how an app's " +
            "users are let start one script and no other.",
          tags: ["runs"],
          params: WorkspaceParams,
          body: Type.Object({
            script: Type.String(),
            input: Type.Optional(Type.Unknown()),
            idempotencyKey: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
            priority: Type.Optional(Type.Integer({ minimum: -100, maximum: 100 })),
            startAfter: Type.Optional(Time),
          }),
          response: { 200: Run, 201: Run },
        },
      },
      async ({ ctx, params, body }, reply) => {
        await findWorkspace(kernel, params.t, params.w);
        const target = await db
          .selectFrom("resource")
          .select("id")
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "script")
          .where("path", "=", body.script)
          .executeTakeFirst();
        await ctx.authorize("run:write", {
          tenantId: params.t,
          workspaceId: params.w,
          resourceId: target?.id,
        });
        const result = await ctx.mutate(async (trx, audit) => {
          const started = await startRun(kernel, trx, {
            tenantId: params.t,
            workspaceId: params.w,
            script: body.script,
            input: body.input ?? {},
            trigger: { type: "manual" },
            startedBy: { type: ctx.principal.type, id: ctx.principal.id },
            idempotencyKey: body.idempotencyKey,
            priority: body.priority,
            startAfter: body.startAfter ? new Date(body.startAfter) : undefined,
          });
          await audit({
            action: "run.started",
            targetType: "run",
            targetId: started.run.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: { script: body.script, repeated: !started.created },
          });
          return started;
        });
        const bundle = await db
          .selectFrom("bundle")
          .select("version")
          .where("id", "=", result.run.bundle_id)
          .executeTakeFirstOrThrow();
        return reply.code(result.created ? 201 : 200).send(toRun(result.run, bundle.version));
      },
    );

    app.post(
      `${base}/runs/:id/rerun`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Run a script run again, with the same input or another",
          description:
            "Starts a new run of the same script, on the version the run used (the default) " +
            "or the active one, with the input given or the same input. The new run names the " +
            "one it repeats and carries its tags. Needs what starting the script needs.",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          body: Type.Object({
            input: Type.Optional(Type.Unknown()),
            bundle: Type.Optional(Type.Union([Type.Literal("original"), Type.Literal("active")])),
          }),
          response: { 201: Run },
        },
      },
      async ({ ctx, params, body }, reply) => {
        await findWorkspace(kernel, params.t, params.w);
        const original = await findRun(params.w, params.id);
        await ctx.authorize("run:write", {
          tenantId: params.t,
          workspaceId: params.w,
          resourceId: original.resource_id,
        });
        if (original.flow_run_id) {
          throw new HttpError(
            409,
            "conflict",
            "This run is a step of a flow run. Retry the flow run instead.",
          );
        }
        const input =
          body.input !== undefined
            ? body.input
            : await readPayload(kernel, original.input, original.input_ref);
        const result = await ctx.mutate(async (trx, audit) => {
          const started = await startRun(kernel, trx, {
            tenantId: params.t,
            workspaceId: params.w,
            script: original.script_path,
            input,
            trigger: { type: "rerun", detail: { of: original.id } },
            startedBy: { type: ctx.principal.type, id: ctx.principal.id },
            bundleId: body.bundle === "active" ? undefined : original.bundle_id,
            tags: original.tags,
          });
          await audit({
            action: "run.rerun",
            targetType: "run",
            targetId: started.run.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: {
              script: original.script_path,
              of: original.id,
              bundle: body.bundle ?? "original",
              inputChanged: body.input !== undefined,
            },
          });
          return started;
        });
        const bundle = await db
          .selectFrom("bundle")
          .select("version")
          .where("id", "=", result.run.bundle_id)
          .executeTakeFirstOrThrow();
        return reply.code(201).send(toRun(result.run, bundle.version));
      },
    );

    /** Why a queued run has nobody to take it, or null when a worker that could is connected. */
    const waitingFor = async (tenantId: string, workspaceId: string, pool: string | null) => {
      const serving = await sql`
        select 1 from worker w join worker_credential c on c.id = w.credential_id
        where w.tenant_id = ${tenantId}
          and w.last_seen_at > now() - make_interval(secs => ${WORKER_STALE_SECONDS})
          and c.revoked_at is null
          and (c.workspace_id is null or c.workspace_id = ${workspaceId})
          and c.pool is not distinct from ${pool}
        limit 1
      `.execute(db);
      if (serving.rows.length > 0) return null;
      if (pool !== null) {
        return `No worker of the pool "${pool}" is connected. Start one with a credential made for that pool.`;
      }
      const tenant = await db
        .selectFrom("tenant")
        .select("managed_workers")
        .where("id", "=", tenantId)
        .executeTakeFirstOrThrow();
      return tenant.managed_workers
        ? null
        : "This tenant runs on its own workers, and none is connected. Start one with a worker credential.";
    };

    /**
     * What a run waits for and, for a script that limits its runs per key, the key: a queued
     * run whose worker is there is held back only by runs with the same value still going.
     */
    const keyed = async (
      tenantId: string,
      workspaceId: string,
      row: {
        id: string;
        status: string;
        pool: string | null;
        resource_id: string;
        concurrency_key: string | null;
      },
    ) => {
      let concurrency: { key: string; value: string; limit: number } | null = null;
      if (row.concurrency_key !== null) {
        const resource = await db
          .selectFrom("resource")
          .select("body")
          .where("id", "=", row.resource_id)
          .executeTakeFirst();
        const declared = (resource?.body as { concurrency?: unknown } | undefined)?.concurrency;
        if (declared && typeof declared === "object") {
          const { key, limit } = declared as { key: string; limit: number };
          concurrency = { key, value: row.concurrency_key, limit };
        }
      }
      if (row.status !== "queued") return { waitingFor: null, concurrency };
      const absent = await waitingFor(tenantId, workspaceId, row.pool);
      if (absent || row.concurrency_key === null) return { waitingFor: absent, concurrency };
      const ahead = await db
        .selectFrom("run")
        .select(db.fn.countAll<string>().as("count"))
        .where("workspace_id", "=", workspaceId)
        .where("resource_id", "=", row.resource_id)
        .where("concurrency_key", "=", row.concurrency_key)
        .where("status", "=", "running")
        .where("id", "<>", row.id)
        .executeTakeFirstOrThrow();
      const going = Number(ahead.count);
      if (going === 0 || (concurrency && going < concurrency.limit)) {
        return { waitingFor: null, concurrency };
      }
      const value = row.concurrency_key === "" ? "none" : row.concurrency_key;
      return {
        waitingFor: `Waiting for ${going} run${going === 1 ? "" : "s"} with the same key (${value}) to finish.`,
        concurrency,
      };
    };

    const findRun = async (workspaceId: string, id: string) => {
      const row = await db
        .selectFrom("run")
        .innerJoin("bundle", "bundle.id", "run.bundle_id")
        .selectAll("run")
        .select("bundle.version as bundle_version")
        .where("run.id", "=", id)
        .where("run.workspace_id", "=", workspaceId)
        .executeTakeFirst();
      if (!row) throw notFound("The run");
      return row;
    };

    app.get(
      `${base}/runs/:id`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "One run, with its input and output",
          description:
            "Needs `run:read` in the workspace. Whoever started a run may always read it.",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: { 200: RunDetail },
        },
      },
      async ({ ctx, params }) => {
        await findWorkspace(kernel, params.t, params.w);
        const mayReadAll = await ctx.allowed("run:read", {
          tenantId: params.t,
          workspaceId: params.w,
        });
        const row = mayReadAll
          ? await findRun(params.w, params.id)
          : await findRun(params.w, params.id).catch(() => undefined);
        const own =
          row !== undefined &&
          ctx.principal.id !== null &&
          row.started_by_id === ctx.principal.id &&
          row.started_by_type === ctx.principal.type;
        // To someone who may not read runs, a run that is not theirs does not exist.
        if (!mayReadAll && !own)
          await ctx.authorize("run:read", { tenantId: params.t, workspaceId: params.w });
        if (!row) throw notFound("The run");
        return {
          ...toRun(row, row.bundle_version),
          pool: row.pool,
          ...(await keyed(params.t, params.w, row)),
          input: await readPayload(kernel, row.input, row.input_ref),
          output: await readPayload(kernel, row.output, row.output_ref),
          alert: row.alert,
          idempotencyKey: row.idempotency_key,
          reruns: (
            await db
              .selectFrom("run")
              .select(["id", "status", "created_at"])
              .where("workspace_id", "=", params.w)
              .where("trigger_type", "=", "rerun")
              .where(sql<boolean>`trigger_detail->>'of' = ${params.id}`)
              .orderBy("id", "desc")
              .limit(20)
              .execute()
          ).map((one) => ({
            id: one.id,
            state: runState(one.status),
            createdAt: iso(one.created_at),
          })),
        };
      },
    );

    app.get(
      `${base}/runs/:id/logs`,
      {
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "A run's log lines, oldest first",
          description: "Pass the last `seq` you have as `after` to read only what is new.",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          querystring: Type.Object({
            after: Type.Optional(Type.Integer({ minimum: 0 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 500 })),
          }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  seq: Type.Integer(),
                  attempt: Type.Integer(),
                  time: Time,
                  level: Type.String(),
                  message: Type.String(),
                  fields: AnyObject,
                }),
              ),
              done: Type.Boolean({
                description: "True when the run has ended and nothing more will come.",
              }),
            }),
          },
        },
      },
      async ({ params, query }) => {
        const run = await findRun(params.w, params.id);
        const rows = await db
          .selectFrom("run_log")
          .selectAll()
          .where("run_id", "=", params.id)
          .where("seq", ">", String(query.after ?? 0))
          .orderBy("seq")
          .limit(query.limit ?? 500)
          .execute();
        return {
          items: rows.map((row) => ({
            seq: Number(row.seq),
            attempt: row.attempt,
            time: iso(row.logged_at),
            level: row.level,
            message: row.message,
            fields: row.fields,
          })),
          done:
            run.status !== "queued" &&
            run.status !== "running" &&
            rows.length < (query.limit ?? 500),
        };
      },
    );

    app.post(
      `${base}/runs/:id/cancel`,
      {
        config: { access: access.workspace("run:write") },
        schema: {
          summary: "Cancel a run that is waiting or in progress",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: { 200: Run },
        },
      },
      async ({ ctx, params }) => {
        const run = await ctx.mutate(async (trx, audit) => {
          const cancelled = await cancelRun(kernel, trx, params.w, params.id);
          await audit({
            action: "run.cancelled",
            targetType: "run",
            targetId: params.id,
            tenantId: params.t,
            workspaceId: params.w,
            details: { script: cancelled.script_path },
          });
          return cancelled;
        });
        return toRun(run, (await findRun(params.w, params.id)).bundle_version);
      },
    );

    // ----- Triggers -----

    app.get(
      `${base}/triggers`,
      {
        config: { access: access.workspace("trigger:read") },
        schema: {
          summary: "Schedules, webhooks, forms and event triggers in a workspace",
          description:
            "The address of a webhook or a form is included only for callers who hold " +
            "`trigger:write`. A form's address is a page under the tenant's portal.",
          tags: ["runs"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  node: Type.String({
                    description: "The trigger node in a flow; empty for a trigger resource.",
                  }),
                  type: Type.String(),
                  script: Type.String({ description: "The path of the script or flow it starts." }),
                  targetKind: Type.Union([Type.Literal("script"), Type.Literal("flow")]),
                  event: NullableString,
                  enabled: Type.Boolean(),
                  cron: NullableString,
                  timezone: NullableString,
                  overlap: Type.Union([Type.Literal("allow"), Type.Literal("skip"), Type.Null()], {
                    description: "For a schedule: whether it skips a time while its last run goes.",
                  }),
                  lastSkippedAt: NullableTime,
                  nextFireAt: NullableTime,
                  lastFiredAt: NullableTime,
                  url: NullableString,
                  paused: Type.Union([
                    Type.Object({ at: Time, by: NullableId, reason: Type.String() }),
                    Type.Null(),
                  ]),
                  lastRun: Type.Union([
                    Type.Object({
                      kind: Type.Union([Type.Literal("script"), Type.Literal("flow")]),
                      id: Id,
                      status: Type.String(),
                      state: RunStateSchema,
                      createdAt: Time,
                    }),
                    Type.Null(),
                  ]),
                  lastRefusal: Type.Union([
                    Type.Object({ reason: Type.String(), problem: Type.String(), at: Time }),
                    Type.Null(),
                  ]),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const rows = await db
          .selectFrom("trigger_state")
          .innerJoin("resource", "resource.id", "trigger_state.resource_id")
          .selectAll("trigger_state")
          .select(["resource.path", "resource.body"])
          .where("trigger_state.workspace_id", "=", params.w)
          .orderBy("resource.path")
          .execute();
        const tenantSlug = (
          await db
            .selectFrom("tenant")
            .select("slug")
            .where("id", "=", params.t)
            .executeTakeFirstOrThrow()
        ).slug;
        const mayAddress = await ctx.allowed("trigger:write", {
          tenantId: params.t,
          workspaceId: params.w,
        });
        const pauses = await db
          .selectFrom("trigger_pause")
          .selectAll()
          .where("workspace_id", "=", params.w)
          .execute();
        const refusals = await sql<{
          path: string;
          node_id: string;
          reason: string;
          problem: string;
          occurred_at: Date;
        }>`
          select distinct on (path, node_id) path, node_id, reason, problem, occurred_at
          from webhook_refusal where workspace_id = ${params.w}
          order by path, node_id, occurred_at desc
        `.execute(db);
        /** The newest run a trigger started: by its label, or for an event by its target and event. */
        const lastRunOf = async (row: (typeof rows)[number]) => {
          const label = row.node_id ? `${row.path}#${row.node_id}` : row.path;
          const match =
            row.type === "event"
              ? sql`trigger_type = 'event' and trigger_detail->>'event' = ${row.event_name}`
              : // A schedule names itself under `schedule`, every other trigger under `trigger`.
                sql`coalesce(trigger_detail->>'trigger', trigger_detail->>'schedule') = ${label}`;
          const found = await sql<{
            kind: "script" | "flow";
            id: string;
            status: string;
            state: RunState;
            created_at: Date;
          }>`
            select * from (
              select 'script' as kind, id, status::text as status,
                ${runStateSql("status")} as state, created_at from run
              where workspace_id = ${params.w} and flow_run_id is null
                and script_path = ${row.target_path} and ${match}
              union all
              select 'flow' as kind, f.id, f.status::text as status,
                ${flowStateSql("f")} as state, f.created_at from flow_run f
              where f.workspace_id = ${params.w} and f.flow_path = ${row.target_path} and ${match}
            ) as fired order by id desc limit 1
          `.execute(db);
          const last = found.rows[0];
          return last
            ? {
                kind: last.kind,
                id: last.id,
                status: last.status,
                state: last.state,
                createdAt: iso(last.created_at),
              }
            : null;
        };
        return {
          items: await Promise.all(
            rows.map(async (row) => {
              const pause = pauses.find(
                (one) => one.path === row.path && one.node_id === row.node_id,
              );
              const refusal = refusals.rows.find(
                (one) => one.path === row.path && one.node_id === row.node_id,
              );
              const body = row.body as { cron?: string; timezone?: string };
              const token =
                mayAddress && (row.type === "webhook" || row.type === "form")
                  ? await webhookToken(kernel, row)
                  : undefined;
              const address =
                row.type === "form"
                  ? `${kernel.config.publicUrl}/portal/${tenantSlug}/forms/${token}`
                  : `${kernel.config.publicUrl}/api/v1/hooks/${token}`;
              return {
                path: row.path,
                node: row.node_id,
                type: row.type,
                script: row.target_path,
                targetKind: row.target_kind,
                event: row.event_name,
                enabled: row.enabled,
                paused: pause
                  ? { at: iso(pause.paused_at), by: pause.paused_by, reason: pause.reason }
                  : null,
                lastRun: await lastRunOf(row),
                lastRefusal: refusal
                  ? {
                      reason: refusal.reason,
                      problem: refusal.problem,
                      at: iso(refusal.occurred_at),
                    }
                  : null,
                cron: body.cron ?? null,
                timezone: row.type === "schedule" ? (body.timezone ?? "UTC") : null,
                overlap:
                  row.type === "schedule"
                    ? ((row.config as { overlap?: "skip" }).overlap ?? ("allow" as const))
                    : null,
                lastSkippedAt: (row.config as { lastSkippedAt?: string }).lastSkippedAt ?? null,
                nextFireAt: isoOrNull(row.next_fire_at),
                lastFiredAt: isoOrNull(row.last_fired_at),
                url: token ? address : null,
              };
            }),
          ),
        };
      },
    );

    app.post(
      `${base}/schedule-firings`,
      {
        config: { access: access.workspace("run:write") },
        schema: {
          summary: "Start a schedule's run now",
          description:
            "Starts one run as the schedule's next time would, with its input, and leaves that " +
            "time where it is. The run's trigger says `manual: true`.",
          tags: ["runs"],
          params: WorkspaceParams,
          body: Type.Object({ path: Type.String({ maxLength: 255 }) }),
          response: {
            201: Type.Object({
              kind: Type.Union([Type.Literal("script"), Type.Literal("flow")]),
              id: Id,
            }),
          },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath({ "*": body.path });
        const started = await ctx.mutate(async (trx, audit) => {
          const made = await fireScheduleNow(kernel, trx, params.w, path);
          await audit({
            action: "schedule.fired",
            targetType: "schedule",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            details: { kind: made.kind, id: made.id },
          });
          return made;
        });
        await kickStarted(kernel, [started]);
        return reply.code(201).send(started);
      },
    );

    app.get(
      `${base}/schedule-preview`,
      {
        config: { access: access.workspace("trigger:read") },
        schema: {
          summary: "When a cron expression would fire next",
          description: "The next five times, worked out as the scheduler works them out.",
          tags: ["runs"],
          params: WorkspaceParams,
          querystring: Type.Object({
            cron: Type.String({ maxLength: 120 }),
            timezone: Type.Optional(Type.String({ maxLength: 64 })),
          }),
          response: { 200: Type.Object({ times: Type.Array(Time) }) },
        },
      },
      async ({ query }) => {
        try {
          return { times: nextFireTimes(query.cron, query.timezone).map(iso) };
        } catch (error) {
          throw badRequest("The schedule is not valid.", [
            {
              path: "/cron",
              message: `"${query.cron}" is not a usable cron expression${query.timezone ? ` in ${query.timezone}` : ""}: ${(error as Error).message}`,
            },
          ]);
        }
      },
    );

    const PauseParams = Type.Object({ t: Id, w: Id, "*": Type.String({ minLength: 1 }) });
    const PauseQuery = Type.Object({
      node: Type.Optional(
        Type.String({ maxLength: 200, description: "The trigger node, in a flow." }),
      ),
    });

    app.put(
      `${base}/trigger-pauses/*`,
      {
        config: { access: access.workspace("trigger:write") },
        schema: {
          summary: "Pause one trigger",
          description:
            "Nothing it would start is started until it is resumed, in any workspace, production " +
            "included. The pause outlives deploys. A paused schedule keeps its due time and fires " +
            "once when resumed; a paused webhook refuses requests and records that it did.",
          tags: ["runs"],
          params: PauseParams,
          querystring: PauseQuery,
          body: Type.Object({ reason: Type.Optional(Type.String({ maxLength: 500 })) }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, query, body }, reply) => {
        const path = params["*"];
        const node = query.node ?? "";
        const exists = await db
          .selectFrom("trigger_state")
          .innerJoin("resource", "resource.id", "trigger_state.resource_id")
          .select("trigger_state.resource_id")
          .where("trigger_state.workspace_id", "=", params.w)
          .where("resource.path", "=", path)
          .where("trigger_state.node_id", "=", node)
          .executeTakeFirst();
        if (!exists) throw notFound("That trigger");
        await ctx.mutate(async (trx, audit) => {
          await trx
            .insertInto("trigger_pause")
            .values({
              workspace_id: params.w,
              tenant_id: params.t,
              path,
              node_id: node,
              reason: body.reason ?? "",
              paused_by: ctx.principal.type === "member" ? ctx.principal.id : null,
            })
            .onConflict((c) =>
              c.columns(["workspace_id", "path", "node_id"]).doUpdateSet({
                reason: body.reason ?? "",
                paused_at: new Date(),
              }),
            )
            .execute();
          await audit({
            action: "trigger.paused",
            targetType: "trigger",
            targetId: null,
            tenantId: params.t,
            workspaceId: params.w,
            details: { path, node, ...(body.reason ? { reason: body.reason } : {}) },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      `${base}/trigger-pauses/*`,
      {
        config: { access: access.workspace("trigger:write") },
        schema: {
          summary: "Resume one trigger",
          tags: ["runs"],
          params: PauseParams,
          querystring: PauseQuery,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, query }, reply) => {
        const path = params["*"];
        const node = query.node ?? "";
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("trigger_pause")
            .where("workspace_id", "=", params.w)
            .where("path", "=", path)
            .where("node_id", "=", node)
            .executeTakeFirst();
          if (Number(removed.numDeletedRows) === 0) throw notFound("A pause on that trigger");
          await audit({
            action: "trigger.resumed",
            targetType: "trigger",
            targetId: null,
            tenantId: params.t,
            workspaceId: params.w,
            details: { path, node },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Connection bindings -----

    const ConnectionBinding = Type.Object({
      path: Type.String(),
      connector: Type.String(),
      description: Type.String(),
      defined: Type.Boolean({
        description: "Whether a deployed resource declares this connection.",
      }),
      bound: Type.Boolean(),
      config: Type.Union([AnyObject, Type.Null()]),
      configSchema: Type.Object(
        {},
        {
          additionalProperties: true,
          description:
            "The JSON Schema the connector gives for `config`. A form can be drawn from it.",
        },
      ),
      hasCredential: Type.Boolean(),
      updatedAt: NullableTime,
      health: Type.Union([
        Type.Object({
          ok: Type.Boolean(),
          problem: Type.Union([Type.String(), Type.Null()]),
          latencyMs: Type.Union([Type.Integer(), Type.Null()]),
          checkedAt: Time,
        }),
        Type.Null(),
      ]),
      oauth: Type.Union(
        [
          Type.Object({
            status: Type.Union([
              Type.Literal("not_connected"),
              Type.Literal("connected"),
              Type.Literal("needs_reconnect"),
            ]),
            expiresAt: NullableTime,
            scopes: Type.Array(Type.String()),
            connectedBy: Type.Union([Type.String(), Type.Null()]),
            connectedAt: NullableTime,
            problem: Type.Union([Type.String(), Type.Null()]),
          }),
          Type.Null(),
        ],
        { description: "For an OAuth connection: whether it is authorized. Null for any other." },
      ),
    });

    app.get(
      `${base}/connection-bindings`,
      {
        config: { access: access.workspace("connection:read") },
        schema: {
          summary: "Connections in a workspace and where each one points",
          description: "A credential is never returned, only whether one is set.",
          tags: ["bindings"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(ConnectionBinding) }) },
        },
      },
      async ({ params }) => {
        const definitions = await db
          .selectFrom("resource")
          .select(["path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "connection")
          .execute();
        // A connection declared in a draft is shown as what the draft says it is, until it is deployed.
        const drafted = await db
          .selectFrom("resource_draft")
          .select(["path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "connection")
          .where("deleted", "=", false)
          .execute();
        const bindings = await db
          .selectFrom("connection_binding")
          .select(["path", "config", "credential", "oauth", "updated_at"])
          .where("workspace_id", "=", params.w)
          .execute();
        const health = await db
          .selectFrom("health_check")
          .select(["path", "ok", "problem", "latency_ms", "checked_at"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "connection")
          .execute();
        const paths = [...new Set([...definitions, ...bindings].map((row) => row.path))].sort();
        const connectors = await deployedConnectors(params.w);
        type Declared = { connector?: string; description?: string } | undefined;
        return {
          items: paths.map((path) => {
            const deployed = definitions.find((row) => row.path === path)?.body as Declared;
            const definition =
              deployed ?? (drafted.find((row) => row.path === path)?.body as Declared);
            const binding = bindings.find((row) => row.path === path);
            const checked = health.find((row) => row.path === path);
            const connector = definition?.connector ?? "http";
            return {
              path,
              connector,
              description: definition?.description ?? "",
              defined: deployed !== undefined,
              bound: binding !== undefined,
              config: binding?.config ?? null,
              configSchema: (connectorSchema(connector, connectors) ??
                BUILTIN_CONFIG_SCHEMAS.http) as Record<string, unknown>,
              hasCredential: Boolean(binding?.credential),
              updatedAt: isoOrNull(binding?.updated_at ?? null),
              health:
                binding && checked
                  ? {
                      ok: checked.ok,
                      problem: checked.problem,
                      latencyMs: checked.latency_ms,
                      checkedAt: iso(checked.checked_at),
                    }
                  : null,
              oauth:
                connector === "oauth2" || binding?.oauth
                  ? {
                      status: binding?.oauth?.status ?? ("not_connected" as const),
                      expiresAt: binding?.oauth?.expiresAt ?? null,
                      scopes: binding?.oauth?.scopes ?? [],
                      connectedBy: binding?.oauth?.connectedBy ?? null,
                      connectedAt: binding?.oauth?.connectedAt ?? null,
                      problem: binding?.oauth?.problem ?? null,
                    }
                  : null,
            };
          }),
        };
      },
    );

    app.get(
      `${base}/connectors`,
      {
        config: { access: access.workspace("connection:read") },
        schema: {
          summary: "The kinds of connection this workspace can have",
          description:
            "The connectors every worker has, then the workspace's own as deployed, each with " +
            "the JSON Schema its settings must fit.",
          tags: ["bindings"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  name: Type.String(),
                  builtin: Type.Boolean(),
                  configSchema: AnyObject,
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const own = await deployedConnectors(params.w);
        return {
          items: [
            ...Object.entries(BUILTIN_CONFIG_SCHEMAS).map(([name, configSchema]) => ({
              name,
              builtin: true,
              configSchema: configSchema as Record<string, unknown>,
            })),
            ...own.map((row) => ({
              name: row.path,
              builtin: false,
              configSchema: ((row.body as { configSchema?: object }).configSchema ?? {}) as Record<
                string,
                unknown
              >,
            })),
          ],
        };
      },
    );

    // ----- Connection groups: members added per workspace, with no deploy -----

    const MemberKey = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$" });
    const MemberParams = Type.Object({ t: Id, w: Id, key: MemberKey, "*": Type.String() });

    app.get(
      `${base}/connection-groups`,
      {
        config: { access: access.workspace("connection:read") },
        schema: {
          summary: "The workspace's connection groups, each with its members",
          description: "A member's address is shown. Its credential never is.",
          tags: ["bindings"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  description: Type.String(),
                  connector: Type.String(),
                  configSchema: AnyObject,
                  members: Type.Array(
                    Type.Object({
                      key: Type.String(),
                      label: Type.String(),
                      config: AnyObject,
                      hasCredential: Type.Boolean(),
                      updatedAt: Time,
                    }),
                  ),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const groups = await db
          .selectFrom("resource")
          .select(["path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "connection_group")
          .orderBy("path")
          .execute();
        const members = await db
          .selectFrom("connection_group_member")
          .select(["group_path", "key", "label", "config", "credential", "updated_at"])
          .where("workspace_id", "=", params.w)
          .orderBy("key")
          .execute();
        const connectors = await deployedConnectors(params.w);
        return {
          items: groups.map((group) => {
            const body = group.body as { description?: string; connector?: string };
            return {
              path: group.path,
              description: body.description ?? "",
              connector: body.connector ?? "http",
              configSchema: (connectorSchema(body.connector ?? "http", connectors) ??
                BUILTIN_CONFIG_SCHEMAS.http) as Record<string, unknown>,
              members: members
                .filter((member) => member.group_path === group.path)
                .map((member) => ({
                  key: member.key,
                  label: member.label,
                  config: member.config,
                  hasCredential: member.credential !== null,
                  updatedAt: iso(member.updated_at),
                })),
            };
          }),
        };
      },
    );

    app.put(
      `${base}/connection-group-members/:key/*`,
      {
        config: { access: access.workspace("connection:write") },
        schema: {
          summary: "Add a member to a connection group, or change one",
          description:
            "Takes effect at once, with no deploy: the next run that asks for this key gets " +
            "it. Leave `credential` out to keep the stored one. Send null to remove it.",
          tags: ["bindings"],
          params: MemberParams,
          body: Type.Object({
            label: Type.Optional(Type.String({ maxLength: 200 })),
            config: AnyObject,
            credential: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 65536 }), Type.Null()]),
            ),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath(params);
        const group = await db
          .selectFrom("resource")
          .select("id")
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "connection_group")
          .where("path", "=", path)
          .executeTakeFirst();
        if (!group) throw notFound(`The connection group ${path}`);
        const issues = validateJson(
          await configSchemaOf(params.w, "connection_group", path),
          body.config,
          "/body/config",
        );
        if (issues.length > 0) throw badRequest("The member's configuration is not valid.", issues);
        await ctx.mutate(async (trx, audit) => {
          const { created } = await bindGroupMember(
            kernel,
            trx,
            { tenantId: params.t, workspaceId: params.w, group: path, key: params.key },
            { label: body.label, config: body.config },
            body.credential,
          );
          await audit({
            action: created ? "connection_group.member_added" : "connection_group.member_changed",
            targetType: "connection_group",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            // The address is recorded. The credential never is.
            details: {
              key: params.key,
              baseUrl: body.config.baseUrl,
              credentialChanged: body.credential !== undefined,
            },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      `${base}/connection-group-members/:key/*`,
      {
        config: { access: access.workspace("connection:write") },
        schema: {
          summary: "Remove a member from a connection group",
          description: "A run that asks for this key afterwards fails with a clear message.",
          tags: ["bindings"],
          params: MemberParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const path = wildPath(params);
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("connection_group_member")
            .where("workspace_id", "=", params.w)
            .where("group_path", "=", path)
            .where("key", "=", params.key)
            .returning("id")
            .executeTakeFirst();
          if (!removed)
            throw notFound(`The member "${params.key}" of the connection group ${path}`);
          await audit({
            action: "connection_group.member_removed",
            targetType: "connection_group",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            details: { key: params.key },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.put(
      `${base}/connection-bindings/*`,
      {
        config: { access: access.workspace("connection:write") },
        schema: {
          summary: "Bind a connection in this workspace",
          description:
            "Leave `credential` out to keep the stored one. Send null to remove it. A " +
            "connection can be bound before the bundle that declares it is deployed.",
          tags: ["bindings"],
          params: WildParams,
          body: Type.Object({
            config: AnyObject,
            credential: Type.Optional(
              Type.Union([Type.String({ minLength: 1, maxLength: 65536 }), Type.Null()]),
            ),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath(params);
        const issues = validateJson(
          await configSchemaOf(params.w, "connection", path),
          body.config,
          "/body/config",
        );
        if (issues.length > 0)
          throw badRequest("The connection's configuration is not valid.", issues);
        await ctx.mutate(async (trx, audit) => {
          const { created, changed } = await bindConnection(
            kernel,
            trx,
            { tenantId: params.t, workspaceId: params.w, path },
            body.config,
            body.credential,
          );
          // What a Test found says nothing about settings it did not try.
          if (changed) await forgetHealth(trx, params.w, path);
          await audit({
            action: created ? "connection.bound" : "connection.rebound",
            targetType: "connection",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            // Where it points is recorded, when the connector has such a thing. The credential never is.
            details: {
              ...(typeof body.config.baseUrl === "string" ? { baseUrl: body.config.baseUrl } : {}),
              ...(typeof body.config.host === "string" ? { host: body.config.host } : {}),
              credentialChanged: body.credential !== undefined,
            },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      `${base}/connection-bindings/*`,
      {
        config: { access: access.workspace("connection:write") },
        schema: {
          summary: "Remove a connection's binding",
          tags: ["bindings"],
          params: WildParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const path = wildPath(params);
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("connection_binding")
            .where("workspace_id", "=", params.w)
            .where("path", "=", path)
            .returning("id")
            .executeTakeFirst();
          if (!removed) throw notFound("The connection binding");
          await forgetHealth(trx, params.w, path);
          await audit({
            action: "connection.unbound",
            targetType: "connection",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.post(
      `${base}/connection-tests`,
      {
        config: { access: access.workspace("connection:write") },
        schema: {
          summary: "Try a bound connection",
          description:
            "One of the workspace's workers tries it: an http connection asks its base URL, " +
            "a mail server is connected to and signed in to, a connector of a bundle's own runs " +
            "its `test`. Follow the task it returns.",
          tags: ["bindings"],
          params: WorkspaceParams,
          body: Type.Object({ path: Type.String({ maxLength: 255 }) }),
          response: { 202: Task },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath({ "*": body.path });
        const bound = await db
          .selectFrom("connection_binding")
          .select("id")
          .where("workspace_id", "=", params.w)
          .where("path", "=", path)
          .executeTakeFirst();
        if (!bound) throw notFound(`A binding for ${path}`);
        // A connector that is not built in is run from the bundle the workspace runs now.
        const bundle = await db
          .selectFrom("workspace")
          .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
          .select(["bundle.id", "bundle.digest"])
          .where("workspace.id", "=", params.w)
          .executeTakeFirst();
        const task = await ctx.mutate(async (trx, audit) => {
          const queued = await queueTask(trx, {
            tenantId: params.t,
            workspaceId: params.w,
            kind: "test-connection",
            subject: path,
            request: {
              connection: path,
              ...(bundle ? { bundle: { id: bundle.id, digest: bundle.digest } } : {}),
            },
          });
          await audit({
            action: "connection.tested",
            targetType: "connection",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            details: { taskId: queued.id },
          });
          return queued;
        });
        return reply.code(202).send(toTask(task));
      },
    );

    // ----- OAuth connections: authorized once by a member, refreshed here -----

    app.post(
      `${base}/connection-oauth`,
      {
        config: { access: access.workspace("connection:write") },
        schema: {
          summary: "Begin authorizing an OAuth connection",
          description:
            "For a member in a browser: send it to the `url` returned. The provider sends it " +
            "back to this instance, which keeps the tokens, and then on to `returnTo`. The " +
            "connection must be bound first, with its client's settings and secret.",
          tags: ["bindings"],
          params: WorkspaceParams,
          body: Type.Object({
            path: Type.String({ maxLength: 255 }),
            returnTo: Type.Optional(Type.String({ maxLength: 2000, pattern: "^/(?![/\\\\])" })),
          }),
          response: { 200: Type.Object({ url: Type.String(), callback: Type.String() }) },
        },
      },
      async ({ ctx, params, body }) => {
        const path = wildPath({ "*": body.path });
        const startedBy = ctx.memberId;
        const begun = await ctx.mutate(async (trx, audit) => {
          const started = await beginAuthorization(
            kernel,
            trx,
            { tenantId: params.t, workspaceId: params.w, path },
            { startedBy, returnTo: body.returnTo },
          );
          await audit({
            action: "connection.oauth_started",
            targetType: "connection",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
          });
          return started;
        });
        return { url: begun.url, callback: callbackAddress(kernel) };
      },
    );

    app.get(
      "/oauth/connections/callback",
      {
        // Anyone may arrive here; who they are is read, to check they began it.
        config: { access: access.custom, rateLimit: { max: 60, timeWindow: "1 minute" } },
        schema: {
          summary: "Where an OAuth provider sends a member back",
          description:
            "For browsers. The answer is taken once, only from the member who began it, and " +
            "the code is exchanged for tokens. The browser is sent back to the console.",
          tags: ["bindings"],
          response: { 302: Type.Null() },
        },
      },
      async (request, reply) => {
        if ((await kernel.hosts.place(request)).kind !== "main") throw notFound("The page");
        const query = new URL(request.url, kernel.hosts.mainOrigin).searchParams;
        const back = (returnTo: string | null, said: Record<string, string>) => {
          const target = new URL(returnTo ?? "/", kernel.hosts.mainOrigin);
          for (const [name, value] of Object.entries(said)) target.searchParams.set(name, value);
          return reply
            .code(302)
            .header("location", `${target.pathname}${target.search}`)
            .header("cache-control", "no-store")
            .send(null);
        };
        try {
          const done = await finishAuthorization(kernel, query, request.ctx.actor);
          return back(done.returnTo, { oauth: "connected", connection: done.connection.path });
        } catch (error) {
          if (!(error instanceof AuthorizationRefused)) throw error;
          request.log.info({ reason: error.message }, "an OAuth connection was not authorized");
          return back(error.returnTo, {
            oauth_error: error.message,
            ...(error.connection ? { connection: error.connection.path } : {}),
          });
        }
      },
    );

    app.get(
      `${base}/tasks/:id`,
      {
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "A task a worker does for the platform",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: { 200: Task },
        },
      },
      async ({ params }) => {
        const task = await db
          .selectFrom("task")
          .selectAll()
          .where("id", "=", params.id)
          .where("workspace_id", "=", params.w)
          .executeTakeFirst();
        if (!task) throw notFound("The task");
        return toTask(task as TaskRow);
      },
    );

    // ----- Variable values -----

    app.get(
      `${base}/variable-values`,
      {
        config: { access: access.workspace("variable:read") },
        schema: {
          summary: "Variables in a workspace and their values",
          tags: ["bindings"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  description: Type.String(),
                  default: NullableString,
                  value: NullableString,
                  updatedAt: Type.Optional(NullableTime),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const definitions = await db
          .selectFrom("resource")
          .select(["path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "variable")
          .execute();
        const values = await db
          .selectFrom("variable_value")
          .selectAll()
          .where("workspace_id", "=", params.w)
          .execute();
        const paths = [...new Set([...definitions, ...values].map((row) => row.path))].sort();
        return {
          items: paths.map((path) => {
            const definition = definitions.find((row) => row.path === path)?.body as
              | { description?: string; default?: string }
              | undefined;
            return {
              path,
              description: definition?.description ?? "",
              default: definition?.default ?? null,
              value: values.find((row) => row.path === path)?.value ?? null,
              updatedAt: isoOrNull(values.find((row) => row.path === path)?.updated_at ?? null),
            };
          }),
        };
      },
    );

    app.put(
      `${base}/variable-values/*`,
      {
        config: { access: access.workspace("variable:write") },
        schema: {
          summary: "Set a variable's value in this workspace",
          tags: ["bindings"],
          params: WildParams,
          body: Type.Object({ value: Type.String({ maxLength: 65536 }) }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const path = wildPath(params);
        await ctx.mutate(async (trx, audit) => {
          await trx
            .insertInto("variable_value")
            .values({
              id: newId(),
              tenant_id: params.t,
              workspace_id: params.w,
              path,
              value: body.value,
              updated_at: new Date(),
            })
            .onConflict((oc) =>
              oc
                .columns(["workspace_id", "path"])
                .doUpdateSet({ value: body.value, updated_at: new Date() }),
            )
            .execute();
          await audit({
            action: "variable.set",
            targetType: "variable",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            details: { value: body.value },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      `${base}/variable-values/*`,
      {
        config: { access: access.workspace("variable:write") },
        schema: {
          summary: "Clear a variable's value, so its default applies",
          tags: ["bindings"],
          params: WildParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const path = wildPath(params);
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("variable_value")
            .where("workspace_id", "=", params.w)
            .where("path", "=", path)
            .returning("id")
            .executeTakeFirst();
          if (!removed) throw notFound("The variable value");
          await audit({
            action: "variable.cleared",
            targetType: "variable",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Workers -----

    app.get(
      "/tenants/:t/worker-credentials",
      {
        config: { access: access.tenant("worker:read") },
        schema: {
          summary: "Credentials for standalone workers",
          tags: ["workers"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(WorkerCredential) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("worker_credential")
          .selectAll()
          .where("tenant_id", "=", params.t)
          .where("managed", "=", false)
          .orderBy("id", "desc")
          .execute();
        return { items: rows.map(toCredential) };
      },
    );

    app.post(
      "/tenants/:t/worker-credentials",
      {
        config: { access: access.tenant("worker:write") },
        schema: {
          summary: "Create a credential for a standalone worker",
          description:
            "The worker can run this tenant's code, or only one workspace's when `workspaceId` is given.",
          tags: ["workers"],
          params: TenantParams,
          body: Type.Object({
            name: Name,
            workspaceId: Type.Optional(Id),
            pool: Type.Optional(
              Type.String({
                pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
                maxLength: 40,
                description:
                  "The pool this worker serves. It then runs only scripts that name this pool, " +
                  "and no others. Without it, the worker runs scripts that name no pool.",
              }),
            ),
          }),
          response: {
            201: Type.Object({
              ...WorkerCredential.properties,
              token: Type.String({
                description: "The credential itself. Shown only in this response.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const created = await ctx.mutate(async (trx, audit) => {
          if (body.workspaceId) {
            const workspace = await trx
              .selectFrom("workspace")
              .select("id")
              .where("id", "=", body.workspaceId)
              .where("tenant_id", "=", params.t)
              .executeTakeFirst();
            if (!workspace) throw badRequest("The workspace is not in this tenant.");
          }
          // A credential for a pool not made yet makes it, so every pool served is a record.
          if (body.pool)
            await trx
              .insertInto("worker_pool")
              .values({ id: newId(), tenant_id: params.t, name: body.pool })
              .onConflict((c) => c.columns(["tenant_id", "name"]).doNothing())
              .execute();
          const credential = await createWorkerCredential(trx, {
            tenantId: params.t,
            workspaceId: body.workspaceId ?? null,
            name: body.name,
            pool: body.pool ?? null,
          });
          await audit({
            action: "worker_credential.created",
            targetType: "worker_credential",
            targetId: credential.row.id,
            tenantId: params.t,
            workspaceId: body.workspaceId ?? null,
            details: { name: body.name },
          });
          return credential;
        });
        return reply.code(201).send({ ...toCredential(created.row), token: created.token });
      },
    );

    app.delete(
      "/tenants/:t/worker-credentials/:id",
      {
        config: { access: access.tenant("worker:write") },
        schema: {
          summary: "Revoke a worker credential",
          tags: ["workers"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const revoked = await trx
            .updateTable("worker_credential")
            .set({ revoked_at: new Date() })
            .where("id", "=", params.id)
            .where("tenant_id", "=", params.t)
            .where("revoked_at", "is", null)
            .returning("id")
            .executeTakeFirst();
          if (!revoked) throw notFound("The worker credential");
          await audit({
            action: "worker_credential.revoked",
            targetType: "worker_credential",
            targetId: params.id,
            tenantId: params.t,
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/tenants/:t/workers",
      {
        config: { access: access.tenant("worker:read") },
        schema: {
          summary: "Workers heard from recently",
          tags: ["workers"],
          params: TenantParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  id: Id,
                  credentialName: Type.String(),
                  managed: Type.Boolean(),
                  version: NullableString,
                  outdated: Type.Boolean({
                    description:
                      "Older than the protocol this control plane speaks: it takes no tasks. Update it.",
                  }),
                  startedAt: Time,
                  lastSeenAt: Time,
                  running: Type.Array(
                    Type.Object({
                      runId: Id,
                      workspaceId: Id,
                      script: Type.String(),
                      startedAt: NullableTime,
                    }),
                    { description: "The runs it holds now." },
                  ),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const holding = await db
          .selectFrom("run")
          .select(["id", "workspace_id", "script_path", "started_at", "worker_id"])
          .where("tenant_id", "=", params.t)
          .where("status", "=", "running")
          .where("worker_id", "is not", null)
          .orderBy("started_at")
          .execute();
        const rows = await db
          .selectFrom("worker")
          .innerJoin("worker_credential", "worker_credential.id", "worker.credential_id")
          .select([
            "worker.id",
            "worker.version",
            "worker.started_at",
            "worker.last_seen_at",
            "worker_credential.name",
            "worker_credential.managed",
          ])
          .where("worker.tenant_id", "=", params.t)
          .where("worker.last_seen_at", ">", new Date(Date.now() - WORKER_STALE_SECONDS * 1000))
          .orderBy("worker.started_at", "desc")
          .execute();
        return {
          items: rows.map((row) => ({
            id: row.id,
            credentialName: row.name,
            managed: row.managed,
            version: row.version,
            outdated: olderThan(row.version, TASKS_SINCE),
            startedAt: iso(row.started_at),
            lastSeenAt: iso(row.last_seen_at),
            running: holding
              .filter((run) => run.worker_id === row.id)
              .map((run) => ({
                runId: run.id,
                workspaceId: run.workspace_id,
                script: run.script_path,
                startedAt: isoOrNull(run.started_at),
              })),
          })),
        };
      },
    );

    app.get(
      "/tenants/:t/queue",
      {
        config: { access: access.tenant("worker:read") },
        schema: {
          summary: "What waits for a worker, by workspace and pool",
          description:
            "Runs due now, runs set for later, how long the oldest due one has waited, and " +
            "how many are running, for each workspace and pool with any; and the tasks waiting.",
          tags: ["workers"],
          params: TenantParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  workspaceId: Id,
                  workspace: Type.String(),
                  pool: NullableString,
                  due: Type.Integer(),
                  later: Type.Integer(),
                  running: Type.Integer(),
                  oldestSeconds: Type.Union([Type.Integer(), Type.Null()]),
                }),
              ),
              tasks: Type.Array(
                Type.Object({ workspaceId: Id, kind: Type.String(), waiting: Type.Integer() }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const rows = await sql<{
          workspace_id: string;
          slug: string;
          pool: string | null;
          due: string;
          later: string;
          running: string;
          oldest: string | null;
        }>`
          select r.workspace_id, w.slug, r.pool,
            count(*) filter (where r.status = 'queued' and coalesce(r.scheduled_for, r.created_at) <= now()) as due,
            count(*) filter (where r.status = 'queued' and r.scheduled_for > now()) as later,
            count(*) filter (where r.status = 'running') as running,
            extract(epoch from now() - min(coalesce(r.scheduled_for, r.created_at))
              filter (where r.status = 'queued' and coalesce(r.scheduled_for, r.created_at) <= now())) as oldest
          from run r join workspace w on w.id = r.workspace_id
          where r.tenant_id = ${params.t} and r.status in ('queued', 'running')
          group by r.workspace_id, w.slug, r.pool
          order by due desc, w.slug
        `.execute(db);
        const tasks = await sql<{ workspace_id: string; kind: string; n: string }>`
          select workspace_id, kind, count(*) as n from task
          where tenant_id = ${params.t} and status = 'queued'
          group by workspace_id, kind
        `.execute(db);
        return {
          items: rows.rows.map((row) => ({
            workspaceId: row.workspace_id,
            workspace: row.slug,
            pool: row.pool,
            due: Number(row.due),
            later: Number(row.later),
            running: Number(row.running),
            oldestSeconds: row.oldest === null ? null : Math.max(0, Math.round(Number(row.oldest))),
          })),
          tasks: tasks.rows.map((row) => ({
            workspaceId: row.workspace_id,
            kind: row.kind,
            waiting: Number(row.n),
          })),
        };
      },
    );

    // ----- Webhooks -----

    // A webhook's body is taken as it was sent, whatever its type: a signature is over
    // those exact bytes. Only this address is read this way.
    await app.register(async (plain) => {
      const hooks = plain.withTypeProvider<TypeBoxTypeProvider>();
      hooks.removeAllContentTypeParsers();
      hooks.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) =>
        done(null, body),
      );
      hooks.post(
        "/hooks/:token",
        {
          config: {
            access: access.public,
            rateLimit: { max: 120, timeWindow: "1 minute" },
          },
          schema: {
            summary: "Start a run from a webhook",
            description:
              "The token in the address is the credential. The body may be JSON, a form " +
              "(`application/x-www-form-urlencoded`) or text, and becomes the script's input. " +
              "A trigger whose `input` is `request` is given the headers, the query, the method " +
              "and the raw body as well. A trigger with `verify` checks the request's signature " +
              "first and answers 401 when it does not match. Send an `idempotency-key` header " +
              "to make a repeated delivery harmless. A flow whose webhook trigger says " +
              "`respond: flow` answers the request itself, with a respond step: the request is " +
              "held open for up to 25 seconds, and answered 202 if the flow has said nothing by " +
              "then. Such an answer carries the flow run's ID in `x-flow-run`.",
            tags: ["runs"],
            params: Type.Object({ token: Type.String({ maxLength: 200 }) }),
            response: { 202: Type.Object({ runId: Id }) },
          },
        },
        async ({ params, body, headers, query, method, raw }, reply) => {
          const key = headers["idempotency-key"];
          const flat: Record<string, string> = {};
          for (const [name, value] of Object.entries(headers)) {
            if (value !== undefined) flat[name] = Array.isArray(value) ? value.join(", ") : value;
          }
          const outcome = await fireWebhook(
            kernel,
            params.token,
            {
              method,
              headers: flat,
              query: Object.fromEntries(
                Object.entries(query as Record<string, unknown>).map(([name, value]) => [
                  name,
                  String(value),
                ]),
              ),
              raw: Buffer.isBuffer(body) ? body : Buffer.alloc(0),
            },
            typeof key === "string" && key.length > 0 && key.length <= 200 ? key : undefined,
          );
          if (!outcome) throw notFound("The webhook");
          if ("refused" in outcome) {
            if (outcome.refused === "paused") {
              // A sender that retries will get through once the workspace is resumed.
              throw new HttpError(
                503,
                "workspace_paused",
                "This workspace's triggers are paused, so the webhook started nothing. Try again later.",
              );
            }
            if (outcome.refused === "signature") {
              throw new HttpError(
                401,
                "signature_invalid",
                outcome.problem ?? "The signature does not match.",
              );
            }
            throw badRequest(outcome.problem ?? "The request could not be read.");
          }
          if ("awaits" in outcome && outcome.awaits) {
            const answer = await awaitResponse(
              kernel,
              outcome.started.id,
              () => raw.socket.destroyed,
            );
            if (answer) {
              const text = typeof answer.body === "string";
              // The answer is a tenant's, sent from the platform's address: a browser must never run it.
              return (reply as unknown as FastifyReply)
                .code(answer.status)
                .headers({
                  "content-type": text ? "text/plain; charset=utf-8" : "application/json",
                  ...answer.headers,
                  "content-security-policy": "default-src 'none'; sandbox",
                  "x-content-type-options": "nosniff",
                  "x-flow-run": outcome.started.id,
                })
                .send(text ? answer.body : JSON.stringify(answer.body ?? null));
            }
          }
          return reply.code(202).send({ runId: outcome.started.id });
        },
      );
    });

    // ----- Operator health -----

    app.get(
      "/metrics",
      {
        config: { access: access.instance("instance:read") },
        schema: {
          summary: "Instance metrics in Prometheus text format",
          tags: ["instance"],
          response: { 200: Type.String() },
        },
      },
      async (_request, reply) => {
        const runs = await sql<{ status: string; n: string }>`
          select status, count(*) as n from run where status in ('queued', 'running') group by status
        `.execute(db);
        const oldest = await sql<{ seconds: string | null }>`
          select extract(epoch from now() - min(coalesce(scheduled_for, created_at))) as seconds
          from run where status = 'queued' and coalesce(scheduled_for, created_at) <= now()
        `.execute(db);
        const workers = await sql<{ managed: boolean; n: string }>`
          select c.managed, count(*) as n from worker w
          join worker_credential c on c.id = w.credential_id
          where w.last_seen_at > now() - make_interval(secs => ${WORKER_STALE_SECONDS})
          group by c.managed
        `.execute(db);
        const count = (status: string) =>
          Number(runs.rows.find((row) => row.status === status)?.n ?? 0);
        const workerCount = (managed: boolean) =>
          Number(workers.rows.find((row) => row.managed === managed)?.n ?? 0);
        const lines = [
          "# HELP platform_runs_queued Runs waiting for a worker.",
          "# TYPE platform_runs_queued gauge",
          `platform_runs_queued ${count("queued")}`,
          "# HELP platform_runs_running Runs in progress.",
          "# TYPE platform_runs_running gauge",
          `platform_runs_running ${count("running")}`,
          "# HELP platform_queue_oldest_seconds Age of the oldest run that is due and still waiting.",
          "# TYPE platform_queue_oldest_seconds gauge",
          `platform_queue_oldest_seconds ${Math.max(0, Math.round(Number(oldest.rows[0]?.seconds ?? 0)))}`,
          "# HELP platform_workers Workers heard from recently.",
          "# TYPE platform_workers gauge",
          `platform_workers{kind="managed"} ${workerCount(true)}`,
          `platform_workers{kind="standalone"} ${workerCount(false)}`,
        ];

        // Where the work waits, by workspace and pool: from the database, so every replica agrees.
        const byPlace = kernel.config.metricsWorkspaceLabels;
        const waiting = await sql<{
          tenant: string;
          workspace: string;
          pool: string | null;
          n: string;
          oldest: string | null;
        }>`
          select t.slug as tenant, w.slug as workspace, r.pool, count(*) as n,
            extract(epoch from now() - min(coalesce(r.scheduled_for, r.created_at))) as oldest
          from run r
          join workspace w on w.id = r.workspace_id
          join tenant t on t.id = r.tenant_id
          where r.status = 'queued' and coalesce(r.scheduled_for, r.created_at) <= now()
          group by t.slug, w.slug, r.pool
        `.execute(db);
        if (byPlace) {
          lines.push(
            "# HELP platform_workspace_runs_queued Runs due and waiting for a worker, by workspace and pool.",
            "# TYPE platform_workspace_runs_queued gauge",
            ...waiting.rows.map(
              (row) =>
                `platform_workspace_runs_queued${labelText({ tenant: row.tenant, workspace: row.workspace, pool: row.pool ?? "default" })} ${Number(row.n)}`,
            ),
            "# HELP platform_workspace_queue_oldest_seconds How long the oldest due run of a workspace has waited.",
            "# TYPE platform_workspace_queue_oldest_seconds gauge",
          );
          const oldestBy = new Map<
            string,
            { tenant: string; workspace: string; seconds: number }
          >();
          for (const row of waiting.rows) {
            const key = `${row.tenant}/${row.workspace}`;
            const seconds = Math.max(0, Math.round(Number(row.oldest ?? 0)));
            if ((oldestBy.get(key)?.seconds ?? -1) < seconds) {
              oldestBy.set(key, { tenant: row.tenant, workspace: row.workspace, seconds });
            }
          }
          for (const one of oldestBy.values()) {
            lines.push(
              `platform_workspace_queue_oldest_seconds${labelText({ tenant: one.tenant, workspace: one.workspace })} ${one.seconds}`,
            );
          }
        }
        const flows = await sql<{ state: string; n: string }>`
          select ${flowStateSql("f")} as state, count(*) as n from flow_run f
          where f.status = 'running' group by 1
        `.execute(db);
        lines.push(
          "# HELP platform_flow_runs Flow runs in progress, by state.",
          "# TYPE platform_flow_runs gauge",
          ...flows.rows.map(
            (row) => `platform_flow_runs${labelText({ state: row.state })} ${Number(row.n)}`,
          ),
        );
        const tasks = await sql<{ kind: string; n: string }>`
          select kind, count(*) as n from task where status = 'queued' group by kind
        `.execute(db);
        lines.push(
          "# HELP platform_tasks_queued Tasks waiting for a worker, by kind.",
          "# TYPE platform_tasks_queued gauge",
          ...tasks.rows.map(
            (row) => `platform_tasks_queued${labelText({ kind: row.kind })} ${Number(row.n)}`,
          ),
        );
        // What each machine that shares its slots is running: the gauge to set an alert on
        // beside the slots the operator gave it.
        const machines = await sql<{ machine: string; n: number }>`
          select w.machine, count(*)::int as n
          from (
            select worker_id from run where status = 'running'
            union all
            select worker_id from task where status = 'running'
          ) busy
          join worker w on w.id = busy.worker_id
          where w.machine is not null
          group by w.machine
        `.execute(db);
        lines.push(
          "# HELP platform_machine_running Scripts running on each machine whose workers share its run slots.",
          "# TYPE platform_machine_running gauge",
          ...machines.rows.map(
            (row) => `platform_machine_running${labelText({ machine: row.machine })} ${row.n}`,
          ),
        );
        const pools = await kernel.data.poolStats();
        lines.push(
          "# HELP platform_db_pool Connections of this replica's pools to the platform database: open, idle, and requests waiting for one.",
          "# TYPE platform_db_pool gauge",
          ...Object.entries(pools).flatMap(([pool, stats]) =>
            (["total", "idle", "waiting"] as const).map(
              (state) => `platform_db_pool${labelText({ pool, state })} ${stats[state]}`,
            ),
          ),
        );
        const size = await sql<{ bytes: string }>`
          select pg_database_size(current_database()) as bytes
        `.execute(db);
        const readOnly = await kernel.readOnly().catch(() => false);
        lines.push(
          "# HELP platform_database_size_bytes The platform database's size on disk. Alert well before its volume is full.",
          "# TYPE platform_database_size_bytes gauge",
          `platform_database_size_bytes ${Number(size.rows[0]?.bytes ?? 0)}`,
          "# HELP platform_database_read_only 1 while the platform database takes no writes, such as when its disk is full.",
          "# TYPE platform_database_read_only gauge",
          `platform_database_read_only ${readOnly ? 1 : 0}`,
        );
        const memory = procProbe.memory();
        if (memory) {
          lines.push(
            "# HELP platform_memory_available_bytes Memory this replica's machine can still give out.",
            "# TYPE platform_memory_available_bytes gauge",
            `platform_memory_available_bytes ${Math.round(memory.availableMb * 1024 * 1024)}`,
            "# HELP platform_memory_total_bytes All of this replica's machine's memory.",
            "# TYPE platform_memory_total_bytes gauge",
            `platform_memory_total_bytes ${Math.round(memory.totalMb * 1024 * 1024)}`,
          );
        }

        // What this replica counted, with workspaces named by their slugs.
        const ids = [...kernel.metrics.workspaceIds()];
        const names = new Map(
          (ids.length === 0
            ? []
            : await db
                .selectFrom("workspace")
                .innerJoin("tenant", "tenant.id", "workspace.tenant_id")
                .select(["workspace.id", "workspace.slug", "tenant.slug as tenant"])
                .where("workspace.id", "in", ids)
                .execute()
          ).map((row) => [row.id, { tenant: row.tenant, workspace: row.slug }]),
        );
        const counted = kernel.metrics.render((labels) => {
          const { workspace, ...rest } = labels;
          if (workspace === undefined) return labels;
          if (!byPlace) return rest;
          const named = names.get(workspace);
          // Where it was first, then what it was.
          return named ? { ...named, ...rest } : { tenant: "gone", workspace: "gone", ...rest };
        });
        return reply.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n${counted}`);
      },
    );
  };
}
