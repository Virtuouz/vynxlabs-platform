-- Who decided an approval step, by type, and where: so that a service account's decision, or one
-- made from an app or by MCP, is listed as Decided and says how it was made. `decided_by` is not a
-- reference to a member: it holds the ID of whichever principal decided.
alter table step_run add column decided_by_type text;
alter table step_run add column decided_via text;
update step_run set decided_by_type = 'member' where decided_by is not null;
