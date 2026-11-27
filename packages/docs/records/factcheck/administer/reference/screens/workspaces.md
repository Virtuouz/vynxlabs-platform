# Fact-check record: administer/reference/screens/workspaces

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Checked by: second agent, 2026-11-23. Every quoted label, message and permission of the page was matched against the console and control-plane source at HEAD (`87000022`) by script and by hand, and what depends on the screen was run on the instance http://localhost:8091 (see `packages/docs/records/runs/...`). Line numbers point at the block that holds the claim. `Git` = `apps/console/src/screens/Git.tsx`, `Env` = `apps/console/src/screens/Environments.tsx`, `CPgit` = `apps/control-plane/src/kernel/git.ts`, `CProu` = `apps/control-plane/src/routes/`, `Rel` = `apps/console/src/screens/Release.tsx`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Description line, columns Name/Slug/Type/Promotes to | `apps/console/src/screens/Tenant.tsx:391-425` | writer, run | holds |
| Empty state text | `Tenant.tsx:427-431` | writer | holds (not run) |
| Create dialog fields, hints, "The type cannot be changed afterwards." | `Tenant.tsx:432-465` | writer, run | holds |
| Slug pattern and 63; name 200 | `CProu/shared.ts:13-14` | writer | holds |
| Duplicate slug "That already exists."; bad slug "Use only lowercase letters, digits and hyphens." | run | writer, run | holds |
| Link may be production or another dev workspace; production cannot link; no link back | `CProu/workspaces.ts:177-200` | writer | holds |
| Success "Workspace X is made." with Open X | `Tenant.tsx:466-472` | writer, run | holds |
| New dev workspace starts with triggers paused, production not | `CProu/workspaces.ts:268,300` | writer, run (Settings said Triggers are paused) | holds |
| workspace:write for create; delete production needs workspace_production:write | `CProu/workspaces.ts:260`, `CProu/workspaces.ts:560-590` | writer | holds |
| A grant on one resource sees name, slug and type | `CProu/workspaces.ts:377` | writer | holds (not run) |

## Second check (2026-11-23)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Without workspace:write the line reads "…, not change it." | `kit/Can.tsx:176-190`, `Tenant.tsx:380` | second agent, 2026-11-23 | corrected: the page said "not change them" |
| Create workspace dialog, duplicate slug, bad slug messages, link | run (earlier) and `api.ts` | second agent, 2026-11-23 | checked |
