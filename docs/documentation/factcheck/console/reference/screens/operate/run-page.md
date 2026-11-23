# Fact-check record: console/reference/screens/operate/run-page.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Script run page header items: Re-run menu, Edit with this input / Edit in <dev>, copy as curl, Cancel run, Trace, Re-run of a run, Run again once / N times. | apps/console/src/screens/RunPage.tsx:300-435 | writer, run on the instance 2026-11-23 (header, Re-run menu, Re-run of a run); second agent, 2026-11-23 (see the second check below) | holds as run |
| A run waiting for a time has Re-run and no Cancel run (active is queued or running only). | apps/console/src/screens/RunPage.tsx:260,395-401; run: the run page of a run 'Waiting until 16:25:00' showed Re-run and Edit with this input only | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Cancel run question, and notice 'Canceling. The worker stops it at its next check.' | apps/console/src/screens/RunPage.tsx:286-298 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Left pane: Attempts '#n failed|succeeded', 'N error lines', 'nothing logged'; Received, Started, Finished, Worker, Time limit, Concurrency key; Uses with Set up here / Not set up here. | apps/console/src/screens/RunPage.tsx:446-535 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Right pane: Why it failed, diagnosis, waiting reason, Input / Output (Error) tabs in ?io=. | apps/console/src/screens/RunPage.tsx:540-633 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| With other input… dialog; masked-values notice; too-large input text. | apps/console/src/screens/RunPage.tsx:638-652; apps/console/src/InputDialog.tsx:60-260 | writer, run on the instance 2026-11-23 (dialog 'Run inventory/check again' with Fields and JSON); second agent, 2026-11-23 (see the second check below) | holds as run |
| Flow run header: Cancel flow run text; Re-run menu entries and when each is offered; Retry the flow that started it. | apps/console/src/screens/RunPage.tsx:658-896 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Flow run failure notice, approval notices with Approve/Reject and the 'You may decide this' lines. | apps/console/src/screens/Flows.tsx:828-905 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Timeline / Graph tabs in ?view=, legend, step panel ?step=, fields of the step panel, 'Kept from the run this one retries', changed-flow notice. | apps/console/src/screens/Flows.tsx:906-1100 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Log viewer controls and limits: 500 rows virtualized, 50,000 lines, 8,000-character message, 32,000-byte fields. | packages/ui/src/LogViewer.tsx:62,430-535; apps/console/src/screens/Execution.tsx:472,615-632; apps/control-plane/src/routes/worker.ts:122-124 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Since it last worked panel: rows, buttons, texts, Compare runs page. | apps/console/src/screens/RunCompare.tsx:34-135,150-269 | writer, run on the instance 2026-11-23 (no-earlier-success text); second agent, 2026-11-23 (see the second check below) | holds as run |
| Failure alert block texts. | apps/console/src/screens/RunAlert.tsx:20-62 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Published section. | apps/console/src/screens/RunAlert.tsx:67-92; apps/console/src/screens/RunPage.tsx:537 | writer, run on the instance 2026-11-23 ('It published no events.'); second agent, 2026-11-23 (see the second check below) | holds as run |
| Palette commands under This run. | apps/console/src/screens/RunPage.tsx:302-360,726-804 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Not found: Go to the runs. | apps/console/src/screens/RunPage.tsx:120-122 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Permissions of the page. | apps/console/src/screens/RunPage.tsx:244-249,675-680; apps/control-plane/src/routes/operations.ts:456 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Method: every bold label and quoted text of the page was searched in the console source (the log controls are in packages/ui/src/LogViewer.tsx; "Run again once", "Retried once" and the alert sentences in RunPage.tsx and RunAlert.tsx); run on the instance with a failed script run, a failed flow run (a rejected approval), a flow run that timed out and a webhook's run.

| Claim | Source | Result |
| --- | --- | --- |
| Header, attempts, Uses, Published, Why it failed, the log, Since it last worked (It last succeeded 10m ago on v2; Input, Version, Took; Show the input's difference). | RunPage.tsx; run | holds as run |
| A flow run's failure notice "Failed at ask: Rejected: op-docs reject"; a timed out step "Nobody decided before the approval timed out."; Re-run menu items (6 with a newer version, 5 without); the retry question "Runs again: ask, after. Kept as it was: nothing. On version 2, with the same input."; On another version…: Version list with "(deployed now)", Run: From the failed step / Every step again, from the start. | RunPage.tsx:700-880; RetryOnVersion.tsx; run | holds as run |
| The failure alert lines: "The failure handler's run", "The failure notification was posted.", "1 later failure was counted on this alert, not sent on its own." | RunAlert.tsx; run | corrected: the singular form is written |
| Cancel flow run says "Canceling. Steps that are running are stopped." | RunPage.tsx:719 | corrected: added |
| A run waiting for a time offers Re-run and Edit with this input and no Cancel run; Cancel is in the Runs row menu. | RunPage.tsx:260 (active = queued or running); run | holds as run; fault: scripts, "a run started with Later ... its run page offers no Cancel run" (p31-faults.md). Revisit the States row when it is fixed. |
| At 390 px and in dark: the run page stacks in one column, no horizontal scroll. | run | holds as run |
