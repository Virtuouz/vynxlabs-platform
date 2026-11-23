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
