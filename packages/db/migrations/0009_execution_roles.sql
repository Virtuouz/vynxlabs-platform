-- The built-in roles learn the permission kinds that arrived with execution.
update role set permissions = permissions
  || '{script:*,run:*,bundle:*,deployment:*,connection:*,variable:*,trigger:*}'::text[]
  where builtin and name = 'workspace_admin';

update role set permissions = permissions
  || '{run:write,bundle:write,connection:write,variable:write}'::text[]
  where builtin and name = 'developer';

-- Activating a bundle changes what runs, and can change roles and bindings.
-- It is its own role, so that it is granted on purpose.
insert into role (id, name, description, permissions, builtin) values
  ('00000000-0000-7000-8000-000000000006', 'deployer',
   'Uploads bundles and activates them.', '{*:read,bundle:*,deployment:*}', true);
