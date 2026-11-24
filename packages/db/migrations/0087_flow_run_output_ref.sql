-- A flow run's output too large to hold in its row is kept in storage, as a run's input is:
-- this says where. `output` still reads `{"stored": "<key>"}` for such a run.
alter table flow_run add column output_ref text;
