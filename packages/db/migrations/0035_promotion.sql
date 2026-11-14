-- Promoting to production is a permission of its own, apart from deploying to a
-- dev workspace. Whoever could promote before keeps that: every built-in role
-- that could write deployments is given it.
update role set permissions = permissions || '{promotion:write}'::text[]
  where builtin
    and ('deployment:write' = any(permissions) or 'deployment:*' = any(permissions))
    and not ('promotion:write' = any(permissions));
