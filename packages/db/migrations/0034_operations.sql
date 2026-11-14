-- Operating a workspace from the console.

-- One trigger paused while running, in any workspace, production included.
-- Keyed by the resource's path and the trigger node, not by the trigger's row,
-- so the pause outlives deploys until someone resumes it.
create table trigger_pause (
  workspace_id uuid not null references workspace (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  path text not null,
  -- Empty for a trigger resource; the trigger node's ID for a trigger inside a flow.
  node_id text not null default '',
  reason text not null default '' check (length(reason) <= 500),
  paused_by uuid,
  paused_at timestamptz not null default now(),
  primary key (workspace_id, path, node_id)
);

-- Webhook requests that were refused: a bad signature, a body that could not be
-- read, or a paused trigger. Kept briefly and few per trigger, so the
-- workspace can see why calls are failing. Never the request's body.
create table webhook_refusal (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id) on delete cascade,
  path text not null,
  node_id text not null default '',
  reason text not null check (reason in ('signature', 'body', 'paused')),
  problem text not null default '',
  occurred_at timestamptz not null default now()
);
create index webhook_refusal_trigger_idx on webhook_refusal (workspace_id, path, node_id, occurred_at desc);

-- Which runs an event started: looked up from the event.
create index run_event_idx on run ((trigger_detail ->> 'eventId')) where trigger_detail ? 'eventId';
create index flow_run_event_idx on flow_run ((trigger_detail ->> 'eventId')) where trigger_detail ? 'eventId';
