# Fact-check record: self-host/explanation/instance/what-is-not-there

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Member suspend exists inside a tenant only | `apps/control-plane/src/routes/tenants.ts:773` | writer, code | |
| No tenant quota or usage on the instance screens (none in the routes) | `apps/control-plane/src/routes/tenants.ts:143` | writer, code (searched routes and screens for quota: none) | |
| PATCH /tenants/:t has no data location field | `apps/control-plane/src/routes/tenants.ts:408` | writer, code | |
| Delete is export, delete, import: import refused while present | `apps/control-plane/src/kernel/tenancy/import.ts:367` | writer, run | |
| Slug is permanent | `apps/console/src/screens/Tenants.tsx:178` | writer, code | |
| Rename drawn only when mayRename | `apps/console/src/screens/Environments.tsx:1589` | writer, run | |
| API accepts PATCH from an operator | `apps/control-plane/src/routes/tenants.ts:405` | writer, run | |
| tenant.console_code: no CLI command | `packages/cli/src/commands.ts:67` | writer, code (searched the CLI) | |
| Members: only create, disable/enable (PATCH), reset link | `apps/control-plane/src/routes/identity.ts:1084` | writer, code | |
| Reset link by an operator | `apps/control-plane/src/routes/member-resets.ts:77` | writer, run | |
| Only operator_admin bound at the instance | `apps/control-plane/src/routes/identity.ts:1208` | writer, code | |
| Operator needs a grant inside a tenant | `apps/console/src/screens/Tenant.tsx:287` | writer, run | |
| recover-operator is a command | `apps/control-plane/src/commands.ts:13` | writer, code | |
| No drain command for triggers | `apps/control-plane/src/routes/instance-control.ts:21` | writer, code | |
| Events kept, webhooks refused with 503 | `apps/control-plane/src/kernel/flows/events.ts:87` | writer, code | |
| Audit Area filter lacks deleted tenants; no workspace filter or saved views at the instance | `apps/console/src/screens/Audit.tsx:184` | writer, run | |

Checked by: second agent, 2026-11-23. Claims about the screens checked against the Run records of the pages they link to. fault: instance (the line "Rename and the console-code switch on every tenant row" describes a fault, the console hiding what the API accepts; revisit when it is fixed).
