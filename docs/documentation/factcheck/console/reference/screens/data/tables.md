# Fact-check record: console/reference/screens/data/tables

Code as of commit `be324f78` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer; walked in a browser on the throwaway instance (`docs/documentation/runs/console/reference/screens/data/tables.md`). "Checked by" ends with the second agent, who read each claim against the code (Checked by: second agent, 2026-11-23). Line numbers point at the block that holds the claim and were found by searching the file, not by reading each line again: the second agent confirms them. `Data` = `apps/console/src/screens/Data.tsx`, `Cols` = `apps/console/src/screens/ColumnControls.tsx`, `Rules` = `apps/console/src/screens/RowRules.tsx`, `GF` = `apps/console/src/screens/gridFilter.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Tables list columns Table, What it holds, Managed in (Repository/Console), Who sees rows, Columns, Rows; retired pill | `Data:1626-1669` | writer, run; second agent 2026-11-23 | holds |
| Who sees rows words: Everyone with access / Each person sees their own rows (col) / By N rules | `Rules:33-40` | writer, run; second agent 2026-11-23 | holds |
| Empty state "No tables yet" and its text | `Data:1663-1664` | writer; second agent 2026-11-23 | holds (not run) |
| Create table needs `resource:write`, button disabled with reason | `Data:1626` (needs), `apps/console/src/kit/Can.tsx:233-245` | writer, run (Sam: disabled); second agent 2026-11-23 | holds |
| Create table fields and labels (Name, What it holds, First column, It holds, Which table, Values, More columns, Who sees rows) and the two policy options | `Data:1672-1722` | writer, run; second agent 2026-11-23 | holds |
| Type names (12) | `Data:73-85`, `Cols:19-32` | writer, run; second agent 2026-11-23 | holds |
| owner policy adds `owner_id` uuid and an owner rule | `Data:1737-1752` | writer; second agent 2026-11-23 | holds (not run) |
| Refusals: empty column name, duplicate or system column name, reference with no table | `Data:1727-1734` | writer, run (duplicate and `id`); second agent 2026-11-23 | holds |
| Name in use: 'Something is already at "…". Choose another name, or change what is there.' | server text; `Data.test.tsx:947`; shown on the dialog | writer, run; second agent 2026-11-23 | holds |
| Table page title, description sentence, "Managed in the repository/console", "Was managed in the…" | `Data:1844-1846` | writer, run; second agent 2026-11-23 | holds |
| Page fills the window; view in address `view` | `Data:1810`, `Data:1775`, `Data:1914-1939` | writer, run; second agent 2026-11-23 | holds |
| Retired table: no tabs, notice text, Bring back (console only), Delete for good, definition read only | `Data:1862-1884` | writer, run; second agent 2026-11-23 | holds |
| Toolbar order: tabs, Keys, Columns, Compact/Standard rows, Rows must match, saved views, CSV, Add row | `Data:419-564` | writer, run; second agent 2026-11-23 | holds |
| Keys popover text | `Data:430-476` | writer, run; second agent 2026-11-23 | holds |
| Columns dialog: show/hide, move (drag or arrows), Lock the first column, Show every column, Done | `Data:479-490`, `apps/console/src/kit/views.tsx:200-330` | writer, run; second agent 2026-11-23 | holds |
| Rows must match appears with more than one filter; every filter / any filter; `match=any` | `Data:495-509` | writer; second agent 2026-11-23 | holds (not run) |
| Saved views menu items; private to member; keyed by table ID | `apps/console/src/kit/views.tsx:86-176`; `Data:3800-3813` | writer, run (menu present); second agent 2026-11-23 | holds; "private/link works for anyone" is from the inventory, not run |
| CSV is a download of the filtered, sorted rows and disabled while a filter is unreadable | `Data:510-522`, `Data:268-279` | writer; second agent 2026-11-23 | holds (not run: no download) |
| Add row disabled with the reason without `data:write` | `Data:524-533`, `Data:1791` needs | writer, run (Sam); second agent 2026-11-23 | holds |
| Address keys sort, filter, page, cols, match, unlock, density, row | `Data:189-203` | writer; second agent 2026-11-23 | holds |
| A link to a row not on the page reads it by ID; "That row is gone…" | `Data:253-258`, `Data:546-551` | writer; second agent 2026-11-23 | holds (not run) |
| Sort: press goes up, down, off; Shift adds, turns, removes; number beside arrow | `Data:167-186` (nextSort); `packages/ui/src/Grid.tsx` | writer; second agent 2026-11-23 | holds (arrows and number not run) |
| JSON and list-of-values columns are not sortable; JSON has no filter box | `Data:344-351` | writer, run (box list); second agent 2026-11-23 | holds |
| Filters apply about 300 ms after typing stops | `apps/console/src/kit/addressBox.ts:17` | writer; second agent 2026-11-23 | holds (not run) |
| Checked rows belong to the page, sort and filter | `Data:240-247` | writer; second agent 2026-11-23 | holds (not run) |
| Grid editing: choice is a select; list, reference, date, moment open a dialog; yes/no toggles; file, id, created_at, updated_at not edited; Escape restores | `Data:788-800`, `Data:353`, `Grid.tsx:318-325` | writer; second agent 2026-11-23 | holds (cell edit not run) |
| Time shown in the reader's clock, title gives UTC | `Grid.tsx:164-215`, `Grid.tsx:719,900` | writer; second agent 2026-11-23 | holds |
| Reference cell shows the row's name; rule name, else title, else first text column | `Data:446-453`; `packages/manifest/src/table.ts` (`displayGuess`) | writer; second agent 2026-11-23 | holds |
| File cell shows Download | `Data:604-612` | writer; second agent 2026-11-23 | holds |
| Grid keys | `packages/ui/src/Grid.tsx:466-570` | writer; second agent 2026-11-23 | holds (not run) |
| Footer text and 50 a page; Previous, Next | `Data:71`, `Data:715-760` | writer, run; second agent 2026-11-23 | holds |
| Checked bar: "N rows checked", Delete, Uncheck all; confirm "Delete these N rows?" / "They are removed for everyone. This cannot be undone."; result and "were gone already" text | `Data:385-410`, `Data:572-590` | writer, run (1 row: "Delete this row?"); second agent 2026-11-23 | holds |
| One bulk delete takes at most 1,000 ids | `apps/control-plane/src/routes/data.ts:1102` | writer; second agent 2026-11-23 | holds |
| Row inspector: fields, Save row, Discard, Delete row, confirm text, Leave without saving? (Leave/Stay) | `Data:343-360`, `Data:1295-1360`, `Data:617-650` | writer, run; second agent 2026-11-23 | holds |
| Reference picker: 50, "Type to find more", 250 ms | `Data:1060`, `Data:898-1030` | writer; second agent 2026-11-23 | holds (250 ms not run) |
| File field: Download or dash, Replace, Remove with confirms; kept in history for audit retention (400 days) | `Data:1091-1150`, inventory D22 `kernel/retention.ts:229-285` | writer; second agent 2026-11-23 | holds (400 days from the existing page; not re-read) |
| Add row sheet text, groups Required / Optional, Choose a file | `Data:1448-1560` | writer, run; second agent 2026-11-23 | holds |
| States: empty, no match, unreadable filter notice, reference filter notice, too slow + Add an index (console tables), gone row, read only | `Data:546-571`, `Data:671`, `Data:300-320`, `Data:264-268` | writer; second agent 2026-11-23 | holds (too slow, gone row not run) |
| Definition off for a repository table with notice; off without `resource:write` with a line | `Data:2695-2700`, `Data:2457-2462` | writer, run (Sam, Devi); second agent 2026-11-23 | holds |
| Saves as you work; Undo, Redo; keys Mod+Z, Shift+Mod+Z, Ctrl+Y not in fields | `Data:2540-2600`, `apps/console/src/kit/UndoRedo.tsx`, `apps/console/src/kit/shortcuts.ts:89-90` | writer, run (undo/redo of a rule); second agent 2026-11-23 | holds |
| Who sees rows save is recorded in undo history | `Data:3039-3053` | writer; second agent 2026-11-23 | holds (corrects the inventory, which says it is not) |
| Someone else changed … text | `Data:2520` | writer; second agent 2026-11-23 | holds (not run) |
| Rename table dialog "Name and path of X", Path, Title; old path answers 90 days; saved as a draft | `apps/console/src/screens/ResourceIdentity.tsx:164`; run | writer, run; second agent 2026-11-23 | holds |
| Describe the table / again; 500 characters | `Data:2711-2714`, `Data:2603` | writer, run; second agent 2026-11-23 | holds |
| Columns table headings Column, Holds, Rules, When not given; Required / No two rows alike | `Data:2745-2800` | writer, run; second agent 2026-11-23 | holds |
| Column actions: Values/On delete, Rules, Change type/Change table, Describe, Rename, Retire; menu "Actions for X" on a phone; Retire disabled on last column | `Data:2605-2690`, `Data:2820` | writer, run (buttons); second agent 2026-11-23 | holds (phone menu not run) |
| Values dialog fields; colors; rename and removal notices | `Data:2174-2290` | writer, run; second agent 2026-11-23 | holds |
| On delete options and cascade warning | `Data:2037-2085` | writer; second agent 2026-11-23 | holds (not run) |
| Rules dialog; refusals; hints | `Cols:225-295` | writer, run (hint); second agent 2026-11-23 | holds |
| Change type dialog; "Change table" for a reference | `Cols:355-445` | writer, run; second agent 2026-11-23 | holds |
| Retire column confirm text; rule-column refusal | `Data:2656-2680`, `Data:2371-2392` | writer, run (confirm); second agent 2026-11-23 | holds |
| Add column fields; "The column X was added."; hint line | `Data:3175-3260` | writer, run; second agent 2026-11-23 | holds |
| Retired columns table; Bring back writes type, table, values | `Data:2843-2905` | writer, run; second agent 2026-11-23 | holds |
| What stands for a row select; excludes json, file, list of values | `Data:2909-2950` | writer, run; second agent 2026-11-23 | holds |
| Indexes: heading, text, "No indexes. Only the ID is indexed.", Remove, Add an index, up to 5, max 20 with message, same columns refused, `at=indexes` | `Data:2955-3030`, `Cols:450-510` | writer, run (dialog); second agent 2026-11-23 | holds |
| Who sees rows modes, labels, Add a rule, Remove (disabled with one rule), Save who sees rows, "Saved. It applies from the next request." | `Rules:100-275` | writer, run (modes); second agent 2026-11-23 | holds |
| Rule limit 20, rule semantics, owner given to adder | `packages/manifest/src/kinds.ts:1527-1560`, `apps/control-plane/src/kernel/data/rows.ts:1088-1110` | writer; second agent 2026-11-23 | holds |
| See it as / See it as a group; first 20 rows; "Someone in this group would see N rows in all." | `Rules:300-440` | writer; second agent 2026-11-23 | holds (not run) |
| Where it is stored; Retire this table and its confirm text | `Data:3070-3092` | writer, run; second agent 2026-11-23 | holds |
| Retire refused while another table refers to it | `apps/control-plane/src/kernel/data/apply.ts:1071-1093` | writer; second agent 2026-11-23 | holds (not run) |
| Bring back (table) saves definition from the catalog; needs `resource:write` | `Data:1925-1990` | writer, run; second agent 2026-11-23 | holds |
| Delete for good: type the name, needs `table:write`, audited `table.purged` | `Data:2015-2035`, `routes/data.ts:595-633` | writer, run (Maya); second agent 2026-11-23 | holds |
| List and table detail need `table:read`; rows, export need `data:read`; writes `data:write`; See it as needs `data_all:read` | `apps/control-plane/src/routes/data.ts:391,458,647-654,1020,1086`; inventory for `data_all` | writer; second agent 2026-11-23 | holds (`data_all` from the inventory, not re-read) |
| Built-in roles named in the page | `apps/console/src/builtinRoles.ts` | writer; second agent 2026-11-23 | holds |
| Rows API takes up to 1,000 rows a request | `routes/data.ts:918` | writer; second agent 2026-11-23 | holds |
| No column masks, computed columns, row validation, row history screen, CSV import | absence; `docs/documentation/inventory/tables.md` section A | writer; second agent 2026-11-23 | holds (searched `Data.tsx` for none) |

## Second check, second agent, 2026-11-23

Every claim above was read against the code and set to "second agent". Where the screen decides, confirmed on `http://localhost:8091` as Maya Brooks in Sandbox, on my own table `chk2-demo` (rows made in the Add row sheet; the table is left in place): the Add row sheet (groups, **Choose a file**), the Row inspector (file field), the checked-rows bar ("1 row checked", **Delete**, **Uncheck all**), sort in the address (`sort=n`, then `sort=n,title` with Shift), the Keys popover text, the Columns dialog (Move X up, Move X down, Lock the first column, Show every column, Done), the Saved views menu (**Save this view…**, **Copy a link to this view** with none saved), the Definition view of a console table, the Columns count in the list (7, not counting the three system columns), filters in the address, and the unreadable-filter notice ("n: Enter a number.").

Corrected in the page:

| Was | Is | Source |
| --- | --- | --- |
| Create table: **What it holds** "500 characters at most" | only the first 500 characters are kept (no field limit; the submit cuts) | `Data:1672-1722` `.slice(0, 500)` |
| Saved views items in straight quotes | curly quotes as the menu has them | `kit/views.tsx:153-160` |
| Address keys omitted `back` | `back` listed (the cursors of the pages before, for **Previous**) | `Data:189-203` |
| Enter or F2 on a cell that cannot be edited opens the row | only Enter opens it; F2 does nothing there | `Grid.tsx:555-567` |
| Dates and times are shown in your own clock, hover gives UTC | only **Date and time**; a **Date** is shown as stored, with no hover | `Grid.tsx:719,900` |
| Picker "says Type to find more" | the hint is "A row of X. Type to find more.", only when there are more than 50 | `Data:1056-1062` |
| Rename table "is saved as a draft" and Definition "takes effect at once" | the button is **Save as a draft** and nothing changes until the draft is deployed; the rest saves at once | `ResourceIdentity.tsx:164,329` |
| Bring back: table description comes back empty | the table's and the columns' descriptions both come back empty (the detail route reads them from the definition, which a retired table lacks) | `routes/data.ts:516-575` |
| Retired notice quoted whole | the notice goes on to say how the table comes back | `Data:1864-1868` |
| What stands for a row, read only | the view names the column or says "The row's ID." | `Data:2930-2940` |

Product fault, reported not endorsed: in the Row inspector the file field shows **Replace** when the row has no file (it then adds one), where the **Add row** sheet words the same case **Choose a file** (`Data:1127-1135` against `Data:1539`). The page says what the screen does and names the difference.

Lines not re-read one by one: the server refusals for a unique rule with repeated values, retiring a table another table points to, and bringing back a reference with missing rows (`kernel/data/apply.ts`, `column-values.ts`): taken from the writer's reading; not run.

### Cuts after the second check, 2026-11-23

Padding removed at the coordinator's request, with the page linking instead: the list of twelve types under Create table (now links to Column types); the "three columns it fills in" paragraph (in Column types); the keys-in-the-grid table (replaced by one sentence naming the keys the Keys popover lacks: Home, End, Ctrl+Home, Ctrl+End, PageUp, PageDown, Space, Enter on a cell that cannot be edited; `Grid.tsx:520-567`; the popover text is `Data:430-476`); the Sorting and Filtering bullets (shortened, with links to Column types and Filter syntax); the role sentence under Permissions (the table stays). The claims "Grid keys", "Sort", "JSON and list-of-values columns are not sortable" and "Type names (12)" now rest on the linked pages' records.

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| **Managed in** reads **Files** or **Code**; page line `Managed as files.`/`Managed as code.` | `apps/console/src/screens/Data.tsx:1676-1678,1867`; `kit/ownership.ts:11-17` | writer, 2026-11-24 | holds as read |
| Take-over notice, button, confirmation, success text, production and permission cases; Retire not offered for Code. | `apps/console/src/screens/Data.tsx:2768-2800,2905-2925`; a6 notes | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. Browser: the notice, the dialog text word for word, the toast text `Data.tsx:2797`, no button in an editor-less state not tested (production workspace read from code). CORRECTED: a note that the dialog's mention of `volvel pull` does not hold for a table (product copy to fix: the dialog says 'until you run volvel pull').

### Fix check (a9), 2026-11-24

Lane a9 build, throwaway instance http://localhost:8729 (database a934), lane CLI `packages/cli/dist/bin.js`. The page now describes the fixed behaviour, run as written: a table in code deployed, taken over in the console with a column added in the same save (`PUT resources/desk`, `takeOver: true`); `volvel deploy` without a pull refused (`desk: changed in the console since the repository last had it`); `volvel pull` wrote `platform/desk.table.yaml` with the column, and printed `desk (table) was taken over in the console, and is still defined in code, by the name desk. Remove it from the TypeScript: until you do, a deploy is refused as defined twice, in the code and in platform/.`; `volvel deploy` then failed at the build with `desk is defined in src/index.ts and again in platform/desk.table.yaml`; with the definition removed from the code the deploy passed and the table kept the column (read). CORRECTED the passages that said a pull brings nothing in for a table (product bug fixed by lane a9).
