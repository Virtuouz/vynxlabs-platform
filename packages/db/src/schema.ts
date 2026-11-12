import type { ColumnType, Generated } from "kysely";

/** Where a tenant's data lives. Every data access resolves through this. */
export type DataLocation = { kind: "shared" } | { kind: "dedicated"; ref: string };

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json<T> = ColumnType<T, string, string>;

export type WorkspaceType = "production" | "dev";
export type Ownership = "code" | "ui";
export type ScopeType = "instance" | "tenant" | "workspace" | "resource";
/** `end_user` is reserved for the per-tenant end-user pool. */
export type PrincipalType = "member" | "group" | "service_account" | "anonymous" | "end_user";

export interface PlatformMigrationTable {
  version: number;
  name: string;
  checksum: string;
  applied_at: Generated<Date>;
}

export interface TenantTable {
  id: string;
  slug: string;
  name: string;
  data_location: ColumnType<DataLocation, string | undefined, string>;
  created_at: Generated<Date>;
}

export interface MemberTable {
  id: string;
  name: string;
  email: string;
  email_verified: Generated<boolean>;
  image: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MemberSessionTable {
  id: string;
  member_id: string;
  token: string;
  expires_at: Timestamp;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface WorkspaceTable {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  type: WorkspaceType;
  linked_workspace_id: string | null;
  created_at: Generated<Date>;
}

export interface TenantMemberTable {
  tenant_id: string;
  member_id: string;
  created_at: Generated<Date>;
}

export interface PrincipalGroupTable {
  id: string;
  tenant_id: string;
  name: string;
  created_at: Generated<Date>;
}

export interface GroupMemberTable {
  group_id: string;
  member_id: string;
  created_at: Generated<Date>;
}

export interface ServiceAccountTable {
  id: string;
  tenant_id: string;
  name: string;
  created_at: Generated<Date>;
}

export interface ApiKeyTable {
  id: string;
  owner_type: "member" | "service_account";
  owner_id: string;
  name: string;
  prefix: string;
  token_hash: string;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface ResourceTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  kind: string;
  schema_version: number;
  path: string;
  ownership: Ownership;
  version: number;
  body: Json<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface ResourceVersionTable {
  resource_id: string;
  version: number;
  tenant_id: string;
  workspace_id: string;
  kind: string;
  schema_version: number;
  path: string;
  ownership: Ownership;
  body: ColumnType<Record<string, unknown> | null, string | null, never>;
  deleted: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface RoleTable {
  id: string;
  tenant_id: string | null;
  workspace_id: string | null;
  name: string;
  description: Generated<string>;
  permissions: string[];
  builtin: Generated<boolean>;
  source_resource_id: string | null;
  created_at: Generated<Date>;
}

export interface BindingTable {
  id: string;
  scope_type: ScopeType;
  tenant_id: string | null;
  workspace_id: string | null;
  resource_id: string | null;
  principal_type: PrincipalType;
  principal_id: string | null;
  role_id: string;
  source_resource_id: string | null;
  created_at: Generated<Date>;
}

export interface AccessGrantTable {
  id: string;
  tenant_id: string;
  member_id: string;
  role_id: string;
  reason: string;
  created_at: Generated<Date>;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
}

export interface TenantKeyTable {
  tenant_id: string;
  wrapped_key: Buffer;
  created_at: Generated<Date>;
}

export interface SecretTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  ciphertext: Buffer;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface AuditEntryTable {
  id: string;
  occurred_at: Generated<Date>;
  tenant_id: string | null;
  workspace_id: string | null;
  actor_type: string;
  actor_id: string | null;
  api_key_id: string | null;
  access_grant_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Json<Record<string, unknown>>;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
}

/** Tables shared by every tenant in the platform database. */
export interface PlatformSchema {
  platform_migration: PlatformMigrationTable;
  tenant: TenantTable;
  member: MemberTable;
  member_session: MemberSessionTable;
  workspace: WorkspaceTable;
  tenant_member: TenantMemberTable;
  principal_group: PrincipalGroupTable;
  group_member: GroupMemberTable;
  service_account: ServiceAccountTable;
  api_key: ApiKeyTable;
  resource: ResourceTable;
  resource_version: ResourceVersionTable;
  role: RoleTable;
  binding: BindingTable;
  access_grant: AccessGrantTable;
  tenant_key: TenantKeyTable;
  secret: SecretTable;
  audit_entry: AuditEntryTable;
}
