import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { Type } from "typebox";
import { workspaceSchema } from "../kernel/data/apply.js";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { listOf } from "../pagination.js";
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
          response: { 200: listOf(Location) },
        },
      },
      async () => {
        const rows = await db.selectFrom("database_location").selectAll().orderBy("name").execute();
        const used = await sql<{ name: string; n: string }>`
          select data_location ->> 'ref' as name, count(*) as n from tenant
          where data_location ->> 'kind' = 'dedicated' group by 1
        `.execute(db);
        // One row that cannot be read or reached is that row's problem, not the page's, and the
        // rows are asked together so that unreachable hosts are waited for once.
        const items = await Promise.all(
          rows.map(async (row) => {
            const tenants = Number(used.rows.find((entry) => entry.name === row.name)?.n ?? 0);
            let address: string;
            try {
              address = kernel.vault.openForInstance(
                `database-location:${row.name}`,
                row.connection_encrypted,
              );
            } catch {
              return {
                name: row.name,
                description: row.description,
                host: "",
                database: "",
                tenants,
                reachable: false,
                problem: "Its address cannot be opened with this instance's master key.",
                updatedAt: iso(row.updated_at),
              };
            }
            const problem = await kernel.data.probe(row.name, address).then(
              () => null,
              (error: Error) => error.message,
            );
            return {
              name: row.name,
              description: row.description,
              ...shown(address),
              tenants,
              reachable: problem === null,
              problem,
              updatedAt: iso(row.updated_at),
            };
          }),
        );
        return { items };
      },
    );

    app.get(
      "/instance/database-locations/names",
      {
        config: { access: access.instance("instance:read") },
        schema: {
          summary: "The names of the registered databases",
          description:
            "For a list to choose from. It does not open any database, so it answers at once, whatever state they are in.",
          tags: ["instance"],
          response: {
            200: listOf(Type.Object({ name: Type.String(), description: Type.String() })),
          },
        },
      },
      async () => ({
        items: await db
          .selectFrom("database_location")
          .select(["name", "description"])
          .orderBy("name")
          .execute(),
      }),
    );

    /**
     * Tenants that keep their tables under a name read them from whatever database the name
     * points at. Pointing it at another is a change of address, and the other must hold what
     * the tenants have: every table of their catalog and every workspace's schema. Otherwise
     * their tables answer "not found" and a table made then would exist in one database only.
     * When the database now registered cannot be reached there is nothing to compare, which is
     * the case a change of address is for.
     */
    const requireCatalogOfTenants = async (
      next: Awaited<ReturnType<Kernel["data"]["connect"]>>,
      name: string,
    ) => {
      const tenants = await sql<{ id: string }>`
        select id from tenant where data_location ->> 'ref' = ${name}
      `.execute(kernel.db);
      if (tenants.rows.length === 0) return;
      const current = await kernel.data.location(name).catch(() => null);
      if (!current) return;
      const ids = tenants.rows.map((row) => row.id);
      const held = await current.owner
        .selectFrom("data_table")
        .select(["id", "workspace_id"])
        .where("tenant_id", "in", ids)
        .execute();
      const there = new Set(
        (
          await next.owner
            .selectFrom("data_table")
            .select("id")
            .where("tenant_id", "in", ids)
            .execute()
        ).map((row) => row.id),
      );
      const schemas = new Set(
        (
          await sql<{
            name: string;
          }>`select nspname as name from pg_namespace where nspname like 'ws\_%'`.execute(
            next.owner,
          )
        ).rows.map((row) => row.name),
      );
      const missingTables = held.filter((row) => !there.has(row.id)).length;
      const missingSchemas = new Set(
        held.map((row) => workspaceSchema(row.workspace_id)).filter((one) => !schemas.has(one)),
      ).size;
      if (missingTables > 0 || missingSchemas > 0) {
        throw conflict(
          `${tenants.rows.length} tenant${tenants.rows.length === 1 ? " keeps" : "s keep"} their tables under "${name}", and that database does not hold them (${missingTables} tables and ${missingSchemas} workspaces missing). Restore a copy of the tenants' database there first, or move the tenants.`,
        );
      }
    };

    app.put(
      "/instance/database-locations/:name",
      {
        config: { access: access.instance("instance:write") },
        schema: {
          summary: "Register a dedicated database, change its address, or change its description",
          description:
            "Without `connectionString`, only the description of a database already registered is " +
            "changed, and nothing is connected to. " +
            "Volvel connects first, and prepares the database: a catalog of custom " +
            "tables and a restricted sign-in for row requests. The user given must own the " +
            "database and be allowed to create roles. The address is stored encrypted. Pointing " +
            "a name that tenants use at another database is refused with 409 unless that " +
            "database holds each tenant's tables and workspaces.",
          tags: ["instance"],
          params: Params,
          body: Type.Object({
            connectionString: Type.Optional(
              Type.String({
                minLength: 1,
                maxLength: 2000,
                description:
                  "postgres://user:password@host:5432/database. Needed to register a name; left out, the address stays and only the description changes.",
              }),
            ),
            description: Type.Optional(Type.String({ maxLength: 500 })),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        if (body.connectionString === undefined) {
          const known = await db
            .selectFrom("database_location")
            .select("name")
            .where("name", "=", params.name)
            .executeTakeFirst();
          if (!known) {
            throw badRequest(
              `"${params.name}" is not registered yet: give its connection string, postgres://user:password@host/database.`,
            );
          }
          if (body.description === undefined) {
            throw badRequest("Send a description, a connection string, or both.");
          }
          const description = body.description;
          await ctx.mutate(async (trx, audit) => {
            await trx
              .updateTable("database_location")
              .set({ description, updated_at: new Date() })
              .where("name", "=", params.name)
              .execute();
            await audit({
              action: "database_location.described",
              targetType: "database_location",
              targetId: null,
              details: { name: params.name, description },
            });
          });
          return reply.code(204).send(null);
        }
        const connectionString = body.connectionString;
        let address: ReturnType<typeof shown>;
        try {
          if (!/^postgres(ql)?:$/.test(new URL(connectionString).protocol)) throw new Error();
          address = shown(connectionString);
        } catch {
          throw badRequest(
            "The connection string must look like postgres://user:password@host/database.",
          );
        }
        // The platform's own database is not a place for tables of their own, and one database
        // under two names would give its tenants two shares of one set of connections.
        const identity = await kernel.data.identify(connectionString).catch(() => null);
        if (identity !== null) {
          const own = await sql<{ id: string }>`
            select (select system_identifier::text from pg_control_system()) || '/' || current_database() as id
          `.execute(kernel.db);
          if (own.rows[0]?.id === identity) {
            throw badRequest(
              "That is this instance's own database. Register a different database for tenants' tables.",
            );
          }
          const others = await db
            .selectFrom("database_location")
            .select(["name", "connection_encrypted"])
            .where("name", "!=", params.name)
            .execute();
          for (const other of others) {
            const reached = await Promise.resolve()
              .then(() =>
                kernel.data.identify(
                  kernel.vault.openForInstance(
                    `database-location:${other.name}`,
                    other.connection_encrypted,
                  ),
                ),
              )
              .catch(() => null);
            if (reached === identity) {
              throw badRequest(
                `That is the database "${other.name}" already reaches. Change "${other.name}" instead, or use another database.`,
              );
            }
          }
        }
        // Prove it works, and prepare it, before any tenant is pointed at it.
        const store = await kernel.data.connect(connectionString).catch((error: Error) => {
          throw badRequest(`That database could not be prepared. ${error.message}`);
        });
        try {
          await requireCatalogOfTenants(store, params.name);
        } finally {
          await store.close();
        }
        await ctx.mutate(async (trx, audit) => {
          const sealed = kernel.data.seal(params.name, connectionString);
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
