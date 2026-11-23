# Fixed: lane t4-data (queries, dashboards, tables; tier 4)

No migration. No contract file changed: two routes gained an answer field (`GET queries/schema` `maySave`, `GET dashboards` `mayCreate`, and `problems` on a member dashboard), all optional to an older console. Walks were not run in a browser; the tests stand in. Screens to walk, at 1440, 768 and 390 px, light and dark, keyboard, reload: Dashboards list as a viewer (no New dashboard, the words in the empty state), as a maker (New dashboard with 101 characters pasted: the field says it and keeps the text); a dashboard's Share sheet as a member without `group:read` (the words), with groups, with none; a dashboard over `nowhere/leads` (the notice above it); a dashboard on a 1 minute refresh in a hidden tab, then shown; Queries as a viewer, in a production workspace, on a repository query, and with `?query=` of one that is not there; Data > a table with rules > See it as (type to find user 201, a json column); any Grid with filters, with a screen reader (row numbers).

Polish gate, for each: states (loading, none, refused, failed) are in the words below; lifecycle unchanged; keyboard is the field's own (Share's "Try again" is a button); copy is plain.

## DAT-24 Save and New dashboard offered to people who may not use them
- **Tests:** `Dashboards.test.tsx` "someone who may not make dashboards is not offered New dashboard"; `Queries.test.tsx` three in "what the Queries screen offers" (no `resource:write`, production, repository query); `queries.test.ts` "it says whether the caller may keep a query"; `data-standing.test.ts` "the list says whether the caller may make a dashboard". The server pair was written with the fix.
- **Changed:** `routes/queries.ts` schema `maySave`; `routes/dashboards.ts` list `mayCreate`; `Queries.tsx` `mayKeep` (disables Save as, says why; `save()` does nothing for an empty text, so Mod+S no longer asks a name for nothing; the take-over notice for `ownership: code`); `Tenant.tsx` passes `editable` (dev workspace); `Dashboards.tsx` hides New dashboard and says what it takes.
- **Siblings, not changed:** Connect database, Change, Unbind, Add row for a viewer (TAB-35 owns the Data screen); the Name and path and Remove draft buttons of Queries are still offered (`ResourceIdentity`, `RemoveDraftButton`).

## DAT-26 `?query=` of one that is not there
- **Test:** `Queries.test.tsx` "an address that names no query says so". **Changed:** `Queries.tsx` `gone`: "There is no query at X." and New query (clears the address). A query just saved or renamed is not "gone" (`savedAs`).

## DAT-27 A dashboard reads on a timer in a hidden tab
- **Test:** `Dashboards.test.tsx` "does not read on its timer while the tab is hidden" (failed with the hidden check off). **Changed:** `kit/every.ts` `useEvery` (waits while hidden, once on return if one was due), used by `DashboardView`.
- **Other timers that read, not changed:** `Runs.tsx:313` (every 5 s), `Execution.tsx:548`, `Environments.tsx:443`, `tasks.ts:42`, `Authoring.tsx:1484`. `useLoad({every})` already stops in a background tab (react-query).

## DAT-28 Figures over a source's table say the table is not there
- **Tests:** `data-standing.test.ts` "figures over a source's table are refused in the source's words" and "a member's dashboard over a table that is not there is kept, and its answer says so" (both failed before). **Changed:** `kernel/data/query/inputs.ts` `inSource` (shared with `external`): a summary over a source's table says "Rows of a data source's table can be listed, not totalled."; `kernel/pages.ts` `unknownTables`; `routes/dashboards.ts` `problems` on a member dashboard; `DashboardView` shows them as a notice (kept, not refused).

## DAT-29 Pages of a keyless source table
- **Test:** `data-access.test.ts` "pages of a table with no key are in a fixed order" (failed before: heap order). **Changed:** `kernel/data/rows.ts` `findRows`: with no key, every column breaks the tie (a type with no order of its own as text). Applies to every route that uses `findRows`; tables of the workspace always have a key.

## DAT-30 (already fixed by t3-data)
- A title and `renamedFrom` are in the list (`queries.test.ts`, `Queries.test.tsx` "the list of saved queries (DAT-30)"). My own version was dropped in the merge.

## DAT-32 Share says what it leaves out
- **Test:** `Dashboards.test.tsx` "the groups a dashboard can be shown to say why they are not listed". **Changed:** `Dashboards.tsx` `SharedWith`: refused (403) says `group:read` and keeps who it is shown to; another failure says so with Try again; loading and none are said. The `limit=200` is dropped: `GET groups` has no limit (it answers every group), so "200 or more" was not so; the kit's picker with search was not needed.

## DAT-33, D52 Names over 100
- **Test:** `Dashboards.test.tsx` "a name over 100 letters is refused on the field". **Changed:** `Dialogs.tsx` `PromptOptions.maxLength` (shared; any prompt may use it); New dashboard uses `submit` and `NAME_MAX`. Rename is now "Name and description" (t3-data), which already had `maxLength` 100.

## TAB-39 Grid row numbers
- **Test:** `Grid.test.tsx` "a screen reader is told rows that end at the count" (failed before: 3,4 for a count of 3). **Changed:** `Grid.tsx` `aria-rowcount` and `aria-rowindex` count the filter row when drawn. Every Grid uses it.

## TAB-40 See it as
- **Test:** `RowRules.test.tsx` "See it as finds an end user past the first page by searching" (failed before: no option). **Changed:** `RowRules.tsx` `SeeItAs`: `usePagedList` with a search, the person chosen kept, values by `showValue`; `Data.tsx` passes `columns` and drops `?limit=200`; `kit/paged.tsx` `items` is one array until a page arrives (a picker's options were a new list each render, which reset the typed search).
- **Left out:** references show their IDs (rows come without names).

## Found
- `Groups.tsx` and `GiveAccess.tsx` use `ComboboxField` with `onSearch` over `usePagedList`; the same-list fix above is what keeps their typed search too.
