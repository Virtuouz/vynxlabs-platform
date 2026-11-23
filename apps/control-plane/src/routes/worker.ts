import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HEARTBEAT_SECONDS } from "@volvel/db";
import { Type } from "typebox";
import type { Principal } from "../kernel/audit.js";
import {
  callerOf,
  deleteRowKeepingFiles,
  type FileCaller,
  insertRowsKeepingFiles,
  MAX_FILE_BYTES,
  readFile,
  storeFile,
  updateRowKeepingFiles,
} from "../kernel/data/files.js";
import {
  aggregateQueryFrom,
  aggregateRows,
  type DataScope,
  deleteRow,
  describeTable,
  findRows,
  getRow,
  insertRows,
  type RowTarget,
  scopeFor,
  translate,
  updateRow,
  withData,
} from "../kernel/data/rows.js";
import { openSource, sourceFailure, sourceTable } from "../kernel/data/sources.js";
import { badRequest, forbiddenBecause, HttpError, notFound } from "../kernel/errors.js";
import { readConnection, readGroupMember } from "../kernel/execution/bindings.js";
import { loadBundle } from "../kernel/execution/bundles.js";
import { accessToken, isOAuthSettings } from "../kernel/execution/oauth.js";
import { redact, redactText } from "../kernel/execution/redact.js";
import {
  activeRun,
  claimRun,
  completeRun,
  failRun,
  MAX_TAGS,
  queueName,
  readPayload,
  runnable,
  TAG_PATTERN,
} from "../kernel/execution/runs.js";
import { servedValues, taskValues } from "../kernel/execution/served.js";
import {
  beatTask,
  claimTask,
  endTask,
  heldTask,
  MAX_RESULT_BYTES,
} from "../kernel/execution/tasks.js";
import { kickStarted } from "../kernel/execution/triggers.js";
import { seeWorker } from "../kernel/execution/workers.js";
import { publishEvent } from "../kernel/flows/events.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { pathNow } from "../kernel/resolve.js";
import { revealSecret } from "../kernel/secrets.js";
import { runTraceparent } from "../kernel/trace.js";
import { announceScriptRows } from "./data.js";
import { AnyObject, Id, NoContent, Time } from "./shared.js";

const Attempt = Type.Integer({ minimum: 1 });
const RunParams = Type.Object({ id: Id });
const AttemptQuery = Type.Object({ attempt: Attempt });

const Job = Type.Object({
  kind: Type.Optional(Type.Literal("run", { description: "Absent from an older control plane." })),
  runId: Id,
  attempt: Attempt,
  workspaceId: Id,
  script: Type.Object({ path: Type.String(), entry: Type.String() }),
  input: Type.Unknown(),
  bundle: Type.Object({ id: Id, digest: Type.String() }),
  timeoutSeconds: Type.Integer(),
  memoryMb: Type.Integer({
    description: "The most memory the script may use, in MB. A worker ends the script past it.",
  }),
  heartbeatSeconds: Type.Integer({ description: "Send a heartbeat at least this often." }),
  idempotencyKey: Type.String(),
  traceparent: Type.Optional(
    Type.String({
      description:
        "The trace the run is part of, as a W3C `traceparent` whose span is the run's " +
        "execution. A worker that sends spans of its own hangs them from it.",
    }),
  ),
  trigger: AnyObject,
  startedBy: Type.Object(
    { type: Type.String(), id: Type.Union([Id, Type.Null()]) },
    {
      description:
        "Who started the run: a member, an end user, a service account, or the system for a schedule, webhook or event.",
    },
  ),
});

/** Work for the platform that is not a run (decision 0001). Given only to a worker that asks for its kind. */
const TaskJob = Type.Object({
  kind: Type.Union([
    Type.Literal("describe"),
    Type.Literal("deliver"),
    Type.Literal("test-connection"),
  ]),
  taskId: Id,
  workspaceId: Id,
  request: AnyObject,
  timeoutSeconds: Type.Integer(),
  memoryMb: Type.Integer(),
  heartbeatSeconds: Type.Integer(),
});
/** How long a task may take, and the memory it may use. */
const TASK_TIMEOUT_SECONDS = 30;
const TASK_MEMORY_MB = 256;

const MAX_WAIT_SECONDS = 25;
/** How long a waiting claim goes without looking, when nothing it hears of wakes it. */
const CLAIM_LOOK_MS = 1000;
const MAX_LOG_MESSAGE = 8000;
/** The most a log line's `fields` keep, as JSON. A line over it keeps a note in their place. */
const MAX_LOG_FIELDS_BYTES = 32_000;
/**
 * What a request may hold, by route. Fastify's own 1 MiB would answer 413 to a batch of lines
 * that are each within their cap, and to an output the run already did its work for. A worker
 * sends logs in parts of about 512 KB; the room here is for one that sends more.
 */
const LOGS_BODY_LIMIT = 4 * 1024 * 1024;
/** The largest output a run may report, and the most rows or arguments one data call may carry. */
export const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_BODY_LIMIT = MAX_OUTPUT_BYTES + 64 * 1024;
const DATA_BODY_LIMIT = 8 * 1024 * 1024;

function cappedFields(fields: unknown): unknown {
  const size = Buffer.byteLength(JSON.stringify(fields));
  if (size <= MAX_LOG_FIELDS_BYTES) return fields;
  return {
    truncated: `The fields of this line were ${size} bytes, and only ${MAX_LOG_FIELDS_BYTES / 1000} KB are kept.`,
  };
}
/** Memory for a script that does not say, in MB. */
const DEFAULT_MEMORY_MB = 512;
/** Log lines the worker held but could not deliver. The run says how many. */
const LogsLost = Type.Optional(Type.Integer({ minimum: 0 }));

/**
 * The worker protocol: the second language-neutral contract. A worker in any
 * language that speaks these routes can run a workspace's code.
 */
export function workerRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const config = { access: access.worker };

    /** A bound connection as a worker builds its client from: connector, settings, credential. */
    async function boundConnection(tenantId: string, workspaceId: string, path: string) {
      const bound = await readConnection(kernel, db, { tenantId, workspaceId, path });
      if (!bound) throw notFound(`The connection ${path}`);
      const definition = await db
        .selectFrom("resource")
        .select("body")
        .where("workspace_id", "=", workspaceId)
        .where("kind", "=", "connection")
        .where("path", "=", path)
        .executeTakeFirst();
      const declared = (definition?.body as { connector?: string } | undefined)?.connector;
      const oauth = bound.oauth !== null || isOAuthSettings(bound.config);
      const connector = declared ?? bound.connector ?? (oauth ? "oauth2" : "http");
      if (connector === "oauth2" || oauth) {
        // The worker is handed the access token, refreshed when it is about to run out.
        // The client's secret and the refresh token stay here.
        const token = await accessToken(kernel, { tenantId, workspaceId, path });
        return {
          connector,
          config: bound.config as Record<string, unknown>,
          credential: token.accessToken,
          ...(token.expiresAt ? { expiresAt: token.expiresAt } : {}),
        };
      }
      return {
        connector,
        config: bound.config as Record<string, unknown>,
        ...(bound.credential !== undefined ? { credential: bound.credential } : {}),
      };
    }

    /**
     * A worker that could not deliver some log lines says how many, and the run's
     * log says so in their place: a run never looks complete without its evidence.
     */
    async function recordLostLogs(runId: string, attempt: number, lost: number | undefined) {
      if (!lost) return;
      await db
        .insertInto("run_log")
        .values({
          run_id: runId,
          attempt,
          logged_at: new Date(),
          level: "warn",
          message: `${lost} log ${lost === 1 ? "line" : "lines"} could not be saved.`,
          fields: JSON.stringify({ logsLost: lost }),
        })
        .execute();
    }

    /** The script manifest a run is pinned to, from the bundle it started on. */
    /** Whether an ID is someone a script may act for: a member or an end user of the tenant. */
    async function personType(
      tenantId: string,
      id: string,
    ): Promise<"member" | "end_user" | undefined> {
      const member = await db
        .selectFrom("tenant_member")
        .select("member_id")
        .where("tenant_id", "=", tenantId)
        .where("member_id", "=", id)
        .executeTakeFirst();
      if (member) return "member";
      const user = await db
        .selectFrom("end_user")
        .select("id")
        .where("tenant_id", "=", tenantId)
        .where("id", "=", id)
        .executeTakeFirst();
      return user ? "end_user" : undefined;
    }

    async function pinned(scope: Parameters<typeof activeRun>[1], runId: string, attempt: number) {
      const run = await activeRun(db, scope, runId, attempt);
      const bundle = await db
        .selectFrom("bundle")
        .select(["id", "storage_key"])
        .where("id", "=", run.bundle_id)
        .executeTakeFirstOrThrow();
      const body = await runnable(kernel, bundle, run.script_path);
      if (!body) throw notFound("The script");
      // A step of a flow may hand its script things the script does not name itself.
      const handed = (run.trigger_type === "flow" ? run.trigger_detail.grants : undefined) as
        | { connections?: string[]; tables?: string[]; events?: string[] }
        | undefined;
      const may = {
        connection: (path: string) =>
          body.uses.connections.includes(path) || (handed?.connections ?? []).includes(path),
        table: (path: string) =>
          (body.uses.tables ?? []).includes(path) || (handed?.tables ?? []).includes(path),
        event: (path: string) =>
          (body.uses.events ?? []).includes(path) || (handed?.events ?? []).includes(path),
      };
      return { run, body, may };
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
            kinds: Type.Optional(
              Type.Array(Type.String({ maxLength: 40 }), {
                maxItems: 10,
                description:
                  "The kinds of job this worker takes: `run`, and the task kinds it knows. " +
                  "A worker that says nothing is given runs only.",
              }),
            ),
            machine: Type.Optional(
              Type.Object(
                {
                  name: Type.String({ minLength: 1, maxLength: 120 }),
                  slots: Type.Integer({ minimum: 1, maximum: 1000 }),
                },
                {
                  description:
                    "The machine this worker shares with others, as the worker host or control " +
                    "plane that started it names it, and how many scripts it runs at once. " +
                    "Workers on one machine never run more than that between them.",
                },
              ),
            ),
          }),
          response: { 200: Type.Object({ job: Type.Union([Job, TaskJob, Type.Null()]) }) },
        },
      },
      async ({ worker, body, raw }) => {
        await seeWorker(kernel, worker, body.workerId, body.version, body.machine);
        const deadline = Date.now() + (body.waitSeconds ?? 20) * 1000;
        // A worker that hung up must not be handed a job.
        const gone = () => raw.socket.destroyed;
        const takesRuns = body.kinds === undefined || body.kinds.includes("run");
        for (;;) {
          // A worker that hung up while this waited is handed nothing: woken by the work
          // that arrived, the claim would otherwise take it for no one.
          if (gone()) return { job: null };
          // A task first: each is short, and someone is often waiting on it.
          const task = body.kinds
            ? await claimTask(kernel, worker, body.workerId, body.kinds, body.machine)
            : undefined;
          if (task) {
            return {
              job: {
                kind: task.kind,
                taskId: task.id,
                workspaceId: task.workspace_id,
                request: task.request,
                timeoutSeconds: TASK_TIMEOUT_SECONDS,
                memoryMb: TASK_MEMORY_MB,
                heartbeatSeconds: Math.floor(HEARTBEAT_SECONDS / 3),
              },
            };
          }
          const claimed = takesRuns
            ? await claimRun(kernel, worker, body.workerId, gone, body.machine)
            : undefined;
          if (claimed) {
            const { run } = claimed;
            const bundle = await db
              .selectFrom("bundle")
              .select(["id", "digest", "storage_key"])
              .where("id", "=", run.bundle_id)
              .executeTakeFirstOrThrow();
            const manifest = await runnable(kernel, bundle, run.script_path);
            return {
              job: {
                kind: "run" as const,
                runId: run.id,
                attempt: run.attempt,
                workspaceId: run.workspace_id,
                script: {
                  path: run.script_path,
                  entry: manifest?.entry ?? "",
                },
                input: await readPayload(kernel, run.input, run.input_ref),
                bundle: { id: bundle.id, digest: bundle.digest },
                timeoutSeconds: claimed.timeoutSeconds,
                memoryMb: manifest?.memoryMb ?? DEFAULT_MEMORY_MB,
                heartbeatSeconds: Math.floor(HEARTBEAT_SECONDS / 3),
                idempotencyKey: run.idempotency_key,
                trigger: { type: run.trigger_type, ...run.trigger_detail, grants: undefined },
                startedBy: { type: run.started_by_type, id: run.started_by_id },
                // The trace the run is part of, for a worker that sends spans of its own.
                ...(runTraceparent(run) ? { traceparent: runTraceparent(run) as string } : {}),
              },
            };
          }
          if (gone() || Date.now() >= deadline) return { job: null };
          // Woken as soon as one of the tenant's runs or tasks changes, which is when a
          // job may be ready; a retry that comes due later is found on the next look.
          await kernel.stream.waitForWork(
            worker.tenantId,
            Math.min(CLAIM_LOOK_MS, Math.max(0, deadline - Date.now())),
          );
        }
      },
    );

    // ----- Tasks -----

    const TaskParams = Type.Object({ id: Id });

    app.post(
      "/worker/tasks/:id/heartbeat",
      {
        config,
        schema: {
          summary: "Say that the worker is still at a task",
          description:
            "A worker calls this while it works. A task that is not heard from is given to another worker.",
          tags: ["worker protocol"],
          params: TaskParams,
          response: { 204: NoContent },
        },
      },
      async ({ worker, params }, reply) => {
        await beatTask(kernel, worker, params.id);
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/worker/tasks/:id/complete",
      {
        config,
        // Over its own limit answers 400 with the words below, not Fastify's 413.
        bodyLimit: 2 * 1024 * 1024,
        schema: {
          summary: "Report what a task found",
          description: `The result is JSON of at most ${MAX_RESULT_BYTES / 1024} KB, in the shape its kind gives.`,
          tags: ["worker protocol"],
          params: TaskParams,
          body: Type.Object({ result: Type.Unknown() }),
          response: { 204: NoContent },
        },
      },
      async ({ worker, params, body }, reply) => {
        if (Buffer.byteLength(JSON.stringify(body.result ?? null)) > MAX_RESULT_BYTES) {
          throw badRequest(`A task's result may be at most ${MAX_RESULT_BYTES / 1024} KB.`);
        }
        await endTask(kernel, worker, params.id, { result: body.result ?? null });
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/worker/tasks/:id/fail",
      {
        config,
        schema: {
          summary: "Report that a task could not be done",
          description: "Ends the task as failed, with the reason the worker gives.",
          tags: ["worker protocol"],
          params: TaskParams,
          body: Type.Object({
            error: Type.Object({ message: Type.String({ maxLength: 8000 }) }),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ worker, params, body }, reply) => {
        // The task's own connection is the one thing it was given.
        const task = await heldTask(db, worker, params.id);
        const known = await taskValues(kernel, db, task);
        await endTask(kernel, worker, params.id, {
          error: { message: redactText(body.error.message, known) },
        });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/worker/tasks/:id/connection",
      {
        config,
        schema: {
          summary: "Read the connection a task is about",
          description:
            "For a `deliver` or `test-connection` task: the one connection it names, and no other.",
          tags: ["worker protocol"],
          params: TaskParams,
          response: {
            200: Type.Object({
              connector: Type.String(),
              config: AnyObject,
              credential: Type.Optional(Type.String()),
              expiresAt: Type.Optional(Type.String({ format: "date-time" })),
            }),
          },
        },
      },
      async ({ worker, params }) => {
        const task = await heldTask(db, worker, params.id);
        const path = task.request.connection;
        if (
          (task.kind !== "deliver" && task.kind !== "test-connection") ||
          typeof path !== "string"
        ) {
          throw forbiddenBecause("This task is not about a connection, so it may not ask for one.");
        }
        return boundConnection(
          task.tenant_id,
          task.workspace_id,
          await pathNow(db, task.workspace_id, path, "connection"),
        );
      },
    );

    app.get(
      "/worker/bundles/:id",
      {
        config,
        schema: {
          summary: "Download a bundle",
          description: "The bundle's bytes, for a worker that does not hold it yet.",
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
        const alive = await kernel.queue.heartbeat(
          queueName(run.workspace_id, run.pool),
          run.queue_job_id,
        );
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
        bodyLimit: LOGS_BODY_LIMIT,
        schema: {
          summary: "Append log lines to a run",
          description: "Adds lines to the run's log.",
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
          .selectAll()
          .where("id", "=", params.id)
          .where("tenant_id", "=", worker.tenantId);
        if (worker.workspaceId) query = query.where("workspace_id", "=", worker.workspaceId);
        const run = await query.executeTakeFirst();
        if (!run) throw notFound("The run");
        if (body.entries.length > 0) {
          // A line is stored masked: the values the run was given, and secret-named fields.
          const known = await servedValues(kernel, db, run);
          await db
            .insertInto("run_log")
            .values(
              body.entries.map((entry) => ({
                run_id: params.id,
                attempt: body.attempt,
                logged_at: new Date(entry.time),
                level: entry.level,
                message: redactText(entry.message, known).slice(0, MAX_LOG_MESSAGE),
                fields: JSON.stringify(cappedFields(redact(entry.fields ?? {}, undefined, known))),
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
          description:
            "The secret's value, for a worker that holds the run and a secret the script declared.",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, name: Type.String() }),
          querystring: AttemptQuery,
          response: { 200: Type.Object({ value: Type.String() }) },
        },
      },
      async ({ worker, params, query }) => {
        const { run, body } = await pinned(worker, params.id, query.attempt);
        if (!body.uses.secrets.includes(params.name)) {
          throw forbiddenBecause(`This needs a declared use of the secret "${params.name}".`);
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
          description:
            "The variable's value in the run's workspace, for a variable the script declared.",
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
          throw forbiddenBecause(`This needs a declared use of the variable "${path}".`);
        }
        // The script names it as its bundle did. Its value is kept where it is now.
        const now = await pathNow(db, run.workspace_id, path, "variable");
        const set = await db
          .selectFrom("variable_value")
          .select("value")
          .where("workspace_id", "=", run.workspace_id)
          .where("path", "=", now)
          .executeTakeFirst();
        if (set) return { value: set.value };
        const definition = await db
          .selectFrom("resource")
          .select("body")
          .where("workspace_id", "=", run.workspace_id)
          .where("kind", "=", "variable")
          .where("path", "=", now)
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
          description:
            "The connection's settings and credentials, for a worker that holds the run and a connection the script declared.",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, "*": Type.String() }),
          querystring: AttemptQuery,
          response: {
            200: Type.Object({
              connector: Type.String(),
              config: AnyObject,
              credential: Type.Optional(Type.String()),
              expiresAt: Type.Optional(Type.String({ format: "date-time" })),
            }),
          },
        },
      },
      async ({ worker, params, query }) => {
        const path = params["*"];
        const { run, may } = await pinned(worker, params.id, query.attempt);
        if (!may.connection(path)) {
          throw forbiddenBecause(`This needs a declared use of the connection "${path}".`);
        }
        return boundConnection(
          run.tenant_id,
          run.workspace_id,
          await pathNow(db, run.workspace_id, path, "connection"),
        );
      },
    );

    /** The connector a group's members use, after checking that the running script declared the group. */
    const declaredGroup = async (
      worker: Parameters<typeof pinned>[0],
      runId: string,
      attempt: number,
      path: string,
    ) => {
      const { run, body } = await pinned(worker, runId, attempt);
      if (!(body.uses.connectionGroups ?? []).includes(path)) {
        throw forbiddenBecause(`This needs a declared use of the connection group "${path}".`);
      }
      const now = await pathNow(db, run.workspace_id, path, "connection_group");
      const definition = await db
        .selectFrom("resource")
        .select("body")
        .where("workspace_id", "=", run.workspace_id)
        .where("kind", "=", "connection_group")
        .where("path", "=", now)
        .executeTakeFirst();
      if (!definition) throw notFound(`The connection group ${path}`);
      return {
        run,
        /** The group's path now: its members are kept under it. */
        now,
        connector: (definition.body as { connector?: string }).connector ?? "http",
      };
    };

    app.get(
      "/worker/runs/:id/connection-groups/*",
      {
        config,
        schema: {
          summary: "List the members of a connection group the running script declared",
          description: "Keys and labels only. A member's credential is read one at a time.",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, "*": Type.String() }),
          querystring: AttemptQuery,
          response: {
            200: Type.Object({
              items: Type.Array(Type.Object({ key: Type.String(), label: Type.String() })),
            }),
          },
        },
      },
      async ({ worker, params, query }) => {
        const path = params["*"];
        const { run, now } = await declaredGroup(worker, params.id, query.attempt, path);
        const rows = await db
          .selectFrom("connection_group_member")
          .select(["key", "label"])
          .where("workspace_id", "=", run.workspace_id)
          .where("group_path", "=", now)
          .orderBy("key")
          .limit(1000)
          .execute();
        return { items: rows };
      },
    );

    app.get(
      "/worker/runs/:id/connection-group-members/:key/*",
      {
        config,
        schema: {
          summary: "Read one member of a connection group the running script declared",
          description:
            "One connection of the group, chosen by `key`, for a worker that holds the run.",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, key: Type.String({ maxLength: 100 }), "*": Type.String() }),
          querystring: AttemptQuery,
          response: {
            200: Type.Object({
              connector: Type.String(),
              config: AnyObject,
              credential: Type.Optional(Type.String()),
              expiresAt: Type.Optional(Type.String({ format: "date-time" })),
            }),
          },
        },
      },
      async ({ worker, params, query }) => {
        const path = params["*"];
        const { run, connector, now } = await declaredGroup(worker, params.id, query.attempt, path);
        const member = await readGroupMember(kernel, db, {
          tenantId: run.tenant_id,
          workspaceId: run.workspace_id,
          group: now,
          key: params.key,
        });
        if (!member) {
          throw notFound(`The member "${params.key}" of the connection group ${path}`);
        }
        return {
          connector,
          config: member.config,
          ...(member.credential !== undefined ? { credential: member.credential } : {}),
        };
      },
    );

    app.post(
      "/worker/runs/:id/events",
      {
        config,
        schema: {
          summary: "Publish an event the running script declared",
          description: "The event is stored and its subscribers are started before this answers.",
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({ attempt: Attempt, event: Type.String(), payload: AnyObject }),
          response: { 200: Type.Object({ eventId: Id, started: Type.Integer() }) },
        },
      },
      async ({ worker, params, body }) => {
        const { run, may } = await pinned(worker, params.id, body.attempt);
        if (!may.event(body.event)) {
          throw forbiddenBecause(`This needs a declared use of the event "${body.event}".`);
        }
        const published = await db.transaction().execute((trx) =>
          publishEvent(kernel, trx, {
            tenantId: run.tenant_id,
            workspaceId: run.workspace_id,
            name: body.event,
            payload: body.payload,
            source: { type: "script", id: run.id },
            depth: Number(run.trigger_detail.depth ?? 0),
          }),
        );
        await kickStarted(kernel, published.started);
        return { eventId: published.event.id, started: published.started.length };
      },
    );

    app.post(
      "/worker/runs/:id/tags",
      {
        config,
        schema: {
          summary: "Label the running script's run",
          description:
            "Adds tags to the run, and to its flow run when it is a step of one. A run keeps " +
            `at most ${MAX_TAGS}; past that, the newest are not kept, and the answer says so.`,
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({
            attempt: Attempt,
            tags: Type.Array(Type.String(), { minItems: 1, maxItems: MAX_TAGS }),
          }),
          response: { 200: Type.Object({ tags: Type.Array(Type.String()) }) },
        },
      },
      async ({ worker, params, body }) => {
        const bad = body.tags.filter((tag) => !TAG_PATTERN.test(tag));
        if (bad.length > 0) {
          throw badRequest(
            `A tag is up to 64 characters of a-z, 0-9 and _.:- only: ${bad.map((tag) => JSON.stringify(tag)).join(", ")}.`,
          );
        }
        const run = await activeRun(db, worker, params.id, body.attempt);
        const merged = async (table: "run" | "flow_run", id: string) => {
          const current = await db
            .selectFrom(table)
            .select("tags")
            .where("id", "=", id)
            .executeTakeFirstOrThrow();
          const tags = [...new Set([...current.tags, ...body.tags])].slice(0, MAX_TAGS);
          await db.updateTable(table).set({ tags }).where("id", "=", id).execute();
          return tags;
        };
        const tags = await merged("run", run.id);
        if (run.flow_run_id) await merged("flow_run", run.flow_run_id);
        return { tags };
      },
    );

    app.post(
      "/worker/runs/:id/data",
      {
        config,
        bodyLimit: DATA_BODY_LIMIT,
        schema: {
          summary: "Read or write rows for the running script",
          description:
            "One of the script's declared tables, or a table of one of its declared data " +
            "sources. With `as`, a workspace table's policy applies as it would to that person. " +
            "Without it, the script acts as the workspace and reaches every row.",
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({
            attempt: Attempt,
            table: Type.String(),
            source: Type.Optional(
              Type.String({
                description: "The data source's path, for a table that is not the workspace's own.",
              }),
            ),
            op: Type.Union([
              Type.Literal("find"),
              Type.Literal("get"),
              Type.Literal("insert"),
              Type.Literal("update"),
              Type.Literal("delete"),
              Type.Literal("aggregate"),
            ]),
            args: Type.Optional(AnyObject),
            as: Type.Optional(Id),
          }),
          response: { 200: Type.Object({ result: Type.Unknown() }) },
        },
      },
      async ({ worker, params, body }) => {
        const { run, body: script, may } = await pinned(worker, params.id, body.attempt);
        const args = (body.args ?? {}) as {
          filter?: unknown;
          sort?: string[];
          limit?: number;
          offset?: number;
          id?: string;
          rows?: unknown[];
          patch?: unknown;
          group?: string[];
          measure?: string[];
        };
        // Acting for a person, a file a row is given must be one that person may have.
        let actingFor: FileCaller | undefined;
        const perform = async (
          data: Parameters<typeof findRows>[0],
          target: RowTarget,
          scope: DataScope,
          own: boolean,
        ) => {
          switch (body.op) {
            case "find":
              return findRows(data, target, args);
            case "get":
              return getRow(data, target, String(args.id)).catch((error) => {
                if (error instanceof HttpError && error.statusCode === 404) return null;
                throw error;
              });
            case "insert": {
              const rows = args.rows ?? [];
              if (rows.length === 0 || rows.length > 1000)
                throw badRequest("Insert between 1 and 1,000 rows at a time.");
              return own
                ? insertRowsKeepingFiles(
                    kernel,
                    data,
                    { tenantId: run.tenant_id, id: run.workspace_id },
                    target,
                    rows,
                    scope,
                    actingFor,
                  )
                : insertRows(data, target, rows, scope);
            }
            case "update":
              // A workspace table's file column names files Volvel stores: a replaced one is
              // noted, as when a person changes the row. A source table has none (see sources.ts).
              return own
                ? updateRowKeepingFiles(
                    kernel,
                    data,
                    { tenantId: run.tenant_id, id: run.workspace_id },
                    { type: "script", id: null },
                    target,
                    String(args.id),
                    args.patch,
                    actingFor,
                  )
                : updateRow(data, target, String(args.id), args.patch);
            case "delete":
              if (own) {
                await deleteRowKeepingFiles(
                  kernel,
                  data,
                  { tenantId: run.tenant_id, id: run.workspace_id },
                  { type: "script", id: null },
                  target,
                  String(args.id),
                );
              } else {
                await deleteRow(data, target, String(args.id));
              }
              return null;
            case "aggregate":
              return aggregateRows(data, target, aggregateQueryFrom(args));
          }
        };

        if (body.source !== undefined) {
          const path = body.source;
          if (!(script.uses.sources ?? []).includes(path)) {
            throw forbiddenBecause(`This needs a declared use of the data source "${path}".`);
          }
          try {
            const now = await pathNow(db, run.workspace_id, path, "data_source");
            const source = await openSource(kernel, db, run.tenant_id, run.workspace_id, now);
            const target = await sourceTable(source.db, source.schema, now, body.table);
            return {
              result: await perform(source.db, target, { principalId: null, all: true }, false),
            };
          } catch (error) {
            throw sourceFailure(path, translate(error));
          }
        }

        if (!may.table(body.table)) {
          throw forbiddenBecause(`This needs a declared use of the table "${body.table}".`);
        }
        // The table's path now: the name a script was built with may be from before a rename.
        const tablePath = await pathNow(db, run.workspace_id, body.table, "table");
        const target = await describeTable(
          (await kernel.data.forTenant(run.tenant_id)).owner,
          run.workspace_id,
          tablePath,
        );
        // A script is the workspace's own code. Acting for a person, it is held to what they may see.
        const person = body.as ? await personType(run.tenant_id, body.as) : undefined;
        if (body.as && !person) {
          throw badRequest("`as` is not a member or an end user of this tenant.");
        }
        // Acting for a person means being them to the table's rules: their groups and attributes too.
        const scope: DataScope =
          body.as && person
            ? await scopeFor(kernel, run.tenant_id, { type: person, id: body.as }, false)
            : { principalId: null, all: true };
        if (body.as && person) {
          actingFor = callerOf(kernel, {
            type: person,
            id: body.as,
            tenantId: run.tenant_id,
          } as Principal);
        }
        const result = await withData(kernel, run.tenant_id, scope, (data) =>
          perform(data, target, scope, true),
        );
        await announceScriptRows(kernel, run, tablePath, body.op, result, args.id);
        return { result };
      },
    );

    app.post(
      "/worker/runs/:id/files",
      {
        config,
        bodyLimit: Math.ceil(MAX_FILE_BYTES * 1.4),
        schema: {
          summary: "Store a file for the running script",
          description: "Keeps the bytes in the run's workspace and answers the file's id.",
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({
            attempt: Attempt,
            name: Type.String({ minLength: 1, maxLength: 255 }),
            contentType: Type.Optional(Type.String({ maxLength: 255 })),
            base64: Type.String({ description: "The file's bytes, base64 encoded." }),
          }),
          response: { 200: AnyObject },
        },
      },
      async ({ worker, params, body }) => {
        const { run } = await pinned(worker, params.id, body.attempt);
        const stored = await storeFile(
          kernel,
          db,
          { tenantId: run.tenant_id, id: run.workspace_id },
          { type: "script", id: null },
          {
            name: body.name,
            contentType: body.contentType ?? "application/octet-stream",
            content: Buffer.from(body.base64, "base64"),
          },
        );
        return stored as unknown as Record<string, unknown>;
      },
    );

    app.get(
      "/worker/runs/:id/files/:fileId",
      {
        config,
        schema: {
          summary: "Read a stored file for the running script",
          description: "The file's bytes, for the worker that holds the run.",
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, fileId: Id }),
          querystring: AttemptQuery,
          response: { 200: AnyObject },
        },
      },
      async ({ worker, params, query }) => {
        const { run } = await pinned(worker, params.id, query.attempt);
        const { file, content } = await readFile(kernel, db, run.workspace_id, params.fileId);
        return { ...file, base64: content.toString("base64") } as unknown as Record<
          string,
          unknown
        >;
      },
    );

    app.post(
      "/worker/runs/:id/complete",
      {
        config,
        bodyLimit: OUTPUT_BODY_LIMIT,
        schema: {
          summary: "Report that the run succeeded",
          description: `The output may be up to ${MAX_OUTPUT_BYTES / 1024 / 1024} MB as JSON. A larger one answers 413: report the failure instead, saying the output is too large. What is over 256 KB is kept in file storage.`,
          tags: ["worker protocol"],
          params: RunParams,
          body: Type.Object({
            attempt: Attempt,
            output: Type.Optional(Type.Unknown()),
            logsLost: LogsLost,
          }),
          response: { 204: NoContent },
        },
      },
      async ({ worker, params, body }, reply) => {
        await completeRun(kernel, worker, params.id, body.attempt, body.output ?? null);
        await recordLostLogs(params.id, body.attempt, body.logsLost);
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
            retry: Type.Optional(
              Type.Boolean({
                description:
                  "False when running the script again would repeat work it already did, as when its output was too large to report: the run fails now, whatever attempts it has left. Absent from an older worker, and then the run is retried as its script says.",
              }),
            ),
            logsLost: LogsLost,
          }),
          response: { 200: Type.Object({ final: Type.Boolean() }) },
        },
      },
      async ({ worker, params, body }) => {
        const result = await failRun(
          kernel,
          worker,
          params.id,
          body.attempt,
          {
            message: body.error.message,
            ...(body.error.stack ? { stack: body.error.stack } : {}),
          },
          body.retry !== false,
        );
        await recordLostLogs(params.id, body.attempt, body.logsLost);
        return result;
      },
    );
  };
}
