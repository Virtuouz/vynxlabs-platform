-- Nobody gives what they do not hold (phase 35). A workspace admin gives people the viewer,
-- developer and deployer roles in its workspace every day, and held less than each of them: no
-- `*:read`, which is all of viewer, and no `code:write`, which a developer has. With the rule and
-- without these two it could give none of the three. Both are held only where the role is bound:
-- in a workspace they add reading what that workspace has, and writing its code, which a workspace
-- admin could already do by uploading and deploying a bundle.
update role
  set permissions = (
    select coalesce(array_agg(distinct p order by p), '{}')
    from unnest(permissions || '{*:read,code:write}'::text[]) as p
  )
  where builtin and name = 'workspace_admin';
