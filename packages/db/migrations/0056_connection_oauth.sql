-- OAuth 2.0 connections. A member authorizes one in the console; the control plane
-- exchanges the code and refreshes the tokens, and a worker is handed the access
-- token alone. The tokens are sealed with the tenant's key, as the credential is;
-- `oauth` says where they stand, for showing, and holds no secret.
alter table connection_binding
  add column oauth_tokens bytea,
  add column oauth jsonb;

-- An authorization in progress: one per press of Connect, answered once, within
-- minutes. The PKCE verifier is sealed with the tenant's key.
create table connection_oauth_state (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id) on delete cascade,
  path text not null,
  state_hash text not null unique,
  secrets bytea not null,
  started_by uuid not null,
  return_to text,
  answered_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index connection_oauth_state_expires_idx on connection_oauth_state (expires_at);
