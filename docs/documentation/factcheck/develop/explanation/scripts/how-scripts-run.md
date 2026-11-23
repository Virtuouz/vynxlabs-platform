# Fact-check record: develop/explanation/scripts/how-scripts-run

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. "Checked by" holds the writer's check and is for the second agent to complete. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Input is validated against the schema before queuing: "The input does not match the script's schema." | CP/kernel/execution/runs.ts:298-299 | writer, read from the code 2026-11-23 | holds |
| A run is pinned to a bundle; run again offers original or deployed now. | CP/routes/execution.ts:1386; screens/runAgain.ts:30-48 | writer, run on the instance 2026-11-23 | holds |
| Test bundles and runs deleted after 7 days. | CP/kernel/execution/bundles.ts:194 | writer, read from the code 2026-11-23 | holds |
| A process per attempt; environment only PATH, TZ, LANG, TMPDIR, NODE_EXTRA_CA_CERTS. | WK/worker.ts:131-140,196 | writer, read from the code 2026-11-23 | holds |
| ctx calls are allow-listed. | WK/context.ts:287-317 | writer, read from the code 2026-11-23 | holds |
| Network reach is the worker host's firewall; WORKER_EGRESS_ALLOW; EGRESS_ALLOW is for the instance. | CP/config-vars.ts:293-296,331-335 | writer, read from the code 2026-11-23 | holds |
| Timeout message; abort then 3 s grace; heartbeat cancel. | WK/worker.ts:129,540-555 | writer, read from the code 2026-11-23 | holds |
| Memory cap, +64 MB, checked every 500 ms; the two messages. | WK/worker.ts:158,173-175,196 | writer, read from the code 2026-11-23 | holds |
| Output limit 10 MB and its text; not retried. | WK/worker.ts:121,616 | writer, read from the code 2026-11-23 | holds |
| Log limits: message 8,000, fields 32 KB, 5,000 buffered. | CP/routes/worker.ts:122-124; WK/worker.ts:113 | writer, read from the code 2026-11-23 | holds |
| Worker silent 30 s is lost; text "The worker stopped responding. The run is being retried." | packages/db/src/queue.ts:12; CP/kernel/execution/runs.ts:791-815 | writer, read from the code 2026-11-23 | holds |
| Input and output over 256 KB are kept in file storage. | CP/kernel/execution/runs.ts:16 | writer, read from the code 2026-11-23 | holds |
| Masking by key, suffix and schema; by value; under 4 characters as a whole word; stored values unchanged. | CP/kernel/execution/redact.ts:1-30 | writer, read from the code 2026-11-23 | holds |
| platform/run-finished for succeeded, failed and canceled. | CP/kernel/execution/runs.ts:645,677 | writer, read from the code 2026-11-23 | holds |
| A user of its own for each managed worker; no container each. | inventory D1 (`fixed/host.md`) | not re-read | open |
| Priority -100 to 100 orders waiting runs. | ID:88-92,135 | writer, read from the code 2026-11-23 | holds |
