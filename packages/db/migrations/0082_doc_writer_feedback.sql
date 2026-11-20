-- The doc writer deploys one table: the one a docs site keeps its readers' answers in.
--
-- The permissions are as they were. What changes is what the deploy of drafts
-- lets this role carry: with a site, the table the site names as its feedback
-- table, when its columns are exactly an answer's. Any other table is refused.
update role
   set description = 'Writes and deploys the workspace''s documentation, and the table a site keeps its readers'' answers in. Deploys nothing else.'
 where id = '00000000-0000-7000-8000-000000000011'
   and builtin;
