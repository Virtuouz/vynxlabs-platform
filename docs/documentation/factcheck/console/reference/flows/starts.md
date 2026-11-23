# Fact-check record: console/reference/flows/starts

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Webhook field labels and options | FlowSteps.tsx:335-550 | writer (read) | |
| Form question types, labels, Who may send it | FlowSteps.tsx:586-840 | writer (read) | |
| Event fields and hint | FlowStepFields.tsx:269-290 | writer (read) | |
| Webhook 120/min, 25 s hold, 202, trigger_paused | apps/control-plane/src/routes/execution.ts:3717-3811 | writer (read) | |
| Platform events list | packages/docs/generated/develop/reference/platform-events.md | writer (read) | |

| Schedule presets Every hour, Weekdays at 9:00, Mondays at 9:00, The first of each month, Your own | apps/console/src/screens/ScheduleForm.tsx:39-43,275 | writer (read) | |
| Skip default is on for a flow's start, standalone defaults to allow | FlowEditor.tsx:2006; ScheduleForm.tsx:162,326 | writer (read) | |
| Form 1 to 30 questions; webhook max age 86400 s; tags up to 10 | schema:268-269,126-127,140 | writer (read) | |
| Fire now exists on the Triggers screen | apps/console/src/screens/Operate.tsx:253; GateRoles.test.tsx:201 | writer (read) | |
| run-finished is in the platform event list | packages/manifest/src/bundle-check.ts:68 | writer (read) | |
| Dev workspace starts with triggers paused; webhook then answers 503 workspace_paused | Overview.tsx:429; run: curl on the instance | writer (read) | |
