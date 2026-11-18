-- A resource has three names. Its key is its identity: it matches the resource
-- across bundles, workspaces, the console and the repository, and never changes.
-- Its path is its address and its folder, and can change. Its title is what
-- people read. Until now the path was all three, so a rename was a delete and
-- a create. Every resource there is keeps its path as its key.
alter table resource
  add column key text,
  add column title text,
  -- What a bundle says about the resource beside its body, kept as it came.
  add column meta jsonb not null default '{}'::jsonb;
update resource set key = path;
alter table resource
  alter column key set not null,
  add constraint resource_key_unique unique (workspace_id, key);

alter table resource_version
  add column key text,
  add column title text,
  add column meta jsonb not null default '{}'::jsonb;
-- A version of a resource that was moved by hand before now takes the key the resource has.
update resource_version v
  set key = coalesce((select r.key from resource r where r.id = v.resource_id), v.path);
alter table resource_version alter column key set not null;

-- A draft is of one resource, by key. Its path is where the draft would put it.
alter table resource_draft add column key text, add column title text;
update resource_draft set key = path;
alter table resource_draft
  alter column key set not null,
  add constraint resource_draft_key_unique unique (workspace_id, key);

alter table resource_draft_history add column key text;
update resource_draft_history set key = path;
alter table resource_draft_history alter column key set not null;
create index resource_draft_history_key_idx on resource_draft_history (workspace_id, key, kept_at desc);

-- The path a resource had before it was renamed keeps answering for a while.
-- An alias is never the path of a resource that is there: making one at its
-- path removes it.
create table resource_alias (
  workspace_id uuid not null references workspace (id) on delete cascade,
  path text not null,
  tenant_id uuid not null references tenant (id),
  resource_id uuid not null references resource (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  primary key (workspace_id, path)
);
create index resource_alias_resource_idx on resource_alias (resource_id);
create index resource_alias_expires_idx on resource_alias (expires_at);
