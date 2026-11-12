import { setTimeout as sleep } from "node:timers/promises";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HEARTBEAT_SECONDS } from "@vynxlabs/db";
import { Type } from "typebox";
import { forbidden, notFound } from "../kernel/errors.js";
import { readConnection } from "../kernel/execution/bindings.js";
import { bundleManifest, loadBundle } from "../kernel/execution/bundles.js";
import {
  activeRun,
  claimRun,
  completeRun,
  failRun,
  queueName,
  readPayload,
  type ScriptBody,
} from "../kernel/execution/runs.js";
import { seeWorker } from "../kernel/execution/workers.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { revealSecret } from "../kernel/secrets.js";
import { AnyObject, Id, NoContent, Time } from "./shared.js";

const Attempt = Type.Integer({ minimum: 1 });
const RunParams = Type.Object({ id: Id });
const AttemptQuery = Type.Object({ attempt: Attempt });

const Job = Type.Object({
  runId: Id,
  attempt: Attempt,
  workspaceId: Id,
  script: Type.Object({ path: Type.String(), entry: Type.String() }),
  input: Type.Unknown(),
  bundle: Type.Object({ id: Id, digest: Type.String() }),
  timeoutSeconds: Type.Integer(),
  heartbeatSeconds: Type.Integer({ description: "Send a heartbeat at least this often." }),
  idempotencyKey: Type.String(),
  trigger: AnyObject,
});

const MAX_WAIT_SECONDS = 25;
const MAX_LOG_MESSAGE = 8000;

/**
 * The worker protocol: the second language-neutral contract. A worker in any
 * language that speaks these routes can run a workspace's code.
 */
export function workerRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const config = { access: access.worker };

    /** The script manifest a run is pinned to, from the bundle it started on. */
    async function pinned(scope: Parameters<typeof activeRun>[1], runId: string, attempt: number) {
      const run = await activeRun(db, scope, runId, attempt);
      const bundle = await db
        .selectFrom("bundle")
        .select(["id", "storage_key"])
        .where("id", "=", run.bundle_id)
        .executeTakeFirstOrThrow();
      const manifest = await bundleManifest(kernel, bundle, "script", run.script_path);
      if (!manifest) throw notFound("The script");
      return { run, body: manifest.body as unknown as ScriptBody };
    }

    app.post(
      "/worker/claim",
      {
        config,
        schema: {
          summary: "Claim the next job",
          description:
            "Waits up to `waitSeconds` for a job. An empty reply means there was none: call again.",
          tags: ["worker protocol"],
          body: Type.Object({
            workerId: Id,
            version: Type.Optional(Type.String({ maxLength: 64 })),
            waitSeconds: Type.Optional(
              Type.Integer({ minimum: 0, maximum: MAX_WAIT_SECONDS, default: 20 }),
            ),
          }),
          response: { 200: Type.Object({ job: Type.Union([Job, Type.Null()]) }) },
        },
      },
      async ({ worker, body, raw }) => {
        await seeWorker(kernel, worker, body.workerId, body.version);
        const deadline = Date.now() + (body.waitSeconds ?? 20) * 1000;
        // A worker that hung up must not be handed a job.
        const gone = () => raw.socket.destroyed;
        for (;;) {
          const claimed = await claimRun(kernel, worker, body.workerId, gone);
          if (claimed) {
            const { run } = claimed;
            const bundle = await db
              .selectFrom("bundle")
              .select(["id", "digest", "storage_key"])
              .where("id", "=", run.bundle_id)
              .executeTakeFirstOrThrow();
            const manifest = await bundleManifest(kernel, bundle, "script", run.script_path);
            return {
              job: {
                runId: run.id,
                attempt: run.attempt,
                workspaceId: run.workspace_id,
                script: {
                  path: run.script_path,
                  entry: (manifest?.body as unknown as ScriptBody | undefined)?.entry ?? "",
                },
                input: await readPayload(kernel, run.input, run.input_ref),
                bundle: { id: bundle.id, digest: bundle.digest },
                timeoutSeconds: claimed.timeoutSeconds,
                heartbeatSeconds: Math.floor(HEARTBEAT_SECONDS / 3),
                idempotencyKey: run.idempotency_key,
                trigger: { type: run.trigger_type, ...run.trigger_detail },
              },
            };
          }
          if (gone() || Date.now() >= deadline) return { job: null };
          await sleep(Math.min(500, Math.max(0, deadline - Date.now())));
        }
      },
    );

    app.get(
      "/worker/bundles/:id",
      {
        config,
        schema: {
          summary: "Download a bundle",
          tags: ["worker protocol"],
          params: RunParams,
          response: { 200: AnyObject },
        },
      },
      async ({ worker, params }) => {
        let query = db
          .selectFrom("bundle")
          .select(["id", "storage_key"])
          .where("id", "=", params.id)
          .where("tenant_id", "=", worker.tenantId);
        if (worker.workspaceId) query = query.where("workspace_id", "=", worker.workspaceId);
        const bundle = await query.executeTakeFirst();
        if (!bundle) throw notFound("The bundle");
        return (await loadBundle(kernel, bundle)) as unknown as Record<string, unknown>;
      },
    );

    app.post(
      "/worker/runs/:id/heartbeat",
      {
        config,
        schema: {
          summary: "Say the run is still in progress",
          description:
            "When `cancelled` is true, stop the script: the run is no longer this worker's.",
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({ attempt: Attempt, workerId: Type.Optional(Id) }),
          response: { 200: Type.Object({ cancelled: Type.Boolean() }) },
        },
      },
      async ({ worker, params, body }) => {
        if (body.workerId) await seeWorker(kernel, worker, body.workerId);
        let query = db
          .selectFrom("run")
          .selectAll()
          .where("id", "=", params.id)
          .where("tenant_id", "=", worker.tenantId);
        if (worker.workspaceId) query = query.where("workspace_id", "=", worker.workspaceId);
        const run = await query.executeTakeFirst();
        if (!run) throw notFound("The run");
        if (run.status !== "running" || run.attempt !== body.attempt || !run.queue_job_id) {
          return { cancelled: true };
        }
        const alive = await kernel.queue.heartbeat(queueName(run.workspace_id), run.queue_job_id);
        if (!alive) return { cancelled: true };
        await db
          .updateTable("run")
          .set({ last_heartbeat_at: new Date() })
          .where("id", "=", run.id)
          .execute();
        return { cancelled: false };
      },
    );

    app.post(
      "/worker/runs/:id/logs",
      {
        config,
        schema: {
          summary: "Append log lines to a run",
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({
            attempt: Attempt,
            entries: Type.Array(
              Type.Object({
                time: Time,
                level: Type.Union([
                  Type.Literal("debug"),
                  Type.Literal("info"),
                  Type.Literal("warn"),
                  Type.Literal("error"),
                ]),
                message: Type.String(),
                fields: Type.Optional(AnyObject),
              }),
              { maxItems: 500 },
            ),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ worker, params, body }, reply) => {
        // Logs from an attempt that just ended are still worth keeping.
        let query = db
          .selectFrom("run")
          .select("id")
          .where("id", "=", params.id)
          .where("tenant_id", "=", worker.tenantId);
        if (worker.workspaceId) query = query.where("workspace_id", "=", worker.workspaceId);
        if (!(await query.executeTakeFirst())) throw notFound("The run");
        if (body.entries.length > 0) {
          await db
            .insertInto("run_log")
            .values(
              body.entries.map((entry) => ({
                run_id: params.id,
                attempt: body.attempt,
                logged_at: new Date(entry.time),
                level: entry.level,
                message: entry.message.slice(0, MAX_LOG_MESSAGE),
                fields: JSON.stringify(entry.fields ?? {}),
              })),
            )
            .execute();
        }
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/worker/runs/:id/secrets/:name",
      {
        config,
        schema: {
          summary: "Read a secret the running script declared",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, name: Type.String() }),
          querystring: AttemptQuery,
          response: { 200: Type.Object({ value: Type.String() }) },
        },
      },
      async ({ worker, params, query }) => {
        const { run, body } = await pinned(worker, params.id, query.attempt);
        if (!body.uses.secrets.includes(params.name)) {
          throw forbidden(`a declared use of the secret "${params.name}"`);
        }
        const value = await revealSecret(db, kernel.vault, {
          tenantId: run.tenant_id,
          workspaceId: run.workspace_id,
          name: params.name,
        });
        if (value === undefined) throw notFound(`The secret ${params.name}`);
        return { value };
      },
    );

    app.get(
      "/worker/runs/:id/variables/*",
      {
        config,
        schema: {
          summary: "Read a variable the running script declared",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, "*": Type.String() }),
          querystring: AttemptQuery,
          response: { 200: Type.Object({ value: Type.String() }) },
        },
      },
      async ({ worker, params, query }) => {
        const path = params["*"];
        const { run, body } = await pinned(worker, params.id, query.attempt);
        if (!body.uses.variables.includes(path)) {
          throw forbidden(`a declared use of the variable "${path}"`);
        }
        const set = await db
          .selectFrom("variable_value")
          .select("value")
          .where("workspace_id", "=", run.workspace_id)
          .where("path", "=", path)
          .executeTakeFirst();
        if (set) return { value: set.value };
        const definition = await db
          .selectFrom("resource")
          .select("body")
          .where("workspace_id", "=", run.workspace_id)
          .where("kind", "=", "variable")
          .where("path", "=", path)
          .executeTakeFirst();
        const fallback = (definition?.body as { default?: string } | undefined)?.default;
        if (fallback === undefined) throw notFound(`The variable ${path}`);
        return { value: fallback };
      },
    );

    app.get(
      "/worker/runs/:id/connections/*",
      {
        config,
        schema: {
          summary: "Read a connection the running script declared",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, "*": Type.String() }),
          querystring: AttemptQuery,
          response: {
            200: Type.Object({
              connector: Type.String(),
              config: AnyObject,
              credential: Type.Optional(Type.String()),
            }),
          },
        },
      },
      async ({ worker, params, query }) => {
        const path = params["*"];
        const { run, body } = await pinned(worker, params.id, query.attempt);
        if (!body.uses.connections.includes(path)) {
          throw forbidden(`a declared use of the connection "${path}"`);
        }
        const bound = await readConnection(kernel, db, {
          tenantId: run.tenant_id,
          workspaceId: run.workspace_id,
          path,
        });
        if (!bound) throw notFound(`The connection ${path}`);
        const definition = await db
          .selectFrom("resource")
          .select("body")
          .where("workspace_id", "=", run.workspace_id)
          .where("kind", "=", "connection")
          .where("path", "=", path)
          .executeTakeFirst();
        return {
          connector: (definition?.body as { connector?: string } | undefined)?.connector ?? "http",
          config: bound.config,
          ...(bound.credential !== undefined ? { credential: bound.credential } : {}),
        };
      },
    );

    app.post(
      "/worker/runs/:id/complete",
      {
        config,
        schema: {
          summary: "Report that the run succeeded",
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({ attempt: Attempt, output: Type.Optional(Type.Unknown()) }),
          response: { 204: NoContent },
        },
      },
      async ({ worker, params, body }, reply) => {
        await completeRun(kernel, worker, params.id, body.attempt, body.output ?? null);
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/worker/runs/:id/fail",
      {
        config,
        schema: {
          summary: "Report that the attempt failed",
          description: "The run is retried if it has attempts left. `final` says whether it has.",
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({
            attempt: Attempt,
            error: Type.Object({
              message: Type.String({ maxLength: 8000 }),
              stack: Type.Optional(Type.String({ maxLength: 32000 })),
            }),
          }),
          response: { 200: Type.Object({ final: Type.Boolean() }) },
        },
      },
      async ({ worker, params, body }) =>
        failRun(kernel, worker, params.id, body.attempt, {
          message: body.error.message,
          ...(body.error.stack ? { stack: body.error.stack } : {}),
        }),
    );
  };
}
