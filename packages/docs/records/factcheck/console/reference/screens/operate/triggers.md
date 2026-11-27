# Fact-check record: console/reference/screens/operate/triggers.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header text, HeadNotes for instance, workspace and production pauses. | apps/console/src/screens/Operate.tsx:440-458 | writer, run on the instance 2026-11-23 ('Every trigger here is paused. Resume them under Workspace settings.'); second agent, 2026-11-23 (see the second check below) | holds as run |
| New trigger menu and disabled tooltip in production. | apps/console/src/screens/Operate.tsx:336-360 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Kind chips with counts; ?kind=. | apps/console/src/screens/Operate.tsx:258,461-474 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Columns Trigger, Starts, State, Last fired and their cells; 'Not fired yet' hover text. | apps/console/src/screens/Operate.tsx:362-420 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| State texts: Draft never deployed, Draft/Removing, Instance paused, Workspace paused, Paused, Off, Next, Fires once when resumed. | apps/console/src/screens/Operate.tsx:104-171 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Batch bar Pause/Resume; draft skipped text; slices of 100; reason prompt. | apps/console/src/screens/Operate.tsx:277-323; apps/control-plane/src/routes/batch.ts:19 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Inspector fields and notices. | apps/console/src/screens/Operate.tsx:560-749 | writer, run on the instance 2026-11-23 (schedule inspector, paused notice); second agent, 2026-11-23 (see the second check below) | holds as run |
| Refusal reasons and wording. | apps/console/src/screens/Operate.tsx:83-91,656-665 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Pause: prompt, 500 chars, toast texts; resume toast. | apps/console/src/screens/Operate.tsx:196-229; apps/control-plane/src/routes/execution.ts:2271-2275 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Fire now: offered when run:write, schedule, not paused, workspace not paused; server refusals text. | apps/console/src/screens/Operate.tsx:253-254,536-549,612-616; apps/control-plane/src/kernel/execution/triggers.ts:1186-1240; routes/execution.ts:2176 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Webhook address shown to those with trigger:write, else the note. | apps/console/src/screens/Operate.tsx:732-747; apps/control-plane/src/routes/execution.ts:1955,2058 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| New schedule sheet fields, presets, texts. | apps/console/src/screens/ScheduleForm.tsx:39-43,115-134,148-171,191,272-326,414-440 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Backlog limit 200 (SCHEDULE_BACKLOG_LIMIT, 0 off); trigger source at most 100 a tick. | apps/control-plane/src/config.ts:352; kernel/execution/triggers.ts:711 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Permissions: list trigger:read; pause trigger:write; Edit resource:write; workspace pause workspace:write; instance pause instance:write. | apps/control-plane/src/routes/execution.ts:1834,2260,2321; routes/workspaces.ts:398-411; routes/instance-control.ts:55; apps/console/src/screens/Operate.tsx:251-256 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Empty state text. | apps/console/src/screens/Operate.tsx:506-509 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Method: every bold label and quoted text searched in the console source (Operate.tsx notes, the states and the refusal reasons found); the backlog default (200, SCHEDULE_BACKLOG_LIMIT, config.ts:352) and the Fire now refusals (triggers.ts:1190-1225) read; run on the instance in my own workspaces (a dev workspace and a production one linked to it).

| Claim | Source | Result |
| --- | --- | --- |
| New trigger menu: Schedule, Webhook, Form, Event; the New schedule sheet (Often used presets, cron, Time zone, Next times, Skip a time while…, Turned on, Save draft). | Operate.tsx; ScheduleForm.tsx; run | corrected: the sheet has Tags for each run (optional), up to 10, and its button is Save draft; both written |
| In the production workspace New trigger is disabled. | Operate.tsx; run | holds as run |
| Pause this trigger asked "Pause *path*?", reason, then "Paused just now by Maya Brooks: op-docs pause test. Nothing it would start is started until it is resumed."; Resume. | Operate.tsx:205-230; run | holds as run |
| Batch Bar: "2 selected" Pause, Resume, Clear; "Pause 2 triggers?" with the paths and Why. Both paused and resumed. | Operate.tsx; run | holds as run |
| A paused webhook answered 503 trigger_paused "This webhook is paused, so it started nothing. Try again later."; with the workspace paused 503 workspace_paused. | execution.ts:3757-3778; run | holds as run |
| Fire now on a schedule opened the run's page, "Schedule opchk/nightly"; the trigger's Last fired still read "Not fired yet". | triggers.ts:1190-1230; run | corrected: the page says Last fired is not changed by Fire now. Possible fault, not on the list: a run that Fire now started is not counted in Last fired. |
| The address of a webhook, Open the last run it started, Last refused with the reason. | run | holds as run |
| The workspace note "Every trigger here is paused. Resume them under Workspace settings." | Operate.tsx:450; run | holds as run |
| 390 px and dark: no horizontal scroll. | run | holds as run |
