# Fact-check record: self-host/reference/console/databases

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title and description | `apps/console/src/screens/Environments.tsx:963` | writer, run | |
| Columns Name, For, Database, Tenants, Status | `apps/console/src/screens/Environments.tsx:975` | writer, run | |
| Status Reached / Failed with problem | `apps/console/src/screens/Environments.tsx:984` | writer, run (Failed after the database was dropped) | |
| Row Edit and Remove; Remove hidden while tenants > 0 | `apps/console/src/screens/Environments.tsx:1023` | writer, run (hidden with a tenant, shown without) | |
| Remove confirmation | `apps/console/src/screens/Environments.tsx:1025` | writer, run | |
| Register dialog description | `apps/console/src/screens/Environments.tsx:997` | writer, run | |
| Register fields: Name hint, What it is for, Connection string hint | `apps/console/src/screens/Environments.tsx:910` | writer, run | |
| Name pattern, max 63 | `apps/control-plane/src/routes/locations.ts:11` | writer, code | |
| Description max 500, connection string max 2000 | `apps/control-plane/src/routes/locations.ts:194` | writer, code | |
| Created. toast after register | `apps/console/src/ListScreen.tsx:122` | writer, run | |
| Cannot be prepared message | `apps/control-plane/src/routes/locations.ts:282` | writer, run | |
| Instance's own database refused | `apps/control-plane/src/routes/locations.ts:254` | writer, code | |
| Database already reached under another name refused | `apps/control-plane/src/routes/locations.ts:275` | writer, code | |
| Edit dialog text and fields | `apps/console/src/screens/Environments.tsx:906` | writer, run | |
| Edit toast 'NAME is saved.' | `apps/console/src/screens/Environments.tsx:921` | writer, code | |
| New address refused unless it holds the tenants' tables | `apps/control-plane/src/routes/locations.ts:169` | writer, code | |
| Description-only edit connects to nothing | `apps/control-plane/src/routes/locations.ts:181` | writer, code | |
| Inspector fields and Tenants here section | `apps/console/src/screens/Environments.tsx:1053` | writer, run | |
| Show them in the tenant list link | `apps/console/src/screens/Environments.tsx:952` | writer, run | |
| Empty state text | `apps/console/src/screens/Environments.tsx:991` | writer, run | |
| 503 data_location_unavailable while down | `apps/control-plane/src/kernel/data/stores.ts:70` | writer, code | |
| Permissions instance:read / instance:write | `apps/control-plane/src/routes/locations.ts:177` | writer, code | |
| Needs line and disabled controls | `apps/console/src/screens/Environments.tsx:965` | writer, code | |
| DATA_TENANT_CONNECTIONS description | `apps/control-plane/src/config-vars.ts:74` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Run against a throwaway database `instchk_loc` in the dev Postgres container: **Register database** (dialog text, "Created.", row **Reached**, "check", "instchk_loc on localhost:54329"), inspector (**Tenants here**, "No tenant keeps its tables here."), **Edit** (dialog text, "inst-chk-db is saved."), **Remove** (question and result "No dedicated databases" empty state); a bogus address ("That database could not be prepared. connect ECONNREFUSED 127.0.0.1:1"); the instance's own address ("That is this instance's own database, the platform's own database. Register a different database for tenants' tables."). A tenant was imported into it and deleted again (see the import record). Corrected: the singular/plural of the edit refusal (`routes/locations.ts:169`). Note: the screen's own dialog line and the refusal say "the platform" (Volvel's words are "instance"); quoted as the screen words it. fault: instance wording ("platform" in the Register database dialog and a server refusal). Not run: the Edit refusal for a new address that lacks the tenants' tables, a location that is down (**Failed** on its row).
