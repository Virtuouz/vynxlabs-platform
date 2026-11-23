# Fact-check record: self-host/how-to/sso/run-a-standalone-worker

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Options | `packages/worker/src/bin.ts:15` | second agent, run, 2026-11-23 | holds |
| Missing message | `packages/worker/src/bin.ts:65` | second agent, code, 2026-11-23 | holds |
| Concurrency default 4 | `packages/worker/src/bin.ts:33` | second agent, code, 2026-11-23 | holds |
| ptrace warning | `packages/worker/src/bin.ts:81` | second agent, code, 2026-11-23 | holds |
| Compose grace | `deploy/worker/compose.yaml:18` | second agent, code, 2026-11-23 | holds |
| Compose env | `deploy/worker/.env.example:5` | second agent, code, 2026-11-23 | holds |
| 0.6.0 | `apps/control-plane/src/routes/execution.ts:103` | second agent, code, 2026-11-23 | holds |
| 1 online | `apps/console/src/screens/Execution.tsx:1113` | second agent, run, 2026-11-23 | holds |
| Compose: worker starts from deploy/worker/compose.yaml with the platform image, shows 1 online with its credential's name and version 0.5.0, container healthy after about a minute, stops cleanly; the secret file must be readable by uid 1000 | `deploy/worker/compose.yaml:1` | second agent, run, 2026-11-23 | holds (run with a host-network override because the instance is on the host; page gained the uid note) |
| Older version warning for a worker below 0.6.0 | `apps/control-plane/src/routes/execution.ts:103` | second agent, run, 2026-11-23 | holds as the code stands; fault fixed (fa): outdated is older than the lower of 0.6.0 and the control plane's own version, confirmed in the code (execution.ts:103-110) |

## Merged (2026-11-23, running checker)

The page is now a pointer to self-host/how-to/running/run-a-standalone-worker, which took in the options table, the uid 1000 note and the ptrace warning. Those claims are recorded in that page's record.
