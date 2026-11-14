-- One-time recovery codes for a tenant's owners, for when single sign-on is
-- required and the provider is broken: a code with the person's own password
-- signs them in once. Shown once, kept only as a hash, each used at most once.
create table member_recovery_code (
  id uuid primary key,
  member_id uuid not null references member (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index member_recovery_code_member_idx on member_recovery_code (member_id);
