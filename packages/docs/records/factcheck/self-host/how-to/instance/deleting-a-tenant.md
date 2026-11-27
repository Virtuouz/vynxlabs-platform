# Fact-check record: self-host/how-to/instance/deleting-a-tenant

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Delete needs tenant:write at the instance | `apps/control-plane/src/routes/environments.ts:300` | writer, code | |
| Only operators see Delete | `apps/console/src/screens/Tenants.tsx:156` | writer, run | |
| Dialog title Delete NAME? and text | `apps/console/src/screens/Environments.tsx:1683` | writer, run | |
| Delete tenant disabled until the slug matches | `apps/console/src/screens/Environments.tsx:1684` | writer, run | |
| Busy refusal text | `apps/control-plane/src/kernel/tenancy/remove.ts:29` | writer, code | |
| Second dialog title and Delete anyway | `apps/console/src/screens/Environments.tsx:1696` | writer, run | |
| Second dialog only after data_location_unavailable | `apps/console/src/screens/Environments.tsx:1693` | writer, run | |
| Entry tenant.deleted with name, slug, workspaces, tables, files | `apps/control-plane/src/kernel/tenancy/remove.ts:176` | writer, run | |
| tablesLeftIn and schemas | `apps/control-plane/src/kernel/tenancy/remove.ts:188` | writer, run | |
| Accounts stay; audit entries stay | `apps/control-plane/src/routes/environments.ts:308` | writer, code | |
| Files removed after commit | `apps/control-plane/src/routes/environments.ts:294` | writer, code | |
| Deleted tenant's earlier entries in the instance log, tagged | `apps/console/src/screens/Audit.tsx:325` | writer, run | |
| Read-only refusal | `apps/console/src/kit/ReadOnly.tsx:28` | writer, code | |
| An export needs export:write; grant as viewer lacks it | `apps/control-plane/src/routes/portability.ts:38` | writer, code | |

Checked by: second agent, 2026-11-23. Re-run on the instance with my own tenants (see the run log): the delete dialog and its slug gate; export, delete, import with a wrong and a right passphrase, a slug, and a database location. Texts compared with the screen and the code (`Environments.tsx:1578, 1281, 1322-1333`; `routes/portability.ts:24`). fault fixed (fb 5, 6): the import report says the tenant had no workspaces, and the Delete anyway dialog ends the error with a full stop, confirmed in the code (Environments.tsx, kit/format.ts); the page quotes neither wording.
