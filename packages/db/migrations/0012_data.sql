-- Custom tables: the catalog, external sources and files.

-- Requests for tenant data switch to this role, which owns nothing. Row
-- policies apply to it. The role belongs to the database server, so another
-- instance on the same server may have made it already.
do $$
begin
  create role platform_data nologin;
exception when duplicate_object or unique_violation then
  null;
end $$;
do $$
begin
  execute format('grant platform_data to %I', current_user);
exception when others then
  -- A superuser needs no grant to switch to it.
  null;
end $$;

-- One row per custom table in a workspace, active or retired.
create table data_table (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  -- The resource that declares it. Null once the table is retired.
  resource_id uuid references resource (id) on delete set null,
  -- The table's path, as scripts and the API name it.
  name text not null,
  -- Its name inside the workspace's schema.
  physical_name text not null,
  status text not null check (status in ('active', 'retired')),
  policy jsonb not null default '{"type": "open"}',
  -- Paths it has had before, so that going back to an older definition renames it back.
  previous_names text[] not null default '{}',
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, physical_name)
);
create unique index data_table_name_idx on data_table (workspace_id, name) where status = 'active';

create table data_column (
  id uuid primary key,
  table_id uuid not null references data_table (id) on delete cascade,
  name text not null,
  physical_name text not null,
  type text not null,
  required boolean not null default false,
  is_unique boolean not null default false,
  default_value jsonb,
  -- For a reference: the path of the table it points to.
  reference_table text,
  -- Names it has had before, so that going back to an older definition renames it back.
  previous_names text[] not null default '{}',
  status text not null check (status in ('active', 'retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (table_id, physical_name)
);
create unique index data_column_name_idx on data_column (table_id, name) where status = 'active';

-- Where an external data source is, in this workspace. Never part of a bundle.
create table data_source_binding (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  path text not null,
  config jsonb not null,
  credential bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, path)
);

create table file (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  name text not null,
  content_type text not null,
  size_bytes bigint not null,
  storage_key text not null,
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now()
);
create index file_workspace_idx on file (workspace_id, id desc);
