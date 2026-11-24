-- The versions of a developer's widget a workspace has deployed. A page that places the widget
-- records the version it was placed with, so every version a page uses stays: deploying a new
-- one adds a row, and a version's files never change once stored (the route that serves them
-- sends them as immutable). The files are named by checksum in bundle_asset, as an app's are.
create table if not exists widget_version (
  workspace_id uuid not null references workspace (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  type text not null,
  version text not null,
  -- The widget's definition as that deploy had it: what the builder draws "Add to page" and the inspector from.
  definition jsonb not null,
  -- [{ path, sha256, size, contentType }]: the frame page and the one script.
  files jsonb not null,
  -- A digest of the files, so that deploying the same version again can tell whether they changed.
  files_digest text not null,
  bundle_id uuid not null references bundle (id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, type, version)
);
create index if not exists widget_version_served on widget_version (tenant_id, type, version);
