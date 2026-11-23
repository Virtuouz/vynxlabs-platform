# Fact-check record: develop/how-to/scripts/test-scripts-in-code

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| runScript, memoryTable, testContext and the options. | SDK/testing.ts:23-60,150-250 | writer, run as a test 2026-11-23 | holds |
| Refusal texts for undeclared and not-given things. | SDK/testing.ts:111-120; SDK/testing.test.ts | writer, run as a test 2026-11-23 (the missing-table text seen) | holds |
| Default trigger test, attempt 1, system. | SDK/testing.ts:218-228 | writer, read from the code 2026-11-23 | holds |
| memoryTable: find ignores filter and sort; aggregate only counts. | SDK/testing.ts:70-100 | writer, read from the code 2026-11-23 | holds |
| `@volvel/sdk/testing` is a separate export. | packages/sdk/package.json:12-16 | writer, read from the code 2026-11-23 | holds |
| volvel run: flags, local.json keys, defaults from variables, refusals for tables, sources, files and mail; events and tags printed. | packages/cli/src/local.ts:19-22,30-45,100-190 | writer, read from the code 2026-11-23 | holds |
| volvel run --remote --tenant --workspace. | packages/cli/src/commands.ts:84-88 | writer, read from the code 2026-11-23 | holds |
