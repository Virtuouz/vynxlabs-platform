-- Events, flow runs and their steps.

create table event (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  name text not null,
  payload jsonb not null,
  -- What published it: a script, the API, a flow or the platform itself.
  source_type text not null,
  source_id uuid,
  -- How many events led to this one. Stops an event from causing itself for ever.
  depth integer not null default 0,
  occurred_at timestamptz not null default now()
);
create index event_workspace_idx on event (workspace_id, id desc);

-- A flow has several triggers, so a trigger's state is now per resource and node.
-- A trigger starts a script or a flow.
alter table trigger_state drop constraint trigger_state_pkey;
alter table trigger_state drop constraint trigger_state_type_check;
alter table trigger_state rename column script_path to target_path;
alter table trigger_state
  add column node_id text not null default '',
  add column target_kind text not null default 'script' check (target_kind in ('script', 'flow')),
  add column event_name text,
  add column filter text,
  -- What the trigger needs to fire: a schedule's expression and time zone.
  add column config jsonb not null default '{}',
  add constraint trigger_state_type_check check (type in ('schedule', 'webhook', 'event')),
  add primary key (resource_id, node_id);
create index trigger_state_event_idx on trigger_state (workspace_id, event_name) where type = 'event';

create table flow_run (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  -- No foreign key: a flow run outlives the flow it ran.
  resource_id uuid not null,
  flow_path text not null,
  bundle_id uuid not null references bundle (id),
  trigger_node text not null,
  trigger_type text not null,
  trigger_detail jsonb not null default '{}',
  status text not null check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  input jsonb,
  input_ref text,
  output jsonb,
  error jsonb,
  alert jsonb,
  -- Set when this flow run is a sub-flow or one item of a foreach.
  parent_flow_run_id uuid references flow_run (id),
  parent_node text,
  parent_item text,
  started_by_type text not null,
  started_by_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (workspace_id, flow_path, idempotency_key)
);
create index flow_run_workspace_idx on flow_run (workspace_id, id desc);

create table step_run (
  flow_run_id uuid not null references flow_run (id) on delete cascade,
  node_id text not null,
  -- Empty for an ordinary step. The item's index for one item of a foreach.
  item_key text not null default '',
  status text not null
    check (status in ('running', 'waiting', 'succeeded', 'failed', 'skipped', 'cancelled')),
  -- For a branch: the case it took.
  output_name text,
  output jsonb,
  output_ref text,
  error jsonb,
  -- A failed step whose error path was taken does not fail the flow.
  handled boolean not null default false,
  -- The run of a code step, or the flow run of a sub-flow.
  run_id uuid,
  child_flow_run_id uuid,
  -- When a delay ends or an approval times out.
  wake_at timestamptz,
  detail jsonb not null default '{}',
  decided_by uuid,
  decision_comment text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (flow_run_id, node_id, item_key)
);
create index step_run_wake_idx on step_run (wake_at) where status = 'waiting' and wake_at is not null;
create index step_run_waiting_idx on step_run (flow_run_id) where status = 'waiting';

alter table run
  add column flow_run_id uuid references flow_run (id),
  add column step_node text,
  add column step_item text;
create index run_flow_idx on run (flow_run_id) where flow_run_id is not null;

-- Where each node of a flow is drawn. Not part of the flow's definition.
create table flow_layout (
  resource_id uuid primary key references resource (id) on delete cascade,
  positions jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
