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
  active_bundle_id: string | null;
  concurrency_limit: Generated<number>;
  failure_alert: ColumnType<FailureAlert, string | undefined, string>;
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
  summary: Json<Record<string, unknown>>;
  created_by_type: string;
  created_by_id: string | null;
  created_at: Generated<Date>;
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
  type: "schedule" | "webhook" | "event";
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
  bundle: BundleTable;
  deployment: DeploymentTable;
  connection_binding: ConnectionBindingTable;
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
}
