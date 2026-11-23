# Fact-check record: console/how-to/operate/run-again.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Run again… question and text; Open it; Started again. | apps/console/src/screens/runAgain.ts:46-61; apps/console/src/screens/Runs.tsx:557-566 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Re-run menu entries of a script and of a flow. | apps/console/src/screens/RunPage.tsx:414-422,857-882 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Retry question 'Runs again:', 'Kept as it was:', 'Approvals kept, not asked again:', refusal sentence. | apps/console/src/screens/runAgain.ts:63-95 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| On another version dialog: Version, Run, From the failed step, Every step again, from the start. | apps/console/src/screens/RetryOnVersion.tsx:61-110 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Run later: Start Now/Later, Starts at, Priority -100 to 100, errors. | apps/console/src/screens/InputDialog.tsx:67-135; apps/console/src/screens/Execution.tsx:436-446 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Later run counts as Waiting for a time and reads 'Waiting until HH:MM'. | apps/console/src/kit/status.tsx:177; apps/control-plane/src/kernel/execution/state.ts:48 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| With other input has no start time or priority. | apps/console/src/screens/RunPage.tsx:638-652 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Retry from a trigger source's run is not offered. | apps/console/src/screens/Runs.tsx:570,597,; apps/console/src/screens/RunPage.tsx:403 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Batch Run again question. | apps/console/src/screens/Runs.tsx:502-543 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Run in a workspace of my own (Operate check, a dev workspace in Fernhill's tenant, with scripts, flows and triggers of mine deployed by the CLI, and a production workspace linked to it): the retry question on a failed flow run, On another version…, the version list, "Retry from the failed step on v3 (deployed now)…", a past start time, an out-of-range priority, the checked-row Run again. A flow run again with other input was not opened (only its menu item was seen).

| Claim | Source | Result |
| --- | --- | --- |
| "Retry from the failed step?" "Runs again: ask, after. Kept as it was: nothing. On version 2, with the same input."; with a newer version "On version 3, the one deployed now, with the same input." | runAgain.ts:60-80; run | holds as run |
| "Choose a time that has not passed." and "Priority is a whole number from -100 to 100." in the script's Run dialog. | InputDialog.tsx:85-91; run | holds as run |
| "Approvals kept, not asked again:" | runAgain.ts:74 | holds as read |
