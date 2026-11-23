# Fact-check record: self-host/how-to/instance/pausing-triggers

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| instance:write for pause and resume | `apps/control-plane/src/routes/instance-control.ts:55` | writer, code | |
| Panel Triggers are on | `apps/console/src/screens/InstanceTriggers.tsx:88` | writer, run | |
| Pause dialog and Why field | `apps/console/src/screens/InstanceTriggers.tsx:34` | writer, code (not pressed) | |
| Toasts Every trigger is paused. / Triggers are running again. | `apps/console/src/screens/InstanceTriggers.tsx:46` | writer, code | |
| Resume triggers button; no button when TRIGGERS_PAUSED | `apps/console/src/screens/InstanceTriggers.tsx:75` | writer, code | |
| CLI lines | `packages/cli/src/cli.ts:1211` | writer, code (cli.test.ts:329) | |
| CLI usage 'volvel instance triggers' | `packages/cli/src/commands.ts:67` | writer, code | |
| Reason shown 'Why: …' in CLI | `packages/cli/src/cli.ts:1219` | writer, code | |
| 2 second pickup | `apps/control-plane/src/kernel/execution/control.ts:5` | writer, code | |
| Workspace header and Overview wording | `apps/console/src/screens/Overview.tsx:422` | writer, code | |
| Audit actions | `apps/control-plane/src/routes/instance-control.ts:83` | writer, code | |
| Schedules fire once; webhooks 503 | `apps/control-plane/src/routes/instance-control.ts:60` | writer, code | |
| Events kept, started by nothing | `apps/control-plane/src/kernel/flows/events.ts:87` | writer, code | |
| Runs already queued or going carry on | `apps/control-plane/src/routes/instance-control.ts:21` | writer, code | |
| Read only refusal 503 read_only | `apps/control-plane/src/kernel/errors.ts:61` | writer, code | |

Checked by: second agent, 2026-11-23. Not run on the instance, by the owner's rule that this instance is never paused: every claim is from the code (`InstanceTriggers.tsx`, `routes/execution.ts:3768-3790`, `kernel/execution/triggers.ts:764-774, 946, 1204-1218`, `cli.ts:1215-1223`) and the code was re-read; the run log says so. No claim was changed.
