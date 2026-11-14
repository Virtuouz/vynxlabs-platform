-- Worker pools as records of their own. A pool was a name on credentials and
-- scripts; now it can be made before any worker serves it, described, and
-- shown with the workers that serve it. Credentials and scripts still name it.
create table worker_pool (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  name text not null check (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(name) <= 40),
  description text not null default '' check (length(description) <= 300),
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);
insert into worker_pool (id, tenant_id, name)
  select gen_random_uuid(), tenant_id, pool from worker_credential
  where pool is not null group by tenant_id, pool;
