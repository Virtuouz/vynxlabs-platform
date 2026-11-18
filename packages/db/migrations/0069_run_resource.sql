-- A run names the resource it is a run of, so that its history follows the
-- resource through a rename. A run of a script that was not in the registry,
-- such as a step of a flow run pinned to an earlier bundle, used to carry the
-- bundle's ID in its place. It now carries nothing: the path it ran under is
-- still on the row.
alter table run alter column resource_id drop not null;
update run set resource_id = null where resource_id in (select id from bundle);
alter table flow_run alter column resource_id drop not null;
update flow_run set resource_id = null where resource_id in (select id from bundle);
