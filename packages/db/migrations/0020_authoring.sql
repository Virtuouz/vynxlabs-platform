-- Resources written in the console.
--
-- A save in the console is a draft. It changes nothing that runs: no trigger is
-- registered and no table altered. Deploying composes the drafts with the
-- workspace's bundle into a new bundle and activates that, which is the only
-- way anything in a workspace changes.
create table resource_draft (
  tenant_id uuid not null references tenant (id),
  workspace_id uuid not null references workspace (id),
  path text not null,
  kind text not null,
  schema_version integer not null check (schema_version >= 1),
  body jsonb not null,
  -- A draft that removes the resource when it is deployed.
  deleted boolean not null default false,
  -- Goes up with each save, so two people editing one draft find out.
  revision integer not null default 1 check (revision >= 1),
  updated_by_type text not null,
  updated_by_id uuid,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, path)
);

-- Where a bundle came from: uploaded by the CLI, composed by the control plane
-- from an upload and console-managed resources, or composed to try a draft out.
alter table bundle
  add column origin text not null default 'upload'
    check (origin in ('upload', 'compose', 'preview'));

-- What whoever deployed said about it. It becomes the commit message.
alter table deployment add column message text;

-- Whether code may be written in the console for this tenant. Workers do not
-- sandbox what they run, so an operator can turn this off.
alter table tenant add column console_code boolean not null default true;

-- Writing code in the console is a permission of its own, so that it is given
-- on purpose. tenant_admin holds everything already.
update role set permissions = permissions || '{code:write}'::text[]
  where builtin and name = 'developer';
