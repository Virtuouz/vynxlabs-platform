-- Small things the console shows.
--
-- What a service account is for, in a sentence. The last four characters of a
-- key, beside its first, so a person can match it to the one they hold; a key's
-- characters say nothing of the rest. And where a member was last in each
-- tenant, kept by the server so it follows them from one device to the next.
alter table service_account add column description text not null default '' check (length(description) <= 300);
alter table api_key add column suffix text;
create table member_recent_scope (
  member_id uuid not null references member (id) on delete cascade,
  tenant_id uuid not null references tenant (id) on delete cascade,
  workspace_id uuid references workspace (id) on delete set null,
  visited_at timestamptz not null default now(),
  primary key (member_id, tenant_id)
);
