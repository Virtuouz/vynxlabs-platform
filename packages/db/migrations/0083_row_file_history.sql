-- A file a row no longer names is kept while the row's history does.
--
-- Replacing or removing a file in a row notes the file here. The retention
-- pass removes a note when it is older than the tenant's history is kept, and
-- the file with the last note that names it.
create table row_file_history (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  file_id uuid not null references file (id) on delete cascade,
  table_name text not null,
  row_id text not null,
  column_name text not null,
  replaced_by_type text not null,
  replaced_by_id uuid,
  replaced_at timestamptz not null default now()
);
create index row_file_history_file_idx on row_file_history (file_id);
create index row_file_history_age_idx on row_file_history (tenant_id, replaced_at);
