-- One-time links that let a member choose a new password. Made by an operator, or by an admin of
-- the member's one tenant; only a hash of the token is kept. The end users' links (end_user_token)
-- belong to a tenant and an end user, so a member's are kept apart.
create table member_password_token (
  id uuid primary key,
  member_id uuid not null references member (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index member_password_token_member_idx on member_password_token (member_id);
