# Fact-check record: console/how-to/widgets/choose-what-a-widget-shows.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add to page lists Work with records, Understand data, Take action, Organize and explain; Table is chosen and its tabs are Data, Display, Actions, Rules. | `screens/builder/AddToPage.tsx:17-20`; run | writer, run on the instance 2026-11-23 | holds as run |
| App Builder needs resource:write or interface:write; production is read only. | `screens/builder/ReadOnly.tsx:34-36` | writer, code only | not run |
| "Table needs a source to show."; page says "Choose what it shows in Data." | run (Data tab Needs fixing); `packages/screens/src/PageView.tsx:682` | writer, run on the instance 2026-11-23 | holds as run |
| Source window "Where it reads from", box "Find a table or query". | `kit/inspector/rowsItUses.tsx:400-401` | writer, run on the instance 2026-11-23 | holds as run |
| Only include window "Only include rows where", chip "Species is Dog", Add; up to 20 conditions. | `kit/inspector/rowsItUses.tsx:880-913,902`; `packages/manifest/src/page.ts:82` | writer, run on the instance 2026-11-23 | holds as run |
| Sorted by: "Then by", Newest/Oldest for a date; up to 4 sorts; Show at most choices All rows,5,10,25,50,100,500,1000; summary "Starts at, newest first · at most 25". | `packages/ui/src/drawer/EditorBodies.tsx:553-587`; `rowsItUses.tsx:942,1010`; `page.ts:146`; run | writer, run on the instance 2026-11-23 | holds as run |
| Display: columns (drag, eye, name opens Column), + Column; Column has Heading, Shown as Text/Badge, Align Auto/Right, Width Auto/Fixed, Sort by clicking the heading, Hide on phones. | `kit/inspector/widgets/tableDrawer.tsx:116,146`; `widgets/ColumnEditor.tsx:144,225,238`; run | writer, run on the instance 2026-11-23 | holds as run |
| Group rows by (Nothing: one list; each day, week, month or quarter gets a heading with a count). | `kit/inspector/groupRowsControl.tsx:105,121,126`; run: heading "booked 25 rows" | writer, run on the instance 2026-11-23 | holds as run |
| Look: Row height Comfortable/Compact, Rows at a time, When empty, Stripe rows; "Showing 25 of 3,708", "Show 25 more". | `widgets/tableDrawer.tsx:219-285`; `packages/widgets-core/views/table.tsx:63-68`; run | writer, run on the instance 2026-11-23 | holds as run |
| Publish check, button "Publish N changes". | run ("Publish 3 changes") | writer, run on the instance 2026-11-23 | holds as run |
| Download button in the heading; first 10,000 rows. | `packages/screens/src/useWidgetData.ts:32`; run: menu "Download as CSV" / "Download as a spreadsheet" (the file was not opened) | writer, run on the instance 2026-11-23 | file not opened |
