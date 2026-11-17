-- The last success of a script or a flow, before a given run: for a failed run's page,
-- what changed since it last worked. Only successes are indexed, newest first.
create index run_succeeded_idx on run (workspace_id, script_path, id desc)
  where status = 'succeeded';
create index flow_run_succeeded_idx on flow_run (workspace_id, flow_path, id desc)
  where status = 'succeeded' and parent_flow_run_id is null;
