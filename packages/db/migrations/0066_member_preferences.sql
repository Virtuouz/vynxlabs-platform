-- A member's own settings, kept so they follow the member from browser to browser:
-- how dense a list is, how wide a pane, whether single-key shortcuts are on, what is
-- pinned. Preferences, never audited, and the instance's to keep: not exported.
create table member_preference (
  member_id uuid not null references member (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, key)
);

-- A list as a member likes to see it, by name: its filters, sort, columns and density.
-- Private to its maker; its link carries the same state, so it opens for anyone who may
-- see the list.
create table member_saved_view (
  id uuid primary key,
  member_id uuid not null references member (id) on delete cascade,
  tenant_id uuid not null references tenant (id) on delete cascade,
  -- Null for a list of the tenant's own, such as its audit log.
  workspace_id uuid references workspace (id) on delete cascade,
  list text not null check (list ~ '^[a-z][a-z0-9-]{0,39}$'),
  name text not null check (char_length(name) between 1 and 80),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index member_saved_view_name_idx on member_saved_view
  (member_id, tenant_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), list, lower(name));
