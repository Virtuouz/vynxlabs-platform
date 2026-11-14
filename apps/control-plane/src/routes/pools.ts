import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId, sql } from "@vynxlabs/db";
import { Type } from "typebox";
import { conflict, notFound } from "../kernel/errors.js";
import { WORKER_STALE_SECONDS } from "../kernel/execution/workers.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { Id, iso, NoContent, TenantParams, Time } from "./shared.js";

const PoolName = Type.String({ pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", maxLength: 40 });
const Pool = Type.Object({
  id: Type.Union([Id, Type.Null()], {
    description: "Null for the default pool, which is not a record.",
  }),
  name: Type.Union([Type.String(), Type.Null()], { description: "Null for the default pool." }),
  description: Type.String(),
  credentials: Type.Integer({ description: "Credentials not revoked that serve it." }),
  online: Type.Integer({ description: "Workers heard from in the last minute and a half." }),
  lastSeenAt: Type.Union([Time, Type.Null()], {
    description: "When a worker of the pool was last heard from, however long ago.",
  }),
  workspaces: Type.Array(Type.Object({ id: Id, name: Type.String() }), {
    description: "Workspaces with a script that runs on it.",
  }),
  managed: Type.Boolean({ description: "Whether the instance starts workers for it itself." }),
});

/** A tenant's worker pools: where its code runs, and whether anything is there to run it. */
export function poolRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.get(
      "/tenants/:t/worker-pools",
      {
        config: { access: access.tenant("worker:read") },
        schema: {
          summary: "Worker pools, with the workers and workspaces of each",
          description:
            "The default pool first: the one a script that names no pool runs on. A pool " +
            "named by a script and served by nobody shows with no worker online.",
          tags: ["workers"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Pool) }) },
        },
      },
      async ({ params }) => {
        const pools = await db
          .selectFrom("worker_pool")
          .selectAll()
          .where("tenant_id", "=", params.t)
          .orderBy("name")
          .execute();
        const credentials = await db
          .selectFrom("worker_credential")
          .select(["pool", "managed"])
          .where("tenant_id", "=", params.t)
          .where("revoked_at", "is", null)
          .execute();
        const workers = await db
          .selectFrom("worker")
          .innerJoin("worker_credential", "worker_credential.id", "worker.credential_id")
          .select(["worker_credential.pool", "worker.last_seen_at"])
          .where("worker.tenant_id", "=", params.t)
          .execute();
        const named = await sql<{ pool: string | null; id: string; name: string }>`
          select distinct r.body->>'worker' as pool, w.id, w.name
          from resource r join workspace w on w.id = r.workspace_id
          where r.tenant_id = ${params.t} and r.kind = 'script'
        `.execute(db);
        const fresh = Date.now() - WORKER_STALE_SECONDS * 1000;
        const describe = (name: string | null, id: string | null, description: string) => {
          const mine = workers.filter((worker) => worker.pool === name);
          const last = mine.reduce<Date | null>(
            (latest, worker) =>
              !latest || worker.last_seen_at > latest ? worker.last_seen_at : latest,
            null,
          );
          const served = new Map(
            named.rows.filter((row) => row.pool === name).map((row) => [row.id, row.name]),
          );
          return {
            id,
            name,
            description,
            credentials: credentials.filter((one) => one.pool === name).length,
            online: mine.filter((worker) => worker.last_seen_at.getTime() > fresh).length,
            lastSeenAt: last ? iso(last) : null,
            workspaces: [...served].map(([wid, wname]) => ({ id: wid, name: wname })),
            managed: credentials.some((one) => one.pool === name && one.managed),
          };
        };
        // A pool that scripts name but nobody made yet is shown, so its absence is seen.
        const unmade = [
          ...new Set(named.rows.map((row) => row.pool).filter((pool): pool is string => !!pool)),
        ].filter((pool) => !pools.some((one) => one.name === pool));
        return {
          items: [
            describe(null, null, "Runs every script that names no pool."),
            ...pools.map((pool) => describe(pool.name, pool.id, pool.description)),
            ...unmade.map((pool) =>
              describe(pool, null, "Named by a script, and not made as a pool yet."),
            ),
          ],
        };
      },
    );

    app.post(
      "/tenants/:t/worker-pools",
      {
        config: { access: access.tenant("worker:write") },
        schema: {
          summary: "Make a worker pool",
          description:
            "A place code can run, such as inside a client's network. Scripts name it with " +
            "`worker`, and credentials made for it let workers there serve it.",
          tags: ["workers"],
          params: TenantParams,
          body: Type.Object({
            name: PoolName,
            description: Type.Optional(Type.String({ maxLength: 300 })),
          }),
          response: {
            201: Type.Object({ id: Id, name: Type.String(), description: Type.String() }),
          },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const made = await ctx.mutate(async (trx, audit) => {
          const taken = await trx
            .selectFrom("worker_pool")
            .select("id")
            .where("tenant_id", "=", params.t)
            .where("name", "=", body.name)
            .executeTakeFirst();
          if (taken) throw conflict(`There is a pool called ${body.name} already.`);
          const row = await trx
            .insertInto("worker_pool")
            .values({
              id: newId(),
              tenant_id: params.t,
              name: body.name,
              description: body.description?.trim() ?? "",
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "worker_pool.created",
            targetType: "worker_pool",
            targetId: row.id,
            tenantId: params.t,
            details: { name: row.name },
          });
          return row;
        });
        return reply
          .code(201)
          .send({ id: made.id, name: made.name, description: made.description });
      },
    );

    app.delete(
      "/tenants/:t/worker-pools/:id",
      {
        config: { access: access.tenant("worker:write") },
        schema: {
          summary: "Remove a worker pool",
          description: "Refused while a credential not revoked still serves it.",
          tags: ["workers"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const pool = await trx
            .selectFrom("worker_pool")
            .selectAll()
            .where("id", "=", params.id)
            .where("tenant_id", "=", params.t)
            .executeTakeFirst();
          if (!pool) throw notFound("The pool");
          const serving = await trx
            .selectFrom("worker_credential")
            .select("id")
            .where("tenant_id", "=", params.t)
            .where("pool", "=", pool.name)
            .where("revoked_at", "is", null)
            .executeTakeFirst();
          if (serving) throw conflict("Revoke the credentials that serve this pool first.");
          await trx.deleteFrom("worker_pool").where("id", "=", pool.id).execute();
          await audit({
            action: "worker_pool.deleted",
            targetType: "worker_pool",
            targetId: pool.id,
            tenantId: params.t,
            details: { name: pool.name },
          });
        });
        return reply.code(204).send(null);
      },
    );
  };
}
