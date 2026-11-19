-- Someone who writes a workspace's documentation, and is not a developer.
--
-- The role lets a person write pages of documentation in the console and
-- deploy them, and the docs apps that serve them, and nothing else:
-- `doc:write` deploys no script, no flow and no table. `table:read` lets a page
-- say what a table and its columns are for, and be checked against them.
insert into role (id, name, description, permissions, builtin) values
  ('00000000-0000-7000-8000-000000000011', 'doc_writer',
   'Writes and deploys the workspace''s documentation. Deploys nothing else.',
   '{workspace:read,doc:*,table:read,app:read}', true);
