# Fact-check record: console/reference/screens/data/tables

Code as of commit `be324f78` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer; walked in a browser on the throwaway instance (`docs/documentation/runs/console/reference/screens/data/tables.md`). "Checked by" is left for the second agent. Line numbers point at the block that holds the claim and were found by searching the file, not by reading each line again: the second agent confirms them. `Data` = `apps/console/src/screens/Data.tsx`, `Cols` = `apps/console/src/screens/ColumnControls.tsx`, `Rules` = `apps/console/src/screens/RowRules.tsx`, `GF` = `apps/console/src/screens/gridFilter.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Tables list columns Table, What it holds, Managed in (Repository/Console), Who sees rows, Columns, Rows; retired pill | `Data:1626-1669` | writer, run | holds |
| Who sees rows words: Everyone with access / Each person sees their own rows (col) / By N rules | `Rules:33-40` | writer, run | holds |
| Empty state "No tables yet" and its text | `Data:1663-1664` | writer | holds (not run) |
| Create table needs `resource:write`, button disabled with reason | `Data:1626` (needs), `apps/console/src/kit/Can.tsx:233-245` | writer, run (Sam: disabled) | holds |
| Create table fields and labels (Name, What it holds, First column, It holds, Which table, Values, More columns, Who sees rows) and the two policy options | `Data:1672-1722` | writer, run | holds |
| Type names (12) | `Data:73-85`, `Cols:19-32` | writer, run | holds |
| owner policy adds `owner_id` uuid and an owner rule | `Data:1737-1752` | writer | holds (not run) |
| Refusals: empty column name, duplicate or system column name, reference with no table | `Data:1727-1734` | writer, run (duplicate and `id`) | holds |
| Name in use: 'Something is already at "…". Choose another name, or change what is there.' | server text; `Data.test.tsx:947`; shown on the dialog | writer, run | holds |
| Table page title, description sentence, "Managed in the repository/console", "Was managed in the…" | `Data:1844-1846` | writer, run | holds |
| Page fills the window; view in address `view` | `Data:1810`, `Data:1775`, `Data:1914-1939` | writer, run | holds |
| Retired table: no tabs, notice text, Bring back (console only), Delete for good, definition read only | `Data:1862-1884` | writer, run | holds |
| Toolbar order: tabs, Keys, Columns, Compact/Standard rows, Rows must match, saved views, CSV, Add row | `Data:419-564` | writer, run | holds |
| Keys popover text | `Data:430-476` | writer, run | holds |
| Columns dialog: show/hide, move (drag or arrows), Lock the first column, Show every column, Done | `Data:479-490`, `apps/console/src/kit/views.tsx:200-330` | writer, run | holds |
| Rows must match appears with more than one filter; every filter / any filter; `match=any` | `Data:495-509` | writer | holds (not run) |
| Saved views menu items; private to member; keyed by table ID | `apps/console/src/kit/views.tsx:86-176`; `Data:3800-3813` | writer, run (menu present) | holds; "private/link works for anyone" is from the inventory, not run |
| CSV is a download of the filtered, sorted rows and disabled while a filter is unreadable | `Data:510-522`, `Data:268-279` | writer | holds (not run: no download) |
| Add row disabled with the reason without `data:write` | `Data:524-533`, `Data:1791` needs | writer, run (Sam) | holds |
| Address keys sort, filter, page, cols, match, unlock, density, row | `Data:189-203` | writer | holds |
| A link to a row not on the page reads it by ID; "That row is gone…" | `Data:253-258`, `Data:546-551` | writer | holds (not run) |
| Sort: press goes up, down, off; Shift adds, turns, removes; number beside arrow | `Data:167-186` (nextSort); `packages/ui/src/Grid.tsx` | writer | holds (arrows and number not run) |
| JSON and list-of-values columns are not sortable; JSON has no filter box | `Data:344-351` | writer, run (box list) | holds |
| Filters apply about 300 ms after typing stops | `apps/console/src/kit/addressBox.ts:17` | writer | holds (not run) |
| Checked rows belong to the page, sort and filter | `Data:240-247` | writer | holds (not run) |
| Grid editing: choice is a select; list, reference, date, moment open a dialog; yes/no toggles; file, id, created_at, updated_at not edited; Escape restores | `Data:788-800`, `Data:353`, `Grid.tsx:318-325` | writer | holds (cell edit not run) |
| Time shown in the reader's clock, title gives UTC | `Grid.tsx:164-215`, `Grid.tsx:719,900` | writer | holds |
| Reference cell shows the row's name; rule name, else title, else first text column | `Data:446-453`; `packages/manifest/src/table.ts` (`displayGuess`) | writer | holds |
| File cell shows Download | `Data:604-612` | writer | holds |
| Grid keys | `packages/ui/src/Grid.tsx:466-570` | writer | holds (not run) |
| Footer text and 50 a page; Previous, Next | `Data:71`, `Data:715-760` | writer, run | holds |
| Checked bar: "N rows checked", Delete, Uncheck all; confirm "Delete these N rows?" / "They are removed for everyone. This cannot be undone."; result and "were gone already" text | `Data:385-410`, `Data:572-590` | writer, run (1 row: "Delete this row?") | holds |
| One bulk delete takes at most 1,000 ids | `apps/control-plane/src/routes/data.ts:1102` | writer | holds |
| Row inspector: fields, Save row, Discard, Delete row, confirm text, Leave without saving? (Leave/Stay) | `Data:343-360`, `Data:1295-1360`, `Data:617-650` | writer, run | holds |
| Reference picker: 50, "Type to find more", 250 ms | `Data:1060`, `Data:898-1030` | writer | holds (250 ms not run) |
| File field: Download or dash, Replace, Remove with confirms; kept in history for audit retention (400 days) | `Data:1091-1150`, inventory D22 `kernel/retention.ts:229-285` | writer | holds (400 days from the existing page; not re-read) |
| Add row sheet text, groups Required / Optional, Choose a file | `Data:1448-1560` | writer, run | holds |
| States: empty, no match, unreadable filter notice, reference filter notice, too slow + Add an index (console tables), gone row, read only | `Data:546-571`, `Data:671`, `Data:300-320`, `Data:264-268` | writer | holds (too slow, gone row not run) |
| Definition off for a repository table with notice; off without `resource:write` with a line | `Data:2695-2700`, `Data:2457-2462` | writer, run (Sam, Devi) | holds |
| Saves as you work; Undo, Redo; keys Mod+Z, Shift+Mod+Z, Ctrl+Y not in fields | `Data:2540-2600`, `apps/console/src/kit/UndoRedo.tsx`, `apps/console/src/kit/shortcuts.ts:89-90` | writer, run (undo/redo of a rule) | holds |
| Who sees rows save is recorded in undo history | `Data:3039-3053` | writer | holds (corrects the inventory, which says it is not) |
| Someone else changed … text | `Data:2520` | writer | holds (not run) |
| Rename table dialog "Name and path of X", Path, Title; old path answers 90 days; saved as a draft | `apps/console/src/screens/ResourceIdentity.tsx:164`; run | writer, run | holds |
| Describe the table / again; 500 characters | `Data:2711-2714`, `Data:2603` | writer, run | holds |
| Columns table headings Column, Holds, Rules, When not given; Required / No two rows alike | `Data:2745-2800` | writer, run | holds |
| Column actions: Values/On delete, Rules, Change type/Change table, Describe, Rename, Retire; menu "Actions for X" on a phone; Retire disabled on last column | `Data:2605-2690`, `Data:2820` | writer, run (buttons) | holds (phone menu not run) |
| Values dialog fields; colors; rename and removal notices | `Data:2174-2290` | writer, run | holds |
| On delete options and cascade warning | `Data:2037-2085` | writer | holds (not run) |
| Rules dialog; refusals; hints | `Cols:225-295` | writer, run (hint) | holds |
| Change type dialog; "Change table" for a reference | `Cols:355-445` | writer, run | holds |
| Retire column confirm text; rule-column refusal | `Data:2656-2680`, `Data:2371-2392` | writer, run (confirm) | holds |
| Add column fields; "The column X was added."; hint line | `Data:3175-3260` | writer, run | holds |
| Retired columns table; Bring back writes type, table, values | `Data:2843-2905` | writer, run | holds |
| What stands for a row select; excludes json, file, list of values | `Data:2909-2950` | writer, run | holds |
| Indexes: heading, text, "No indexes. Only the ID is indexed.", Remove, Add an index, up to 5, max 20 with message, same columns refused, `at=indexes` | `Data:2955-3030`, `Cols:450-510` | writer, run (dialog) | holds |
| Who sees rows modes, labels, Add a rule, Remove (disabled with one rule), Save who sees rows, "Saved. It applies from the next request." | `Rules:100-275` | writer, run (modes) | holds |
| Rule limit 20, rule semantics, owner given to adder | `packages/manifest/src/kinds.ts:1527-1560`, `apps/control-plane/src/kernel/data/rows.ts:1088-1110` | writer | holds |
| See it as / See it as a group; first 20 rows; "Someone in this group would see N rows in all." | `Rules:300-440` | writer | holds (not run) |
| Where it is stored; Retire this table and its confirm text | `Data:3070-3092` | writer, run | holds |
| Retire refused while another table refers to it | `apps/control-plane/src/kernel/data/apply.ts:1071-1093` | writer | holds (not run) |
| Bring back (table) saves definition from the catalog; needs `resource:write` | `Data:1925-1990` | writer, run | holds |
| Delete for good: type the name, needs `table:write`, audited `table.purged` | `Data:2015-2035`, `routes/data.ts:595-633` | writer, run (Maya) | holds |
| List and table detail need `table:read`; rows, export need `data:read`; writes `data:write`; See it as needs `data_all:read` | `apps/control-plane/src/routes/data.ts:391,458,647-654,1020,1086`; inventory for `data_all` | writer | holds (`data_all` from the inventory, not re-read) |
| Built-in roles named in the page | `apps/console/src/builtinRoles.ts` | writer | holds |
| Rows API takes up to 1,000 rows a request | `routes/data.ts:918` | writer | holds |
| No column masks, computed columns, row validation, row history screen, CSV import | absence; `docs/documentation/inventory/tables.md` section A | writer | holds (searched `Data.tsx` for none) |
