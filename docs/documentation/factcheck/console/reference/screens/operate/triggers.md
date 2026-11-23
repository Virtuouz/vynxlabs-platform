# Fact-check record: console/reference/screens/operate/triggers.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header text, HeadNotes for instance, workspace and production pauses. | apps/console/src/screens/Operate.tsx:440-458 | writer, run on the instance 2026-11-23 ('Every trigger here is paused. Resume them under Workspace settings.'); second agent: pending | holds as run |
| New trigger menu and disabled tooltip in production. | apps/console/src/screens/Operate.tsx:336-360 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Kind chips with counts; ?kind=. | apps/console/src/screens/Operate.tsx:258,461-474 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Columns Trigger, Starts, State, Last fired and their cells; 'Not fired yet' hover text. | apps/console/src/screens/Operate.tsx:362-420 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| State texts: Draft never deployed, Draft/Removing, Instance paused, Workspace paused, Paused, Off, Next, Fires once when resumed. | apps/console/src/screens/Operate.tsx:104-171 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Batch bar Pause/Resume; draft skipped text; slices of 100; reason prompt. | apps/console/src/screens/Operate.tsx:277-323; apps/control-plane/src/routes/batch.ts:19 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Inspector fields and notices. | apps/console/src/screens/Operate.tsx:560-749 | writer, run on the instance 2026-11-23 (schedule inspector, paused notice); second agent: pending | holds as run |
| Refusal reasons and wording. | apps/console/src/screens/Operate.tsx:83-91,656-665 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Pause: prompt, 500 chars, toast texts; resume toast. | apps/console/src/screens/Operate.tsx:196-229; apps/control-plane/src/routes/execution.ts:2271-2275 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Fire now: offered when run:write, schedule, not paused, workspace not paused; server refusals text. | apps/console/src/screens/Operate.tsx:253-254,536-549,612-616; apps/control-plane/src/kernel/execution/triggers.ts:1186-1240; routes/execution.ts:2176 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Webhook address shown to those with trigger:write, else the note. | apps/console/src/screens/Operate.tsx:732-747; apps/control-plane/src/routes/execution.ts:1955,2058 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| New schedule sheet fields, presets, texts. | apps/console/src/screens/ScheduleForm.tsx:39-43,115-134,148-171,191,272-326,414-440 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Backlog limit 200 (SCHEDULE_BACKLOG_LIMIT, 0 off); trigger source at most 100 a tick. | apps/control-plane/src/config.ts:352; kernel/execution/triggers.ts:711 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Permissions: list trigger:read; pause trigger:write; Edit resource:write; workspace pause workspace:write; instance pause instance:write. | apps/control-plane/src/routes/execution.ts:1834,2260,2321; routes/workspaces.ts:398-411; routes/instance-control.ts:55; apps/console/src/screens/Operate.tsx:251-256 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Empty state text. | apps/console/src/screens/Operate.tsx:506-509 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
