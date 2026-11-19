-- The trace a run and a flow run are part of, and the span they hang from:
-- the request that started them, or nothing when a schedule did. A run inside
-- a flow run carries the flow run's trace. Kept whether or not traces are
-- sent anywhere, so a run can be found in a collector and in the logs.
alter table run add column trace_id text, add column trace_parent text;
alter table flow_run add column trace_id text, add column trace_parent text;
