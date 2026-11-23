# Fact-check record: console/reference/flows/starts

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Webhook field labels and options | FlowSteps.tsx:335-550 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Form question types, labels, Who may send it | FlowSteps.tsx:586-840 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Event fields and hint | FlowStepFields.tsx:269-290 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Webhook 120/min, 25 s hold, 202, trigger_paused | apps/control-plane/src/routes/execution.ts:3717-3811 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Platform events list | packages/docs/generated/develop/reference/platform-events.md | second agent, 2026-11-23 | checked: labels matched against the console source |

| Schedule presets Every hour, Weekdays at 9:00, Mondays at 9:00, The first of each month, Your own | apps/console/src/screens/ScheduleForm.tsx:39-43,275 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Skip default is on for a flow's start, standalone defaults to allow | FlowEditor.tsx:2006; ScheduleForm.tsx:162,326 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Form 1 to 30 questions; webhook max age 86400 s; tags up to 10 | schema:268-269,126-127,140 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Fire now exists on the Triggers screen | apps/console/src/screens/Operate.tsx:253; GateRoles.test.tsx:201 | second agent, 2026-11-23 | checked: labels matched against the console source |
| run-finished is in the platform event list | packages/manifest/src/bundle-check.ts:68 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Dev workspace starts with triggers paused; webhook then answers 503 workspace_paused | Overview.tsx:429; run: curl on the instance | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Webhook "Each request is checked" third option only with a trigger source; labels "Header the timestamp is sent in", "How old a request may be" (default 5 minutes, max 86400) and the required-when-signed rule: FlowSteps.tsx:405-560. Schedule default `0 8 * * *`; trigger source field only when a poll source exists (FlowEditor.tsx:2020-2024). Corrected. Confirmed on the instance. Form default question, 120 requests a minute (execution.ts:3718), idempotency key (confirmed).
