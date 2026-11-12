alter table tenant add column name text;
update tenant set name = slug;
alter table tenant alter column name set not null;

create table workspace (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 63),
  name text not null,
  type text not null check (type in ('production', 'dev')),
  linked_workspace_id uuid references workspace (id),
  created_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- A workspace is production or dev for life.
create function workspace_type_is_immutable() returns trigger language plpgsql as $$
begin
  if new.type is distinct from old.type then
    raise exception 'the type of a workspace cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger workspace_type_is_immutable before update on workspace
  for each row execute function workspace_type_is_immutable();

create table tenant_member (
  tenant_id uuid not null references tenant (id),
  member_id uuid not null references member (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, member_id)
);
create index tenant_member_member_id_idx on tenant_member (member_id);

create table principal_group (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table group_member (
  group_id uuid not null references principal_group (id) on delete cascade,
  member_id uuid not null references member (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, member_id)
);
create index group_member_member_id_idx on group_member (member_id);

create table service_account (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- A key acts as its owner. Only the hash of the key is stored.
create table api_key (
  id uuid primary key,
  owner_type text not null check (owner_type in ('member', 'service_account')),
  owner_id uuid not null,
  name text not null,
  prefix text not null,
  token_hash text not null unique,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_key_owner_idx on api_key (owner_type, owner_id);
