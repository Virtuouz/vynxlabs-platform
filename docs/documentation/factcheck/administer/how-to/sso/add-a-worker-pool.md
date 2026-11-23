# Fact-check record: administer/how-to/sso/add-a-worker-pool

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add pool dialog | `apps/console/src/screens/Execution.tsx:1426` | second agent, run, 2026-11-23 | holds |
| Name pattern | `apps/control-plane/src/routes/pools.ts:12` | second agent, code, 2026-11-23 | holds |
| Create credential | `apps/console/src/screens/Execution.tsx:1490` | second agent, run, 2026-11-23 | holds |
| Command shown | `apps/console/src/screens/Execution.tsx:1527` | second agent, run, 2026-11-23 | holds |
| 1 online | `apps/console/src/screens/Execution.tsx:1113` | second agent, run, 2026-11-23 | holds |
| worker option | `packages/sdk/src/index.ts:269` | second agent, code, 2026-11-23 | holds |
| Remove refused | `apps/control-plane/src/routes/pools.ts:247` | second agent, code, 2026-11-23 | holds |
| Revoke confirm | `apps/console/src/screens/Execution.tsx:1542` | second agent, code, 2026-11-23 | holds |
| Not made tag | `apps/console/src/screens/Execution.tsx:1291` | second agent, run, 2026-11-23 | holds |
| Switch about default pool | `apps/console/src/screens/Execution.tsx:1371` | second agent, code, 2026-11-23 | holds |
| Revoke asks `Revoke "<name>"? A worker using it stops.`; pool removal refused until credentials are revoked, then asks `Remove the pool "<name>"?`; the default-pool button reads Let the instance run workers / Run only on our own workers | `apps/console/src/screens/Execution.tsx:1322` | second agent, run, 2026-11-23 | holds (page corrected: it called the button a switch) |
| Older version, takes no tasks beside a worker older than 0.6.0 | `apps/control-plane/src/routes/execution.ts:103` | second agent, run, 2026-11-23 | holds as the code stands; fault: sso/workers TASKS_SINCE (a 0.5.0 worker of this release is shown Older version) |
