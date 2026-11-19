import { createHash } from "node:crypto";
import { type Kysely, type PlatformSchema, sql } from "@vynxlabs/db";
import { loadCatalog, workspaceSchema } from "../apply.js";

/**
 * The views a query reads (Decision 0003, guard 3). Each workspace has a
 * schema beside the one its tables are in, holding one view for each live
 * table: named for the table's path, with the columns it has now under the
 * names they have now. A view is made `security_invoker`, so the table's row
 * policy applies to whoever asks, as it does when the table is read directly.
 */

export const querySchema = (workspaceId: string) => `q_${workspaceId.replaceAll("-", "")}`;

/** The longest name Postgres keeps whole. A table whose path is longer has no view. */
const MAX_NAME_BYTES = 63;

const SYSTEM = ["id", "created_at", "updated_at"];

/** Serializes the making of one workspace's views between requests that find them out of date. */
const viewsLock = (workspaceId: string) =>
  BigInt(`0x${createHash("sha256").update(`q:${workspaceId}`).digest("hex").slice(0, 15)}`);

export interface QueryTables {
  schema: string;
  /** The paths of the tables that can be queried, with the resource each belongs to. */
  tables: Map<string, { resourceId: string | null }>;
}

/**
 * Makes sure the workspace's views are the ones its tables call for, and says
 * which tables can be queried. The views are made again only when the tables
 * have changed since: what they were made from is kept as the schema's
 * comment, and compared.
 */
export async function ensureQueryViews(
  owner: Kysely<PlatformSchema>,
  role: string,
  workspaceId: string,
): Promise<QueryTables> {
  const schema = querySchema(workspaceId);
  const source = workspaceSchema(workspaceId);
  const catalog = (await loadCatalog(owner, workspaceId)).filter(
    (table) => table.status === "active" && Buffer.byteLength(table.name, "utf8") <= MAX_NAME_BYTES,
  );
  const shape = catalog.map((table) => ({
    name: table.name,
    physical: table.physicalName,
    columns: table.columns
      .filter((column) => column.status === "active")
      .map((column) => ({ name: column.name, physical: column.physicalName })),
  }));
  const made = createHash("sha256").update(JSON.stringify(shape)).digest("hex");
  const tables = new Map(
    catalog.map((table) => [table.name, { resourceId: table.resourceId ?? null }]),
  );

  const current = await sql<{ made: string | null }>`
    select obj_description(n.oid, 'pg_namespace') as made
    from pg_namespace n where n.nspname = ${schema}
  `.execute(owner);
  if (current.rows[0]?.made === made) return { schema, tables };

  await owner.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(${String(viewsLock(workspaceId))}::bigint)`.execute(trx);
    // Views and nothing else live in this schema, so it is made afresh each time.
    await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(trx);
    await sql`create schema ${sql.id(schema)}`.execute(trx);
    await sql`grant usage on schema ${sql.id(schema)} to ${sql.id(role)}`.execute(trx);
    for (const table of shape) {
      const columns = [
        ...SYSTEM.map((name) => sql.id(name)),
        ...table.columns.map((column) => sql`${sql.id(column.physical)} as ${sql.id(column.name)}`),
      ];
      const view = sql.id(schema, table.name);
      await sql`
        create view ${view} with (security_invoker = true) as
        select ${sql.join(columns)} from ${sql.id(source, table.physical)}
      `.execute(trx);
      await sql`grant select on ${view} to ${sql.id(role)}`.execute(trx);
    }
    await sql`comment on schema ${sql.id(schema)} is ${sql.lit(made)}`.execute(trx);
  });
  return { schema, tables };
}
