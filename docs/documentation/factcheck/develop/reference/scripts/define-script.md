# Fact-check record: develop/reference/scripts/define-script

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. "Checked by" holds the writer's check and is for the second agent to complete. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Options and their types. | SDK/index.ts:167-250 | writer, run as a test 2026-11-23 (an example script with these options ran) | holds |
| Defaults: timeout 300, retries delay 30, backoff true, limit 0; memory omitted is 512. | SDK/index.ts:258-262; WK/worker.ts:136 (`DEFAULT_MEMORY_MB`) | writer, read from the code 2026-11-23 | holds |
| Ranges and the concurrency key pattern. | KINDS:157-232 | writer, read from the code 2026-11-23 | holds |
| The concurrency key is typed against the input. | SDK/index.ts:150-156 (`InputKey`) | writer, read from the code 2026-11-23 | holds |
| Default tool name `run_orders__sync`; rules for a chosen name. | SDK/index.ts:68-76 | writer, read from the code 2026-11-23 | holds |
| SchemaError texts. | SDK/index.ts:238-247 | writer, run as a test 2026-11-23 (input mismatch seen) | holds |
| A definition not exported is refused by the build. | SDK/index.ts:112-120 (the comment on `DEFINITIONS`) | writer, read from the code 2026-11-23 | holds |
| Delivery is at least once; idempotencyKey is stable across attempts. | SDK/index.ts:208-212; SDK/context.ts:20-24 | writer, read from the code 2026-11-23 | holds |
| onFailure input `{ run: { id, script, attempt, error } }`; replaces the default; once per 10 minutes; handler failure starts nothing; handler reads the deployed script. | SDK/index.ts:213-218; CP/kernel/execution/alerts.ts:61,217; inventory SCR-17 | writer, read from the code 2026-11-23 | holds |
| The notify connection must be HTTP. | CP/kernel/... bundle-check (inventory CFG lane) | not re-read | open |
| Definitions that start a script: defineSchedule, defineWebhook, defineForm, defineEventTrigger. | SDK/index.ts:332,496,538,735 | writer, read from the code 2026-11-23 | holds |
| `node` options and limits. | KINDS:319-345 | writer, read from the code 2026-11-23 | holds |
| The example runs. | scratch test through `runScript` in `packages/sdk` (removed afterwards) | writer, run as a test 2026-11-23 | holds |
