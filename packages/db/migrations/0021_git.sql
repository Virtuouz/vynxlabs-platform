-- A tenant's repository, and how each dev workspace follows a branch of it.
--
-- The server writes one folder of the repository: the resources managed in the
-- console, as files. It commits to a branch per dev workspace and never to the
-- default branch. Everything else in the repository is the developers'.
create table git_repository (
  tenant_id uuid primary key references tenant (id),
  url text not null,
  default_branch text not null default 'main',
  -- The folder the server writes, relative to the repository's root.
  folder text not null default 'platform',
  username text not null default 'x-access-token',
  -- An access token, encrypted under the tenant's key. Never returned.
  credential bytea not null,
  -- Set on an imported tenant, so that two instances never push to one branch.
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_git (
  workspace_id uuid primary key references workspace (id),
  tenant_id uuid not null references tenant (id),
  branch text not null,
  -- The commit the workspace and the branch last agreed at.
  synced_commit text,
  -- Each file of the folder at that commit, by path, as git's own checksum of its content.
  synced_files jsonb not null default '{}',
  state text not null default 'never'
    check (state in ('never', 'synced', 'ahead', 'behind', 'conflict', 'error')),
  last_error text,
  -- Held while one operation talks to the remote, so that two never overlap.
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);

create table git_operation (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  kind text not null check (kind in ('push', 'pull')),
  status text not null check (status in ('done', 'nothing', 'refused', 'failed')),
  commit_id text,
  message text,
  detail jsonb not null default '{}',
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now()
);
create index git_operation_workspace_idx on git_operation (workspace_id, id desc);
