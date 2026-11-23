# Fact-check record: administer/reference/screens/workers

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Queue panel: notice, columns Workspace, Pool, Waiting, Oldest, Later, Running, empty text, task line | `apps/console/src/screens/Execution.tsx:1204` | writer, run, 2026-11-23 | holds |
| Workers online list: version, idle, Older version / takes no tasks | `apps/console/src/screens/Execution.tsx:1217` | writer, run, 2026-11-23 | holds |
| outdated pill label Older version | `apps/console/src/kit/status.tsx:83` | writer, code only, 2026-11-23 | holds (not run) |
| Worker version threshold 0.6.0 | `apps/control-plane/src/routes/execution.ts:103` | writer, run, 2026-11-23 | holds |
| Pools table columns, Instance-run and Not made tags, Default pool text | `apps/console/src/screens/Execution.tsx:1291` | writer, run, 2026-11-23 | holds |
| Add pool dialog: Name hint, Description | `apps/console/src/screens/Execution.tsx:1434` | writer, run, 2026-11-23 | holds |
| Pool name pattern, max 40; description max 300 | `apps/control-plane/src/routes/pools.ts:12` | writer, code only, 2026-11-23 | holds (not run) |
| Remove the pool confirm; refused while credentials serve | `apps/control-plane/src/routes/pools.ts:247` | writer, code only, 2026-11-23 | holds (not run) |
| Remove the pool confirm text | `apps/console/src/screens/Execution.tsx:1328` | writer, code only, 2026-11-23 | holds (not run) |
| Switch lines: four sentences | `apps/console/src/screens/Execution.tsx:1365` | writer, run, 2026-11-23 | holds |
| Refused notice text | `apps/console/src/screens/Execution.tsx:1350` | writer, code only, 2026-11-23 | holds (not run) |
| Operator-turned-off text | `apps/console/src/screens/Execution.tsx:1376` | writer, code only, 2026-11-23 | holds (not run) |
| Stop the instance starting workers? dialog | `apps/console/src/screens/Execution.tsx:1389` | writer, code only, 2026-11-23 | holds (not run) |
| Credentials table columns and Create credential fields | `apps/console/src/screens/Execution.tsx:1501` | writer, run, 2026-11-23 | holds |
| Credential shown once and the command | `apps/console/src/screens/Execution.tsx:1463` | writer, run, 2026-11-23 | holds |
| Revoke confirm | `apps/console/src/screens/Execution.tsx:1542` | writer, code only, 2026-11-23 | holds (not run) |
| Empty states No pool yet / No standalone workers | `apps/console/src/screens/Execution.tsx:1486` | writer, run, 2026-11-23 | holds |
| Whole screen behind worker:write via Can | `apps/console/src/screens/Execution.tsx:1257` | writer, code only, 2026-11-23 | holds (not run) |
| worker verbs | `packages/manifest/src/permissions.ts:170` | writer, code only, 2026-11-23 | holds (not run) |
