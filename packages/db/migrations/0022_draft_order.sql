-- A draft is kept as it was written, not as jsonb. jsonb puts an object's keys
-- in an order of its own, so a flow drawn in the console lost the order its
-- author gave its steps, and its file in the repository changed for no reason.
alter table resource_draft alter column body type json using body::json;
