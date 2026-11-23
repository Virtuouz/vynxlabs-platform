# Fact-check record: console/reference/screens/home/tenants.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, 1440 px, light, as Maya Brooks (member) or the operator admin where said.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title Tenants; description differs for operators and members. | `screens/Tenants.tsx:34-39`; run | writer, run | holds as run |
| Root address reopens the last place on opening only (not reload, not with a query); only for a member. | `App.tsx:95-135`; `apps/control-plane/src/routes/search.ts:373-410` | writer | holds |
| Search tenants searches by name or slug on the server, 50 a page, "Showing the first N tenants." | `kit/ListCollection.tsx:105-120,150`; `kit/paged.tsx:198` | writer | holds |
| Tables kept in filter for operators when locations exist; "(not registered)". | `screens/Tenants.tsx:40-62` | writer | holds (not run: no locations) |
| Columns and which are for operators. | `screens/Tenants.tsx:64-120`; run (operator: Name Slug Workspaces You Tables kept in Created) | writer, run | holds as run |
| Inspector fields. | `screens/Tenants.tsx:128-170`; run | writer, run | holds as run |
| Workers the instance starts / History kept blocks and their words. | `screens/TenantPowers.tsx:30-110`; run ("Runs 30 days, events 30, refused requests 7, audit log 400.") | writer, run | holds as run |
| Footer: Open, Rename, console-code switch, Delete (operator). | `screens/Tenants.tsx:171-190`; `screens/Environments.tsx:1581-1720`; run (operator sees Open and Delete only) | writer, run | holds as run |
| Rename, console code and retention need `tenant:write` on the tenant or the instance; delete and create need it on the instance. | `apps/control-plane/src/routes/tenants.ts:226-237,405,553-570`; `routes/environments.ts:302`; `routes/tenants.ts:246` | writer | holds |
| Operator is a holder of `tenant:write` on the instance. | `api.ts:394` | writer | holds |
| Create tenant fields and hints. | `screens/Tenants.tsx:196-230` | writer | holds (not run: no tenant was made) |
| "Tenant {name} is made." with "Open {name}". | `screens/Tenants.tsx:225-232` | writer | holds (not run) |
| Empty states. | `screens/Tenants.tsx:130-142` | writer | holds (not run) |
| Operator without membership: "You have no access to this tenant", grant form fields and durations. | `screens/Tenant.tsx:122-215,285-295` | writer | holds (not run) |
| A suspended tenant is not listed. | `fixed/shl.md` SHL-15 | writer | not re-read in code; from the lane note |

## Second check

Checked by: second agent, 2026-11-23. Run as the operator `admin@example.com` (1440 px light), as Maya (390 px dark) and on a tenant of my own made at **Create tenant** and deleted. Compared with `screens/Tenants.tsx`, `screens/TenantPowers.tsx`, `screens/Tenant.tsx`.

| Claim | Source / run | Result |
| --- | --- | --- |
| Operator's columns Name, Slug, Workspaces, You, Tables kept in, Created; member's list: Name with the slug under it at 390 px. | run | holds as run |
| Search tenants: the text is kept as `q`; the row opens the inspector (`item` in the address): Tenant, name, Slug, Workspaces, Your access, Tables kept in, Created, ID; the two blocks; footer **Open**, **Rename**, **Turn off code in the console**, **Delete**. | run | holds as run |
| Create tenant dialog: Name, Slug ("Lowercase letters, digits and hyphens. It cannot be changed later."), Database location ("Leave empty for the instance's own database. It is chosen once."), "Make me a member, as tenant admin" with the hint "Then you work inside it as its own people do. Without it, you see inside only through an access grant, which ends and is recorded."; the tenant opened with the notice "Tenant Basics Two is made." | run | corrected ("inside the tenant" to "inside it") |
| Delete: "Delete {name}?", "…every workspace, secret, table and file. Export it first if anything should be kept. It cannot be undone.", "Type {slug} to confirm", **Delete tenant**; the list then no longer showed it. | run | holds as run |
| Operator opening a tenant they are not a member of: "You have no access to this tenant", "Operators see inside a tenant only through an access grant", "A grant is time-limited and needs a reason. The tenant's admins can see it and end it.", **Open operator access**; the dialog has **Reason**, **Access level** (viewer (read only), developer, workspace_admin, tenant_admin), **Duration** (1 hour, 4 hours, 24 hours, Other). | run | holds as run |
| Member with no tenant: "No tenants yet" / "Nobody has added you to a tenant yet. Ask your administrator." | run (a member holding a role only in the database) | holds as run |
| **Rename** and **Turn off code in the console** are hidden for an operator who is not a member of the tenant (the Delete and Open buttons stay); for a tenant the operator is a member of they show. The server takes both. | run; `screens/Tenants.tsx:171-190` | fault: instance, the Tenants inspector hides Rename and "Turn off code in the console" for a tenant the operator is not in. |
| The **You** column says "Through a grant" for tenants where no grant is open (Fernhill, SSO Docs, Acc Main…). | run | fault: instance, the tenants list's "You" column says "Through a grant" when no grant is open. |
| "Delete anyway" and its sentence. | `screens/Tenants.tsx` | fault: instance, the "Delete anyway" dialog runs the database error into the next sentence (not run: needs a tenant database that does not answer). |
| **Tables kept in** filter, locations, "(not registered)", Load more at 50, "Nothing matches" on this list. | code | holds (not run: no locations; 16 tenants) |
