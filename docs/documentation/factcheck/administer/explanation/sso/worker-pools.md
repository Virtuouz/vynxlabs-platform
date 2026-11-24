# Fact-check record: administer/explanation/sso/worker-pools

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| default not a record | `apps/control-plane/src/routes/pools.ts:15` | second agent, code, 2026-11-23 | holds |
| Credential and workspace | `apps/console/src/screens/Execution.tsx:1509` | second agent, code, 2026-11-23 | holds |
| Switch default pool | `apps/console/src/screens/Execution.tsx:1371` | second agent, code, 2026-11-23 | holds |
| Refused state | `apps/control-plane/src/routes/pools.ts:46` | second agent, code, 2026-11-23 | holds |
| Operator lock | `apps/console/src/screens/Execution.tsx:1376` | second agent, code, 2026-11-23 | holds |
| worker in script | `packages/manifest/src/kinds.ts:256` | second agent, code, 2026-11-23 | holds |
| Not made | `apps/console/src/screens/Execution.tsx:1291` | second agent, code, 2026-11-23 | holds |
| process mode | `docs/self-hosting.md:241` | second agent, code, 2026-11-23 | holds |
