-- Bundles, deploys, per-workspace bindings, runs, triggers and workers.

create table bundle (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  version integer not null check (version >= 1),
  digest text not null,
  sdk_version text not null,
  core_min text not null,
  core_below text not null,
  storage_key text not null,
  size_bytes integer not null,
  manifest_count integer not null,
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, version),
  unique (workspace_id, digest)
);

alter table workspace
  add column active_bundle_id uuid references bundle (id),
  add column concurrency_limit integer not null default 10
    check (concurrency_limit between 1 and 1000),
  add column failure_alert jsonb not null default '{}';

create table deployment (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  bundle_id uuid not null references bundle (id),
  previous_bundle_id uuid references bundle (id),
  summary jsonb not null default '{}',
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now()
);
create index deployment_workspace_idx on deployment (workspace_id, id desc);

-- Where a connection points in this workspace, and its credential. Never part of a bundle.
create table connection_binding (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  path text not null,
  config jsonb not null,
  credential bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, path)
);

create table variable_value (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  path text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, path)
);

create table run (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  -- No foreign key: a run outlives the script it ran.
  resource_id uuid not null,
  script_path text not null,
  bundle_id uuid not null references bundle (id),
  status text not null
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt integer not null default 0,
  max_attempts integer not null,
  queue_job_id uuid,
  priority integer not null default 0,
  trigger_type text not null,
  trigger_detail jsonb not null default '{}',
  started_by_type text not null,
  started_by_id uuid,
  idempotency_key text not null,
  input jsonb,
  input_ref text,
  output jsonb,
  output_ref text,
  error jsonb,
  alert jsonb,
  worker_id uuid,
  created_at timestamptz not null default now(),
  scheduled_for timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_heartbeat_at timestamptz,
  unique (workspace_id, script_path, idempotency_key)
);
create index run_workspace_idx on run (workspace_id, id desc);
create index run_active_idx on run (tenant_id, status) where status in ('queued', 'running');

create table run_log (
  run_id uuid not null references run (id) on delete cascade,
  seq bigint generated always as identity,
  attempt integer not null,
  logged_at timestamptz not null,
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  message text not null,
  fields jsonb not null default '{}',
  primary key (run_id, seq)
);

-- The live state of a schedule or webhook resource. Goes when the resource goes.
create table trigger_state (
  resource_id uuid primary key references resource (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  type text not null check (type in ('schedule', 'webhook')),
  script_path text not null,
  enabled boolean not null default true,
  next_fire_at timestamptz,
  last_fired_at timestamptz,
  token_hash text unique,
  token_encrypted bytea
);
create index trigger_state_due_idx on trigger_state (next_fire_at) where type = 'schedule' and enabled;

create table worker_credential (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid references workspace (id),
  name text not null,
  prefix text not null,
  token_hash text not null unique,
  -- True for the short-lived credentials the control plane gives its own workers.
  managed boolean not null default false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index worker_credential_tenant_idx on worker_credential (tenant_id);

-- Workers seen recently.
create table worker (
  id uuid primary key,
  credential_id uuid not null references worker_credential (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  version text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
