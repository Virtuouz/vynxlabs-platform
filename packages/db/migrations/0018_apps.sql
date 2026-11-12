-- Apps, end users, the addresses apps are served at, and branding.

-- The files of an app. A bundle lists them by checksum and they are stored once
-- per tenant, so promoting a bundle to another workspace copies nothing.
create table bundle_asset (
  tenant_id uuid not null references tenant (id),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check (size_bytes >= 0),
  storage_key text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, sha256)
);

-- A client's customers and portal users. One pool per tenant: the same email in
-- two tenants is two people who know nothing of each other.
create table end_user (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  email text not null check (email = lower(email) and length(email) <= 320),
  name text not null default '',
  -- Null until the person sets a password from an invitation.
  password_hash text,
  disabled_at timestamptz,
  last_signed_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

-- One-time links: an invitation to set a first password, or a reset.
create table end_user_token (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  end_user_id uuid not null references end_user (id) on delete cascade,
  purpose text not null check (purpose in ('invite', 'reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index end_user_token_user_idx on end_user_token (end_user_id);

-- A sign-in to a tenant's apps. An end user's, or a member's on an address other
-- than the instance's own, where the member's ordinary session is never sent.
-- It is good for one tenant, on the address it was made on.
create table app_session (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  principal_type text not null check (principal_type in ('end_user', 'member')),
  principal_id uuid not null,
  token_hash text not null unique,
  host text not null,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index app_session_principal_idx on app_session (principal_type, principal_id);
create index app_session_tenant_idx on app_session (tenant_id);

-- Carries a signed-in member from the instance's address to an app's address.
-- Used once, within a minute.
create table app_handoff (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  member_id uuid not null references member (id) on delete cascade,
  code_hash text not null unique,
  host text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index app_handoff_tenant_idx on app_handoff (tenant_id);

-- A hostname of the client's own that serves one app at its root.
create table app_domain (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  app_path text not null,
  hostname text not null unique
    check (
      hostname = lower(hostname)
      and length(hostname) <= 253
      and hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    ),
  enabled boolean not null default false,
  -- When the hostname's owner was last shown to agree, by a DNS record only they can make.
  verified_at timestamptz,
  checked_at timestamptz,
  -- Why the last check failed. Null when it passed or was never run.
  check_error text,
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now()
);
create index app_domain_tenant_idx on app_domain (tenant_id);
create index app_domain_workspace_idx on app_domain (workspace_id);

-- What a tenant's apps look like and who may join them.
create table tenant_portal (
  tenant_id uuid primary key references tenant (id),
  -- Whether people may create their own end-user account.
  sign_up boolean not null default false,
  -- Theme token overrides: {"tokens": {...}, "dark": {...}}.
  theme jsonb not null default '{}',
  logo_key text,
  logo_content_type text,
  updated_at timestamptz not null default now()
);

-- Bindings learn two principals: one end user, and every signed-in end user of
-- the tenant. Like the anonymous principal, the second has no ID.
do $$
declare found record;
begin
  for found in
    select conname from pg_constraint
    where conrelid = 'binding'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%anonymous%'
  loop
    execute format('alter table binding drop constraint %I', found.conname);
  end loop;
end $$;
alter table binding
  add constraint binding_principal_type_check check (
    principal_type in ('member', 'group', 'service_account', 'anonymous', 'end_user', 'end_users')
  ),
  add constraint binding_principal_id_check check (
    (principal_type in ('anonymous', 'end_users')) = (principal_id is null)
  );

-- What a portal user needs and no more: to open the apps and to read and write
-- rows. It does not hold data_all, so a table's owner rule applies to them.
insert into role (id, name, description, permissions, builtin) values
  ('00000000-0000-7000-8000-000000000007', 'portal_user',
   'Opens apps and reads and writes rows, held to each table''s row policy.',
   '{app:read,data:read,data:write}', true);

update role set permissions = permissions || '{app:*,theme:*}'::text[]
  where builtin and name = 'workspace_admin';
