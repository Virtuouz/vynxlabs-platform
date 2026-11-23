-- A binding is unique by what it gives, to whom and where, and now also by where it came from:
-- one given by hand and one a workspace's bundle gives are two rows, each its owner's, so that
-- neither stops the other with "That already exists."
do $$
declare found record;
begin
  for found in
    select conname from pg_constraint
    where conrelid = 'binding'::regclass and contype = 'u'
  loop
    execute format('alter table binding drop constraint %I', found.conname);
  end loop;
end $$;
alter table binding
  add constraint binding_given_once unique nulls not distinct
    (scope_type, tenant_id, workspace_id, resource_id, principal_type, principal_id, role_id,
     source_resource_id);

-- The workspace's own administrator gains the interfaces, the documents and the repository of its
-- workspace (not `code`), and loses two permissions that check nothing at a workspace: `role:*`
-- (roles are the tenant's) and `access:write` (access is the tenant's).
update role
  set permissions = (
    select coalesce(array_agg(distinct p order by p), '{}')
    from unnest(permissions || '{interface:*,doc:*,git:*}'::text[]) as p
    where p not in ('role:*', 'access:write')
  )
  where builtin and name = 'workspace_admin';

-- A service account's description may be as long as every other access description (500).
do $$
declare found record;
begin
  for found in
    select conname from pg_constraint
    where conrelid = 'service_account'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%length(description) <= 300%'
  loop
    execute format('alter table service_account drop constraint %I', found.conname);
  end loop;
end $$;
alter table service_account
  add constraint service_account_description_length check (length(description) <= 500);
