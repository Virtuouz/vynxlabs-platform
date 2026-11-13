-- Groups of end users.
--
-- Members have had groups since the start. End users are a pool of their own
-- per tenant, so they get groups of their own: a role is given to a group
-- once, and a table's rows can be ruled by which group a person is in.
create table end_user_group (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  name text not null check (name ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table end_user_group_member (
  group_id uuid not null references end_user_group (id) on delete cascade,
  end_user_id uuid not null references end_user (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, end_user_id)
);
create index end_user_group_member_user_idx on end_user_group_member (end_user_id);

-- Facts about an end user that rows can be matched against: which customer
-- they belong to, which region they cover. Set by staff, or by the identity
-- provider they sign in through.
alter table end_user
  add column attributes jsonb not null default '{}'
    check (jsonb_typeof(attributes) = 'object');

-- A binding may name a group of end users.
do $$
declare found record;
begin
  for found in
    select conname from pg_constraint
    where conrelid = 'binding'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%principal_type%'
  loop
    execute format('alter table binding drop constraint %I', found.conname);
  end loop;
end $$;
alter table binding
  add constraint binding_principal_type_check check (
    principal_type in (
      'member', 'group', 'service_account', 'anonymous', 'end_user', 'end_users', 'end_user_group'
    )
  ),
  add constraint binding_principal_id_check check (
    (principal_type in ('anonymous', 'end_users')) = (principal_id is null)
  );
