# Fixed: lane tab2 (tier 2)

Tests: `apps/control-plane/src/data-tab2.test.ts` (server, one test per row; seen failing before), `apps/control-plane/src/data-access.test.ts` (TAB-32 and the files test), `apps/control-plane/src/data.test.ts` (messages changed), `apps/console/src/Data.test.tsx` (the TAB-13 to TAB-38 tests at its end; all seen failing on the old code). No migration. Commits: `git log p29-tab2`.

## Server

- **TAB-14.** `routes/workspaces.ts` DELETE `resources/*` calls `refuseRetiringReferred` (`kernel/data/apply.ts`): 409 naming each table and column that refers to the table (D27). A deploy is not changed: it already refuses at its end. The same file's PUT of a table calls `refuseMissingTargets`: a table saved alone that refers to a table the workspace lacks is 400 at `/body/columns/<c>/references`. Test "TAB-14". Siblings: deploy (`deploy.ts:399`) deletes through `deleteResource`, which is not changed, so a bundle that drops both tables still works.
- **TAB-15.** `packages/manifest/src/table.ts` `defaultFits` takes only a day that exists, an ISO time (or, for old bundles, a day or a time with no zone that exists), an ID, and no NUL; `kernel/resources.ts` `nulAt` refuses a NUL anywhere in a resource body at its path; `apply.ts` `applyTable` lifts the table's policies before a widen and sets them again after, unless the save sets another; a unique column added with a default to a table of two or more rows is 409 naming the column. Test "TAB-15".
- **TAB-16.** `rows.ts`: `toDatabase` refuses NUL in text and json, and years outside 0001 to 9999 (with TAB-28); `translate` knows 22021, 22P05, 54000, 54001, 08P01; `insertRows` inserts in statements of at most 60,000 values in the caller's one transaction; `fromDatabase` shows a source's `infinity` as the word. Test "TAB-16" (NUL in text, json and a filter, two years, 20,000 characters in a unique column, 1,000 rows of 100 columns) and the TAB-32 test (source `infinity`).
- **TAB-17.** `rows.ts` cursor: an enum's value is read as text and a list's as a list of text, not checked against the values now offered. Test "TAB-17" (rows and a CSV).
- **TAB-22.** `routes/data.ts` `rows-export` reads the first page before it answers. Test "TAB-22": `?sort=nope` is 400.
- **TAB-23** (eased by tier 1's TAB-08). `reconcileReferences` refuses a column pointed at another table while rows hold IDs that are not in it, saying the column, the table and how many rows. Rollback of a deleted row's column already worked. Test "TAB-23".
- **TAB-24.** `has` takes any text; `ColumnMeta.retired`; a write may keep a value the list no longer offers when the row holds it (`updateRow` reads the row for that); SDK `Filter` has `has`; the message lists `has`. Test "TAB-24"; `data.test.ts` changed (`has` of "bag" is 200 and empty).
- **TAB-25.** `routes/data.ts` `currentName` is the one place that resolves an old table name, used by `enter` and by `tables/*`, which now answers with `volvel-resource-moved` and `deprecation`. Test "TAB-25".
- **TAB-26.** Already fixed by `02e840eb` (SCR-04): `routes/worker.ts` announces the table's path now and only insert, update and delete. Test: `data-access.test.ts` "an aggregate is no change, so it announces nothing and logs no error". A rename test was not written.
- **TAB-27** (D28). Not announced, and said so: `kinds.ts` onDelete description, the SDK `ReferenceOptions` comment and the two delete routes' descriptions. Test "TAB-27 and TAB-41" reads `schemas/kinds/table.v1.schema.json`.
- **TAB-28** (server half). `toDatabase`: a time is ISO 8601 with a zone and exists; a day exists. `kernel/pages/act.ts` turns a day given for a time column (`today`) into midnight UTC. `data.test.ts` messages changed. Test "TAB-28". A client that sent `"2026-06-01"` or `"2026-06-01 09:00"` for a time is now refused: say so in the changelog.
- **TAB-29.** `apply.ts`: retire drops the database default, restore sets it again from the catalogue; `restoreStructure` makes retired columns with none. Test "TAB-29".
- **TAB-32.** `rows.ts` `fromDatabase` gives a bigint or numeric a double cannot hold as the database's text, `keyParam` keeps such a key as text, and a `numeric` key is not paged by keyset. Test: `data-access.test.ts` "TAB-32 and TAB-16".
- **TAB-41.** `kinds.ts` (values are offered in their order, sorted by spelling), `table.ts` `RowCondition` and `sdk/src/index.ts` (a group's key), `sdk/src/tables.ts` (`reference` comment). `schemas/` emitted. Docs lines below.
- **Files of rows removed by a cascade or a table drop** (files lane's "not done"). `kernel/data/files.ts` `cascadedRows` reads, before a delete, the rows that `cascade` rules take at any depth and notes their files after; `filesOfPurge` and `noteDroppedFiles` do the same for "Delete for good" of a retired table or file column (`routes/data.ts`). Test: `data-access.test.ts` "a file of a row that a reference's rule deletes, or of a dropped table...".

## Console

- **TAB-13, TAB-20.** `kit/addressBox.ts` `useAddressBox` is the one hook for a box that reaches the address after a pause and follows it when something else changes it; Data (filters), Audit and Runs (search) use it. Data: filter errors are worked out from the address text each time (no state), shown with the column named, the box has `aria-invalid` (`Grid` `filterErrors`), nothing is requested and no rows or CSV link are shown while one stands (a disabled CSV button). Tests "TAB-13", "TAB-20".
- **TAB-18.** `VALUES_FIELD` and `newColumn` are shared by Create table and Add column; `ListScreen.tsx` `CreateDialog` also shows the first reason that belongs to no field. Test "TAB-18".
- **TAB-19.** `moveColumn` (exported) moves or retires a column in the display, the indexes and the rules; a column a rule needs cannot be retired, and the message says which rule. Test "TAB-19".
- **TAB-21.** `pickerFilter`: contains for text, eq for others that read, nothing otherwise; a failed search keeps the picker (the ID box is for a table that cannot be read). Tests "TAB-21" (two).
- **TAB-38.** `viewsOf(rowsPath, tableId)` names the list by the end of the table's ID. Views saved under the old name are not found. Test "TAB-38".
- **TAB-28** (console half, D21). `packages/ui/src/Grid.tsx`: `localWall`, `instantFromText`, `utcOf`; cells show the reader's time with the UTC instant as the title; a cell edited and the inspector show and read the reader's clock; Add row's date field is local, not UTC; the inspector has the date field. Test "TAB-28".

## Screens to walk, and the Polish gate

Tables (Create table with a list, with a bad value; a definition: Rename and Retire the display, an indexed and a policy column), table Rows (apply a saved view and wait; type a filter that cannot be read and fix it; CSV; a time column in the grid, hovered, edited, in the inspector and in Add row; the row picker of a column named by a number), Audit and Runs (type in search, press Back). At 1440, 768 and 390 px, light and dark, by keyboard, with a reload. Not walked here (no instance may run in this lane).
States: a filter that cannot be read says so and shows no rows. Lifecycle: views follow the table, not its name. Keyboard: unchanged (the same boxes and handlers). Copy: "total: Enter a number."; "Enter a date and time that exists, such as 2026-06-01 09:00."; "There is already..." unchanged.

## Lines for docs and the changelog (not edited here)

- `content/data/tables.md`: undo is not in row rules' own edits, and they do not save as you type (Save who sees rows); exports do not "use the same rule": a CSV holds IDs; "stays in the row's history" says nothing is shown of it (Q5); a time is shown and typed in your time zone, UTC on hover; a table that others refer to cannot be deleted, and the message names them; rows a reference's rule deletes or empties are not announced.
- CHANGELOG: the rows API takes a time only as ISO 8601 with a zone (`2026-06-01T09:00:00Z`) and a day only if it exists; `has` finds retired list values; a deleted table that others refer to is refused.

## Left, and Found

- Found: the app form's picker (`routes/widget-choices.ts:132`) searches the display column with `contains` whatever its type, so a table named by a number answers 400. Not fixed here (no test of an interface in this lane).
- Found: deploy's own check does not name which tables refer to a table a bundle drops (it says the referrer "refers to a table that does not exist"); the delete route now names them.
- Not done: the deploy's final reference check on a single save beyond `refuseMissingTargets`.
- The `docs-apps.test.ts` "product's own terms" test fails in this worktree; it does not touch tables and was not changed.
