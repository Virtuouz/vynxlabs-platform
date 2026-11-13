-- What a flow answered the request that started it.
--
-- A flow started by a webhook can answer the request itself, with a respond
-- step. The request is held open on one process while the flow may run on
-- another, so the answer is kept here for the one that is waiting to find.
-- The first respond step to run is the answer. Later ones change nothing.
alter table flow_run add column response jsonb;
