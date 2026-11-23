# Fixed: lane t2-walk-data (tiers 2b, 3 and 4)

Paths: `C/` = `apps/console/src/`, `S/` = `packages/screens/src/`, `P/` = `apps/control-plane/src/`. No migration. No contract changed (`pnpm emit:schemas` writes nothing new; `GET /tables/*` gained an optional `id` query). Every test below was seen failing on the code before its fix, except where said.

## WLK-07 (already done by walk1; verified)
Tests: `P/kernel/data/source-failure.test.ts` (no password says "No password is set"), `WLK-07` in `C/Data.test.tsx` (a changed host asks for the password and says the stored one will not go there). The health check goes through the same `sourceFailure`. Not looked at: the connections wizard (CFG-03).

## WLK-09a focus
New `C/kit/focus.ts` `keepPlace(opener)`: when the action is done, focus goes back to what opened it, else to the first control left in its list or section, else to the page heading. Used in the shared `RemoveButton` (`C/ListScreen.tsx`; purge of a table or column, every Remove with a confirmation), `C/kit/RemoveDraftButton.tsx` (Discard, Keep, Remove in Queries and the editors) and `C/screens/ResourceIdentity.tsx` (rename). Tests in `C/RemoveDraft.test.tsx`: "WLK-09a" (a row that goes leaves focus on the next one), the Queries discard and rename tests (focus not on the body). The discard-button test passes before the fix too: happy-dom does not blur a disabled button as a browser does. Siblings: every `RemoveButton` and `RemoveDraftButton` caller (Roles, Members, Groups, Branding, Environments, Execution, Instance, Account, OldPaths, Tenant, Data, Authoring, ResourceEditor, FlowEditor, Queries). Left out: Discard in the flow editor and Dialog-owned focus (WLK-17i is the shell lane's).

## WLK-09b
`C/screens/Data.tsx` Tables: the retired pill sits in a `shrink-0` wrapper and the name gives way ("Retir..."); a retired table says nothing of "Managed in" (its list cell is empty, its page leaves the sentence out): the server cannot know what a retired table was managed in (`routes/data.ts` falls back to `code`). Test "WLK-09b". "Created." for Add column was done by walk1 (`Data.test.tsx` "The column paid was added."). Not done: other `CreateDialog`s with no `done` still say "Created.".

## WLK-09c
`C/screens/Queries.tsx`: Discard of a new query replaces its history entry (Back no longer lands on `?query=` of a query that is gone); an address that names a query that is not there says so. `ResourceIdentity` takes `removing`, set by Queries, so "Name and path" is off on a removal draft with the reason. Tests "WLK-09c" (two) in `C/RemoveDraft.test.tsx`.

## WLK-09d, cfg2 found
`C/screens/Data.tsx`: Undo refused with `draft_changed` says "Someone else changed {table} after you opened it. This page shows what is saved now, so undo and redo start again from there." (test `TAB-12` changed to the server's real answer). New `SourceActions` (Test, Change, Unbind) shared by the list row and the page of a data source (`SourceView`), which had none; Unbind there returns to the list. In the list the buttons wrap with a `max-w` on a phone. Tests "cfg2" and "WLK-09d" (the wrap is a class test: layout is for the walk). States of the page buttons: not drawn until the bindings load, nor when they are refused.

## WLK-11a
`S/actions.tsx` `fillTitle`: with several rows, a custom title that named a field of one reads "Remove the invoice (2 chosen)?". Test in `S/row-actions.test.tsx` (the old "Remove?" one changed).

## WLK-11b (partly)
`P/kernel/input-words.ts`, used by `kernel/flows/engine.ts`: a flow that refuses its input says "The flow flows/strict refused its input. It needs why." Test in `P/page-actions.test.ts`. Not found: which two alerts the walk saw (a form shows its notice and a field's own message by design); the script's message is a contract other tests and clients read and is unchanged.

## WLK-11c
`S/actions.tsx`: the rows behind a number take the widget's `format` for the column the number was made of (`behindColumns`). Test "WLK-11" in `S/actions.test.tsx` (the table is a stub: it checks the config the table is given).

## WLK-11d
`C/kit/inspector/actionModel.ts` `addedAt`, used by `actionControls.tsx`: a message added by hand goes before a closing step. Test in `C/inspector-actions.test.tsx`. Only one place adds steps by hand.

## tab left
`P/routes/data.ts` `GET /tables/*?id=`; `C/screens/Data.tsx` links a retired table by its ID and `TableView` asks for it; list rows are keyed by ID. Test "TAB2: of two retired tables" in `P/data-tab2.test.ts` (the second table is made by SQL: no route makes one today). Siblings: Purge already sent `tableId`; other links to `/tables/<name>` are not retired ones.

## tab2 found
Picker: `P/routes/widget-choices.ts` searches a display column that is not text as written, over its first 1,000 rows (test in `P/widget-data.test.ts`, a `gadgets` table named by a number). Deploy: `P/kernel/data/apply.ts` names the table, the column and the table it refers to, and says what to do (test "TAB2: a deploy that drops a table a console table refers to" in `data-tab2.test.ts`). A bundle's own check already names both.

## files left
Already done by tab2 (`kernel/data/files.ts` `cascadedRows`, `filesOfPurge`); shown by `data-access.test.ts` "a file of a row that a reference's rule deletes, or of a dropped table...", which passes.

## Screens to walk, and the Polish gate
Data sources (list at 390: buttons wrap; the page: Test, Change, Unbind), Tables (retired rows, two retired of one name), a table's Definition (Undo after a change in a second window), Queries (Discard a new query, press Back; a removal draft; rename), a table purge, a confirmation of several rows with a custom title, a pivot's rows behind a money cell, the action editor (add a message after Close). At 1440, 768, 390, light and dark, by keyboard, with a reload. Not walked here (no instance may run in this lane).
States: Unbind on the page leaves for the list; the page's buttons wait for the bindings. Lifecycle: discard, purge, rename keep the keyboard's place. Keyboard: focus returns to the opener or the nearest control. Copy: "(2 chosen)", "It needs why.", "There is no saved query at ...", "Someone else changed ... This page shows what is saved now".

## Lines for docs and the changelog
- `GET /tables/{name}` takes `?id=` for one of two retired tables of a name. A flow started with input it refuses answers "The flow X refused its input. It needs why." A deploy's reference refusal names the tables.

## Found
- A retired table's `managedIn` is always `code` from the server (not kept when it retires); the console hides it. If it should show, the catalog must keep it.
- `CreateDialog`s with no `done` say "Created."
