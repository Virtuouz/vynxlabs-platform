-- Each tenant's data key, wrapped with the instance master key.
create table tenant_key (
  tenant_id uuid primary key references tenant (id),
  wrapped_key bytea not null,
  created_at timestamptz not null default now()
);

-- Secret values, encrypted with the tenant's data key.
create table secret (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  name text not null check (name ~ '^[A-Za-z_][A-Za-z0-9_]*$' and length(name) <= 127),
  ciphertext bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);
