-- Promotion between linked workspaces, and pausing a workspace's triggers.

-- Where a deployment's bundle came from, when it was promoted rather than uploaded.
alter table deployment
  add column promoted_from_workspace_id uuid references workspace (id) on delete set null;

-- A paused workspace starts nothing by itself: no schedule, webhook or event
-- trigger fires. Runs started by hand still work. Clones and imported tenants
-- start paused, so a copy can never act on real systems by surprise.
alter table workspace
  add column triggers_paused boolean not null default false;
