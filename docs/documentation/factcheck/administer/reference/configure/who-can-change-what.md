# Fact-check: administer/reference/configure/who-can-change-what.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: not yet made.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Permission of each route. | `apps/control-plane/src/routes/execution.ts:2580,2911,2970,3006,3249,3328; routes/workspaces.ts:524,566,397; routes/alerts.ts:36,99,161` | writer, 2026-11-23 | holds |
| Test needs `run:read` to show; Declare needs `resource:write`. | `apps/console/src/screens/Execution.tsx:789-791,926` | writer, 2026-11-23 | holds |
| Clone permissions. | `apps/control-plane/src/routes/environments.ts:78-82` | writer, 2026-11-23 | holds |
| Delete a production workspace needs `workspace_production:write`, given only by name. | `apps/control-plane/src/routes/environments.ts:236-240,270-285; packages/docs/generated/administer/reference/permissions.md:60` | writer, 2026-11-23 | holds |
| Role contents. | `apps/console/src/builtinRoles.ts:19-82` | writer, 2026-11-23 | holds (also held to the migrations by builtin-roles.test.ts) |
| Read-only texts of the five screens. | `apps/console/src/screens/Execution.tsx:969; Tenant.tsx:909; Alerts.tsx:139; Environments.tsx:280; ObjectPages.tsx:273-290` | writer, 2026-11-23 | holds; seen as Devi for Settings and Alerts |
| No `workspace:read`: "This needs the workspace:read permission." | `seen as Sam Reyes on the walk instance` | writer, 2026-11-23 | holds; seen |
| The console shows the buttons if it cannot learn what is held. | `apps/console/src/kit/Can.tsx:113-125` | writer, 2026-11-23 | holds |
| A grant on one resource counts. | `apps/control-plane/src/routes/workspaces.ts:320-366` | writer, 2026-11-23 | holds |
