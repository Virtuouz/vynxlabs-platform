-- A member's own dashboards.
--
-- A dashboard is one page of widgets over a workspace's tables, the same as a
-- page of an interface, kept for the member who made it. It is not a resource:
-- it is saved as it is changed, with no deploy, and it is not promoted. It can
-- be shown, read-only, to everyone else in the workspace who may see
-- dashboards. Whoever looks at it is given only the rows they may read.
create table member_dashboard (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  member_id uuid not null references member (id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  -- One page, in the shape of a page of an interface. `json`, so that it is kept as written.
  body json not null,
  shared boolean not null default false,
  -- Goes up on each save, so that two windows do not overwrite each other.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index member_dashboard_workspace_idx on member_dashboard (workspace_id, member_id);

-- Whoever builds things in a workspace may keep dashboards of their own there.
update role set permissions = permissions || '{dashboard:write}'::text[]
  where builtin and name in ('developer', 'workspace_admin', 'app_maintainer')
    and not ('dashboard:write' = any(permissions));
update role set permissions = permissions || '{dashboard:read}'::text[]
  where builtin and name in ('workspace_admin', 'app_maintainer')
    and not ('dashboard:read' = any(permissions));
