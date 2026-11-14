-- A draft keeps its history. Each save keeps what it replaced, and setting a
-- draft aside keeps it whole, so no earlier text is lost. The newest few per
-- path are kept: a builder that saves on every change would otherwise fill it.
create table resource_draft_history (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id) on delete cascade,
  path text not null,
  kind text not null,
  schema_version integer not null,
  body jsonb not null,
  deleted boolean not null default false,
  revision integer not null,
  -- `replaced` when a later save took its place; `set_aside` when the draft was put away.
  reason text not null check (reason in ('replaced', 'set_aside')),
  saved_by_type text not null,
  saved_by_id uuid,
  saved_at timestamptz not null,
  kept_at timestamptz not null default now()
);
create index resource_draft_history_path_idx on resource_draft_history (workspace_id, path, kept_at desc);
