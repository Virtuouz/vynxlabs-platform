-- A role for people who may open an app and read its rows, and change nothing.
--
-- `portal_user` also lets its holder write rows, and `viewer` reads everything
-- in scope, every row of a table included, whatever the table's row rules say.
-- Sharing an app with people who should only look needs neither.
insert into role (id, name, description, permissions, builtin) values
  ('00000000-0000-7000-8000-000000000009', 'portal_reader',
   'Opens apps and reads rows, held to each table''s row policy. Changes nothing.',
   '{app:read,data:read}', true);
