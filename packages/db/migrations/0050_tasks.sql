-- Work the tenant's execution context does for the platform that is not a run of a
-- script: reading what code declares (describe), sending a notification through a
-- tenant's connection (deliver), trying a connection (test-connection). The control
-- plane never runs a tenant's code or reaches a tenant's systems for this itself
-- (decision 0001); it queues a task, and a worker that takes that kind claims it.

create table task (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id) on delete cascade,
  -- The worker pool that takes it. Null for the default pool.
  pool text,
  kind text not null check (kind in ('describe', 'deliver', 'test-connection')),
  request jsonb not null default '{}',
  -- What it is about, for finding it again: a draft's path, a binding's path, a run's ID.
  subject text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  result jsonb,
  error jsonb,
  attempt integer not null default 0,
  worker_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_heartbeat_at timestamptz,
  -- Past this, a task nobody took is failed: a person waiting on it is told.
  expires_at timestamptz not null
);
create index task_queued_idx on task (tenant_id, created_at) where status = 'queued';
create index task_running_idx on task (last_heartbeat_at) where status = 'running';
create index task_retention_idx on task (tenant_id, finished_at) where finished_at is not null;

create function notify_task_event() returns trigger language plpgsql as $$
begin
  if vx_quiet() then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  perform pg_notify('vx_runs', json_build_object(
    't', new.tenant_id,
    'w', new.workspace_id,
    'k', 'task',
    'id', new.id,
    's', new.status,
    'p', new.kind || ':' || coalesce(new.subject, '')
  )::text);
  return null;
end $$;
create trigger task_event after insert or update of status on task
  for each row execute function notify_task_event();
