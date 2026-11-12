-- The resource registry: one stored envelope per resource.
create table resource (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  kind text not null,
  schema_version integer not null check (schema_version >= 1),
  path text not null,
  ownership text not null check (ownership in ('code', 'ui')),
  version integer not null check (version >= 1),
  body jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, path)
);
create index resource_kind_idx on resource (workspace_id, kind);

-- Every version a resource has had. Kept after the resource is deleted.
create table resource_version (
  resource_id uuid not null,
  version integer not null,
  tenant_id uuid not null,
  workspace_id uuid not null,
  kind text not null,
  schema_version integer not null,
  path text not null,
  ownership text not null,
  body jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (resource_id, version)
);
