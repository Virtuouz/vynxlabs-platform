-- A tenant export uploaded once, to be inspected before it is imported: what
-- it holds, which version wrote it, whether the passphrase opens it, and
-- whether its tenant or slug is taken here. The file is kept beside the
-- control plane that took it, and removed when it is imported, abandoned, or
-- an hour has passed.
create table import_staging (
  id uuid primary key,
  created_by uuid,
  file_name text not null,
  size_bytes bigint not null,
  inspection jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
