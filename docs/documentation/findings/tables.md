# Findings: tables and rows

Settled at `270e509`, 2026-11-22. Short names: `cp` = `apps/control-plane/src`, `Data` = `apps/console/src/screens/Data.tsx`, `rows` = `cp/kernel/data/rows.ts`, `plan` / `apply` = `cp/kernel/data/plan.ts` / `apply.ts`, `rd` = `cp/routes/data.ts`, `Grid` = `packages/ui/src/Grid.tsx`. "Scratch" is a vitest file with its own instance and database (removed afterwards). "Walk" is Playwright against port 8091 in a tenant of its own.

Inventory items: E1 TAB-03, E2 TAB-17, E3 TAB-18, E4 TAB-19, E5 parts P1 to P4, E6 TAB-10, E7 TAB-42 (refuted), E8 TAB-24, E9 TAB-15, E10 TAB-20, E11 TAB-35, E12 TAB-26. Gotchas and D: TAB-24, 27, 28, 31, 36, 41, 42.

## Security

### TAB-01 An owner-policy table shows a row whose owner is empty text to a caller who is nobody
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `apply:615` compares the owner column with the caller's ID as text, and a caller with no ID is the empty text. The `rules` branch guards this ("No one is nobody's"); `owner` does not.
- **Evidence:** scratch: text owner column, one row with `""`; a scope with no person and no all-rows right finds 1 row. An anonymous visitor with `data:read` has that scope. Needs a text owner column and such a row (a form or script may write `""`; the console's Add row cannot).
- **Fix:** the same `<> ''` guard in `owner`, and `upgradePolicies` recompiles old ones. Sibling: an empty attribute against an empty cell (`equals`). Test first: nobody sees none.
- **Size:** S. **Milestone:** M1

### TAB-02 A row change in one tenant removes another tenant's note that keeps a replaced file
- **Outcome:** reproduced
- **Severity:** security (write across tenants; needs the file's ID)
- **Where:** `cp/kernel/data/files.ts:106` deletes `row_file_history` by file ID alone.
- **Evidence:** scratch: the other tenant's note count went 1 to 0. The file's content stayed 404. Effect: that file is never collected. A file ID is also never checked against the workspace: a row naming a file that is not there is accepted (201).
- **Fix:** match tenant and workspace; check a written file ID is a file of this workspace, in one place for insert and update. Test first: the note is still there.
- **Size:** S. **Milestone:** M1

## Data

### TAB-03 Pages sorted by a time skip or repeat rows
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `rows:362,398,600-629`: the cursor is the value in milliseconds, the column holds microseconds. `rd` CSV export uses the same cursor.
- **Evidence:** scratch, 120 rows inserted together: `-created_at` gives 50 rows in 2 pages and stops; `created_at` gives the same 50 for ever. CSV of 2,000 rows by `created_at`: 100,001 lines, 1,001 different; of 1,200 by `-created_at`: 1,000 lines. `eq` with the time the API gave finds 0 rows.
- **Fix:** carry the full-precision text in the cursor (select `::text` beside the value for the sorted column), or keep times in milliseconds in the column. Decide once for `eq` as well. Siblings: source rows, `inputs.ts` lists, worker `find` (offset, safe). Test first: 120 rows, all distinct, both ways, and the CSV.
- **Size:** M. **Milestone:** M2

### TAB-04 A new table given a name another table used to have takes that table's rows
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `plan:200-205`: "a table that used to have this path gets it back" does not check that the table is still declared. Columns do check (`plan:277`, `candidate.name in body.columns`).
- **Evidence:** scratch, three deploys: `alpha`; `beta` with `renamedFrom: alpha`; `beta` without it plus a new `alpha`. 201. `alpha` holds `beta`'s row with its column retired, `beta` is 404, its manifest still deployed. From the console the same create is stopped by accident (409 "That already exists.", the resource key).
- **Fix:** only a retired table, or one whose resource this deploy removes, may be the former. Then say the 409 in words. Test first: both tables are there.
- **Size:** S. **Milestone:** M2

### TAB-05 "Create table" with a name in use replaces that table's definition
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `Data:1225` sends a plain PUT.
- **Evidence:** walk: creating `codes` over a table with two columns: no warning, both columns retired, its policy, display and indexes gone. (Values are kept as retired.)
- **Fix:** refuse a taken path: a `create: true` on the route (answered 409 `path_taken`), used by this dialog. Siblings: no other console dialog PUTs `resources/`; drafts have their own check. Test first: 409, definition unchanged.
- **Size:** S. **Milestone:** M2

### TAB-06 Rename, Add column and Bring back overwrite a column that has the name
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `Data:1890-1893` (Rename), `Data:2329` (Add column), `Data:2106` (Bring back): `body.columns[name] = …` with no check.
- **Evidence:** walk: renaming `b` to `a` left `a` with its own values and retired `b`. Scratch, with the bodies the screen sends: adding `st` as text over a required choice column lets go of its list, default and Required; bringing back a retired text `x` while a whole-number `x` is live turned the live one into text (200) and left the retired one retired.
- **Fix:** one `nameTaken` check in all three, said on the field; the server also refuses `renamedFrom` a live column onto a live one. Test first: each refused, body not sent.
- **Size:** S. **Milestone:** M2

### TAB-07 Two retired columns may share a name, and "Delete for good" removes whichever comes first
- **Outcome:** reproduced
- **Severity:** data (the one action that destroys)
- **Where:** `apply:970-993`: found by name, `executeTakeFirst` with no order; `rd` `table-purges` takes only a name. `Data:2060` rows share one key.
- **Evidence:** scratch: `x` text retired, then `x` whole number retired; both listed (phase 4 says so); the purge dropped the text one. Walk: two rows named `x`, each with its own button, sending the same request. "Bring back" is `TAB-06` as well. Two retired tables of one name have the same gap.
- **Fix:** the catalogue row's ID in the listing and in the purge; a name alone is refused when it means two. Test first: the one chosen goes.
- **Size:** S. **Milestone:** M2

### TAB-08 A retired table's rows are still deleted, and still block deletes, through its references
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `apply:953` keeps the table's foreign keys. `retire_column` (`apply:345`) drops them.
- **Evidence:** scratch: with `cascade`, deleting the row pointed to emptied the retired table ("Its rows are kept"). With `restrict`, the delete is refused with "Another row still refers to this one", a row no one can see or change.
- **Fix:** drop the keys on retire; put them back on return, not validated where a row dangles (as TAB-23). Siblings: `restrict` message names the table. Test first: both cases.
- **Size:** M. **Milestone:** M2

### TAB-09 A file that a row still names is deleted by the retention pass
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `cp/kernel/data/files.ts:85-107`: only a change of a row takes a note away, an insert does not; `cp/kernel/retention.ts:262-288` looks at notes, never at rows.
- **Evidence:** scratch: (a) file replaced in row A, then row B inserted naming it; (b) rows C and D name one file and C lets go. Notes aged, `pruneOnce`: both files 404 while B and D name them.
- **Fix:** before deleting, look for the ID in every file column of the workspace (the catalogue lists them, dedicated databases too); clear notes on insert. Test first: (a) and (b). With DAT-10 and Q4.
- **Size:** M. **Milestone:** M2

### TAB-10 Rows checked on one page or filter are deleted from another
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `Data:181` (`checked` is cleared only by a delete); `Grid:418,463` compare sizes, not members.
- **Evidence:** walk: 50 checked, Next, filter to 1 row: "50 rows checked", and Delete asks "Delete these 50 rows?". Over 1,000 is refused by the API.
- **Fix:** clear on page, sort or filter change, as the other lists do; the heading box is checked when every shown key is. Siblings: `kit/ListCollection`. Test first: filter, then no toolbar.
- **Size:** S. **Milestone:** M2

### TAB-11 Undoing a renamed choice leaves the rows with the new spelling, as a value no longer offered
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `Data:1747-1757`: `restoring` names the old spelling for renamed columns, not for values.
- **Evidence:** walk: `open` renamed to `todo`, Undo: the row holds `todo`, values `[open]`, retired `[todo]`.
- **Fix:** the same for values (`renamedFrom` the newer spelling). Siblings: redo. Test first: the body Undo sends.
- **Size:** S. **Milestone:** M2

### TAB-12 Undo in a definition takes back what someone else changed since
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `Data:1742-1775`: PUTs the whole earlier definition; the resource's `version` is never sent or asked for. Ordinary changes read and write with the same gap, for milliseconds.
- **Evidence:** walk: I describe the table, someone adds a column, I Undo: their column is retired.
- **Fix:** send the version read and answer 409 (with BLD-01's shape); Undo then clears and says why. Test first: 409 and the column stays.
- **Size:** M. **Milestone:** M2

## Broken

### TAB-13 A saved view of rows loses its filters a third of a second after it is chosen
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `Data:168-176`: `typed` is read from the address once, and its effect writes it back when the address changes.
- **Evidence:** walk as a member: view "ones" applied: `?filter=…` then nothing, 70 rows, box empty.
- **Fix:** take `typed` from the address when it changes from elsewhere (one shared hook for a debounced URL filter). Siblings: other debounced boxes tied to the address. Test first: apply, wait 400 ms, still filtered.
- **Size:** S. **Milestone:** M6

### TAB-14 Retiring a table that another refers to is allowed, and then no deploy to the workspace succeeds
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `cp/kernel/kinds.ts:243` (no check); `deploy.ts:612` insists at the end of every deploy.
- **Evidence:** scratch: 204, then an unrelated bundle: 400 'The table "pr" refers to a table that does not exist'. Saving `pr` alone is accepted.
- **Fix:** refuse the delete, naming the referring columns (Q3). Siblings: the final check on a single save too. Test first: 409.
- **Size:** S. **Milestone:** M6

### TAB-15 A definition that Postgres refuses answers 500
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `T:defaultFits` (`packages/manifest/src/table.ts:83`) takes any text for date, timestamp and uuid; `apply:358`, `apply:331`; `cp/problem.ts:74` knows four codes.
- **Evidence:** scratch, 500 each: a date or timestamp default of "soon"; a NUL in a text or json default; widening a column the table's policy names (uuid or whole number to text), even when the same save drops the policy. 400 "A value is malformed." with no column: a uuid default of "nope". 409 "That already exists.": a unique column with a default added to two rows.
- **Fix:** check dates, times, UUIDs and NUL in `defaultFits`; drop the policy before a widen and set it after; refuse unique with a default on a table with rows, in words. Test first: each, 400 with a path.
- **Size:** M. **Milestone:** M6

### TAB-16 Values that Postgres cannot hold answer 500
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `rows:translate` (no 22021, 22P05, 54000, 08P01), `rows:362` (years), `rows:398` (a source's `infinity`).
- **Evidence:** scratch, 500 each: a NUL in text, in json, and in a filter; timestamp years 200000 and -200000; long text in a unique or indexed column; 1,000 rows of 100 columns (over 65,535 values; 600 rows pass, the limit says 1,000); a source row with `infinity`.
- **Fix:** refuse NUL and out-of-range years in `toDatabase`; translate the rest; insert in chunks in the one transaction. Siblings: sources, worker, forms, all through `rows`. Test first: 400 with the column.
- **Size:** M. **Milestone:** M6

### TAB-17 Sorting by a list column stops at "The cursor is not valid" when a page ends on a retired value
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `rows:600-622` checks the cursor's value against the values now offered.
- **Evidence:** scratch: 400 on page 2 for `enum` and `enum_list`; the CSV export breaks in the middle the same way.
- **Fix:** read the cursor's value as text, as filters do (`rows:513`). With TAB-03. Test first: page 2 of retired values.
- **Size:** S. **Milestone:** M2

### TAB-18 Create table offers One or Several of a list and cannot make either
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `Data:1219` offers every type but reference; `Data:1225` sends no values.
- **Evidence:** walk: "The table's definition is not valid.", with no field or reason (the create dialog drops `errors`).
- **Fix:** the Values field of Add column, shared; show the first field's message in the create dialog, as `change` does. Test first: the body sent has values.
- **Size:** S. **Milestone:** M6

### TAB-19 Renaming or retiring a column that stands for a row, or is indexed, is refused
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `Data:1888-1905` follows `policy` only; Retire (`Data:1919`) follows nothing.
- **Evidence:** walk: 'there is no column "a"'. Scratch: the same for `indexes`, and for Retire of the display column (an index cannot be undone in the console at all).
- **Fix:** one function that moves or removes a column everywhere in the body (display, indexes, policy). Retire of a policy's column says which rule. Test first: the body after each.
- **Size:** S. **Milestone:** M6

### TAB-20 A filter that cannot be read shows every row, exports every row, and its message stays
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `Data:193-205` (`filter` is left out when any part throws, the good parts too); `filterError` is set while drawing and cleared only by typing.
- **Evidence:** walk: "abc" in a number column: "Enter a number.", 70 rows "of 70", CSV link with no filter. Then "5": 1 row "that match", with the message still shown.
- **Fix:** work the error out from the text (no state), say it under its box, and ask for nothing (and disable CSV) while there is one. Test first: no request, no stale message.
- **Size:** S. **Milestone:** M6

### TAB-21 The row picker turns into an ID box when the display column is not text
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `Data:644` always asks `contains`; `rows:516` refuses it for other types; any error shows the ID box (`Data:668`).
- **Evidence:** walk: display is a whole number (allowed in the definition); typing "1" replaced the picker by a text box "The ID of a row of codes".
- **Fix:** `contains` for text, else `eq` (nothing while it does not parse), else no search; a failed search keeps the picker. Siblings: the app form's picker. Test first: the filter sent by type.
- **Size:** S. **Milestone:** M6

### TAB-22 A CSV export that is refused starts as a good file and breaks
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `rd:849` `rows-export`: the heading is sent before the first page is read.
- **Evidence:** scratch over HTTP: `?sort=nope` is 200, then the connection ends. By code, a slow query (422) does the same.
- **Fix:** read the first page before answering. Test first: 400.
- **Size:** S. **Milestone:** M6

### TAB-23 A reference column cannot come back once a row it held has gone, so a rollback is refused
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `apply:833`: the key is validated. Phase 4 says going back is always possible (`required` is put back leniently, `apply:430`).
- **Evidence:** scratch: 409 "It refers to something that does not exist, or is still referred to.", with no table or column. Pointing a column with values at another table answers the same.
- **Fix:** on return, `not valid`, as `required` does; when retargeted, refuse naming the column and how many rows. Test first: rollback after a delete.
- **Size:** M. **Milestone:** M2

### TAB-24 A retired value of a several-of-a-list column cannot be filtered for, or kept when the list is edited
- **Outcome:** reproduced (filter); confirmed by code (edit)
- **Severity:** broken
- **Where:** `rows:502-508`, `rows:375-386`; `Data` `MultiSelectField` options leave it out. SDK `Filter` (`packages/sdk/src/tables.ts:8`) and the server's "Use eq, ne, …" (`rows:527`) lack `has`.
- **Evidence:** scratch: `eq` on a retired `enum` value is 200; `has` on a retired list value is 400 "is not one of the values". Writing the same retired value back is 400; the console sends the whole list, so adding one value to such a row is refused.
- **Fix:** `has` takes any text; a write may keep what the row holds (the retired list passed in `ColumnMeta`); add `has` to the SDK type and the message. Test first: both.
- **Size:** S. **Milestone:** M6 (SDK: M11)

### TAB-25 A renamed table's definition is not found at its old address
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `rd:396-420` does not look at aliases; `rows/*`, `column-values` and `aggregate` do (`enter`).
- **Evidence:** scratch: `GET tables/old-name` 404, `GET rows/old-name` 200. The docs say the old address leads to the new one; the console opens a table with this route.
- **Fix:** resolve the alias in one place for `tables/*` and `enter`, with `Deprecation`; the console goes to the new address. Test first: 200 and the header.
- **Size:** S. **Milestone:** M6

## Wrong

### TAB-26 Events of a script name a table's old path, and its totals count as a deletion
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/routes/worker.ts:962-975`: announces `body.table`, and every operation but find and get.
- **Evidence:** scratch: after a rename a script's insert says `old-name`, the API's says `new-name`, so a filter on the new name misses it. `aggregate` with a listener tries to publish `deleted` of "undefined" and logs an error each time (stopped only by the uuid column).
- **Fix:** `target.name`, and a list of the writing operations. Test first: both.
- **Size:** S. **Milestone:** M4

### TAB-27 Rows deleted or emptied by a reference's rule are not announced
- **Outcome:** owner decides (Q2); the fact is reproduced
- **Severity:** wrong
- **Where:** `rd:announceRows` names only the rows asked for.
- **Evidence:** scratch: deleting the parent of a `cascade` row gave one event, for the parent.
- **Size:** M (S to document). **Milestone:** M6

### TAB-28 One time is written three ways, and an impossible one is stored as another
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `Grid:showValue` (viewer's zone), `Data:1117` (Add row, UTC), `Data` `RowEditor` (plain text, stored text), `rows:362` (`Date.parse` in the server's zone).
- **Evidence:** walk: 12:00Z shows "6:00 AM" in the grid and the raw text in the inspector; "2026-06-01 09:00" typed there became 15:00Z, by the server's zone. Scratch: `2026-02-31T10:00:00Z` is stored as 3 March, "1" as 2001.
- **Fix:** one `DateField` in Add row, inspector and cell, in the zone chosen (Q1); the server takes only ISO 8601 with a zone and a date that exists. Siblings: filters, forms, defaults. Test first: server refusals.
- **Size:** M. **Milestone:** M6

### TAB-29 A retired column keeps filling with its default
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `apply:345` leaves the database default.
- **Evidence:** scratch: a row added after the retirement counts in "Still holds", and comes back with the default. With a unique column, two such rows would stop it coming back.
- **Fix:** drop the default on retire, keep it in the catalogue and set it on return. Test first: held is 0.
- **Size:** S. **Milestone:** M6

### TAB-30 Columns are shown in alphabetical order, not as defined
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `rows:describeTable` and `apply:loadCatalog` order by `created_at, name` (one deploy, one time); the stored body's keys are reordered too.
- **Evidence:** scratch: t, j, d, a came back a, d, j, t in the grid, Add row, CSV and definition. `displayGuess` ("first text column") goes by this order.
- **Fix:** keep a position from the bundle or request when the column is made; existing ones keep today's. Test first: order.
- **Size:** M. **Milestone:** M6

### TAB-31 An empty choice, list or reference cell is edited by typing its raw value
- **Outcome:** reproduced (choice)
- **Severity:** rough
- **Where:** `Data:435-470` (`cell` gives nothing for an empty value) and `Grid` takes that as editable; a filled one opens the row.
- **Evidence:** walk: double-click on an empty choice cell opens a text box. A yes/no cell cannot be emptied again.
- **Fix:** editability by type, not by what `cell` returned; those types open the row. Test first: Enter on an empty choice opens the row.
- **Size:** S. **Milestone:** M6

### TAB-32 A source's whole numbers over 2^53 are shown as other numbers
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `rows:400`, `cp/kernel/data/sources.ts:platformType` (bigint, numeric). `rows:keyset` pages `numeric` by the rounded value (confirmed by code).
- **Evidence:** scratch: keys ...993 and ...992 both come as ...992; the row cannot be opened, changed or deleted (404; the wrong row is not touched). By code, `NaN` becomes empty.
- **Fix:** give such a value as text, or as a type that is only read; no keyset on `numeric`. Test first: two keys, two rows.
- **Size:** M. **Milestone:** M6

### TAB-33 Deleting several rows fails whole for one malformed ID, and a row with a json column named `rows` reads as a batch
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `rows:1025` (`keyValue` throws; the route says such keys come back in `missing`); `rd` POST `rows/*`.
- **Evidence:** scratch: `ids: ["nope"]` 404; `{ "rows": [1, 2] }` 400 "/0 must be an object".
- **Fix:** malformed keys go to `missing`; say in the route that a row with only `rows` is sent as `{ rows: [row] }`. Test first: the first.
- **Size:** S. **Milestone:** M6

### TAB-34 Reload loses "Previous", and a link to a row works only when its page is shown
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `Data:180` (`back` is not in the address), `Data:229` (`open` is looked for among the rows shown).
- **Evidence:** walk: page 3, reload, Previous goes to page 1; `?row=` of a row on page 2 opens nothing and says nothing.
- **Fix:** read the row by its ID when it is not shown, and say when it is gone; browser history for pages. Siblings: source rows. Test first: the row opens.
- **Size:** M. **Milestone:** M6

### TAB-35 Row and definition buttons are shown to people who may not use them
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `Data` throughout: the console asks for no permission (as DAT-24).
- **Evidence:** walk as a viewer: Add row, Add column, Rename, Retire, Save who sees rows, Create table; using one says "This needs the resource:write permission." A developer sees "Delete for good" and is refused (`table:write`).
- **Fix:** the shared answer for DAT-24 and its like, used here for `data:write`, `resource:write`, `table:write`. Test first: none for a viewer.
- **Size:** M. **Milestone:** M6

### TAB-36 Names of referenced rows come for the first five reference columns, even when others are shown
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `Data:208` takes five of all columns, not of `order`. A reference can be filtered only by a whole ID (400 otherwise), and the box does not say so.
- **Fix:** take from the columns shown; filter a reference with the picker. Test first: `expand` follows the columns.
- **Size:** S (picker M). **Milestone:** M6

### TAB-37 A failed row save says no field, and a failed Add row uploads its file again
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `Data:856` (a toast, no field; Add row marks fields), `Data:997-1004` (upload before insert; each try leaves a file no row names). Add row keeps old errors when opened again.
- **Fix:** one function from `fields` to messages for both; keep the uploaded ID between tries. Test first: the message under the field.
- **Size:** S. **Milestone:** M6

### TAB-38 Tables whose names differ only in marks share their saved views
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `Data:2675-2681`: `crm/orders` and `crm-orders` both become `rows-crm-orders`, and names are cut at 40.
- **Fix:** the table's resource ID in the list's name (it also follows a rename, which today loses the views). Test first: two names.
- **Size:** S. **Milestone:** M6

### TAB-39 The grid tells a screen reader row numbers past its own count
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `Grid:448,538`: the count is rows + 1, and the last row's index is rows + 2.
- **Fix:** count the filter row when there is one, or give the index as r + 1. Test first: last index equals the count.
- **Size:** S. **Milestone:** M6

### TAB-40 "See it as" offers the first 200 end users and shows raw values
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `Data:2199`, `RowRules.tsx:326` (`String(value)`: json is "[object Object]", references are IDs). With part P7.
- **Fix:** the paged member picker (`kit/paged.tsx`) and the grid's own cells. Test first: user 201 is found.
- **Size:** S. **Milestone:** M6

### TAB-41 Docs and comments that are not so
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `content/data/tables.md`: undo is not in row rules' own edits and they do not save as you type (**Save who sees rows**); "Exports … use the same rule" (CSV holds IDs); "stays in the row's history" (nothing shows it, Q5). `packages/manifest/src/kinds.ts:1063` and `generated/kinds/table.md`: values are "sorted" in their order (phase 18 decided by spelling; scratch: active, done, new). `table.ts` `RowCondition` and `sdk/src/index.ts`: a group's key is not named. `sdk/src/tables.ts`: the `reference` comment sits on `enum`.
- **Fix:** the words. **Size:** S. **Milestone:** M6 (SDK: M11)

## Not a bug

### TAB-42 Settled as they are
- **Outcome:** not a bug
- **E7, the total after add or delete:** every write marks the tenant's reads out of date (`apps/console/src/api.ts:157`). Walk: 70, 69, 70, 69 after batch delete, add and inspector delete.
- Viewer and developer read every row: phase 4's decision (`phase-4-data.md:47`). Row edits are not audited: `rd` says so. Deleting a row keeps its file: `phase-4-data.md:54` (but Q4). Rename saves a draft: `ResourceIdentity`'s dialog says so. Sorting a list column by spelling: `phase-18-data-insight.md:221`.
- Two values swapped or chained in one Values save: refused by `checkTable`, so rows are not merged. `ne` skips empty rows, as SQL does: document it. "empty" cannot be searched as text: document it. Bring back loses rules: document it, or P3.
- A row's explicit empty owner is refused (403), and one left out is given the writer.

## Missing parts

- **P1 Unique.** API: `unique` (`table.ts:22`). Add column and the column's actions; refusal names the rows' values. `resource:write`. S
- **P2 Required and default of an existing column.** API: `set_required`, `set_default` (`plan:46-58`). Column actions; default by the column's own control (Add column's too, today a text box for every type). `resource:write`. M
- **P3 Change type.** API: widenings and text to a list (`plan:108`). Column actions, offering only what can be. Also change the table a reference points to (`set_reference`). `resource:write`. M
- **P4 Indexes.** API: `indexes` (up to 20 of 1 to 5, system columns too). A section in Definition, linked from the 422 "add an index". SDK `indexes` cannot name `created_at` though the manifest can (`index.ts:977`). S console, S SDK
- **P5 Create table** with a description, several columns, a reference first column, and who sees rows. API takes the whole body. M
- **P6 Bring back a retired table.** The catalogue holds it whole; the screen says only "Deploying a definition with this name". A button on the retired table for one made in the console. `resource:write`. M
- **P7 See it as a group.** API: `asGroup` (`rd:566`), on rows and totals. Beside "See it as". `data_all:read`, `group:read`. S
- **P8 Filters.** API: `ne`, `in`, `is_null: false`, and/or, ranges (`rows:455-530`). The grid has one condition a column, ANDed; "not empty" cannot be said. M
- **P9 Sort by several columns.** API: `sort=a,-b`. Shift-click or a menu; URL state already a string. S
- **P10 Files of a workspace.** API: list, details, delete (`cp/routes/sources.ts:494-646`). No screen. After DAT-Q3. `file:read`, `file:write`. M
- **P11 Cell control in the grid** for choice, list, reference, date and time (the inspector has them). With TAB-31. M

11 parts: 4 S (P1, P4, P7, P9), 7 M (P2, P3, P5, P6, P8, P10, P11).

## Owner decides

- **Q1 Which zone is a time shown and typed in?** (a) the viewer's, with UTC on hover; (b) UTC; (c) the workspace's. Recommend (a), in grid, inspector and Add row alike.
- **Q2 Are rows changed by a reference's rule announced?** (a) yes, one event a row; (b) no, documented. Recommend (b) now: the database does it, and the number has no bound.
- **Q3 Retiring a table others refer to:** (a) refuse, naming them; (b) retire the referring columns too. Recommend (a).
- **Q4 Files of a deleted row:** (a) noted and kept for the audit period, as a replaced file is; (b) kept for ever, as phase 4 says; (c) deleted. Recommend (a), with DAT-Q3.
- **Q5 "The row's history" that keeps a replaced file:** (a) a list in the inspector with Download and Put back; (b) say "kept for N days" and nothing of history. Recommend (b) in this phase.
- **Q6 CSV import:** the API takes 1,000 rows at a time, and the console can only export. A new capability, so not listed above. Recommend a later phase.
