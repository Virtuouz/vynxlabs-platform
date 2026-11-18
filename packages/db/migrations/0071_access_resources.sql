-- Access as resources. A member group, a group of end users and a service
-- account get a key: what code and a repository name them by, which never
-- changes. The name they had becomes what people read, and can now change.
--
-- The key is made from the name: lower case, anything that is not a letter or a
-- digit turned into a hyphen. Two that would get the same key are told apart by
-- a number. A name that is already written like a key keeps it.

create function access_key(given text) returns text language sql immutable as $$
  select coalesce(
    nullif(
      left(
        trim(both '-' from regexp_replace(lower(normalize(given, NFKD)), '[^a-z0-9_]+', '-', 'g')),
        56
      ),
      ''
    ),
    'unnamed'
  )
$$;

-- Gives a row its key when it was made without one, as the console and a
-- directory do: from its name, with a number after it if that key is taken.
create function access_key_fill() returns trigger language plpgsql as $$
declare
  base text := access_key(new.name);
  candidate text := base;
  taken boolean;
  n integer := 1;
begin
  if new.key is not null then
    return new;
  end if;
  loop
    execute format('select exists (select 1 from %I where tenant_id = $1 and key = $2)', tg_table_name)
      into taken using new.tenant_id, candidate;
    exit when not taken;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.key := candidate;
  return new;
end
$$;

alter table principal_group
  add column key text,
  add column description text not null default '',
  -- `provider` for a group an identity provider made by pushing it. A release never removes one.
  add column managed_by text not null default 'release' check (managed_by in ('release', 'provider'));
alter table service_account
  add column key text,
  add column managed_by text not null default 'release' check (managed_by in ('release', 'provider'));
alter table end_user_group
  add column key text,
  add column managed_by text not null default 'release' check (managed_by in ('release', 'provider'));

do $$
declare
  target text;
begin
  foreach target in array array['principal_group', 'service_account', 'end_user_group'] loop
    -- The one whose name is its key already is numbered first, and so keeps it.
    execute format($f$
      with numbered as (
        select id, access_key(name) as base,
          row_number() over (
            partition by tenant_id, access_key(name)
            order by (name = access_key(name)) desc, created_at, id
          ) as n
        from %1$I
      )
      update %1$I t set key = case when numbered.n = 1 then numbered.base else numbered.base || '-' || numbered.n end
      from numbered where numbered.id = t.id
    $f$, target);
    execute format('alter table %1$I alter column key set not null', target);
    execute format('alter table %1$I add constraint %2$I unique (tenant_id, key)', target, target || '_key_unique');
    execute format(
      'alter table %1$I add constraint %2$I check (key ~ ''^[a-z0-9][a-z0-9_-]{0,62}$'')',
      target, target || '_key_check'
    );
    execute format(
      'create trigger %2$I before insert on %1$I for each row execute function access_key_fill()',
      target, target || '_key_fill'
    );
  end loop;
end
$$;

-- A claim value mapped to a group by a release, apart from one mapped by hand:
-- a release replaces its own and leaves the others.
alter table identity_group_map
  add column managed_by text not null default 'hand' check (managed_by in ('hand', 'release'));

-- A tenant's access as it was released: its groups, service accounts, roles and
-- what they are given, as one reviewed change. `content` is what was asked for:
-- the whole set, from a repository, or one change, from the console. `snapshot`
-- is the whole set once it applied, which is what going back to it restores.
create table tenant_release (
  id uuid primary key,
  tenant_id uuid not null references tenant (id),
  number integer not null,
  scope text not null check (scope in ('full', 'partial')),
  content jsonb not null,
  snapshot jsonb,
  summary jsonb not null default '{}'::jsonb,
  message text check (length(message) <= 500),
  status text not null
    check (status in ('applied', 'awaiting_approval', 'declined', 'withdrawn', 'superseded')),
  origin text not null check (origin in ('cli', 'console', 'api', 'rollback')),
  created_by_type text not null,
  created_by_id uuid,
  created_at timestamptz not null default now(),
  decided_by_type text,
  decided_by_id uuid,
  decided_at timestamptz,
  comment text check (length(comment) <= 1000),
  applied_at timestamptz,
  unique (tenant_id, number)
);
create index tenant_release_waiting_idx on tenant_release (tenant_id) where status = 'awaiting_approval';

-- Whether a change to the tenant's access waits for a second person.
alter table tenant add column access_approval boolean not null default false;

-- The branch the tenant's access is committed to, when it has a repository.
alter table git_repository add column tenant_branch text;

-- Releasing access is a permission of its own. Whoever could change groups,
-- service accounts or roles keeps being able to: each such role is given it.
update role set permissions = permissions || '{access:write}'::text[]
  where not ('access:write' = any(permissions))
    and not ('*:*' = any(permissions))
    and (
      permissions && '{group:write,group:*,service_account:write,service_account:*,role:write,role:*,end_user_group:write,end_user_group:*}'::text[]
    );
