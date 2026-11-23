# Fact-check record: develop/reference/operate/platform-events.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The six events, their descriptions and payload fields. | packages/manifest/src/bundle-check.ts:49-101 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Stored only when an enabled, unpaused event trigger listens. | apps/control-plane/src/kernel/flows/events.ts:188-214 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| run-succeeded, run-failed and run-finished published at the end of every run; canceled runs publish run-finished with cancelled. | apps/control-plane/src/kernel/execution/runs.ts:602-682 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| flow-run-finished. | apps/control-plane/src/kernel/flows/engine.ts:462-470 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| deployment-created on deploy and on a decided promotion. | apps/control-plane/src/routes/execution.ts:823-830,1051-1056; routes/promotion-requests.ts:464-470 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| row-changed; cascaded and nulled rows are not announced. | apps/control-plane/src/routes/data.ts:205-230; packages/sdk/src/tables.ts:166-173 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Platform names refused when published by a person. | apps/control-plane/src/routes/flows.ts:2075 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| defineEventTrigger fields. | packages/sdk/src/index.ts:720-745 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Depth 10. | apps/control-plane/src/kernel/flows/events.ts:13 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
