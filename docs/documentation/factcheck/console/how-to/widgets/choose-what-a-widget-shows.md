# Fact-check record: console/how-to/widgets/choose-what-a-widget-shows.md

Code as of the working tree of branch `phase-31-write-the-docs`, 2026-11-23. Paths are under `apps/console/src` unless they start with `packages` or `apps/control-plane`. Second check: every row below was read in the code and, where it says run, done on http://localhost:8091.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add to page lists Suggested for this page, Work with records, Understand data, Take action, Organize and explain; Table is placed at the end, chosen; tabs Data, Display, Actions, Rules | `screens/builder/AddToPage.tsx:17-20` | second agent, 2026-11-23 | holds as run |
| App Builder needs resource:write or interface:write; production is read only | `screens/builder/ReadOnly.tsx:34-36` | second agent, 2026-11-23 | code only |
| "Table needs a source to show."; page says "Choose what it shows in Data." | `PageView.tsx:682` | second agent, 2026-11-23 | holds as run |
| Source window "Where it reads from", box "Find a table or query" | `rowsItUses.tsx:400-401` | second agent, 2026-11-23 | holds as run |
| Only include: window "Only include rows where", Field, test is/is not/is empty/is not empty, values with counts, Add; chip "Species is Dog"; up to 20 conditions | `rowsItUses.tsx:880-913`; `packages/manifest/src/page.ts:82` | second agent, 2026-11-23 | holds as run; the limit is code only |
| Sorted by: Then by adds a sort (first one Id), choose Starts at, Newest/Oldest; up to four; Show at most is a list All rows,5,10,25,50,100,500,1000; summary "Starts at, newest first · at most 25" | `packages/ui/src/drawer/EditorBodies.tsx:553-587`; `page.ts:146` | second agent, 2026-11-23 | holds as run |
| Display: columns drag/eye/name opens Column (Heading, Shown as Text/Badge, Align Auto/Right, Width Auto/Fixed, Sort by clicking the heading, Hide on phones); + Column | `widgets/tableDrawer.tsx:111-190`; `ColumnEditor.tsx:144-238` | second agent, 2026-11-23 | holds as run |
| Group rows by: a list (Nothing: one list, columns); a date column asks Day, Week or Month (not quarter); First earliest/latest; headings carry a count | `kit/inspector/groupRowsControl.tsx:95-170` | second agent, 2026-11-23 | corrected: the page said quarter; run: heading "booked 24 rows" |
| Look: Row height Comfortable/Compact, Rows at a time (5 to 200, "25, then pages"), When empty ("There is nothing here yet." or "Nothing matches the filters."), Stripe rows; "Showing 25 of 3,708" and "Show 25 more" only when the source has more than shown | `tableDrawer.tsx:195-285`; `packages/widgets-core/views/table.tsx:63-68` | second agent, 2026-11-23 | corrected: Rows at a time range added; run: no "Showing" line once Show at most is 25 |
| Publish check and "Publish N changes"; served app at /apps/fernhill/sandbox/<address>/ | run | second agent, 2026-11-23 | holds as run |
| Download in the heading: Download as CSV / Download as a spreadsheet; up to 10,000 rows; file opened: table.csv, 25 rows, all columns, times as ISO UTC | `packages/screens/src/Frame.tsx:233,320-340`; `useWidgetData.ts:32` | second agent, 2026-11-23 | holds as run; file opened |
| Hide on phones turned on for a column: served at 390 px (light, dark) shows a list without it | `ColumnEditor.tsx:238` | second agent, 2026-11-23 | holds as run |

Checked by: second agent, 2026-11-23
