import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId, sql } from "@vynxlabs/db";
import { PATH_PATTERN, validateJson } from "@vynxlabs/manifest";
import { httpConnector } from "@vynxlabs/sdk";
import { Type } from "typebox";
import { badRequest, notFound } from "../kernel/errors.js";
import { bindConnection } from "../kernel/execution/bindings.js";
import { MAX_BUNDLE_BYTES, storeBundle } from "../kernel/execution/bundles.js";
import { deployBundle } from "../kernel/execution/deploy.js";
import { cancelRun, readPayload, type ScriptBody, startRun } from "../kernel/execution/runs.js";
import { fireWebhook, webhookToken } from "../kernel/execution/triggers.js";
import { createWorkerCredential, WORKER_STALE_SECONDS } from "../kernel/execution/workers.js";
import { publishPlatformEvent } from "../kernel/flows/events.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { PageQuery, pageOf } from "../pagination.js";
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
const WildParams = Type.Object({ t: Id, w: Id, "*": Type.String() });
function wildPath(params: { "*": string }): string {
  const path = params["*"];
  if (!pathPattern.test(path) || path.length > 255) throw badRequest("The path is not valid.");
  return path;
}

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
});
const Deployment = Type.Object({
  id: Id,
  bundleId: Id,
  bundleVersion: Type.Integer(),
  previousBundleId: NullableId,
  summary: AnyObject,
  createdByType: Type.String(),
  createdById: NullableId,
  createdAt: Time,
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
  attempt: Type.Integer(),
  maxAttempts: Type.Integer(),
  trigger: AnyObject,
  startedBy: Type.Object({ type: Type.String(), id: NullableId }),
  bundleId: Id,
  bundleVersion: Type.Integer(),
  error: Type.Union([Type.Object({ message: Type.String() }), Type.Null()]),
  createdAt: Time,
  startedAt: NullableTime,
  finishedAt: NullableTime,
});
const RunDetail = Type.Object({
  ...Run.properties,
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
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}
const toRun = (row: RunRow, bundleVersion: number) => ({
  id: row.id,
  script: row.script_path,
  status: row.status,
  attempt: row.attempt,
  maxAttempts: row.max_attempts,
  trigger: { type: row.trigger_type, ...row.trigger_detail },
  startedBy: { type: row.started_by_type, id: row.started_by_id },
  bundleId: row.bundle_id,
  bundleVersion,
  error: row.error ? { message: row.error.message } : null,
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
  expiresAt: isoOrNull(row.expires_at),
  revokedAt: isoOrNull(row.revoked_at),
  createdAt: iso(row.created_at),
});

export function executionRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";
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
            "Stores the bundle as the workspace's next version. It does not run until it is deployed.",
          tags: ["deploys"],
          params: WorkspaceParams,
          body: AnyObject,
          response: { 200: Bundle, 201: Bundle },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const result = await ctx.mutate((trx, audit) =>
          storeBundle(kernel, trx, audit, workspace, ctx.principal, body),
        );
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
            "deployment.summary",
            "deployment.created_by_type",
            "deployment.created_by_id",
            "deployment.created_at",
            "bundle.version",
          ])
          .where("deployment.workspace_id", "=", params.w)
          .orderBy("deployment.id", "desc")
          .limit(100)
          .execute();
        return {
          items: rows.map((row) => ({
            id: row.id,
            bundleId: row.bundle_id,
            bundleVersion: row.version,
            previousBundleId: row.previous_bundle_id,
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
          body: Type.Object({ bundleId: Id }),
          response: {
            201: Type.Object({
              id: Id,
              bundleId: Id,
              bundleVersion: Type.Integer(),
              summary: Summary,
            }),
          },
        },
      },
      async ({ ctx, body }, reply) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const result = await ctx.mutate((trx, audit) =>
          deployBundle(kernel, trx, audit, workspace, ctx.principal, body.bundleId),
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
                  lastRun: Type.Union([
                    Type.Object({ id: Id, status: RunStatus, createdAt: Time }),
                    Type.Null(),
                  ]),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const scripts = await db
          .selectFrom("resource")
          .select(["path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "script")
          .orderBy("path")
          .execute();
        const latest = await sql<{
          script_path: string;
          id: string;
          status: RunRow["status"];
          created_at: Date;
        }>`
          select distinct on (script_path) script_path, id, status, created_at
          from run where workspace_id = ${params.w}
          order by script_path, id desc
        `.execute(db);
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
              lastRun: last
                ? { id: last.id, status: last.status, createdAt: iso(last.created_at) }
                : null,
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
        config: { access: access.workspace("run:write") },
        schema: {
          summary: "Start a run of a script",
          description:
            "Starting again with the same `idempotencyKey` for the same script returns the first run.",
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
        config: { access: access.workspace("run:read") },
        schema: {
          summary: "One run, with its input and output",
          tags: ["runs"],
          params: Type.Object({ t: Id, w: Id, id: Id }),
          response: { 200: RunDetail },
        },
      },
      async ({ params }) => {
        const row = await findRun(params.w, params.id);
        return {
          ...toRun(row, row.bundle_version),
          input: await readPayload(kernel, row.input, row.input_ref),
          output: await readPayload(kernel, row.output, row.output_ref),
          alert: row.alert,
          idempotencyKey: row.idempotency_key,
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
          summary: "Schedules and webhooks in a workspace",
          description: "A webhook's address is included only for callers who hold `trigger:write`.",
          tags: ["runs"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  type: Type.String(),
                  script: Type.String(),
                  enabled: Type.Boolean(),
                  cron: NullableString,
                  timezone: NullableString,
                  nextFireAt: NullableTime,
                  lastFiredAt: NullableTime,
                  url: NullableString,
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
        const mayAddress = await ctx.allowed("trigger:write", {
          tenantId: params.t,
          workspaceId: params.w,
        });
        return {
          items: await Promise.all(
            rows.map(async (row) => {
              const body = row.body as { cron?: string; timezone?: string };
              const token =
                mayAddress && row.type === "webhook" ? await webhookToken(kernel, row) : undefined;
              return {
                path: row.path,
                type: row.type,
                script: row.target_path,
                enabled: row.enabled,
                cron: body.cron ?? null,
                timezone: row.type === "schedule" ? (body.timezone ?? "UTC") : null,
                nextFireAt: isoOrNull(row.next_fire_at),
                lastFiredAt: isoOrNull(row.last_fired_at),
                url: token ? `${kernel.config.publicUrl}/api/v1/hooks/${token}` : null,
              };
            }),
          ),
        };
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
      hasCredential: Type.Boolean(),
      updatedAt: NullableTime,
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
        const bindings = await db
          .selectFrom("connection_binding")
          .selectAll()
          .where("workspace_id", "=", params.w)
          .execute();
        const paths = [...new Set([...definitions, ...bindings].map((row) => row.path))].sort();
        return {
          items: paths.map((path) => {
            const definition = definitions.find((row) => row.path === path)?.body as
              | { connector?: string; description?: string }
              | undefined;
            const binding = bindings.find((row) => row.path === path);
            return {
              path,
              connector: definition?.connector ?? "http",
              description: definition?.description ?? "",
              defined: definition !== undefined,
              bound: binding !== undefined,
              config: binding?.config ?? null,
              hasCredential: Boolean(binding?.credential),
              updatedAt: isoOrNull(binding?.updated_at ?? null),
            };
          }),
        };
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
        const issues = validateJson(httpConnector.configSchema, body.config, "/body/config");
        if (issues.length > 0)
          throw badRequest("The connection's configuration is not valid.", issues);
        await ctx.mutate(async (trx, audit) => {
          const { created } = await bindConnection(
            kernel,
            trx,
            { tenantId: params.t, workspaceId: params.w, path },
            body.config,
            body.credential,
          );
          await audit({
            action: created ? "connection.bound" : "connection.rebound",
            targetType: "connection",
            targetId: path,
            tenantId: params.t,
            workspaceId: params.w,
            // The address is recorded. The credential never is.
            details: {
              baseUrl: body.config.baseUrl,
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
          body: Type.Object({ name: Name, workspaceId: Type.Optional(Id) }),
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
          const credential = await createWorkerCredential(trx, {
            tenantId: params.t,
            workspaceId: body.workspaceId ?? null,
            name: body.name,
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
                  startedAt: Time,
                  lastSeenAt: Time,
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
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
            startedAt: iso(row.started_at),
            lastSeenAt: iso(row.last_seen_at),
          })),
        };
      },
    );

    // ----- Webhooks -----

    app.post(
      "/hooks/:token",
      {
        config: {
          access: access.public,
          rateLimit: { max: 120, timeWindow: "1 minute" },
        },
        schema: {
          summary: "Start a run from a webhook",
          description:
            "The token in the address is the credential. The JSON body becomes the script's " +
            "input. Send an `idempotency-key` header to make a repeated delivery harmless.",
          tags: ["runs"],
          params: Type.Object({ token: Type.String({ maxLength: 200 }) }),
          body: Type.Optional(Type.Unknown()),
          response: { 202: Type.Object({ runId: Id }) },
        },
      },
      async ({ params, body, headers }, reply) => {
        const key = headers["idempotency-key"];
        const started = await fireWebhook(
          kernel,
          params.token,
          body,
          typeof key === "string" && key.length > 0 && key.length <= 200 ? key : undefined,
        );
        if (!started) throw notFound("The webhook");
        return reply.code(202).send({ runId: started.id });
      },
    );

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
        return reply.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
      },
    );
  };
}
