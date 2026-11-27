# Fact-check record: self-host/reference/console/import

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title, description, stepper labels | `apps/console/src/screens/Environments.tsx:1290` | writer, run | |
| Uploads that wait list, kept an hour, survives a reload | `apps/console/src/screens/Environments.tsx:1173` | writer, run | |
| Open and Throw away; elsewhere text | `apps/console/src/screens/Environments.tsx:1187` | writer, code | |
| Throw away confirmation | `apps/console/src/screens/Environments.tsx:1198` | writer, code | |
| Upload form fields and hint | `apps/console/src/screens/Environments.tsx:1560` | writer, run | |
| CLI hint | `apps/console/src/screens/Environments.tsx:1571` | writer, run | |
| Passphrase sent in x-export-passphrase | `apps/console/src/screens/Environments.tsx:1114` | writer, code | |
| Limit 50 GiB, kept 1 hour | `apps/control-plane/src/routes/portability.ts:24` | writer, code | |
| 413 text | `apps/control-plane/src/routes/portability.ts:99` | writer, code | |
| Check panel lines (Exported, From version, Workspaces, Rows, Members, Run history, Unfinished runs) | `apps/console/src/screens/Environments.tsx:1387` | writer, run | |
| Can it come in lines and their texts | `apps/console/src/screens/Environments.tsx:1399` | writer, run | |
| Format 1 has no signature text | `apps/console/src/screens/Environments.tsx:1417` | writer, code | |
| Signed list line | `apps/console/src/screens/Environments.tsx:1415` | writer, run | |
| Tenant already here / slug taken lines | `apps/console/src/screens/Environments.tsx:1422` | writer, run | |
| Not carried list texts | `apps/control-plane/src/kernel/tenancy/export.ts:30` | writer, run | |
| Refusal texts import_refused | `apps/control-plane/src/kernel/tenancy/import.ts:37` | writer, code | |
| Not a tenant export / damaged texts | `apps/control-plane/src/kernel/tenancy/import.ts:82` | writer, code | |
| Form: passphrase, slug hint, where tables go | `apps/console/src/screens/Environments.tsx:1481` | writer, run | |
| Recheck 600 ms | `apps/console/src/screens/Environments.tsx:1277` | writer, run | |
| Import enabled only for a verdict made with what is typed | `apps/console/src/screens/Environments.tsx:1259` | writer, run (disabled right after typing the slug, enabled after the recheck) | |
| Button labels Check again, Import tenant, Importing…, Throw it away | `apps/console/src/screens/Environments.tsx:1512` | writer, run | |
| Result notice text | `apps/console/src/screens/Environments.tsx:1306` | writer, run | |
| Result bullets: location, paused triggers, canceled runs | `apps/console/src/screens/Environments.tsx:1318` | writer, run | |
| 'All 0 workspaces' wording | `apps/console/src/screens/Environments.tsx:1318` | writer, run | |
| Open the tenant / Import another | `apps/console/src/screens/Environments.tsx:1342` | writer, run | |
| Tenant keeps IDs; matched by ID then email | `apps/control-plane/src/kernel/tenancy/import.ts:380` | writer, code | |
| Conflict when one account by ID and another by email | `apps/control-plane/src/kernel/tenancy/import.ts:417` | writer, code | |
| Password carried sealed (format 2) | `apps/control-plane/src/kernel/tenancy/import.ts:50` | writer, code | |
| Workspaces arrive with triggers paused; git, providers paused; domains unproved | `apps/control-plane/src/kernel/tenancy/import.ts:857` | writer, code | |
| tenant.imported in the tenant's log; tenant_import.staged / discarded | `apps/control-plane/src/routes/portability.ts:359` | writer, run | |
| Already here refusal text | `apps/control-plane/src/kernel/tenancy/import.ts:367` | writer, code | |
| Slug taken refusal text | `apps/control-plane/src/kernel/tenancy/import.ts:368` | writer, code | |
| staged_elsewhere text | `apps/console/src/screens/Environments.tsx:1228` | writer, code | |
| Needs tenant:write at the instance | `apps/control-plane/src/routes/portability.ts:168` | writer, code | |
| CLI import flags and env passphrase | `packages/cli/src/cli.ts:880` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Run: exported `instance-chk2` (a tenant with one dev workspace) from its **Export** screen, deleted it, then **Import a tenant**: **Upload and check** (the Check step: Exported, From version, Workspaces "Chk dev (dev)", Rows, Members, Run history, **Can it come in** lines, **Not carried** list); a wrong passphrase ("The passphrase does not open it"); the right one ("The passphrase opens it", "Its list of contents is signed with its key, and the signature is right"); slug `instance-chk3` and **Where its custom tables go** (options: "The instance's own database" and the location); the result "Instance Chk Two was imported: 17 rows and 0 stored objects. Members created: 0. Members linked to accounts already here: 1.", "Its custom tables are in the database location "inst-chk-db".", singular "The workspace arrived with its triggers paused. Resume it when the instance it came from has stopped." and the "Not carried:" lines. The 50 GiB limit (`routes/portability.ts:24`), the 600 ms recheck (`Environments.tsx:1281`) and the singular/plural result lines (`Environments.tsx:1322-1333`) by code. fault fixed (fb 6): a tenant with none now reads "The tenant had no workspaces, so there are no triggers to resume." (Environments.tsx:1327), confirmed in the code; the page quotes it. Not run: a format 1 export, a file over 50 GiB, "staged elsewhere", the CLI.
