-- Exporting a tenant was checked as `tenant:export`, which is not a permission a
-- role can list: a permission's second half is read, write or *. It becomes
-- `export:write`. Whoever could export before, by holding every tenant
-- permission, still can.
update role set permissions = permissions || '{export:write}'::text[]
  where 'tenant:*' = any(permissions) and not ('export:write' = any(permissions));
