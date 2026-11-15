-- A link in the mail an approver is sent when a flow waits for them: one per approver
-- and step, used once, and only until it runs out or the step is decided. Only the
-- token's hash is kept.
create table approval_link (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id) on delete cascade,
  flow_run_id uuid not null references flow_run (id) on delete cascade,
  node_id text not null,
  member_id uuid not null references member (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  -- Set on the one link the approval was decided with, if any: "decided by email".
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_link_step_idx on approval_link (flow_run_id, node_id);
create index approval_link_expires_idx on approval_link (expires_at);
