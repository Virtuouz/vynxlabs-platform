-- How long a tenant's history is kept. A null column takes the instance's default.
create table tenant_retention (
  tenant_id uuid primary key references tenant (id) on delete cascade,
  runs_days integer check (runs_days between 1 and 3650),
  events_days integer check (events_days between 1 and 3650),
  refusals_days integer check (refusals_days between 1 and 3650),
  audit_days integer check (audit_days between 90 and 3650),
  updated_at timestamptz not null default now()
);

-- What the retention job looks for: finished runs and top-level flow runs, events and
-- refusals, each per tenant and oldest first.
create index run_retention_idx on run (tenant_id, finished_at)
  where flow_run_id is null and finished_at is not null;
create index flow_run_retention_idx on flow_run (tenant_id, finished_at)
  where parent_flow_run_id is null and finished_at is not null;
create index event_retention_idx on event (tenant_id, occurred_at);
create index webhook_refusal_retention_idx on webhook_refusal (tenant_id, occurred_at);
create index scim_refusal_retention_idx on scim_refusal (tenant_id, occurred_at);

-- The audit log, split by month, so that a month past every tenant's retention can be
-- exported and dropped whole. Each row stays append-only: the trigger on the parent is
-- cloned to every partition, and each partition refuses TRUNCATE of its own.
alter table audit_entry rename to audit_entry_unpartitioned;
alter index audit_entry_pkey rename to audit_entry_unpartitioned_pkey;
alter index audit_entry_tenant_idx rename to audit_entry_unpartitioned_tenant_idx;

create table audit_entry (
  id uuid not null,
  occurred_at timestamptz not null default now(),
  tenant_id uuid,
  workspace_id uuid,
  actor_type text not null,
  actor_id uuid,
  api_key_id uuid,
  access_grant_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}',
  ip_address text,
  user_agent text,
  request_id text,
  primary key (id, occurred_at)
) partition by range (occurred_at);
create index audit_entry_tenant_idx on audit_entry (tenant_id, id desc);
create index audit_entry_occurred_idx on audit_entry (occurred_at);

create trigger audit_entry_no_change before update or delete on audit_entry
  for each row execute function audit_entry_is_append_only();
create trigger audit_entry_no_truncate before truncate on audit_entry
  for each statement execute function audit_entry_is_append_only();

-- Rows for a month with no partition of its own land here. It is never dropped.
create table audit_entry_default partition of audit_entry default;
create trigger audit_entry_no_truncate before truncate on audit_entry_default
  for each statement execute function audit_entry_is_append_only();

-- Makes the partition for the calendar month (UTC) holding `at`, unless it is there.
-- Returns its name, or null when rows of that month already sit in the default
-- partition: they stay there, and the month with them.
create function audit_partition(at timestamptz) returns text language plpgsql as $$
declare
  first timestamp := date_trunc('month', at at time zone 'UTC');
  name text := format('audit_entry_y%sm%s', to_char(first, 'YYYY'), to_char(first, 'MM'));
  starts timestamptz := first at time zone 'UTC';
  ends timestamptz := (first + interval '1 month') at time zone 'UTC';
begin
  if to_regclass(name) is not null then
    return name;
  end if;
  if exists (
    select 1 from audit_entry_default where occurred_at >= starts and occurred_at < ends
  ) then
    return null;
  end if;
  execute format(
    'create table %I partition of audit_entry for values from (%L) to (%L)', name, starts, ends
  );
  execute format(
    'create trigger audit_entry_no_truncate before truncate on %I '
    'for each statement execute function audit_entry_is_append_only()',
    name
  );
  return name;
end $$;

select audit_partition(month)
from generate_series(
  coalesce((select min(occurred_at) from audit_entry_unpartitioned), now()),
  now() + interval '3 months',
  interval '1 month'
) as month;
-- generate_series can step past the last month's start; make sure it is there.
select audit_partition(now() + interval '3 months');

insert into audit_entry select * from audit_entry_unpartitioned;
drop table audit_entry_unpartitioned;
