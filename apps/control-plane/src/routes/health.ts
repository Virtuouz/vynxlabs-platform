import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Database } from "@vynxlabs/db";
import { Type } from "typebox";
import type { ObjectStore } from "../storage.js";

const Check = Type.Object({ ok: Type.Boolean(), error: Type.Optional(Type.String()) });
const Readiness = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("not_ready")]),
  checks: Type.Object({ database: Check, objectStore: Check }),
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
        schema: {
          summary: "Readiness",
          description:
            "Returns 200 when Postgres and the object store are reachable, 503 otherwise.",
          tags: ["health"],
          response: { 200: Readiness, 503: Readiness },
        },
      },
      async (request, reply) => {
        const [database, objectStore] = await Promise.all([
          run(() => deps.database.ping()),
          run(() => deps.storage.check()),
        ]);
        const ready = database.ok && objectStore.ok;
        if (!ready) request.log.warn({ database, objectStore }, "readiness check failed");
        return reply.code(ready ? 200 : 503).send({
          status: ready ? "ready" : "not_ready",
          checks: { database, objectStore },
        });
      },
    );
  };
}
