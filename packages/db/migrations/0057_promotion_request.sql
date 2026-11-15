-- A developer who may not promote asks for it. The bundle running in the source when
-- they asked is pinned: deciding promotes that bundle, whatever was deployed since.
create table promotion_request (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  source_workspace_id uuid not null references workspace (id) on delete cascade,
  target_workspace_id uuid not null references workspace (id) on delete cascade,
  bundle_id uuid not null references bundle (id) on delete cascade,
  digest text not null,
  version integer not null,
  note text,
  requested_by_type text not null,
  requested_by_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'promoted', 'declined', 'withdrawn', 'superseded')),
  decided_by_type text,
  decided_by_id uuid,
  decided_at timestamptz,
  comment text,
  deployment_id uuid,
  created_at timestamptz not null default now()
);
-- One request waits per pair of workspaces: asking again replaces it.
create unique index promotion_request_pending_idx
  on promotion_request (source_workspace_id, target_workspace_id) where status = 'pending';
create index promotion_request_tenant_idx on promotion_request (tenant_id, created_at desc);
