# Fixed: lane tab

Tests: `apps/control-plane/src/data-tab.test.ts` (server, one test per row) and `apps/console/src/Data.test.tsx` (the four TAB-05, 06, 10, 11, 12 tests added at its end). Each was seen to fail before its fix. No migration.

## TAB-01 (commit a850626)
`kernel/data/apply.ts:587` `SOMEONE` guard, used by `owner`, `is` and `equals` clauses in `setPolicy`; `upgradePolicies` now also recompiles policies lacking it (found by `SOMEONE_STORED`). Test: "TAB-01". Siblings: `in` and `everyone` rules need no guard. A person sees: nothing new (a visitor no longer sees rows with an empty owner).

## TAB-03 (a850626)
`kernel/data/rows.ts` `findRows`: the cursor carries the sorted time as the database wrote it (`SORT_TEXT`), and time filters (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`) treat a time as its whole millisecond (`compareTime`). Routes, CSV export (uses `findRows`) and scripts' `find` (offset paging, same function) share it. Test: "TAB-03" (120 rows in one statement and 120 within a millisecond, both sorts, rows, CSV, offset paging, `eq`). Siblings looked at: `sources.ts` and `inputs.ts` page by offset, and are not affected.

## TAB-04 (ef33c36)
`kernel/data/plan.ts` "former" lookup requires a retired table (a deploy retires what it removes first). Test "TAB-04". The console's own create is TAB-05.

## TAB-05, 06, 10, 11, 12 (last commit)
- TAB-05: `routes/workspaces.ts` PUT `resources/*` takes `create: true`, 409 `path_taken`; `Data.tsx` Create table sends it. Copy: `Something is already at "<name>". Choose another name, or change what is there.`
- TAB-06: `takenColumn` in `Data.tsx` for Rename (said on the dialog's field via the prompt's `submit`), Add column and Bring back. The server already refuses `renamedFrom` a column that is still declared (`packages/manifest/src/table.ts:217`).
- TAB-10: `Data.tsx` RowsBrowser: checks belong to page, sort and filter (`scope`); `packages/ui/src/Grid.tsx` heading box is checked when every shown row is. Only Data uses `checked`.
- TAB-11: `bodyToRestore` (exported) names the newer spelling as `renamedFrom` for choices as for columns.
- TAB-12: PUT `resources/*` takes `version`, 409 `draft_changed` (`kernel/resources.ts`); `change` and Undo/Redo send the version read or saved. Undo that is refused clears the history and says why. The shape matches `draft_changed` of authoring; BLD-01's lane may widen it.
Screens to walk: Tables (Create table with a used name), table Definition (Rename to a taken name, Add column, Bring back, Undo after a change from a second window), Rows (check, Next, filter; heading box). Polish gate: states: refusal shown on the field or banner; lifecycle: undo cleared when stale; keyboard: unchanged (Space/Enter use the same handlers); copy as above.

## TAB-07, TAB-08 (7a2fd1b)
- TAB-07: listings and table detail return `id`; `table-purges` takes `columnId` and `tableId`; a name that means two is 409. Console passes both. `kernel/data/apply.ts` `purgeRetired`.
- TAB-08: `retireTable` drops the keys of the retired table's reference columns; `reconcileReferences` puts them back when the table returns, `not valid` where a row dangles (partly TAB-23: a returning column or table with dangling rows no longer fails). Test "TAB-08" (cascade and restrict).

## Left, and Found
- Two retired tables of one name: the server and purge button take `tableId`, but the detail page is opened by name and shows the first. Not done.
- Found: the `tables/*` detail page of a retired table cannot say which of two same-named retired tables it is.
- Another lane's stash was popped by mistake into this worktree and undone (`git checkout HEAD -- apply.ts`); nothing of theirs remains here.
- Not walked in a browser (no instance run in this lane).
