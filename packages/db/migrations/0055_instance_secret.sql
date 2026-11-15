-- Secrets of the instance itself, each sealed with the master key. The first is the
-- seed of the restricted data role's password, which was the master key itself: kept
-- here, rotating the master key no longer changes that password, so replicas that
-- restart one by one keep reaching tenants' tables. The control plane writes the row
-- on its first start after this migration.
create table instance_secret (
  name text primary key,
  sealed bytea not null,
  created_at timestamptz not null default now()
);
