-- The built-in roles learn the permission kinds that arrived with data.
update role set permissions = permissions
  || '{data:*,data_all:*,table:*,data_source:*,file:*}'::text[]
  where builtin and name = 'workspace_admin';

update role set permissions = permissions
  || '{data:write,data_all:write,file:write}'::text[]
  where builtin and name = 'developer';
