# Fact-check record: console/reference/screens/operate/run-page.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Script run page header items: Re-run menu, Edit with this input / Edit in <dev>, copy as curl, Cancel run, Trace, Re-run of a run, Run again once / N times. | apps/console/src/screens/RunPage.tsx:300-435 | writer, run on the instance 2026-11-23 (header, Re-run menu, Re-run of a run); second agent: pending | holds as run |
| A run waiting for a time has Re-run and no Cancel run (active is queued or running only). | apps/console/src/screens/RunPage.tsx:260,395-401; run: the run page of a run 'Waiting until 16:25:00' showed Re-run and Edit with this input only | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Cancel run question, and notice 'Canceling. The worker stops it at its next check.' | apps/console/src/screens/RunPage.tsx:286-298 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Left pane: Attempts '#n failed|succeeded', 'N error lines', 'nothing logged'; Received, Started, Finished, Worker, Time limit, Concurrency key; Uses with Set up here / Not set up here. | apps/console/src/screens/RunPage.tsx:446-535 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Right pane: Why it failed, diagnosis, waiting reason, Input / Output (Error) tabs in ?io=. | apps/console/src/screens/RunPage.tsx:540-633 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| With other input… dialog; masked-values notice; too-large input text. | apps/console/src/screens/RunPage.tsx:638-652; apps/console/src/InputDialog.tsx:60-260 | writer, run on the instance 2026-11-23 (dialog 'Run inventory/check again' with Fields and JSON); second agent: pending | holds as run |
| Flow run header: Cancel flow run text; Re-run menu entries and when each is offered; Retry the flow that started it. | apps/console/src/screens/RunPage.tsx:658-896 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Flow run failure notice, approval notices with Approve/Reject and the 'You may decide this' lines. | apps/console/src/screens/Flows.tsx:828-905 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Timeline / Graph tabs in ?view=, legend, step panel ?step=, fields of the step panel, 'Kept from the run this one retries', changed-flow notice. | apps/console/src/screens/Flows.tsx:906-1100 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Log viewer controls and limits: 500 rows virtualized, 50,000 lines, 8,000-character message, 32,000-byte fields. | packages/ui/src/LogViewer.tsx:62,430-535; apps/console/src/screens/Execution.tsx:472,615-632; apps/control-plane/src/routes/worker.ts:122-124 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Since it last worked panel: rows, buttons, texts, Compare runs page. | apps/console/src/screens/RunCompare.tsx:34-135,150-269 | writer, run on the instance 2026-11-23 (no-earlier-success text); second agent: pending | holds as run |
| Failure alert block texts. | apps/console/src/screens/RunAlert.tsx:20-62 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Published section. | apps/console/src/screens/RunAlert.tsx:67-92; apps/console/src/screens/RunPage.tsx:537 | writer, run on the instance 2026-11-23 ('It published no events.'); second agent: pending | holds as run |
| Palette commands under This run. | apps/console/src/screens/RunPage.tsx:302-360,726-804 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Not found: Go to the runs. | apps/console/src/screens/RunPage.tsx:120-122 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Permissions of the page. | apps/console/src/screens/RunPage.tsx:244-249,675-680; apps/control-plane/src/routes/operations.ts:456 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
