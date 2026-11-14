-- Every change of a run's, a flow run's or a step's status is announced, once the
-- change is committed, on the channel `vx_runs`. Log lines are announced on `vx_logs`,
-- once per run per insert. The control plane passes them on to the browsers that may
-- see them. A payload holds only identifiers and the status: what changed is read again.
--
-- A bulk load quiets them with `set local vx.quiet = 'on'`.

create function vx_quiet() returns boolean language sql stable as $$
  select coalesce(current_setting('vx.quiet', true), '') = 'on'
$$;

create function notify_run_event() returns trigger language plpgsql as $$
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
    'p', new.script_path
  )::text);
  return null;
end $$;

create function notify_flow_run_event() returns trigger language plpgsql as $$
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
    'p', new.flow_path
  )::text);
  return null;
end $$;

create function notify_step_event() returns trigger language plpgsql as $$
declare
  owner record;
begin
  if vx_quiet() then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  select tenant_id, workspace_id, flow_path into owner from flow_run where id = new.flow_run_id;
  perform pg_notify('vx_runs', json_build_object(
    't', owner.tenant_id,
    'w', owner.workspace_id,
    'k', 'step',
    'id', new.flow_run_id,
    'node', new.node_id,
    's', new.status,
    'p', owner.flow_path
  )::text);
  return null;
end $$;

create function notify_log_event() returns trigger language plpgsql as $$
begin
  if vx_quiet() then
    return null;
  end if;
  perform pg_notify('vx_logs', json_build_object(
    't', r.tenant_id, 'w', r.workspace_id, 'k', 'log', 'id', r.id, 'flow', r.flow_run_id
  )::text)
  from run r where r.id in (select distinct run_id from added);
  return null;
end $$;

create trigger run_event after insert or update of status on run
  for each row execute function notify_run_event();
create trigger flow_run_event after insert or update of status on flow_run
  for each row execute function notify_flow_run_event();
create trigger step_event after insert or update of status on step_run
  for each row execute function notify_step_event();
create trigger run_log_event after insert on run_log
  referencing new table as added
  for each statement execute function notify_log_event();
