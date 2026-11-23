# Fact-check record: console/how-to/scripts/run-a-script

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/` or `packages`. Checked by: second agent, 2026-11-23. CS = `screens/CodeSettings.tsx`, AU = `screens/Authoring.tsx`, OP = `screens/ObjectPages.tsx`, EX = `screens/Execution.tsx`, ID = `InputDialog.tsx`, OA = `screens/OfferToAgent.tsx`, RP = `screens/RunPage.tsx`, CP = `apps/control-plane/src`, SDK = `packages/sdk/src`, KINDS = `packages/manifest/src/kinds.ts`, WK = `packages/worker/src`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Run from the inspector or the script page; dialog title with a draft. | EX:339,439; OP:740 | writer, run on the instance 2026-11-23 | holds |
| Start Later, Starts at, Priority errors; waiting until time. | ID:84-91,135 | writer, run on the instance 2026-11-23 (a run for 5 minutes ahead showed Waiting until 14:31:00) | holds |
| Run page: Re-run menu items With the same input, With other input…, On the version deployed now. | RP:415-417 | writer, run on the instance 2026-11-23 | holds |
| Confirm "Run {path} again?" and its two texts; Run again. | screens/runAgain.ts:30-48 | writer, run on the instance 2026-11-23 (original-version text seen) | holds |
| With other input… dialog "Run {path} again". | RP:640-651 | writer, run on the instance 2026-11-23 | holds |
| Run again shows "Re-run of a run" and the first run "Run again once"; trigger Re-run in the list. | RP:383,387 | writer, run on the instance 2026-11-23 | holds |
| Masked values notice. | ID:253 | writer, read from the code 2026-11-23 | holds |
| Flow step refused: "This run is a step of a flow run. Retry the flow run instead." | CP/routes/execution.ts:1405 | writer, read from the code 2026-11-23 | holds |
| Cancel from Runs row menu: Cancel, "Cancel this run of {path}?", Cancel the run, Keep it. | screens/Runs.tsx:608 | writer, run on the instance 2026-11-23 | holds |
| Cancel run on the run page asks "Cancel this run?" with Cancel run / Keep running; toast "Canceling. The worker stops it at its next check." | RP:289,296 | writer, read from the code 2026-11-23 | holds |
| A run waiting for a time has no Cancel run on its page (`active` is queued or running). | RP:260 | writer, run on the instance 2026-11-23 | holds (a product fault, said in the report) |
| A guest cannot start a script. | CP/kernel/errors.ts:39 | second agent, read from the code 2026-11-23 | holds |
| A guest: 403 "Sign in to start a script." (with a guest that holds `run:write` on the script); 401 "Sign in or send an API key." with none. | CP/routes/execution.ts:1328-1336 | second agent, run on the instance 2026-11-23 (an anonymous binding made and removed) | holds |
| A run set for later has no Cancel run on its page. | RP:260 | second agent, confirmed on the instance | fault: scripts (the list's "Cancel run for a waiting run" item) |
