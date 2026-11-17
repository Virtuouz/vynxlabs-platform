-- The zone a workspace's schedules are written in unless they say otherwise. Forms
-- that make a schedule start from it and always show it. Existing schedules keep
-- their own zone: nothing is migrated.
alter table workspace add column time_zone text not null default 'UTC';
