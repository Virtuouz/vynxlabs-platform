# Fact-check record: console/explanation/operate/how-runs-work.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| States and their labels. | apps/console/src/kit/status.tsx:62-70; apps/control-plane/src/kernel/execution/state.ts:10-56 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Retries 0-10, delay up to 3,600, backoff; time limit 1-3,600; memory 64-4,096, default 512. | packages/manifest/src/kinds.ts:180-215 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Failed attempt requeues until last. | apps/control-plane/src/kernel/execution/runs.ts:703-720 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| 10 MB output fails, not retried. | packages/worker/src/worker.ts:121,614-618 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Masking by key and by value. | apps/control-plane/src/kernel/execution/redact.ts:1-40 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| 256 KB payload kept as a file; 8,000-char log message; 50,000 lines; tags 10, pattern. | apps/control-plane/src/kernel/execution/runs.ts:16,95-97; routes/worker.ts:122; apps/console/src/screens/Execution.tsx:472 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Retention 30/30/7. | apps/control-plane/src/config.ts:320-322 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Numbers read: retries 0 to 10 and delay up to 3,600 (kinds.ts:201,207), time limit 1 to 3,600 and memory 64 to 4,096, default 512 (kinds.ts:180-190, sdk index.ts:196), 10 MB output (worker.ts:132), 256 KB inline payload (runs.ts:16), log line 8,000 characters (worker.ts:122) and 50,000 lines (Execution.tsx:472), tags (worker.ts MAX_TAGS), retention 30/30/7 (config.ts:322 and the tenant's policy). The states and the "Skipped" step state were checked in the console labels. A run with retries stayed Queued between attempts on the instance (run log of set-failure-alerts). 
