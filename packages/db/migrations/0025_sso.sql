-- Single sign-on.
--
-- A tenant connects an identity provider, over OIDC or SAML, for its members
-- or for its end users. The instance may have providers of its own, for the
-- people who run it. A person is tied to a provider by the provider's own name
-- for them, and never by email after the first sign-in.
create table identity_provider (
  id uuid primary key,
  -- Null for a provider of the instance itself.
  tenant_id uuid references tenant (id),
  audience text not null check (audience in ('members', 'end_users')),
  protocol text not null check (protocol in ('oidc', 'saml')),
  -- What the sign-in button says.
  name text not null check (length(name) between 1 and 80),
  -- Everything that is not secret: addresses, certificates, which claims to read.
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  -- The client secret, or this side's private key. Sealed with the tenant's
  -- key, or the instance's for an instance provider. Never returned.
  secrets bytea,
  enabled boolean not null default false,
  -- Passwords are refused for the people this provider covers.
  enforce boolean not null default false,
  -- People are created the first time they sign in.
  provision boolean not null default false,
  -- The role a member created that way is given.
  default_role_id uuid references role (id) on delete set null,
  -- What the provider sent the last time someone tried it out.
  last_test jsonb,
  -- Set on an imported tenant, until the provider is saved again: the
  -- addresses the provider was given belong to the instance it came from.
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tenant_id is not null or audience = 'members'),
  check (enabled or not enforce)
);
create index identity_provider_tenant_idx on identity_provider (tenant_id);

-- The email domains a provider signs in. A tenant proves a domain with a DNS
-- record before any sign-in is routed by it or any email in it is believed.
create table identity_domain (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  audience text not null check (audience in ('members', 'end_users')),
  domain text not null check (domain = lower(domain) and length(domain) <= 253),
  verified_at timestamptz,
  checked_at timestamptz,
  check_error text,
  created_at timestamptz not null default now(),
  unique (provider_id, domain)
);
-- A member is one person across the whole instance, so one proved domain
-- belongs to one provider of members.
create unique index identity_domain_members_idx on identity_domain (domain)
  where audience = 'members' and verified_at is not null;

-- Who a provider's subject is here.
create table identity_link (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  subject text not null,
  principal_type text not null check (principal_type in ('member', 'end_user')),
  principal_id uuid not null,
  -- The email the provider last gave. For people to read, never matched on.
  email text,
  created_at timestamptz not null default now(),
  last_signed_in_at timestamptz,
  unique (provider_id, subject),
  unique (provider_id, principal_id)
);
create index identity_link_principal_idx on identity_link (principal_id);

-- A group at the provider, by the value it sends, and the group here that
-- people in it belong to. `*` stands for everyone the provider signs in.
create table identity_group_map (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  claim_value text not null check (length(claim_value) between 1 and 500),
  member_group_id uuid references principal_group (id) on delete cascade,
  end_user_group_id uuid references end_user_group (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((member_group_id is null) <> (end_user_group_id is null)),
  unique nulls not distinct (provider_id, claim_value, member_group_id, end_user_group_id)
);

-- One sign-in on its way to a provider and back. Only hashes of what the
-- browser carries are kept.
create table sso_state (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  purpose text not null check (purpose in ('sign_in', 'test')),
  -- The value that goes to the provider and comes back with its answer.
  state_hash text not null unique,
  -- A cookie set in the browser that began. Empty when the provider began.
  browser_hash text not null,
  -- OIDC's nonce and code verifier, sealed.
  secrets bytea,
  -- The ID of the SAML request, which the answer must name.
  request_id text,
  -- The address the sign-in began at, where it ends.
  origin text not null,
  return_to text,
  -- The member trying a provider out.
  started_by uuid,
  -- Set once the provider has answered and the answer has been checked.
  answered_at timestamptz,
  finish_hash text unique,
  principal_id uuid,
  finished_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sso_state_request_idx on sso_state (provider_id, request_id);
create index sso_state_expires_idx on sso_state (expires_at);

-- Every SAML assertion accepted, until it would have run out anyway, so that
-- none is accepted twice.
create table sso_assertion (
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  assertion_key text not null,
  expires_at timestamptz not null,
  primary key (provider_id, assertion_key)
);
create index sso_assertion_expires_idx on sso_assertion (expires_at);
