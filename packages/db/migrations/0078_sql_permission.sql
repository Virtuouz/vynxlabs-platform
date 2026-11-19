-- Running a query written in SQL is a permission of its own, `sql:read`, and one
-- that no wildcard gives: a role has it only when it lists it. The roles that
-- build and look after a workspace are given it by name. `viewer` is not, and
-- neither is any role a tenant made: those are for the tenant to decide.
update role set permissions = permissions || '{sql:read}'::text[]
  where builtin
    and name in ('tenant_admin', 'workspace_admin', 'developer')
    and not ('sql:read' = any(permissions));
