-- The palette remembers what a member opened. The API took a page, a variable, a saved query
-- and a data source as kinds, and this list refused them: "doc" was accepted and then failed.
alter table member_recent_item drop constraint if exists member_recent_item_kind_check;
alter table member_recent_item add constraint member_recent_item_kind_check check (
  kind in (
    'script', 'flow', 'app', 'interface', 'table', 'trigger', 'schedule', 'connection', 'event',
    'doc', 'variable', 'query', 'data_source', 'run', 'flow_run'
  )
);
