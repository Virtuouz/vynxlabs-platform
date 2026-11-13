import { type PlatformSchema, sql } from "@vynxlabs/db";
import type { Db, Trx } from "../audit.js";

type Condition = ReturnType<typeof sql>;

/**
 * One platform table whose rows belong to a tenant. Deleting a workspace or a
 * tenant, and exporting and importing a tenant, all work from this list, so a
 * new table cannot be forgotten by one of them: a test fails if a table in
 * the database is neither here nor in `INSTANCE_TABLES`.
 *
 * The order is the order rows can be inserted in: a table comes after
 * everything it refers to. Deleting goes the other way.
 */
export interface OwnedTable {
  table: keyof PlatformSchema & string;
  /** Selects the rows of one tenant. `t` is this table's alias. */
  ofTenant: (tenantId: string) => Condition;
  /** Selects the rows of one workspace. Absent for what belongs to the tenant as a whole. */
  ofWorkspace?: (workspaceId: string) => Condition;
  /** Columns that give a stable order, for an export that is the same every time. */
  key: string[];
  /**
   * Whether a tenant export carries the rows: always, only when history is
   * asked for, or never (credentials that must be made again, and what
   * belongs to this instance rather than the tenant).
   */
  export: "always" | "history" | "never";
  /** Columns holding the key of an object in the object store. */
  stored?: string[];
  /** Never deleted with the tenant or workspace. */
  keep?: true;
}

const own = (id: string) => sql`t.tenant_id = ${id}`;
const inWorkspace = (id: string) => sql`t.workspace_id = ${id}`;

export const OWNED_TABLES: OwnedTable[] = [
  { table: "tenant_key", ofTenant: own, key: ["tenant_id"], export: "never" },
  { table: "tenant_member", ofTenant: own, key: ["member_id"], export: "always" },
  { table: "principal_group", ofTenant: own, key: ["id"], export: "always" },
  {
    table: "group_member",
    ofTenant: (id) => sql`t.group_id in (select id from principal_group where tenant_id = ${id})`,
    key: ["group_id", "member_id"],
    export: "always",
  },
  { table: "service_account", ofTenant: own, key: ["id"], export: "always" },
  {
    table: "api_key",
    ofTenant: (id) =>
      sql`t.owner_type = 'service_account' and t.owner_id in (select id from service_account where tenant_id = ${id})`,
    key: ["id"],
    export: "never",
  },
  {
    table: "workspace",
    ofTenant: own,
    ofWorkspace: (id) => sql`t.id = ${id}`,
    key: ["id"],
    export: "always",
  },
  {
    table: "bundle",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "always",
    stored: ["storage_key"],
  },
  { table: "resource", ofTenant: own, ofWorkspace: inWorkspace, key: ["id"], export: "always" },
  {
    table: "resource_version",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["resource_id", "version"],
    export: "always",
  },
  {
    table: "resource_draft",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["workspace_id", "path"],
    export: "always",
  },
  // The token is encrypted under the tenant's key, which travels with the export.
  { table: "git_repository", ofTenant: own, key: ["tenant_id"], export: "always" },
  {
    table: "workspace_git",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["workspace_id"],
    export: "always",
  },
  {
    table: "git_operation",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "history",
  },
  { table: "role", ofTenant: own, ofWorkspace: inWorkspace, key: ["id"], export: "always" },
  { table: "binding", ofTenant: own, ofWorkspace: inWorkspace, key: ["id"], export: "always" },
  { table: "deployment", ofTenant: own, ofWorkspace: inWorkspace, key: ["id"], export: "always" },
  {
    table: "connection_binding",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "always",
  },
  {
    table: "connection_group_member",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "always",
  },
  {
    table: "variable_value",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "always",
  },
  { table: "secret", ofTenant: own, ofWorkspace: inWorkspace, key: ["id"], export: "always" },
  {
    table: "data_source_binding",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "always",
  },
  {
    table: "trigger_state",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["resource_id", "node_id"],
    export: "always",
  },
  {
    table: "flow_layout",
    ofTenant: (id) => sql`t.resource_id in (select id from resource where tenant_id = ${id})`,
    ofWorkspace: (id) => sql`t.resource_id in (select id from resource where workspace_id = ${id})`,
    key: ["resource_id"],
    export: "always",
  },
  {
    table: "file",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "always",
    stored: ["storage_key"],
  },
  {
    table: "flow_run",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    // A sub-flow's run refers to its parent's, and IDs grow with time.
    key: ["id"],
    export: "history",
    stored: ["input_ref"],
  },
  {
    table: "run",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "history",
    stored: ["input_ref", "output_ref"],
  },
  {
    table: "step_run",
    ofTenant: (id) => sql`t.flow_run_id in (select id from flow_run where tenant_id = ${id})`,
    ofWorkspace: (id) => sql`t.flow_run_id in (select id from flow_run where workspace_id = ${id})`,
    key: ["flow_run_id", "node_id", "item_key"],
    export: "history",
    stored: ["output_ref"],
  },
  {
    table: "run_log",
    ofTenant: (id) => sql`t.run_id in (select id from run where tenant_id = ${id})`,
    ofWorkspace: (id) => sql`t.run_id in (select id from run where workspace_id = ${id})`,
    key: ["run_id", "seq"],
    export: "history",
  },
  { table: "event", ofTenant: own, ofWorkspace: inWorkspace, key: ["id"], export: "history" },
  // Who the operator let in, and the tenant's own workers: both belong to this instance.
  { table: "access_grant", ofTenant: own, key: ["id"], export: "never" },
  {
    table: "worker",
    ofTenant: own,
    key: ["id"],
    export: "never",
  },
  {
    table: "worker_credential",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "never",
  },
  { table: "workspace_clone", ofTenant: own, key: ["id"], export: "never" },
  // App files are kept once per tenant and shared by its workspaces, so they go with the tenant.
  {
    table: "bundle_asset",
    ofTenant: own,
    key: ["sha256"],
    export: "always",
    stored: ["storage_key"],
  },
  // The end-user pool travels, with the hash each person signs in with.
  { table: "end_user", ofTenant: own, key: ["id"], export: "always" },
  // Links and sign-ins are made again where the tenant arrives.
  { table: "end_user_token", ofTenant: own, key: ["id"], export: "never" },
  { table: "app_session", ofTenant: own, key: ["id"], export: "never" },
  { table: "app_handoff", ofTenant: own, key: ["id"], export: "never" },
  // A hostname points at one instance. It is registered again on the next.
  {
    table: "app_domain",
    ofTenant: own,
    ofWorkspace: inWorkspace,
    key: ["id"],
    export: "never",
  },
  {
    table: "tenant_portal",
    ofTenant: own,
    key: ["tenant_id"],
    export: "always",
    stored: ["logo_key"],
  },
  // The record of what was done is never removed, even when what it describes is.
  { table: "audit_entry", ofTenant: own, key: ["id"], export: "always", keep: true },
];

/**
 * Tables that belong to the instance. `tenant` and the member tables are here
 * because they are handled by name: a tenant is one row, and members are
 * shared by every tenant of the instance.
 */
export const INSTANCE_TABLES = [
  "platform_migration",
  "tenant",
  "member",
  "member_session",
  "member_account",
  "member_verification",
  "database_location",
  // In the platform database these hold every shared tenant's catalog. They are
  // handled with the tables they describe, which may be in another database.
  "data_table",
  "data_column",
];

/** Deletes a tenant's or a workspace's rows from every table that holds any, children first. */
export async function deleteOwned(
  trx: Trx,
  scope: { tenantId: string } | { workspaceId: string },
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const entry of [...OWNED_TABLES].reverse()) {
    if (entry.keep) continue;
    const condition =
      "tenantId" in scope ? entry.ofTenant(scope.tenantId) : entry.ofWorkspace?.(scope.workspaceId);
    if (!condition) continue;
    const result = await sql`delete from ${sql.table(entry.table)} as t where ${condition}`.execute(
      trx,
    );
    counts[entry.table] = Number(result.numAffectedRows ?? 0n);
  }
  return counts;
}

/** The object store keys a tenant's or a workspace's rows point at. */
export async function storedKeys(
  db: Db | Trx,
  scope: { tenantId: string } | { workspaceId: string },
): Promise<string[]> {
  const keys: string[] = [];
  for (const entry of OWNED_TABLES) {
    const condition =
      "tenantId" in scope ? entry.ofTenant(scope.tenantId) : entry.ofWorkspace?.(scope.workspaceId);
    if (!condition) continue;
    for (const column of entry.stored ?? []) {
      const found = await sql<{ key: string }>`
        select ${sql.ref(`t.${column}`)} as key from ${sql.table(entry.table)} as t
        where ${condition} and ${sql.ref(`t.${column}`)} is not null
      `.execute(db);
      keys.push(...found.rows.map((row) => row.key));
    }
  }
  return keys;
}
