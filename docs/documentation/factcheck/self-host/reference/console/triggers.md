# Fact-check record: self-host/reference/console/triggers

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title, description, section Emergency stop | `apps/console/src/screens/InstanceTriggers.tsx:61` | writer, run | |
| Triggers are on panel text | `apps/console/src/screens/InstanceTriggers.tsx:91` | writer, run | |
| Pause dialog text and Why field (optional, 500) | `apps/console/src/screens/InstanceTriggers.tsx:33` | writer, code (not pressed: the instance is not paused for a doc) | |
| Why hint | `apps/console/src/screens/InstanceTriggers.tsx:35` | writer, code | |
| Toasts | `apps/console/src/screens/InstanceTriggers.tsx:46` | writer, code | |
| Paused notice and reason text | `apps/console/src/screens/InstanceTriggers.tsx:80` | writer, code | |
| TRIGGERS_PAUSED text, no Resume button | `apps/console/src/screens/InstanceTriggers.tsx:82` | writer, code | |
| reason max 500 | `apps/control-plane/src/routes/instance-control.ts:65` | writer, code | |
| Audit actions | `apps/control-plane/src/routes/instance-control.ts:83` | writer, code | |
| Permissions instance:read GET, instance:write PUT | `apps/control-plane/src/routes/instance-control.ts:55` | writer, code | |
| Needs line | `apps/console/src/screens/InstanceTriggers.tsx:66` | writer, code | |
| CLI: show, pause --reason, resume | `packages/cli/src/cli.ts:1187` | writer, code (CLI test: cli.test.ts:329) | |
| CLI output lines | `packages/cli/src/cli.ts:1216` | writer, code | |
| 2 second cache | `apps/control-plane/src/kernel/execution/control.ts:5` | writer, code | |
| Schedules keep due time, fire once | `apps/control-plane/src/routes/instance-control.ts:60` | writer, code | |
| Webhook 503 trigger_paused text | `apps/control-plane/src/routes/execution.ts:3777` | writer, code | |
| Refusal recorded with reason paused | `apps/control-plane/src/kernel/execution/triggers.ts:1338` | writer, code | |
| Form 503 page text | `apps/control-plane/src/kernel/apps/front.ts:528` | writer, code | |
| Event kept, starts nothing | `apps/control-plane/src/kernel/flows/events.ts:87` | writer, code | |
| Source already running not started, refusal recorded | `apps/control-plane/src/kernel/execution/triggers.ts:774` | writer, code | |
| Firing a schedule by hand refused | `apps/control-plane/src/kernel/execution/triggers.ts:1213` | writer, code | |
| Workspace pill Paused by the instance | `apps/console/src/Shell.tsx:1171` | writer, code | |
| Overview card text | `apps/console/src/screens/Overview.tsx:427` | writer, code | |
| Overview of the tenant: triggers paused by the instance | `apps/console/src/screens/TenantOverview.tsx:343` | writer, code | |
| Read only strip text | `apps/console/src/kit/ReadOnly.tsx:28` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Seen only the running state (never pressed **Pause every trigger**: the instance is not to be paused): title, description, **EMERGENCY STOP**, "Triggers are on", the sentence under it, the button. The paused states, the dialog and the toasts are from the code (`InstanceTriggers.tsx:32-82`, `routes/execution.ts:3768-3790`, `kernel/execution/triggers.ts:764-774, 946, 1204-1218`, `apps/control-plane/src/kernel/apps/front.ts:528`) and the CLI (`cli.ts:1215-1223`), and were NOT run on the instance. The webhook refusal and the 503 were not run. A dev workspace's own pause was seen (separate switch).
