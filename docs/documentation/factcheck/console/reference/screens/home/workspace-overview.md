# Fact-check record: console/reference/screens/home/workspace-overview.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, 1440 px, light, as Maya Brooks (member) or the operator admin where said.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Header: eyebrow, title, tag, Triggers paused pills, Running v{N}, Review changes or Open runs. | `screens/Overview.tsx:372-398`; run ("Overview / Sandbox / DEV / Triggers paused / Running v22 / Review changes") | writer, run | holds as run |
| First steps: four steps, done conditions, buttons, "{n} of 4 done". | `screens/Overview.tsx:166-260` | writer | holds (not run: Sandbox has run) |
| First steps show only when scripts and everRan are readable and nothing ran or no version. | `screens/Overview.tsx:304-313` | writer | holds |
| Needs attention rows, titles, buttons. | `screens/Overview.tsx:316-465`; run ("5 runs failed in the last 24 hours", "8 drafts not deployed", "Triggers are paused") | writer, run | holds as run |
| "Nothing needs you here" and its detail; "Nothing you can see needs you here"; "Some of this you cannot see"; unseen text. | `screens/Overview.tsx:300-310,500-526` | writer | holds (not run) |
| Runs card: four figures, chart, hover text, hidden table, All runs. | `screens/Overview.tsx:56-160` | writer | holds |
| Deploy card: Draft, workspace vN or nothing deployed, linked workspace, three sentences, Deployments. | `screens/Overview.tsx:545-600`; run ("Clinics runs a different bundle. Promote to bring it up to date.") | writer, run | holds as run |
| What starts work here: first 8, empty state, All triggers; states Draft never deployed, Workspace paused, Instance paused. | `screens/Overview.tsx:608-655`; `screens/Operate.tsx:130-170` | writer | holds |
| Permissions: workspace:read for the summary; failed runs run:read/flow_run:read; approvals approval:read; connections connection:read; drafts resource:read; git git:read; workers worker:read; triggers trigger:read. | `apps/control-plane/src/routes/summary.ts:100-135,160-300`; `routes/operations.ts:375`; `routes/execution.ts:1832` | writer | holds |
| Version and linked workspace are hidden from a person who reaches only inside. | `routes/summary.ts:300-318` | writer | holds |
| Failed counts a flow run once, not its steps. | `routes/summary.ts:160-190` | writer | holds |

## Second check

Checked by: second agent, 2026-11-23. Run as Maya on the Sandbox overview at 1440 px light, 768 px dark and 390 px dark; compared with `screens/Overview.tsx`.

| Claim | Source / run | Result |
| --- | --- | --- |
| Header: **Overview**, the name, **Dev**, **Triggers paused**, **Running v47**, **Review changes** (a dev workspace with drafts). | run | holds as run |
| Needs attention rows seen: "8 runs failed in the last 24 hours" (**Open failed runs**), "2 runs are waiting for you" (**Decide**), "18 drafts not deployed" (**Review**), "Triggers are paused" (**View settings**). The connection row and the empty sentence are in the source as "{n} connection is/connections are not set up here" and "…everything set up." (commit 5d18392a). The page said "nothing bound here" and "everything bound": corrected to the source. fault: configure "bound"/"bind" words remain on the Overview (the instance is an older build and still says "nothing bound here"; seen on a production workspace of another lane). | `screens/Overview.tsx:377-390,520`; run | corrected |
| Runs card: Succeeded 30, Failed 8, In progress 10, Median time 8.5 s, a chart with a table for screen readers, **All runs**. | run | holds as run |
| Deploy: **Draft** 18, Sandbox v47, Clinics v1, "Clinics runs a different bundle. Promote to bring it up to date.", **Deployments**. | `screens/Overview.tsx:588-589`; run | holds as run |
| What starts work here: the first 8 triggers with their kind, target and "Workspace paused", "Fires once when resumed", **All triggers**. | run | holds as run |
| At 390 px dark the page is 481 px wide inside a 390 px column: the right of the Needs attention rows (the buttons) and of the Runs card is cut off and the column scrolls sideways. At 768 px it fits. | run (`main` scrollWidth 481, clientWidth 390) | fault: new, the workspace overview overflows at 390 px; not yet in the faults list. |
| Permissions table, First steps, States. | the writer's citations | holds (not re-run: First steps shows only while nothing has run; Maya's Sandbox has runs) |
