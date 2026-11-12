import { createHash, createHmac } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { PlatformSchema } from "./schema.js";

/**
 * Where tenants' custom tables live: the platform database, or a dedicated
 * one. It has two ways in. `owner` owns the tables, changes their structure
 * and keeps their catalog. `rows` is signed in as a role that owns nothing,
 * so every table's row policy applies to whatever it does, and nothing run on
 * it can become the owner.
 */
export interface DataStore {
  /** True for the platform database itself. */
  readonly shared: boolean;
  readonly owner: Kysely<PlatformSchema>;
  readonly rows: Kysely<PlatformSchema>;
  /** The role `rows` signs in as. Workspace tables are granted to it. */
  readonly role: string;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** The sign-in for row requests in one database. Named after it, so two instances on one server never share one. */
export function dataRoleName(database: string): string {
  return `vxd_${createHash("sha256").update(database).digest("hex").slice(0, 20)}`;
}

/**
 * The catalog of custom tables, for a dedicated database. In the platform
 * database the migrations create the same two tables. A test holds the two
 * definitions to each other.
 */
const CATALOG = `
create table if not exists data_table (
  id uuid primary key,
  tenant_id uuid not null,
  workspace_id uuid not null,
  resource_id uuid,
  name text not null,
  physical_name text not null,
  status text not null check (status in ('active', 'retired')),
  policy jsonb not null default '{"type": "open"}',
  previous_names text[] not null default '{}',
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, physical_name)
);
create unique index if not exists data_table_name_idx on data_table (workspace_id, name) where status = 'active';
create index if not exists data_table_tenant_idx on data_table (tenant_id);
create table if not exists data_column (
  id uuid primary key,
  table_id uuid not null references data_table (id) on delete cascade,
  name text not null,
  physical_name text not null,
  type text not null,
  required boolean not null default false,
  is_unique boolean not null default false,
  default_value jsonb,
  reference_table text,
  previous_names text[] not null default '{}',
  status text not null check (status in ('active', 'retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (table_id, physical_name)
);
create unique index if not exists data_column_name_idx on data_column (table_id, name) where status = 'active';
`;

/** Serializes role and catalog set-up between replicas starting together. */
const SETUP_LOCK = 7_265_100_302;

export interface DataStoreOptions {
  connectionString: string;
  /**
   * The instance's secret. The role's password is derived from it and the
   * database's name, so it is never stored and every replica arrives at the same one.
   */
  secret: Buffer;
  /** The platform database's own connection, when this store is that database. */
  platform?: Kysely<PlatformSchema>;
  maxConnections?: number;
  onConnectionError?: (error: Error) => void;
}

function pool(connectionString: string, max: number, onError?: (error: Error) => void) {
  const made = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "vynxlabs-platform-data",
  });
  // An idle connection the server closes must not take the control plane down.
  made.on("error", (error) => onError?.(error));
  return made;
}

/**
 * Opens a data store, first making sure it is ready: the catalog exists, the
 * restricted role exists with the right password, and that role may use every
 * workspace table already there.
 */
export async function openDataStore(options: DataStoreOptions): Promise<DataStore> {
  const max = options.maxConnections ?? 10;
  const owner =
    options.platform ??
    new Kysely<PlatformSchema>({
      dialect: new PostgresDialect({
        pool: pool(options.connectionString, max, options.onConnectionError),
      }),
    });
  try {
    const database = (await sql<{ name: string }>`select current_database() as name`.execute(owner))
      .rows[0]?.name as string;
    const role = dataRoleName(database);
    // Hex only, so it is safe to place in the statement, which cannot take a parameter here.
    const password = createHmac("sha256", options.secret)
      .update(`data-role:${database}`)
      .digest("hex");

    await owner.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(${SETUP_LOCK})`.execute(trx);
      if (!options.platform) await sql.raw(CATALOG).execute(trx);
      const exists = await sql`select 1 from pg_roles where rolname = ${role}`.execute(trx);
      await sql
        .raw(
          `${exists.rows.length > 0 ? "alter" : "create"} role "${role}" login password '${password}'`,
        )
        .execute(trx);
      // Tables made before this role existed, by an earlier version.
      const schemas = await sql<{ name: string }>`
        select nspname as name from pg_namespace where nspname ~ '^ws_[0-9a-f]{32}$'
      `.execute(trx);
      for (const { name } of schemas.rows) {
        await sql`grant usage on schema ${sql.id(name)} to ${sql.id(role)}`.execute(trx);
        await sql`grant select, insert, update, delete on all tables in schema ${sql.id(name)} to ${sql.id(role)}`.execute(
          trx,
        );
      }
      const policies = await sql<{ schema: string; table: string }>`
        select schemaname as schema, tablename as "table" from pg_policies
        where schemaname ~ '^ws_[0-9a-f]{32}$' and policyname = 'rows' and not (${role} = any (roles))
      `.execute(trx);
      for (const policy of policies.rows) {
        await sql`alter policy rows on ${sql.id(policy.schema, policy.table)} to ${sql.id(role)}`.execute(
          trx,
        );
      }
    });

    const address = new URL(options.connectionString);
    address.username = role;
    address.password = password;
    const rows = new Kysely<PlatformSchema>({
      dialect: new PostgresDialect({
        pool: pool(address.toString(), max, options.onConnectionError),
      }),
    });
    return {
      shared: options.platform !== undefined,
      owner,
      rows,
      role,
      async ping() {
        await sql`select 1`.execute(owner);
        await sql`select 1`.execute(rows);
      },
      async close() {
        await rows.destroy();
        if (!options.platform) await owner.destroy();
      },
    };
  } catch (error) {
    if (!options.platform) await owner.destroy().catch(() => {});
    throw error;
  }
}
