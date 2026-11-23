# Fact-check record: administer/reference/screens/workers

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Queue panel: notice, columns Workspace, Pool, Waiting, Oldest, Later, Running, empty text, task line | `apps/console/src/screens/Execution.tsx:1204` | second agent, run, 2026-11-23 | holds |
| Workers online list: version, idle, Older version / takes no tasks | `apps/console/src/screens/Execution.tsx:1217` | second agent, run, 2026-11-23 | holds |
| outdated pill label Older version | `apps/console/src/kit/status.tsx:83` | second agent, code, 2026-11-23 | holds |
| Worker version threshold 0.6.0 | `apps/control-plane/src/routes/execution.ts:103` | second agent, run, 2026-11-23 | holds |
| Pools table columns, Instance-run and Not made tags, Default pool text | `apps/console/src/screens/Execution.tsx:1291` | second agent, run, 2026-11-23 | holds |
| Add pool dialog: Name hint, Description | `apps/console/src/screens/Execution.tsx:1434` | second agent, run, 2026-11-23 | holds |
| Pool name pattern, max 40; description max 300 | `apps/control-plane/src/routes/pools.ts:12` | second agent, code, 2026-11-23 | holds |
| Remove the pool confirm; refused while credentials serve | `apps/control-plane/src/routes/pools.ts:247` | second agent, code, 2026-11-23 | holds |
| Remove the pool confirm text | `apps/console/src/screens/Execution.tsx:1328` | second agent, code, 2026-11-23 | holds |
| Switch lines: four sentences | `apps/console/src/screens/Execution.tsx:1365` | second agent, run, 2026-11-23 | holds |
| Refused notice text | `apps/console/src/screens/Execution.tsx:1350` | second agent, code, 2026-11-23 | holds |
| Operator-turned-off text | `apps/console/src/screens/Execution.tsx:1376` | second agent, code, 2026-11-23 | holds |
| Stop the instance starting workers? dialog | `apps/console/src/screens/Execution.tsx:1389` | second agent, code, 2026-11-23 | holds |
| Credentials table columns and Create credential fields | `apps/console/src/screens/Execution.tsx:1501` | second agent, run, 2026-11-23 | holds |
| Credential shown once and the command | `apps/console/src/screens/Execution.tsx:1463` | second agent, run, 2026-11-23 | holds |
| Revoke confirm | `apps/console/src/screens/Execution.tsx:1542` | second agent, code, 2026-11-23 | holds |
| Empty states No pool yet / No standalone workers | `apps/console/src/screens/Execution.tsx:1486` | second agent, run, 2026-11-23 | holds |
| Whole screen behind worker:write via Can | `apps/console/src/screens/Execution.tsx:1257` | second agent, code, 2026-11-23 | holds |
| worker verbs | `packages/manifest/src/permissions.ts:170` | second agent, code, 2026-11-23 | holds |
| Older version, takes no tasks for a worker below 0.6.0 | `apps/control-plane/src/routes/execution.ts:103` | second agent, run, 2026-11-23 | holds as the code stands; fault fixed (fa): outdated is older than the lower of 0.6.0 and the control plane's own version, confirmed in the code (execution.ts:103-110); the page says so, and says "Volvel" for "the platform" (fc 18) |
