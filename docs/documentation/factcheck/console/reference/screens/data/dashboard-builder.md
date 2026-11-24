# Fact-check record: console/reference/screens/data/dashboard-builder

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Toolbar: status words Saved./Saving…/Not saved, Undo/Redo, Refreshes, Share, ⋯, Done, panel buttons, More menu | `apps/console/src/screens/builder/EditorShell.tsx:21-30,140-225`; `apps/console/src/kit/UndoRedo.tsx:25-45`; DB:520-570 | writer, run | holds |
| A resource has no Share in the editor | DB:540-560 | writer, run | holds |
| History: a hundred back; not name or sharing | DB:196-205 | writer, code | holds |
| A change to a resource is saved as a draft on its revision; clash notice | DB:450-520 | writer, run | holds |
| No frame or layout is passed to the dashboard's editor | DB:530-545; `apps/console/src/screens/builder/PageEditor.tsx:225-245` | writer, code | holds |
| Widgets offered: surfaces include dashboard for Table, List, Stat, Chart, Pivot, Text, Section, Tabs, Search and filter, Goal | `packages/widgets-core/src/index.ts:80,309,384,522,807,912,1380,1439,1533,1717` | writer, run | holds |
| Add to page groups and descriptions | seen on the instance: Add to page dialog | writer, run | holds |
| Limits 30 widgets, 8 filters, 12 columns, 40 high, 400 rows, 16 filters per input | `packages/widget-sdk/src/page.ts:194-204`; manifest page.ts:293 | writer, code | holds |
| Where it reads from: tables, source tables (table/list only), queries, SQL written here with sql:read | `apps/console/src/kit/inspector/rowsItUses.tsx:332-378`; model.ts:337 | writer, run | holds |
| A source's table hint text | rowsItUses.tsx:364-366 | writer, run | holds |
| Steps on a dashboard: message, narrow, rows | `apps/console/src/kit/inspector/actionModel.ts:75-100` | writer, code | holds |
| Filter kinds, relative ranges, All time, Clear filters, 10 words 200 letters | `packages/widget-sdk/src/page.ts:120-140`; `packages/widgets-core/views/filter.tsx:126`; `packages/screens/src/PageView.tsx:1649`; qry/filters.ts:123-195 | writer, code | holds |
| Trend bucket by length of range | qry/widget.ts:150-156 | writer, code | holds |
| Compare with the period before switch | `apps/console/src/kit/inspector/widgets/statDrawer.tsx:104` | writer, code | holds |
| Keys: A, arrows, Shift+arrow, Delete, undo/redo | `apps/console/src/kit/shortcuts.ts:80-90`; e2e/dashboards.spec.ts | writer, code | holds (A seen; others from code) |
| Saver needs sql:read / data_source:read | `apps/control-plane/src/kernel/pages/standing.ts:1-14` | writer, code | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Confirmed in `packages/widget-sdk/src/page.ts:194-204` and `packages/manifest/src/page.ts` (12 columns, 40 cells, 400 rows, 30 widgets, 8 filters, 16 filters per input); panel button labels in `screens/builder/EditorShell.tsx:205-261`.
- Confirmed on the instance: key :kbd[A] opens **Add to page** (the dialog's search is focused; "Stat" then Enter places it at the end); the widget groups and names; **Refreshes** options; the first table of a workspace with one table is chosen as the source on its own; Where it reads from lists Visits, saved queries by title with their path, then **SQL written here** (for tenant_admin); at 390 px the toolbar is behind "More: undo, redo and the screen size" (Refreshes and Share inside) and the outline is **Pages and widgets**; the canvas says "Wider than this window: scroll sideways to see all of it." (no overflow of the page).
- A dashboard editor draft clash offers **Copy what I wrote** (the app builder's does not: see faults).
