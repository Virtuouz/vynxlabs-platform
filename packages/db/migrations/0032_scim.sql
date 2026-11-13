-- Provisioning over SCIM.
--
-- An identity provider can push the people and groups it holds, and say when
-- one of them has left, without waiting for that person to sign in. It calls
-- an address of its own with a token made for it.
create table scim_token (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  name text not null check (length(name) between 1 and 80),
  -- The first characters of the token, to tell one from another. Only a hash is kept.
  prefix text not null,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index scim_token_provider_idx on scim_token (provider_id);

-- A person as the provider pushed them, and who they are here.
create table scim_user (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  external_id text,
  user_name text not null check (length(user_name) between 1 and 320),
  email text not null,
  display_name text,
  given_name text,
  family_name text,
  active boolean not null default true,
  principal_type text not null check (principal_type in ('member', 'end_user')),
  principal_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, principal_id)
);
create unique index scim_user_name_idx on scim_user (provider_id, lower(user_name));
create unique index scim_user_external_idx on scim_user (provider_id, external_id)
  where external_id is not null;
create index scim_user_principal_idx on scim_user (principal_id);

-- A group as the provider pushed it. Which group here its people belong to is
-- said by the provider's group map, by the group's name.
create table scim_group (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  external_id text,
  display_name text not null check (length(display_name) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index scim_group_name_idx on scim_group (provider_id, lower(display_name));

create table scim_group_member (
  group_id uuid not null references scim_group (id) on delete cascade,
  user_id uuid not null references scim_user (id) on delete cascade,
  primary key (group_id, user_id)
);
create index scim_group_member_user_idx on scim_group_member (user_id);

-- A member the tenant's provider said has left is suspended in that tenant:
-- they keep their account, and whatever they hold in other tenants.
alter table tenant_member add column suspended_at timestamptz;
-- A member the instance's own provider said has left can sign in nowhere.
alter table member add column disabled_at timestamptz;

-- How a provider's pushes are taken: which of its fields is the name it signs
-- people in by, and whether groups come from what it pushes.
alter table identity_provider
  add column scim jsonb not null default '{}' check (jsonb_typeof(scim) = 'object');
