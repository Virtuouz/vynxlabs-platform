import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Database } from "@volvel/db";
import { Type } from "typebox";
import { access } from "../kernel/http.js";
import type { ObjectStore } from "../storage.js";

const Check = Type.Object({ ok: Type.Boolean(), error: Type.Optional(Type.String()) });
const DatabaseCheck = Type.Object({
  ok: Type.Boolean(),
  error: Type.Optional(Type.String()),
  readOnly: Type.Optional(
    Type.Boolean({
      description:
        "The database answers but takes no writes, such as when its disk is full. Reads are served; changes are answered 503.",
    }),
  ),
  latencyMs: Type.Optional(Type.Integer({ description: "How long the database took to answer." })),
});
const Readiness = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("not_ready")]),
  checks: Type.Object({ database: DatabaseCheck, objectStore: Check }),
});

const CHECK_TIMEOUT_MS = 3000;

async function run(check: () => Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), CHECK_TIMEOUT_MS);
      }),
    ]);
    return { ok: true };
  } catch (error) {
    // The cause stays in the log. The response only names what kind of failure it was.
    return { ok: false, error: error instanceof Error ? error.name : "Error" };
  } finally {
    clearTimeout(timer);
  }
}

export function healthRoutes(deps: {
  database: Database;
  storage: ObjectStore;
}): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/healthz",
      {
        config: { access: access.public, traced: false },
        schema: {
          summary: "Liveness",
          description: "Returns 200 whenever the process is serving requests.",
          tags: ["health"],
          response: { 200: Type.Object({ status: Type.Literal("ok") }) },
        },
      },
      async () => ({ status: "ok" as const }),
    );

    app.get(
      "/readyz",
      {
        config: { access: access.public, traced: false },
        schema: {
          summary: "Readiness",
          description:
            "Returns 200 when Postgres and the object store are reachable, 503 otherwise. A database that takes no writes is still ready, and says so in `readOnly`.",
          tags: ["health"],
          response: { 200: Readiness, 503: Readiness },
        },
      },
      async (request, reply) => {
        let readOnly: boolean | undefined;
        const started = performance.now();
        const [database, objectStore] = await Promise.all([
          run(async () => {
            await deps.database.ping();
            readOnly = await deps.database.readOnly();
          }),
          run(() => deps.storage.check()),
        ]);
        // A database that answers but takes no writes is still ready: reads are served.
        const databaseCheck = database.ok
          ? {
              ...database,
              ...(readOnly === undefined ? {} : { readOnly }),
              latencyMs: Math.round(performance.now() - started),
            }
          : database;
        const ready = database.ok && objectStore.ok;
        if (!ready) request.log.warn({ database, objectStore }, "readiness check failed");
        return reply.code(ready ? 200 : 503).send({
          status: ready ? "ready" : "not_ready",
          checks: { database: databaseCheck, objectStore },
        });
      },
    );
  };
}
