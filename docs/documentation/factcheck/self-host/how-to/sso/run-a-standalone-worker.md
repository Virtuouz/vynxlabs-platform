# Fact-check record: self-host/how-to/sso/run-a-standalone-worker

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Options | `packages/worker/src/bin.ts:15` | writer, run, 2026-11-23 | holds |
| Missing message | `packages/worker/src/bin.ts:65` | writer, code only, 2026-11-23 | holds (not run) |
| Concurrency default 4 | `packages/worker/src/bin.ts:33` | writer, code only, 2026-11-23 | holds (not run) |
| ptrace warning | `packages/worker/src/bin.ts:81` | writer, code only, 2026-11-23 | holds (not run) |
| Compose grace | `deploy/worker/compose.yaml:18` | writer, code only, 2026-11-23 | holds (not run) |
| Compose env | `deploy/worker/.env.example:5` | writer, code only, 2026-11-23 | holds (not run) |
| 0.6.0 | `apps/control-plane/src/routes/execution.ts:103` | writer, code only, 2026-11-23 | holds (not run) |
| 1 online | `apps/console/src/screens/Execution.tsx:1113` | writer, run, 2026-11-23 | holds |
