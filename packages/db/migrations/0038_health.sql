-- The last time each of a workspace's data sources was reached, and how that
-- went, so a list can say what is reachable without reaching everything as it
-- is drawn. Checked on a schedule and on request.
create table health_check (
  workspace_id uuid not null references workspace (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  kind text not null check (kind in ('data_source', 'connection')),
  path text not null,
  ok boolean not null,
  problem text,
  latency_ms integer,
  checked_at timestamptz not null default now(),
  primary key (workspace_id, kind, path)
);
