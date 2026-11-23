# Fact-check: administer/how-to/access/check-what-someone-can-do

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Texts | `apps/console/src/screens/Access.tsx` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Steps, labels: View access, Find or check a permission, What gives them access; account menu 'What I may do here' | `apps/console/src/screens/Access.tsx:150-260; apps/console/src/Shell.tsx:653-700` | second agent, 2026-11-23 | holds; run in the browser (acc2). Corrected: the account menu is the circle with the initial (aria-label 'Your account') |
| Allowed/Denied texts and placeholder | `apps/console/src/screens/Access.tsx:185-225` | second agent, 2026-11-23 | corrected: the Denied texts carry a second sentence ('A role with it, bound to them or a group of theirs where it is needed, would give it.'); placeholder 'promotion:write, or secrets'. Confirmed on screen |
| `tenant_admin`, `workspace_admin`, `developer` list `sql:read` by name | `packages/db/migrations/0078_sql_permission.sql` | second agent, 2026-11-23 | added; confirmed on screen (acc2-ann Allowed for `sql:read`) |
