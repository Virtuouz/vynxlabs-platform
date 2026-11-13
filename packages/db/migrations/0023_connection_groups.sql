-- Credentials chosen by data at run time.
--
-- A connection group is declared in the repository like a connection, and names
-- no particular system: its members are added per workspace, in the console,
-- with no deploy. A script that declared the group picks a member by key when
-- it runs, so one script can serve every customer's account of the same kind.
create table connection_group_member (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  group_path text not null,
  -- What a script asks for: a customer's ID, a region, a shop's name.
  key text not null check (key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  label text not null default '',
  config jsonb not null,
  credential bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, group_path, key)
);
