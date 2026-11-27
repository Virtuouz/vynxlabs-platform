# Fact-check record: develop/reference/scripts/script-context

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Members of ctx. | SDK/context.ts:33-75 | writer, read from the code 2026-11-23 | holds |
| run members, tag limits (10 per run, 64 characters of a-z 0-9 _.:-). | SDK/context.ts:10-30; CP/kernel/execution/runs.ts:95 | writer, read from the code 2026-11-23 | holds |
| Connection group keys at most 1,000. | CP/routes/worker.ts:764 | writer, read from the code 2026-11-23 | holds |
| File put 25 MB. | CP/kernel/data/files.ts:22 | writer, read from the code 2026-11-23 | holds |
| Table client methods; find limit 50 max 1,000; insertMany 1 to 1,000 and atomic; aggregate limits; as(). | SDK/tables.ts:23-88; CP/routes/worker.ts:952; CP/kernel/data/rows.ts:642,911 | writer, read from the code 2026-11-23 | holds |
| Filter operators. | SDK/tables.ts:3-22 | writer, read from the code 2026-11-23 | holds |
| HttpClient methods, options, HttpError message, no put/patch/delete, allowFailure, 5 redirects, own origin only. | SDK/http.ts:14-24,38-42,56-63,70-71,199-236 | writer, read from the code 2026-11-23 | holds |
| console.* goes to the run's log. | WK/runner.ts:72 (from the inventory) | second agent, read from the code 2026-11-23 | holds |
| Environment of a script process. | WK/worker.ts:131-140 | writer, read from the code 2026-11-23 | holds |
| What does not exist. | SDK/context.ts (no such member) | writer, read from the code 2026-11-23 | holds |
