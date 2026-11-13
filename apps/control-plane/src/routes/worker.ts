import { setTimeout as sleep } from "node:timers/promises";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HEARTBEAT_SECONDS } from "@vynxlabs/db";
import { Type } from "typebox";
import { MAX_FILE_BYTES, readFile, storeFile } from "../kernel/data/files.js";
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
import { badRequest, forbidden, HttpError, notFound } from "../kernel/errors.js";
import { readConnection, readGroupMember } from "../kernel/execution/bindings.js";
import { loadBundle } from "../kernel/execution/bundles.js";
import {
  activeRun,
  claimRun,
  completeRun,
  failRun,
  queueName,
  readPayload,
  runnable,
} from "../kernel/execution/runs.js";
import { kickStarted } from "../kernel/execution/triggers.js";
import { seeWorker } from "../kernel/execution/workers.js";
import { publishEvent } from "../kernel/flows/events.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { revealSecret } from "../kernel/secrets.js";
import { announceRows } from "./data.js";
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
  startedBy: Type.Object(
    { type: Type.String(), id: Type.Union([Id, Type.Null()]) },
    {
      description:
        "Who started the run: a member, an end user, a service account, or the system for a schedule, webhook or event.",
    },
  ),
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
            const manifest = await runnable(kernel, bundle, run.script_path);
            return {
              job: {
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
                heartbeatSeconds: Math.floor(HEARTBEAT_SECONDS / 3),
                idempotencyKey: run.idempotency_key,
                trigger: { type: run.trigger_type, ...run.trigger_detail, grants: undefined },
                startedBy: { type: run.started_by_type, id: run.started_by_id },
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
        const { run, may } = await pinned(worker, params.id, query.attempt);
        if (!may.connection(path)) {
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

    /** The connector a group's members use, after checking that the running script declared the group. */
    const declaredGroup = async (
      worker: Parameters<typeof pinned>[0],
      runId: string,
      attempt: number,
      path: string,
    ) => {
      const { run, body } = await pinned(worker, runId, attempt);
      if (!(body.uses.connectionGroups ?? []).includes(path)) {
        throw forbidden(`a declared use of the connection group "${path}"`);
      }
      const definition = await db
        .selectFrom("resource")
        .select("body")
        .where("workspace_id", "=", run.workspace_id)
        .where("kind", "=", "connection_group")
        .where("path", "=", path)
        .executeTakeFirst();
      if (!definition) throw notFound(`The connection group ${path}`);
      return {
        run,
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
        const { run } = await declaredGroup(worker, params.id, query.attempt, path);
        const rows = await db
          .selectFrom("connection_group_member")
          .select(["key", "label"])
          .where("workspace_id", "=", run.workspace_id)
          .where("group_path", "=", path)
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
          tags: ["worker protocol"],
          params: Type.Object({ id: Id, key: Type.String({ maxLength: 100 }), "*": Type.String() }),
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
        const { run, connector } = await declaredGroup(worker, params.id, query.attempt, path);
        const member = await readGroupMember(kernel, db, {
          tenantId: run.tenant_id,
          workspaceId: run.workspace_id,
          group: path,
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
          throw forbidden(`a declared use of the event "${body.event}"`);
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
      "/worker/runs/:id/data",
      {
        config,
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
        const perform = async (
          data: Parameters<typeof findRows>[0],
          target: RowTarget,
          scope: DataScope,
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
              return insertRows(data, target, rows, scope);
            }
            case "update":
              return updateRow(data, target, String(args.id), args.patch);
            case "delete":
              await deleteRow(data, target, String(args.id));
              return null;
            case "aggregate":
              return aggregateRows(data, target, aggregateQueryFrom(args));
          }
        };

        if (body.source !== undefined) {
          const path = body.source;
          if (!(script.uses.sources ?? []).includes(path)) {
            throw forbidden(`a declared use of the data source "${path}"`);
          }
          try {
            const source = await openSource(kernel, db, run.tenant_id, run.workspace_id, path);
            const target = await sourceTable(source.db, source.schema, path, body.table);
            return { result: await perform(source.db, target, { principalId: null, all: true }) };
          } catch (error) {
            throw sourceFailure(path, translate(error));
          }
        }

        if (!may.table(body.table)) {
          throw forbidden(`a declared use of the table "${body.table}"`);
        }
        const target = await describeTable(
          (await kernel.data.forTenant(run.tenant_id)).owner,
          run.workspace_id,
          body.table,
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
        const result = await withData(kernel, run.tenant_id, scope, (data) =>
          perform(data, target, scope),
        );
        if (body.op !== "find" && body.op !== "get") {
          const ids =
            body.op === "insert"
              ? (result as { id: string }[]).map((row) => row.id)
              : [String(args.id)];
          await announceRows(
            kernel,
            run.tenant_id,
            run.workspace_id,
            body.table,
            body.op === "insert" ? "inserted" : body.op === "update" ? "updated" : "deleted",
            ids,
          );
        }
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
