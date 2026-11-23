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
