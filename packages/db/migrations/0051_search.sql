-- Finding resources by name from the command palette, and the entities a member
-- opened last.

-- A path is matched by its start through the primary key's own order, and anywhere
-- in it through a trigram index where the database allows the extension (0049).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index resource_path_trgm_idx on resource using gin (path gin_trgm_ops);
  end if;
end $$;
create index resource_workspace_path_idx on resource (workspace_id, path text_pattern_ops);

-- What a member opened last in a tenant: a script, a flow, a run. A preference, kept to
-- the newest few, and never audited.
create table member_recent_item (
  member_id uuid not null references member (id) on delete cascade,
  tenant_id uuid not null references tenant (id) on delete cascade,
  kind text not null check (kind in ('script', 'flow', 'app', 'interface', 'table', 'trigger', 'schedule', 'connection', 'event', 'run', 'flow_run')),
  -- A resource's path, or a run's ID.
  ref text not null,
  workspace_id uuid not null references workspace (id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (member_id, tenant_id, workspace_id, kind, ref)
);
create index member_recent_item_idx on member_recent_item (member_id, tenant_id, visited_at desc);
