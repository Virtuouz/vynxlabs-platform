# Fact-check record: console/explanation/widgets/how-widgets-get-their-data.md

Code as of the working tree of branch `phase-31-write-the-docs`, 2026-11-23. Paths are under `apps/console/src` unless they start with `packages` or `apps/control-plane`. Second check: every row below was read in the code and, where it says run, done on http://localhost:8091.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Widgets declare shapes rows, summary, record, approvals | `packages/docs/generated/develop/reference/widgets/*.md` | second agent, 2026-11-23 | holds |
| Sources: table, saved query, SQL on dashboards only, record/selected/own; an app page may read a saved query, not SQL | `packages/manifest/src/page.ts:1105-1160` | second agent, 2026-11-23 | holds (code) |
| data_source:read and sql:read when the page is saved; reader needs data:read | `apps/control-plane/src/kernel/pages/standing.ts:7-12,112-117` | second agent, 2026-11-23 | holds (code) |
| Rules tab: "What rows each person receives is decided by the Appointments row rules." | run (Rules tab) | second agent, 2026-11-23 | holds as run (earlier run) |
| Reader's zone sent with every read; UTC when none | `packages/screens/src/useWidgetData.ts:73-76`; `apps/control-plane/src/kernel/zones.ts:13-17` | second agent, 2026-11-23 | holds (code) |
| Reads: 1,000 default, 10,000 most, about 5 MB; choices at most 200; a download takes up to 10,000 | `apps/control-plane/src/kernel/data/query/run.ts:21-23`; `inputs.ts:118,529`; `useWidgetData.ts:32` | second agent, 2026-11-23 | holds (code) |
| Empty states and their words | `packages/screens/src/PageView.tsx:677-686`; `Frame.tsx:282-290` | second agent, 2026-11-23 | holds (code); "Choose what it shows in Data." seen in the builder |
| Page reads again after an action, and at 1, 3 and 8 seconds after a start | `packages/screens/src/actions.tsx:691` | second agent, 2026-11-23 | holds (code) |
| Dashboard refresh: off, 1, 5, 15, 60 minutes; default 5; none while editing | `packages/widget-sdk/src/page.ts:294-300`; `apps/console/src/screens/Dashboards.tsx:442-446` | second agent, 2026-11-23 | corrected: the page did not give the default |
| Table reads 25 at a time, Show 25 more | run | second agent, 2026-11-23 | holds as run |
| Not there: Pivot above three breakdowns, a chart above six measures, a form file, Form or Record detail on a dashboard | `widgets-core/src/index.ts:523,808` | second agent, 2026-11-23 | holds (code) |

Checked by: second agent, 2026-11-23
