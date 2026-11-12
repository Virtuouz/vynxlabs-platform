import { type Kysely, newId, openExternalPostgres, sql } from "@vynxlabs/db";
import type { Db, Trx } from "../audit.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import { decryptFor, encryptFor } from "../execution/bindings.js";
import type { Kernel } from "../kernel.js";
import type { ColumnMeta, RowTarget } from "./rows.js";

// biome-ignore lint/suspicious/noExplicitAny: an external database has no schema known in advance
type AnyDb = Kysely<any>;

export interface SourceConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  /** The schema whose tables are offered. Default `public`. */
  schema?: string;
  ssl?: boolean;
}

export const sourceConfigSchema = {
  type: "object",
  properties: {
    host: { type: "string", minLength: 1, maxLength: 255 },
    port: { type: "integer", minimum: 1, maximum: 65535 },
    database: { type: "string", minLength: 1, maxLength: 63 },
    user: { type: "string", minLength: 1, maxLength: 63 },
    schema: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$", maxLength: 63 },
    ssl: { type: "boolean" },
  },
  required: ["host", "database", "user"],
  additionalProperties: false,
};

const credentialName = (path: string) => `data-source:${path}`;

/** Open pools, one per binding as it currently stands. */
const pools = new Map<string, { stamp: string; db: AnyDb }>();

export async function bindSource(
  kernel: Kernel,
  trx: Trx,
  id: { tenantId: string; workspaceId: string; path: string },
  config: SourceConfig,
  password: string | null | undefined,
) {
  const existing = await trx
    .selectFrom("data_source_binding")
    .select(["id", "credential"])
    .where("workspace_id", "=", id.workspaceId)
    .where("path", "=", id.path)
    .executeTakeFirst();
  const credential =
    password === undefined
      ? (existing?.credential ?? null)
      : password === null
        ? null
        : await encryptFor(
            kernel,
            trx,
            id.tenantId,
            id.workspaceId,
            credentialName(id.path),
            password,
          );
  if (existing) {
    await trx
      .updateTable("data_source_binding")
      .set({ config: JSON.stringify(config), credential, updated_at: new Date() })
      .where("id", "=", existing.id)
      .execute();
    return { created: false };
  }
  await trx
    .insertInto("data_source_binding")
    .values({
      id: newId(),
      tenant_id: id.tenantId,
      workspace_id: id.workspaceId,
      path: id.path,
      config: JSON.stringify(config),
      credential,
      updated_at: new Date(),
    })
    .execute();
  return { created: true };
}

/** A connection to a bound source. Pools are reused until the binding changes. */
export async function openSource(
  kernel: Kernel,
  db: Db,
  tenantId: string,
  workspaceId: string,
  path: string,
) {
  const binding = await db
    .selectFrom("data_source_binding")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("tenant_id", "=", tenantId)
    .where("path", "=", path)
    .executeTakeFirst();
  if (!binding) throw notFound(`A binding for the data source ${path}`);
  const config = binding.config as unknown as SourceConfig;
  const stamp = binding.updated_at.toISOString();
  const open = pools.get(binding.id);
  if (open?.stamp === stamp) return { db: open.db, schema: config.schema ?? "public" };
  if (open) void open.db.destroy();
  const password = binding.credential
    ? await decryptFor(kernel, db, tenantId, workspaceId, credentialName(path), binding.credential)
    : undefined;
  const connection = openExternalPostgres({
    host: config.host,
    port: config.port ?? 5432,
    database: config.database,
    user: config.user,
    password,
    ssl: config.ssl,
  });
  pools.set(binding.id, { stamp, db: connection });
  return { db: connection, schema: config.schema ?? "public" };
}

export async function closeSource(bindingId: string) {
  const open = pools.get(bindingId);
  pools.delete(bindingId);
  await open?.db.destroy();
}

export async function closeAllSources() {
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map((pool) => pool.db.destroy()));
}

/** Problems reaching a source are the binding's, not the platform's. */
export function sourceFailure(path: string, error: unknown): unknown {
  if (error instanceof HttpError) return error;
  const code = (error as { code?: string }).code ?? "";
  const message = (error as Error).message ?? "";
  const network =
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH", "ECONNRESET"].includes(code) ||
    /timeout|terminated/i.test(message);
  if (network)
    return new HttpError(
      502,
      "source_unreachable",
      `The data source "${path}" could not be reached. Check its address.`,
    );
  if (code === "28P01" || code === "28000")
    return new HttpError(
      502,
      "source_refused",
      `The data source "${path}" refused the user name or password.`,
    );
  if (code === "3D000")
    return new HttpError(
      502,
      "source_refused",
      `The data source "${path}" has no database by that name.`,
    );
  if (code === "42501")
    return new HttpError(
      502,
      "source_refused",
      `The data source "${path}" does not let its user do that.`,
    );
  if (code === "57014")
    return new HttpError(504, "source_slow", `The data source "${path}" took too long to answer.`);
  return error;
}

/** The platform's type for a Postgres type, or null for one it can only show as text. */
function platformType(dataType: string): string | null {
  if (["text", "character varying", "character", "citext", "name"].includes(dataType))
    return "text";
  if (["integer", "bigint", "smallint"].includes(dataType)) return "integer";
  if (["numeric", "real", "double precision"].includes(dataType)) return "number";
  if (dataType === "boolean") return "boolean";
  if (dataType.startsWith("timestamp")) return "timestamp";
  if (dataType === "date") return "date";
  if (dataType === "json" || dataType === "jsonb") return "json";
  if (dataType === "uuid") return "uuid";
  return null;
}

interface SourceColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

/** The tables of a source's schema, as the platform can read and write them. */
export async function sourceTables(db: AnyDb, schema: string): Promise<RowTarget[]> {
  const columns = await sql<SourceColumn>`
    select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = ${schema} and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position
  `.execute(db);
  const keys = await sql<{ table_name: string; column_name: string; n: string }>`
    select tc.table_name, min(kcu.column_name) as column_name, count(*) as n
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name
    where tc.table_schema = ${schema} and tc.constraint_type = 'PRIMARY KEY'
    group by tc.table_name
  `.execute(db);
  const names = [...new Set(columns.rows.map((column) => column.table_name))];
  return names.map((name) => {
    const key = keys.rows.find((candidate) => candidate.table_name === name && candidate.n === "1");
    return {
      name,
      schema,
      table: name,
      // Rows of a table with no single key column can be listed and added, not changed.
      key: key?.column_name ?? null,
      managed: false,
      policy: { type: "open" as const },
      resourceId: null,
      columns: columns.rows
        .filter((column) => column.table_name === name)
        .map((column): ColumnMeta => {
          const type = platformType(column.data_type);
          return {
            name: column.column_name,
            physicalName: column.column_name,
            type: type ?? column.data_type,
            required: column.is_nullable === "NO",
            hasDefault: column.column_default !== null,
            writable: type !== null,
          };
        }),
    };
  });
}

export async function sourceTable(
  db: AnyDb,
  schema: string,
  path: string,
  table: string,
): Promise<RowTarget> {
  const found = (await sourceTables(db, schema)).find((candidate) => candidate.name === table);
  if (!found) throw notFound(`The table ${table} in the data source ${path}`);
  return found;
}

export function checkSourceConfig(issues: { path: string; message: string }[]) {
  if (issues.length > 0) throw badRequest("The data source's settings are not valid.", issues);
}
