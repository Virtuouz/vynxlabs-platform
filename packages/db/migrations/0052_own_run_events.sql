-- A run event also says who started the run, so that someone who may read only
-- their own runs (an end user of an app, a member signed in to one) can be sent
-- the events of those. The control plane keeps it to itself: it decides who
-- receives an event, and is never passed on.
--
-- A step and a log line name who started their flow run or run.

create or replace function notify_run_event() returns trigger language plpgsql as $$
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
    'k', 'run',
    'id', new.id,
    'flow', new.flow_run_id,
    's', new.status,
    'p', new.script_path,
    'by', new.started_by_type || ':' || coalesce(new.started_by_id::text, '')
  )::text);
  return null;
end $$;

create or replace function notify_flow_run_event() returns trigger language plpgsql as $$
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
    'k', 'flow_run',
    'id', new.id,
    's', new.status,
    'p', new.flow_path,
    'by', new.started_by_type || ':' || coalesce(new.started_by_id::text, '')
  )::text);
  return null;
end $$;

create or replace function notify_step_event() returns trigger language plpgsql as $$
declare
  owner record;
begin
  if vx_quiet() then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  select tenant_id, workspace_id, flow_path, started_by_type, started_by_id into owner
    from flow_run where id = new.flow_run_id;
  perform pg_notify('vx_runs', json_build_object(
    't', owner.tenant_id,
    'w', owner.workspace_id,
    'k', 'step',
    'id', new.flow_run_id,
    'node', new.node_id,
    's', new.status,
    'p', owner.flow_path,
    'by', owner.started_by_type || ':' || coalesce(owner.started_by_id::text, '')
  )::text);
  return null;
end $$;

create or replace function notify_log_event() returns trigger language plpgsql as $$
begin
  if vx_quiet() then
    return null;
  end if;
  perform pg_notify('vx_logs', json_build_object(
    't', r.tenant_id, 'w', r.workspace_id, 'k', 'log', 'id', r.id, 'flow', r.flow_run_id,
    'by', r.started_by_type || ':' || coalesce(r.started_by_id::text, '')
  )::text)
  from run r where r.id in (select distinct run_id from added);
  return null;
end $$;
