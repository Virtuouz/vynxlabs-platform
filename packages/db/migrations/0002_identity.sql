-- Platform members: one identity per instance. The member* tables are read
-- and written by the authentication library, so their columns follow its model.
create table member (
  id uuid primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table member_session (
  id uuid primary key,
  member_id uuid not null references member (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index member_session_member_id_idx on member_session (member_id);

create table member_account (
  id uuid primary key,
  member_id uuid not null references member (id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index member_account_member_id_idx on member_account (member_id);

create table member_verification (
  id uuid primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index member_verification_identifier_idx on member_verification (identifier);
