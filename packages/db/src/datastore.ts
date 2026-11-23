import { createHash, createHmac } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { type PoolStats, statsOf } from "./pool-stats.js";
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
  /**
   * Signs a claim of who is asking, for `app.claim`. Row policies read the
   * claim through `vx.claim()`, which checks the signature against a key the
   * `rows` role cannot read: so nothing run on `rows` can say it is someone else.
   */
  sign(claim: string): string;
  /** How the `rows` pool is doing. */
  rowStats(): PoolStats;
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
alter table data_column add column if not exists options jsonb;
alter table data_column add column if not exists on_delete text;
alter table data_table add column if not exists display_column text;
alter table data_table add column if not exists managed_in text;
`;

/**
 * How row policies learn who is asking (Decision 0003, guard 5). The control
 * plane sets `app.claim` to a JSON object followed by a dot and a signature.
 * `vx.claim()` checks the signature with a key kept where the `rows` role
 * cannot go, and gives the object. A claim that is not signed, or is out of
 * date, raises. No claim at all is nobody: an object with nothing in it.
 */
const CLAIMS = `
create schema if not exists vx;
revoke all on schema vx from public;
create table if not exists vx.claim_key (
  one boolean primary key default true check (one),
  key bytea not null
);
revoke all on vx.claim_key from public;
create or replace function vx.claim() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $claim$
declare
  given text := current_setting('app.claim', true);
  body text;
  signing bytea;
  claim jsonb;
begin
  if given is null or given = '' then
    return '{}'::jsonb;
  end if;
  if length(given) < 66 or substr(given, length(given) - 64, 1) <> '.' then
    raise exception 'The claim of who is asking is not signed.' using errcode = '28000';
  end if;
  body := left(given, length(given) - 65);
  select key into signing from vx.claim_key;
  if signing is null
    or encode(sha256(signing || sha256(signing || convert_to(body, 'UTF8'))), 'hex') <> right(given, 64)
  then
    raise exception 'The claim of who is asking is not signed.' using errcode = '28000';
  end if;
  claim := body::jsonb;
  if (claim ->> 'exp')::numeric < extract(epoch from clock_timestamp()) then
    raise exception 'The claim of who is asking is out of date.' using errcode = '28000';
  end if;
  return claim;
end
$claim$;
revoke all on function vx.claim() from public;
`;

/** The signature `vx.claim()` checks: two rounds of SHA-256 with the key in front, as hex. */
export function claimSignature(key: Buffer, claim: string): string {
  const inner = createHash("sha256").update(key).update(claim, "utf8").digest();
  return createHash("sha256").update(key).update(inner).digest("hex");
}

/** Serializes role and catalog set-up between replicas starting together. */
const SETUP_LOCK = 7_265_100_302;

export interface DataStoreOptions {
  connectionString: string;
  /**
   * The instance's secret. The role's password is derived from it and the
   * database's name, so it is never stored and every replica arrives at the same one.
   */
  secret: Buffer;
  /**
   * Whether to make sure the catalog, the role and its grants are in place. Off
   * only for a database that takes no writes: they were made when it last did.
   */
  setUp?: boolean;
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
    // A connection opened while the database took no writes keeps refusing them: renewed each minute.
    maxLifetimeSeconds: 60,
    connectionTimeoutMillis: 5_000,
    application_name: "volvel-data",
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

    // Derived like the password: never stored here, and the same on every replica.
    const claimKey = createHmac("sha256", options.secret).update(`claim-key:${database}`).digest();

    if (options.setUp !== false) await setUp(owner, options, role, password, claimKey);

    const address = new URL(options.connectionString);

    address.username = role;
    address.password = password;
    const rowsPool = pool(address.toString(), max, options.onConnectionError);
    const rows = new Kysely<PlatformSchema>({ dialect: new PostgresDialect({ pool: rowsPool }) });
    return {
      shared: options.platform !== undefined,
      owner,
      rows,
      role,
      sign: (claim) => `${claim}.${claimSignature(claimKey, claim)}`,
      rowStats: () => statsOf(rowsPool),
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

/**
 * The names a table's row policies may have. A table with an owner or open policy has
 * `rows`; one with rules has the four others. Every place that finds or drops them uses this list.
 */
export const POLICY_NAMES = ["rows", "rows_read", "rows_insert", "rows_update", "rows_delete"];

/** Makes sure the catalog exists, the role signs in with its password, and it may use every workspace table. */
async function setUp(
  owner: Kysely<PlatformSchema>,
  options: DataStoreOptions,
  role: string,
  password: string,
  claimKey: Buffer,
): Promise<void> {
  await owner.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(${SETUP_LOCK})`.execute(trx);
    if (!options.platform) await sql.raw(CATALOG).execute(trx);
    await sql.raw(CLAIMS).execute(trx);
    // Hex only, so it is safe to place in the statement.
    await sql
      .raw(
        `insert into vx.claim_key (key) values (decode('${claimKey.toString("hex")}', 'hex'))
         on conflict (one) do update set key = excluded.key`,
      )
      .execute(trx);
    const exists = await sql`select 1 from pg_roles where rolname = ${role}`.execute(trx);
    await sql
      .raw(
        `${exists.rows.length > 0 ? "alter" : "create"} role "${role}" login password '${password}'`,
      )
      .execute(trx);
    await sql`grant usage on schema vx to ${sql.id(role)}`.execute(trx);
    await sql`grant execute on function vx.claim() to ${sql.id(role)}`.execute(trx);
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
    // A restore under another database name leaves each policy handed to the old name's role.
    const policies = await sql<{ schema: string; table: string; name: string }>`
        select schemaname as schema, tablename as "table", policyname as name from pg_policies
        where schemaname ~ '^ws_[0-9a-f]{32}$' and policyname = any (${sql.val(POLICY_NAMES)})
          and not (${role} = any (roles))
      `.execute(trx);
    for (const policy of policies.rows) {
      await sql`alter policy ${sql.id(policy.name)} on ${sql.id(policy.schema, policy.table)} to ${sql.id(role)}`.execute(
        trx,
      );
    }
  });
}
