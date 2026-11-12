-- The built-in roles learn the permission kinds that arrived with events and flows.
update role set permissions = permissions
  || '{flow:*,flow_run:*,event:*,approval:*}'::text[]
  where builtin and name = 'workspace_admin';

update role set permissions = permissions
  || '{flow_run:write,event:write}'::text[]
  where builtin and name = 'developer';
