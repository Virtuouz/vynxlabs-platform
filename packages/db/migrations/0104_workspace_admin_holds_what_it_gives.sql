-- Nobody gives what they do not hold (phase 35). A workspace admin gives people the viewer and
-- deployer roles in its workspace every day, and held less than either: it had no `*:read`, which
-- is all of viewer. With the rule and without it, it could give neither. It is held only where the
-- role is bound: in a workspace it adds reading what that workspace has.
--
-- It still does not hold `code:write`, on purpose: writing code is given by its own name, and so
-- the developer role, which has it, is given by someone who holds it, a tenant admin.
update role
  set permissions = (
    select coalesce(array_agg(distinct p order by p), '{}')
    from unnest(permissions || '{*:read}'::text[]) as p
  )
  where builtin and name = 'workspace_admin';
