# Fact-check record: console/explanation/widgets/how-widgets-get-their-data.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Widgets declare shapes rows, summary, record, approvals. | `packages/docs/generated/develop/reference/widgets/*.md` ("What it reads") | writer | holds |
| Sources: table, saved query, SQL on dashboards only, record/selected/own. An app page may read a saved query, not SQL. | `packages/manifest/src/page.ts:1105-1156` | writer, code only | not run |
| Saved query / SQL parameters set in Data; "Choose <label>." | `kit/inspector/rowsItUses.tsx` (ConstantValues) | writer, code only | not run |
| data_source:read and sql:read on save; reader needs data:read. | `apps/control-plane/src/kernel/pages/standing.ts:9-11,116-117` | writer, code only | holds |
| Rules tab: "What rows each person receives is decided by the Appointments row rules." | run (Rules tab) | writer, run on the instance 2026-11-23 | holds as run |
| Reader's zone sent on every read; UTC when none. | `packages/screens/src/useWidgetData.ts:75-76` | writer, code only | holds |
| 1,000 default, 10,000 most, 5 MB; choices 200; download 10,000. | `apps/control-plane/src/kernel/data/query/run.ts:21-23`; `useWidgetData.ts:32` | writer, code only | holds |
| Empty states: "Choose what it shows in Data.", "Nothing is set up here yet.", "Open a record to see it here.", "Choose a row in X to see it here.", "You may not see this.", Try again. | `packages/screens/src/PageView.tsx:677-686`; `Frame.tsx:282-290` | writer, code only | holds |
| Page reads again after an action, at 1/3/8 s after a start; dashboard refresh Never/1/5/15/60. | `packages/screens/src/actions.tsx:691`; `packages/widget-sdk/src/page.ts:272-274` | writer, code only | not run |
| Table reads 25, "Show 25 more". | run | writer, run on the instance 2026-11-23 | holds as run |
| Not built: Pivot above three breakdowns, chart above six measures, form file, Form/Detail on dashboards. | `docs/documentation/inventory/widgets.md` (A, not built) | writer | from the inventory |
