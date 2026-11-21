-- What a dashboard's widget named when the dashboard was deployed. A widget names its
-- query by path, and a path can change: the old one keeps answering for 90 days. The
-- query's key never changes, so the key is what a widget can still be followed by once
-- the old path has stopped answering. Written when a dashboard is deployed, and removed
-- with the dashboard.
create table dashboard_widget_query (
  dashboard_id uuid not null references resource (id) on delete cascade,
  widget_id text not null,
  workspace_id uuid not null references workspace (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  dashboard_key text not null,
  -- The path the widget names, as it is written in the dashboard.
  path text not null,
  -- The key of the query that path named when the dashboard was deployed.
  query_key text not null,
  primary key (dashboard_id, widget_id)
);
create index dashboard_widget_query_dashboard_idx on dashboard_widget_query (workspace_id, dashboard_key);
