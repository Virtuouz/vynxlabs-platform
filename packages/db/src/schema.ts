import type { ColumnType, Generated } from "kysely";

/** Where a tenant's data lives. Every data access resolves through this. */
export type DataLocation = { kind: "shared" } | { kind: "dedicated"; ref: string };

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json<T> = ColumnType<T, string, string>;

export type WorkspaceType = "production" | "dev";
export type Ownership = "code" | "ui";
export type ScopeType = "instance" | "tenant" | "workspace" | "resource";
/** `end_user` is one person in a tenant's pool. `end_users` is every signed-in one of them. */
export type PrincipalType =
  | "member"
  | "group"
  | "service_account"
  | "anonymous"
  | "end_user"
  | "end_users"
  | "end_user_group";

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
  managed_workers: Generated<boolean>;
  console_code: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface MemberTable {
  id: string;
  name: string;
  email: string;
  email_verified: Generated<boolean>;
  image: string | null;
  /** Set when the instance's own identity provider said the person has left. */
  disabled_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
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
  active_bundle_id: string | null;
  triggers_paused: Generated<boolean>;
  concurrency_limit: Generated<number>;
  failure_alert: ColumnType<FailureAlert, string | undefined, string>;
  created_at: Generated<Date>;
}

export interface TenantMemberTable {
  tenant_id: string;
  member_id: string;
  /** Set when the member may not act in this tenant for now. */
  suspended_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  created_at: Generated<Date>;
}

export interface ScimTokenTable {
  id: string;
  provider_id: string;
  tenant_id: string | null;
  name: string;
  prefix: string;
  token_hash: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface ScimUserTable {
  id: string;
  provider_id: string;
  tenant_id: string | null;
  external_id: string | null;
  user_name: string;
  email: string;
  display_name: string | null;
  given_name: string | null;
  family_name: string | null;
  active: Generated<boolean>;
  principal_type: "member" | "end_user";
  principal_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ScimGroupTable {
  id: string;
  provider_id: string;
  tenant_id: string | null;
  external_id: string | null;
  display_name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ScimGroupMemberTable {
  group_id: string;
  user_id: string;
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

/** What to do when a run fails for the last time. Paths of a script and of an HTTP connection. */
export interface FailureAlert {
  script?: string;
  notify?: string;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface BundleTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  version: number;
  digest: string;
  sdk_version: string;
  core_min: string;
  core_below: string;
  storage_key: string;
  size_bytes: number;
  manifest_count: number;
  origin: Generated<"upload" | "compose" | "preview">;
  created_by_type: string;
  created_by_id: string | null;
  created_at: Generated<Date>;
}

export interface ResourceDraftTable {
  tenant_id: string;
  workspace_id: string;
  path: string;
  kind: string;
  schema_version: number;
  body: Json<Record<string, unknown>>;
  deleted: Generated<boolean>;
  revision: Generated<number>;
  updated_by_type: string;
  updated_by_id: string | null;
  updated_at: Generated<Date>;
}

export interface GitRepositoryTable {
  tenant_id: string;
  url: string;
  default_branch: Generated<string>;
  folder: Generated<string>;
  username: Generated<string>;
  credential: Buffer;
  paused: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type GitState = "never" | "synced" | "ahead" | "behind" | "conflict" | "error";

export interface WorkspaceGitTable {
  workspace_id: string;
  tenant_id: string;
  branch: string;
  synced_commit: Generated<string | null>;
  synced_files: ColumnType<Record<string, string>, string | undefined, string>;
  state: Generated<GitState>;
  last_error: Generated<string | null>;
  lease_until: Generated<Date | null>;
  updated_at: Generated<Date>;
}

export interface GitOperationTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  kind: "push" | "pull";
  status: "done" | "nothing" | "refused" | "failed";
  commit_id: string | null;
  message: string | null;
  detail: Json<Record<string, unknown>>;
  created_by_type: string;
  created_by_id: string | null;
  created_at: Generated<Date>;
}

export interface DeploymentTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  bundle_id: string;
  previous_bundle_id: string | null;
  promoted_from_workspace_id: Generated<string | null>;
  summary: Json<Record<string, unknown>>;
  message: Generated<string | null>;
  created_by_type: string;
  created_by_id: string | null;
  created_at: Generated<Date>;
}

export interface ConnectionGroupMemberTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  group_path: string;
  key: string;
  label: Generated<string>;
  config: Json<Record<string, unknown>>;
  credential: Buffer | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface ConnectionBindingTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  path: string;
  config: Json<Record<string, unknown>>;
  credential: Buffer | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface VariableValueTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  path: string;
  value: string;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

type NullableJson = ColumnType<unknown, string | null | undefined, string | null>;

export interface RunTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  resource_id: string;
  script_path: string;
  /** The worker pool the run waits for. Null for the default pool. */
  pool: Generated<string | null>;
  bundle_id: string;
  status: RunStatus;
  attempt: Generated<number>;
  max_attempts: number;
  queue_job_id: string | null;
  priority: Generated<number>;
  trigger_type: string;
  trigger_detail: Json<Record<string, unknown>>;
  started_by_type: string;
  started_by_id: string | null;
  idempotency_key: string;
  input: NullableJson;
  input_ref: string | null;
  output: NullableJson;
  output_ref: string | null;
  error: ColumnType<
    { message: string; stack?: string } | null,
    string | null | undefined,
    string | null
  >;
  alert: ColumnType<Record<string, unknown> | null, string | null | undefined, string | null>;
  worker_id: string | null;
  flow_run_id: string | null;
  step_node: string | null;
  step_item: string | null;
  created_at: Generated<Date>;
  scheduled_for: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  last_heartbeat_at: Date | null;
}

export interface RunLogTable {
  run_id: string;
  seq: Generated<string>;
  attempt: number;
  logged_at: Date;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  fields: Json<Record<string, unknown>>;
}

export interface TriggerStateTable {
  resource_id: string;
  /** Empty for a trigger resource. The trigger node's ID for a trigger inside a flow. */
  node_id: Generated<string>;
  tenant_id: string;
  workspace_id: string;
  type: "schedule" | "webhook" | "event" | "form";
  target_kind: Generated<"script" | "flow">;
  /** The path of the script or flow the trigger starts. */
  target_path: string;
  enabled: boolean;
  next_fire_at: Date | null;
  last_fired_at: Date | null;
  token_hash: string | null;
  token_encrypted: Buffer | null;
  event_name: string | null;
  filter: string | null;
  config: ColumnType<Record<string, unknown>, string | undefined, string>;
  /** Where a polling trigger source had got to. */
  cursor: Json<unknown> | null;
}

export interface EventTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  payload: Json<Record<string, unknown>>;
  source_type: string;
  source_id: string | null;
  depth: Generated<number>;
  occurred_at: Generated<Date>;
}

export type FlowRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type StepStatus = "running" | "waiting" | "succeeded" | "failed" | "skipped" | "cancelled";
type ErrorColumn = ColumnType<{ message: string } | null, string | null | undefined, string | null>;

export interface FlowRunTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  resource_id: string;
  flow_path: string;
  bundle_id: string;
  trigger_node: string;
  trigger_type: string;
  trigger_detail: Json<Record<string, unknown>>;
  status: FlowRunStatus;
  input: NullableJson;
  input_ref: string | null;
  output: NullableJson;
  error: ErrorColumn;
  alert: ColumnType<Record<string, unknown> | null, string | null | undefined, string | null>;
  parent_flow_run_id: string | null;
  parent_node: string | null;
  parent_item: string | null;
  started_by_type: string;
  started_by_id: string | null;
  idempotency_key: string;
  /** What a respond step answered the request that started the run. */
  response: NullableJson;
  created_at: Generated<Date>;
  finished_at: Date | null;
}

export interface StepRunTable {
  flow_run_id: string;
  node_id: string;
  item_key: Generated<string>;
  status: StepStatus;
  output_name: string | null;
  output: NullableJson;
  output_ref: string | null;
  error: ErrorColumn;
  handled: Generated<boolean>;
  run_id: string | null;
  child_flow_run_id: string | null;
  wake_at: Date | null;
  detail: ColumnType<Record<string, unknown>, string | undefined, string>;
  decided_by: string | null;
  decision_comment: string | null;
  started_at: Generated<Date>;
  finished_at: Date | null;
}

export interface FlowLayoutTable {
  resource_id: string;
  positions: Json<Record<string, { x: number; y: number }>>;
  updated_at: Timestamp;
}

export interface WorkerCredentialTable {
  id: string;
  tenant_id: string;
  workspace_id: string | null;
  name: string;
  prefix: string;
  token_hash: string;
  managed: Generated<boolean>;
  pool: Generated<string | null>;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface WorkerTable {
  id: string;
  credential_id: string;
  tenant_id: string;
  version: string | null;
  started_at: Generated<Date>;
  last_seen_at: Timestamp;
}

export type CatalogStatus = "active" | "retired";

export interface DataTableTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  resource_id: string | null;
  name: string;
  physical_name: string;
  status: CatalogStatus;
  policy: ColumnType<
    { type: "open" } | { type: "owner"; column: string },
    string | undefined,
    string
  >;
  previous_names: Generated<string[]>;
  retired_at: Date | null;
  created_at: Generated<Date>;
}

export interface DataColumnTable {
  id: string;
  table_id: string;
  name: string;
  physical_name: string;
  type: string;
  required: Generated<boolean>;
  is_unique: Generated<boolean>;
  default_value: ColumnType<unknown, string | null | undefined, string | null>;
  reference_table: string | null;
  previous_names: Generated<string[]>;
  status: CatalogStatus;
  retired_at: Date | null;
  created_at: Generated<Date>;
}

export interface DataSourceBindingTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  path: string;
  config: Json<Record<string, unknown>>;
  credential: Buffer | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface FileTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  content_type: string;
  size_bytes: ColumnType<string, number, never>;
  storage_key: string;
  created_by_type: string;
  created_by_id: string | null;
  created_at: Generated<Date>;
}

export interface WorkspaceCloneTable {
  id: string;
  tenant_id: string;
  source_workspace_id: string;
  workspace_id: string;
  status: "running" | "succeeded" | "failed";
  with_data: boolean;
  safe: boolean;
  report: Json<Record<string, unknown>>;
  error: string | null;
  created_by_type: string;
  created_by_id: string | null;
  created_at: Generated<Date>;
  finished_at: Date | null;
}

export interface DatabaseLocationTable {
  name: string;
  description: Generated<string>;
  connection_encrypted: Buffer;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Tables shared by every tenant in the platform database. */
export interface BundleAssetTable {
  tenant_id: string;
  sha256: string;
  size_bytes: number;
  storage_key: string;
  created_at: Generated<Date>;
}

export interface EndUserTable {
  id: string;
  tenant_id: string;
  email: string;
  name: Generated<string>;
  password_hash: string | null;
  attributes: ColumnType<Record<string, string>, string | undefined, string>;
  disabled_at: Date | null;
  last_signed_in_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EndUserGroupTable {
  id: string;
  tenant_id: string;
  name: string;
  description: Generated<string>;
  created_at: Generated<Date>;
}

export interface EndUserGroupMemberTable {
  group_id: string;
  end_user_id: string;
  created_at: Generated<Date>;
}

export interface EndUserTokenTable {
  id: string;
  tenant_id: string;
  end_user_id: string;
  purpose: "invite" | "reset";
  token_hash: string;
  expires_at: Timestamp;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface AppSessionTable {
  id: string;
  tenant_id: string;
  principal_type: "end_user" | "member";
  principal_id: string;
  token_hash: string;
  host: string;
  expires_at: Timestamp;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
}

export interface AppHandoffTable {
  id: string;
  tenant_id: string;
  member_id: string;
  code_hash: string;
  host: string;
  expires_at: Timestamp;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface AppDomainTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  app_path: string;
  hostname: string;
  enabled: Generated<boolean>;
  verified_at: Date | null;
  checked_at: Date | null;
  check_error: string | null;
  created_by_type: string;
  created_by_id: string | null;
  created_at: Generated<Date>;
}

/** Theme token overrides, for light and for dark. */
export interface ThemeValues {
  tokens?: Record<string, string>;
  dark?: Record<string, string>;
}

export interface TenantPortalTable {
  tenant_id: string;
  sign_up: Generated<boolean>;
  theme: ColumnType<ThemeValues, string | undefined, string>;
  logo_key: string | null;
  logo_content_type: string | null;
  updated_at: Generated<Date>;
}

export interface MemberDashboardTable {
  id: string;
  tenant_id: string;
  workspace_id: string;
  member_id: string;
  title: string;
  body: Json<Record<string, unknown>>;
  shared: Generated<boolean>;
  revision: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface IdentityProviderTable {
  id: string;
  tenant_id: string | null;
  audience: "members" | "end_users";
  protocol: "oidc" | "saml";
  name: string;
  config: Json<Record<string, unknown>>;
  secrets: Buffer | null;
  enabled: Generated<boolean>;
  enforce: Generated<boolean>;
  provision: Generated<boolean>;
  default_role_id: string | null;
  last_test: Json<Record<string, unknown>> | null;
  paused: Generated<boolean>;
  /** How pushes over SCIM are taken. */
  scim: ColumnType<Record<string, unknown>, string | undefined, string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface IdentityDomainTable {
  id: string;
  provider_id: string;
  tenant_id: string | null;
  audience: "members" | "end_users";
  domain: string;
  verified_at: Timestamp | null;
  checked_at: Timestamp | null;
  check_error: string | null;
  created_at: Generated<Date>;
}

export interface IdentityLinkTable {
  id: string;
  provider_id: string;
  tenant_id: string | null;
  subject: string;
  principal_type: "member" | "end_user";
  principal_id: string;
  email: string | null;
  created_at: Generated<Date>;
  last_signed_in_at: Timestamp | null;
}

export interface IdentityGroupMapTable {
  id: string;
  provider_id: string;
  tenant_id: string;
  claim_value: string;
  member_group_id: string | null;
  end_user_group_id: string | null;
  created_at: Generated<Date>;
}

export interface SsoStateTable {
  id: string;
  provider_id: string;
  tenant_id: string | null;
  purpose: "sign_in" | "test";
  state_hash: string;
  browser_hash: string;
  secrets: Buffer | null;
  request_id: string | null;
  origin: string;
  return_to: string | null;
  started_by: string | null;
  answered_at: Timestamp | null;
  finish_hash: string | null;
  principal_id: string | null;
  finished_at: Timestamp | null;
  expires_at: Timestamp;
  created_at: Generated<Date>;
}

export interface SsoAssertionTable {
  provider_id: string;
  tenant_id: string | null;
  assertion_key: string;
  expires_at: Timestamp;
}

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
  bundle: BundleTable;
  deployment: DeploymentTable;
  resource_draft: ResourceDraftTable;
  git_repository: GitRepositoryTable;
  workspace_git: WorkspaceGitTable;
  git_operation: GitOperationTable;
  connection_binding: ConnectionBindingTable;
  connection_group_member: ConnectionGroupMemberTable;
  variable_value: VariableValueTable;
  run: RunTable;
  run_log: RunLogTable;
  trigger_state: TriggerStateTable;
  worker_credential: WorkerCredentialTable;
  worker: WorkerTable;
  event: EventTable;
  flow_run: FlowRunTable;
  step_run: StepRunTable;
  flow_layout: FlowLayoutTable;
  data_table: DataTableTable;
  data_column: DataColumnTable;
  data_source_binding: DataSourceBindingTable;
  file: FileTable;
  database_location: DatabaseLocationTable;
  workspace_clone: WorkspaceCloneTable;
  bundle_asset: BundleAssetTable;
  end_user: EndUserTable;
  end_user_group: EndUserGroupTable;
  end_user_group_member: EndUserGroupMemberTable;
  end_user_token: EndUserTokenTable;
  app_session: AppSessionTable;
  app_handoff: AppHandoffTable;
  app_domain: AppDomainTable;
  tenant_portal: TenantPortalTable;
  identity_provider: IdentityProviderTable;
  identity_domain: IdentityDomainTable;
  identity_link: IdentityLinkTable;
  identity_group_map: IdentityGroupMapTable;
  scim_token: ScimTokenTable;
  scim_user: ScimUserTable;
  scim_group: ScimGroupTable;
  scim_group_member: ScimGroupMemberTable;
  sso_state: SsoStateTable;
  sso_assertion: SsoAssertionTable;
  member_dashboard: MemberDashboardTable;
}
