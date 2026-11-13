-- Someone who looks after the apps made in the console, and is not a developer.
--
-- The role lets a person build interfaces over the workspace's tables and
-- deploy them, and the apps that serve them, and nothing else: `interface:write`
-- deploys no script and no flow. They read and write rows as the tables'
-- policies let them, like anyone else.
insert into role (id, name, description, permissions, builtin) values
  ('00000000-0000-7000-8000-000000000008', 'app_maintainer',
   'Builds and deploys apps made in the console over the workspace''s tables. Deploys no code.',
   '{workspace:read,interface:*,table:read,data:read,data:write,app:read}', true);
