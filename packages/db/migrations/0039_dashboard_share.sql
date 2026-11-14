-- A dashboard shared with some groups of members, rather than with everyone in
-- the workspace. Whoever sees it still sees only the rows they may read.
create table dashboard_share (
  dashboard_id uuid not null references member_dashboard (id) on delete cascade,
  group_id uuid not null references principal_group (id) on delete cascade,
  tenant_id uuid not null references tenant (id),
  primary key (dashboard_id, group_id)
);
create index dashboard_share_group_idx on dashboard_share (group_id);
