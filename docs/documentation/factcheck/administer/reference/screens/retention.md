# Fact-check record: administer/reference/screens/retention

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Fields, labels and about texts | `apps/console/src/screens/Retention.tsx:33` | second agent, run, 2026-11-23 | holds |
| Placeholder and Now N days | `apps/console/src/screens/Retention.tsx:39` | second agent, run, 2026-11-23 | holds |
| Bounds 1 to 3650 and audit 90 to 3650 | `apps/control-plane/src/config.ts:141` | second agent, run, 2026-11-23 | holds |
| Defaults 30, 30, 7, 400 | `apps/control-plane/src/config.ts:323` | second agent, run, 2026-11-23 | holds |
| Out of range message | `apps/console/src/screens/Retention.tsx:56` | second agent, run, 2026-11-23 | holds |
| Shortening dialog and its audit paragraph | `apps/console/src/screens/Retention.tsx:99` | second agent, run, 2026-11-23 | holds |
| Save and remove older history; Retention saved. | `apps/console/src/screens/Retention.tsx:126` | second agent, run, 2026-11-23 | holds |
| Finished tasks kept 7 days | `apps/control-plane/src/kernel/retention.ts:33` | second agent, code, 2026-11-23 | holds |
| tenant:write or operator binding | `apps/console/src/screens/Retention.tsx:138` | second agent, code, 2026-11-23 | holds |
| Periods, defaults, bounds; tenant:read to see and tenant:write or an operator's binding to change; Governance group; topic | `apps/control-plane/src/routes/tenants.ts:551`, `apps/console/src/nav.ts:213` | second agent, run, 2026-11-23 | holds |
