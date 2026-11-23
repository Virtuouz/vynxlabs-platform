# Lane dat2: fixed

Rows DAT-12 to DAT-23, DAT-25, DAT-31, DAT-34 (the part that is code and `docs/sdk-guide.md`). Decision D41. From `fixed/dat.md` "Found": the dry run and the git pull. No migration. No schema or contract change: one field is added to `GET queries` (`renamedFrom`) and one to `GET queries/schema` (`inSql`), both additions. `packages/manifest` has one new export, `parameterMisfit`.

Tests: `apps/control-plane/src/data-reading.test.ts` (new, DAT-12, 13, 16, 17, 19, 20, 21, 22, 25), `data-standing.test.ts` ("the dry run"), `git.test.ts` ("a pull brings SQL"), `packages/manifest/src/page.test.ts`, console `Queries.test.tsx` (new), `Data.test.tsx`, `Dashboards.test.tsx`, `Shell.test.tsx`, `kit/inspector/actionModel.test.ts`. Each was seen failing on the code before the change. Neighbors run and passing: queries, widget-data, data-access, dashboard-follow, page-approvals, group-rows, interfaces, page-actions, kernel/, the console's DraftBasis, enforce and inspector tests, `packages/manifest`, `packages/cli` examples.

## DAT-12 A widget over a source that cannot be reached answers 500
- `kernel/data/sources.ts` `onSource` (moved from `routes/sources.ts`, which now calls it): opens the source, runs, and turns refusals into `sourceFailure(translate(...))`. `kernel/data/query/inputs.ts` `external` runs inside it.
- Test: "DAT-12 ... answers as the rows route does": 502 `source_unreachable`, same detail.
- Siblings: the six rows and tables routes (already used it), `routes/worker.ts:994` (already wrapped by hand, same words), `checkSource` (own catch). The health check and rows routes share one function now.
- A person sees: a dashboard widget over a source that is down says the source could not be reached, not "internal error".

## DAT-13 A source's health stays "reached" after it is changed, and a check of nothing is kept
- `kernel/data/health.ts` `forgetHealth` takes the kind. `routes/sources.ts`: called on rebind and on unbind. `POST data-source-checks/*` is 404 for a path that is not bound, and writes nothing.
- Test: "DAT-13 ... is forgotten when the source is changed or unbound", "is not kept for a path that is not bound".
- Siblings: connections already forgot theirs (`routes/execution.ts`).

## DAT-14 A typed value that does not fit its parameter is sent as something else
- `apps/console/src/screens/Queries.tsx` `readTyped` reads a value with `parameterMisfit` (`packages/manifest/src/kinds.ts`, the server's own words, moved from `routes/queries.ts`). A value that does not fit is said on its field ("Must be a whole number.") as it is typed, and Run sends nothing. Yes/no is a select, a date is a date field.
- Test: `Queries.test.tsx` "a word for a whole number is said on its field, and nothing is run".
- Siblings: `routes/queries.ts` and widgets use the same `readParameters` (DAT-17). SQL in a dashboard widget has no typed parameters.
- Screens to walk: Data > Queries, open a saved query with an integer, a yes/no and a date parameter. States: field error, then fixed. Keyboard: the select and date field are native. Copy: "Must be ...".

## DAT-15 Parameters are counted by a regular expression that misreads SQL
- `apps/console/src/kit/sqlParameters.ts` `parametersIn`: one scan over strings, quoted names, `--` and nested `/* */` comments and dollar quotes, capped at 20.
- Test: `Queries.test.tsx` "an apostrophe in a comment ...", "a dollar amount in a comment or a string ...". The old code ran out of memory on `"$5000000"` (five million fields).
- Siblings: none (the widget inspector does not scan).

## DAT-16 Days and months of a timestamp are the database's, not UTC
- `kernel/data/rows.ts` `withData` sets `TimeZone` to UTC for the transaction; `packages/db/src/external.ts` sets it on a source's connections.
- Test: "DAT-16 ... a workspace table's days are UTC whatever the database's zone" (failed: a row at 02:00Z on 1 March counted in February). The source test passed before the change (the filter's text is typed by the driver), and stays as a guard.
- Siblings: every read of workspace data goes through `withData`; `visual.ts` day buckets with a `zone` are unchanged.

## DAT-17 A widget ignores a saved query's `required` and its parameter types
- `kernel/data/query/parameters.ts` `readParameters`, used by `routes/queries.ts` (saved) and `kernel/data/query/widget.ts`. A widget with no value for a required parameter answers 400 "Choose <label>."; a value that does not fit names the parameter ("must be a whole number"); a name the query lacks is refused.
- Test: "DAT-17 ..." (3 tests).
- Siblings: a query read by a flow or script (`ctx.query`) was not looked at; a page action with a query was not.

## DAT-18 "Show the rows behind" is offered, saved and then refused for a query or SQL
- `apps/console/src/kit/inspector/model.ts` `readsTable`, used by `actionContext` (so `stepKindsFor` stops offering the step). `packages/manifest/src/page.ts` `checkAction`: an issue "shows the rows behind a figure, and this widget reads a saved query or SQL" for a dashboard or interface (a draft keeps it, a deploy refuses).
- Tests: `actionModel.test.ts` "the rows behind a figure are offered for a table ..."; `page.test.ts` "the rows behind a figure are asked for only of a widget that reads a table". Fernhill (`packages/cli examples.test`) still builds.
- Siblings: forms' `config` actions are not widgets with rows and are unchanged.

## DAT-19 A list over a source's table pages past its limit
- `kernel/data/query/inputs.ts` `external`: the page asked for is cut to the list's `limit` minus the offset, and no `next` is given at the limit.
- Test: "DAT-19 ... has no next page past its own limit".

## DAT-20 A table whose path is over 63 bytes is offered, and cannot be queried or put on a page
- `kernel/data/query/view-name.ts` `viewName`: a short name from the path's hash for a long one. `views.ts` makes the view under it, `visual.ts` reads it, `run.ts` `checkFor` maps names back to paths for permissions and the "read" list. SQL a person writes cannot name such a path (Postgres cuts it), so `GET queries/schema` says `inSql: false` and the SQL screen leaves it out; the widget picker still offers it.
- Test: "DAT-20 ... can be put on a page", "is offered to a page, and said to be one SQL cannot name".
- Left out: a note on the table's own page saying why it is not in SQL (the Tables screen is the tab lane's).

## DAT-21 A source's table with a space, dash or other mark in its name is listed and cannot be opened
- `routes/sources.ts` `TableName`: any name of 1 to 63 bytes (it is looked up in the source's list before use). `Data.tsx` `SourceView` encodes the name in the address.
- Test: "DAT-21 ..." and `Data.test.tsx` "DAT-23, DAT-21 ...".
- Siblings: `visual.table` keeps its path pattern, so such a table stays off pages (as the row says).

## DAT-22 Columns of a SQL result can change order
- `kernel/data/query/run.ts`: rows are read as JSON text (`row_to_json(...)::text`) and split by `readColumns`, which keeps order and same-named columns, and keeps a whole number over 2^53 as text. With no rows a second statement (a left join on false) gives the column names.
- Tests: "DAT-22" (3 tests). Also checked: queries, widget-data and group-rows suites.
- Siblings: `queries/saved`, widgets and `ctx.query` run through `runQuery`, so share it.

## DAT-23 The no-primary-key note says rows can be added, and nothing adds them
- `Data.tsx`: `RowsBrowser` takes `canAdd`; a source's table with no key now offers Add row, and the note says "rows can be added but not changed or deleted".
- Test: `Data.test.tsx` "an external source's tables are browsed ..." (note and button), "DAT-23, DAT-21 ...".
- Screens to walk: Data > Data sources > a source > a table with no key: Add row, Escape closes it, a reload.

## DAT-25 A renamed, undeployed query is listed twice
- `routes/queries.ts` `GET queries`: a draft matches its resource by key; one row at the new path with `draft: "changed"` and `renamedFrom`.
- Test: "DAT-25 ... is listed once, at its new path".
- Siblings: `routes/dashboards.ts` and other lists made from `resource` and `resource_draft` were not changed. The console's Queries list does not yet show `renamedFrom`.

## DAT-31 F1 on a viewed dashboard opens the editor's help
- `nav.ts`: a dashboard's address has its section's help; `DashboardView` says `data-dashboards-editor` only while it is edited (`useHelpTopic`).
- Tests: `Shell.test.tsx` (address), `Dashboards.test.tsx` "F1 on a dashboard that is looked at ...".
- Left out: the dashboard address is still an "editor" for layout while only viewing (`EDITORS` also drives the edge-to-edge layout), which is the viewer's choice of the shell lane.

## DAT-34 Docs that say what is not so
- Done: `docs/sdk-guide.md` says same-named columns are kept, a number past 2^53 comes back as text, a table over 63 bytes is not for SQL, and what `sql:read` asks (D25).
- Left out, for phase 31's pages: `dashboard-builder.md`, `data-sources.md`, `queries.md`, and the YAML of versions 1 and 2 in `docs/sdk-guide.md:192-230`.
- Lines for `packages/docs/content`: queries.md: "A parameter has a type; a value that does not fit is said on its field. A column keeps its place and its name when two have the same name. A table whose path is over 63 bytes can be put on a page and is not written in SQL." data-sources.md: "A new source starts with the connection encrypted (certificate checked); choose No for a private authority." dashboards: "Show the rows behind is for widgets that read a table."

## D41 "Encrypt the connection" starts at Yes
- `Data.tsx` `SOURCE_FIELDS`: Yes is first and `initial`, with a hint about private authorities. Test: `Data.test.tsx` "D41 ...". Change keeps the source's own value.
- Left out: the CLI and a manifest-declared source do not bind one; no change there.

## Found (from `fixed/dat.md`): the dry run and the git pull use the same standing as a save
- `routes/authoring.ts` `GET changes/preview` calls `requireStanding` with the drafts a deploy would take; a refusal is `possible: false` with the 403's detail.
- `kernel/git.ts` `pull` takes `standing`, asked before anything is deployed, of the dashboards, interfaces and queries the branch changes; `routes/git.ts` passes `requireStanding(... deploying)`. A pull is 403 for someone without `sql:read` bringing new SQL.
- Tests: `data-standing.test.ts` "the dry run of a deploy ...", `git.test.ts` "a pull brings SQL into the workspace only for someone who may write it".
- Shared files another lane may touch: `routes/authoring.ts` (preview), `kernel/git.ts`, `routes/git.ts`, `routes/sources.ts`, `screens/Data.tsx`, `screens/Queries.tsx`, `kit/inspector/actionControls.tsx`.

## Polish gate (screens: Queries, Data sources, a source's table, Dashboards view)
States: a parameter field with an error; a source down on a widget (502 text); a key-less table with Add row. Lifecycle: type a wrong value, fix it, run. Keyboard: native select and date field; Add row dialog as before. Copy: above. Not walked in a browser (no server allowed in this lane): walk Queries at 1440, 768 and 390 px in light and dark, then Data > source > keyless table, and F1 on a dashboard in both modes.

## Found
- The Queries list does not show `renamedFrom` or a title (DAT-30).
