-- Copies of a workspace. A clone can carry a lot of data, so it runs after
-- the request that asked for it, and its progress is kept here.
create table workspace_clone (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  -- Neither is a foreign key: the record outlives a workspace that is later deleted.
  source_workspace_id uuid not null,
  workspace_id uuid not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  with_data boolean not null,
  -- With safety on, the clone gets no connection, data source or secret value.
  safe boolean not null,
  report jsonb not null default '{}',
  error text,
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index workspace_clone_tenant_idx on workspace_clone (tenant_id, id desc);
