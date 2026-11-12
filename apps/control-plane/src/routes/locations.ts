import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import { Type } from "typebox";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { iso, NoContent, Time } from "./shared.js";

const LocationName = Type.String({ pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", maxLength: 63 });
const Params = Type.Object({ name: LocationName });
const Location = Type.Object({
  name: Type.String(),
  description: Type.String(),
  host: Type.String(),
  database: Type.String(),
  tenants: Type.Integer({ description: "How many tenants keep their tables here." }),
  reachable: Type.Boolean(),
  problem: Type.Union([Type.String(), Type.Null()]),
  updatedAt: Time,
});

/** The parts of a connection string that are safe to show: never the user or the password. */
function shown(connectionString: string) {
  const address = new URL(connectionString);
  return {
    host: address.port ? `${address.hostname}:${address.port}` : address.hostname,
    database: decodeURIComponent(address.pathname.slice(1)),
  };
}

/** Databases, other than the platform's own, where tenants' custom tables can live. Operators only. */
export function locationRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.get(
      "/instance/database-locations",
      {
        config: { access: access.instance("instance:read") },
        schema: {
          summary: "Dedicated databases registered with this instance",
          description:
            "Says whether each one can be reached now. The user name and password are never returned.",
          tags: ["instance"],
          response: { 200: Type.Object({ items: Type.Array(Location) }) },
        },
      },
      async () => {
        const rows = await db.selectFrom("database_location").selectAll().orderBy("name").execute();
        const used = await sql<{ name: string; n: string }>`
          select data_location ->> 'ref' as name, count(*) as n from tenant
          where data_location ->> 'kind' = 'dedicated' group by 1
        `.execute(db);
        const items = [];
        for (const row of rows) {
          const address = kernel.vault.openForInstance(
            `database-location:${row.name}`,
            row.connection_encrypted,
          );
          const problem = await kernel.data
            .location(row.name)
            .then((store) => store.ping())
            .then(
              () => null,
              (error: Error) => error.message,
            );
          items.push({
            name: row.name,
            description: row.description,
            ...shown(address),
            tenants: Number(used.rows.find((entry) => entry.name === row.name)?.n ?? 0),
            reachable: problem === null,
            problem,
            updatedAt: iso(row.updated_at),
          });
        }
        return { items };
      },
    );

    app.put(
      "/instance/database-locations/:name",
      {
        config: { access: access.instance("instance:write") },
        schema: {
          summary: "Register a dedicated database, or change its address",
          description:
            "The platform connects first, and prepares the database: a catalog of custom " +
            "tables and a restricted sign-in for row requests. The user given must own the " +
            "database and be allowed to create roles. The address is stored encrypted.",
          tags: ["instance"],
          params: Params,
          body: Type.Object({
            connectionString: Type.String({
              minLength: 1,
              maxLength: 2000,
              description: "postgres://user:password@host:5432/database",
            }),
            description: Type.Optional(Type.String({ maxLength: 500 })),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        let address: ReturnType<typeof shown>;
        try {
          if (!/^postgres(ql)?:$/.test(new URL(body.connectionString).protocol)) throw new Error();
          address = shown(body.connectionString);
        } catch {
          throw badRequest(
            "The connection string must look like postgres://user:password@host/database.",
          );
        }
        // Prove it works, and prepare it, before any tenant is pointed at it.
        const store = await kernel.data.connect(body.connectionString).catch((error: Error) => {
          throw badRequest(`That database could not be prepared. ${error.message}`);
        });
        await store.close();
        await ctx.mutate(async (trx, audit) => {
          const sealed = kernel.data.seal(params.name, body.connectionString);
          await trx
            .insertInto("database_location")
            .values({
              name: params.name,
              description: body.description ?? "",
              connection_encrypted: sealed,
            })
            .onConflict((oc) =>
              oc.column("name").doUpdateSet({
                connection_encrypted: sealed,
                ...(body.description !== undefined ? { description: body.description } : {}),
                updated_at: new Date(),
              }),
            )
            .execute();
          await audit({
            action: "database_location.set",
            targetType: "database_location",
            targetId: null,
            details: { name: params.name, ...address },
          });
        });
        await kernel.data.forget(params.name);
        return reply.code(204).send(null);
      },
    );

    app.delete(
      "/instance/database-locations/:name",
      {
        config: { access: access.instance("instance:write") },
        schema: {
          summary: "Remove a dedicated database from this instance",
          description:
            "Refused while a tenant keeps its tables there. Nothing in the database is touched.",
          tags: ["instance"],
          params: Params,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const used = await sql`
            select 1 from tenant where data_location ->> 'ref' = ${params.name} limit 1
          `.execute(trx);
          if (used.rows.length > 0) {
            throw conflict(
              "A tenant keeps its tables in this database. Move or delete the tenant first.",
            );
          }
          const removed = await trx
            .deleteFrom("database_location")
            .where("name", "=", params.name)
            .executeTakeFirst();
          if (removed.numDeletedRows === 0n) throw notFound(`The database location ${params.name}`);
          await audit({
            action: "database_location.removed",
            targetType: "database_location",
            targetId: null,
            details: { name: params.name },
          });
        });
        await kernel.data.forget(params.name);
        return reply.code(204).send(null);
      },
    );
  };
}
