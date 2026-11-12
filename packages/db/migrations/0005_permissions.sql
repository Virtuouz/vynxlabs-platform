create table role (
  id uuid primary key,
  tenant_id uuid references tenant (id),
  workspace_id uuid references workspace (id),
  name text not null check (name ~ '^[a-z][a-z0-9_]*$' and length(name) <= 63),
  description text not null default '',
  permissions text[] not null,
  builtin boolean not null default false,
  -- Set when the role is the projection of a resource of kind "role".
  source_resource_id uuid references resource (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (builtin = (tenant_id is null)),
  check (workspace_id is null or tenant_id is not null),
  unique nulls not distinct (tenant_id, workspace_id, name)
);

insert into role (id, name, description, permissions, builtin) values
  ('00000000-0000-7000-8000-000000000001', 'operator_admin',
   'Runs the instance. Has no access inside a tenant without an access grant.',
   '{instance:*,tenant:*,member:*,binding:*,access_grant:*,audit:read}', true),
  ('00000000-0000-7000-8000-000000000002', 'tenant_admin',
   'Full control of a tenant.', '{*:*}', true),
  ('00000000-0000-7000-8000-000000000003', 'workspace_admin',
   'Full control of a workspace.',
   '{workspace:*,role:*,binding:*,secret:*,resource:*,audit:read,member:read,group:read}', true),
  ('00000000-0000-7000-8000-000000000004', 'developer',
   'Reads everything in scope and changes resources and secrets.',
   '{*:read,secret:write,resource:write}', true),
  ('00000000-0000-7000-8000-000000000005', 'viewer',
   'Reads everything in scope.', '{*:read}', true);

create table binding (
  id uuid primary key,
  scope_type text not null check (scope_type in ('instance', 'tenant', 'workspace', 'resource')),
  tenant_id uuid references tenant (id),
  workspace_id uuid references workspace (id),
  resource_id uuid references resource (id) on delete cascade,
  -- end_user is reserved for the per-tenant end-user pool.
  principal_type text not null
    check (principal_type in ('member', 'group', 'service_account', 'anonymous', 'end_user')),
  principal_id uuid,
  role_id uuid not null references role (id),
  -- Set when the binding is the projection of a resource of kind "binding".
  source_resource_id uuid references resource (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((principal_type = 'anonymous') = (principal_id is null)),
  check (
    case scope_type
      when 'instance' then tenant_id is null and workspace_id is null and resource_id is null
      when 'tenant' then tenant_id is not null and workspace_id is null and resource_id is null
      when 'workspace' then tenant_id is not null and workspace_id is not null and resource_id is null
      else tenant_id is not null and workspace_id is not null and resource_id is not null
    end
  ),
  unique nulls not distinct
    (scope_type, tenant_id, workspace_id, resource_id, principal_type, principal_id, role_id)
);
create index binding_principal_idx on binding (principal_type, principal_id);
create index binding_tenant_idx on binding (tenant_id);

-- An operator's explicit, time-limited access to one tenant.
create table access_grant (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  member_id uuid not null references member (id),
  role_id uuid not null references role (id),
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid
);
create index access_grant_lookup_idx on access_grant (member_id, tenant_id);
