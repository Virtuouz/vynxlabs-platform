# Findings: queries, data sources, dashboards, files

Slice inventory: [queries-sources-dashboards.md](../inventory/queries-sources-dashboards.md). Settled at `270e509` by scratch vitest files in the pinned tree: a test instance with two tenants, a second Postgres as a source and members with narrow roles, and the console's screens under happy-dom. The scratch files are removed. No browser walk was run. Paths: `cp` = `apps/control-plane/src`, `con` = `apps/console/src`.

## Security

### DAT-01 A widget reads a bound data source with `data:read` alone
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `cp/kernel/data/query/inputs.ts:534-551` (checks workspace `data:read`); saves that do not ask: `cp/routes/dashboards.ts:176-222`, `cp/routes/authoring.ts` (drafts, deploy), `cp/kernel/pages.ts:117`.
- **Evidence:** a member with `dashboard:*` and `data:read`: `source-rows` and `data-source-tables` answer 403; a dashboard of theirs over `<source>/<table>` is saved (200) and `widget-data` gives every row. The same with `interface:write` through `draft=1`, and for a viewer of a deployed resource dashboard. Nothing looks at what kind of principal asks, so an end user of a deployed app takes the same path. Phase 4 asks `data_source:read` for rows, and decision 0003 says a source has no row policy; S9:146 reads them "through the rows API by the same endpoint", whose own permission was not carried over.
- **Fix:** whoever puts a source's table on a page (member dashboard save, draft save, deploy) must hold `data_source:read`, checked in one helper beside `missingTables`; the reader by DAT-Q1. Siblings: draft reads (`locate.ts`), download, filter options. Test first: the requests above expect 403.
- **Size:** M. **Milestone:** M1

### DAT-02 SQL is written and run without `sql:read` through drafts and deploys
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `cp/routes/dashboards.ts:205` is the only save that asks; `cp/routes/authoring.ts:590` (drafts) and `:1034` (deploy) do not; nor `PUT resources/*`. The inventory's D is right that `docs/sdk-guide.md:220` claims a check that is not there.
- **Evidence:** a member with `resource:write` and no `sql:read`: `queries/run` 403, own dashboard with SQL 403, but `PUT drafts` of a dashboard with SQL 200 and its widget read with `draft=1` 200. With `deployment:write`: a SQL dashboard and a `query` deploy (201) and run (200). These runs are also not in the audit log. Each table's `data:read` and row policy still hold.
- **Fix:** `saveDraft` and console deploys ask `sql:read` when a dashboard widget holds `sql`, or a `query`'s text changed. Repository deploys stay as they are (DAT-Q2). Share the helper with `checked()` in dashboards. Siblings: `PUT resources/*`, `git` pull of console edits, restore of an earlier draft. Test first: draft save expects 403.
- **Size:** M. **Milestone:** M1

### DAT-03 "Change" keeps a stored password for a new host and sends it there
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `cp/kernel/data/sources.ts:52` (`password === undefined` keeps it whatever the config); `con/screens/Data.tsx:2417-2459` ("Leave the password empty to keep the stored one"), and "Connect database" over a bound source.
- **Evidence:** a source bound with a password, rebound to another host with none given, then Test: a listener at the new address received the stored password, in clear (encryption off). The console's Change with only Host edited sends exactly that body. `data_source:write` never sees a password, so this hands out one it could not read. `data-sources.md` states that the password stays, and phase 22 added Change; neither weighs a new host.
- **Fix:** when host, port or `user` differs, or `ssl` is turned off, `bindSource` refuses to keep a stored password (400 on `/password`: type it again). Siblings: connection bindings and the connection wizard (`bindConnection`), git repository URL, SSO issuer, mail: one shared rule. Test first: the PUT above expects 400.
- **Size:** M. **Milestone:** M1

### DAT-04 Query routes answer a stranger about tables and saved queries
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `cp/routes/queries.ts:200, 314-345, 483-530` (`access.custom`, and the standing is checked only after the query was compiled or its parameters were read).
- **Evidence:** a member of another tenant, with the IDs: `queries/schema` 200 (empty); `queries/visual` tells "no table", "no column" and 403 apart, so names can be probed; `queries/saved/<path>` names a missing parameter before 403, and 404 "The tenant was not found" for one that is not there. The same inside a tenant for a member with no `data:read`. No rows leak.
- **Fix:** give `writeVisual` a catalog of only the tables the caller may read (its own words already say "you may read here"), and for `saved` and `schema` check tenant standing before anything is read. Siblings: `inputs.ts` record paths are behind `locatePage` and are not affected. Test first: the stranger gets one answer for all.
- **Size:** S. **Milestone:** M1

### DAT-05 `file:read` and `file:write` reach every file of a workspace, whatever the rows' policy
- **Outcome:** owner decides (DAT-Q3); the facts are reproduced
- **Severity:** security
- **Where:** `cp/routes/sources.ts:494-646`; the permissions say "Download files" and "Upload files", and both may be held by an end user.
- **Evidence:** a member with only the two file permissions lists the workspace's files, reads one that only another person's row names, and deletes it (204). The permission's description does not say that it deletes.
- **Size:** M. **Milestone:** M1

## Data

### DAT-06 Opening a drafted query shows the deployed SQL, and Save replaces the draft
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `cp/routes/queries.ts:419-425` lists the deployed body ("The draft's own text is read from the draft": nothing reads it); `con/screens/Queries.tsx:199`, `:131` (no revision and no `create` for a saved query).
- **Evidence:** the list gives the deployed text with `draft: "changed"`; the screen never asks for `drafts/<path>`; Save sends no revision and the server answers 200, revision 2, with the first draft gone. A rename or removal draft is replaced the same way. With no draft the same window is open between two people (BLD-01).
- **Fix:** read the draft (body and revision) when one exists, show and save that, and say when it was changed elsewhere, as other editors do with `keep.reset(text, revision)`. The server side is BLD-01 (require a revision). Siblings: builder, `RemoveDraftButton`. Test first: a drafted query opens with its draft's text and Save sends its revision.
- **Size:** M. **Milestone:** M2

### DAT-07 Saving a query drops a parameter's `required`
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `con/screens/Queries.tsx:124-131`.
- **Evidence:** the body sent for `{ name, type, required: true, label }` has no `required`; a change to the SQL alone unlocks the parameter.
- **Fix:** send the known parameter as it is (spread), and rename only `$n`. Test first: as above.
- **Size:** S. **Milestone:** M2

### DAT-08 A discarded query draft stays on screen and the next Save brings it back
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `con/screens/Queries.tsx:343-352` (clears only a never-deployed draft); `cp/kernel/authoring.ts:248` (a revision for no draft is accepted).
- **Evidence:** edit, Save, Discard draft: the pill goes, the editor still shows the discarded text as if it were the query's. Save sends `revision: 3` and the server answers 200, making it a draft again.
- **Fix:** after a discard, `setText` and `keep.reset` with the deployed text. Server: a revision with no draft is 409 `draft_changed`. Siblings: FlowEditor, ScriptEditor, ResourceEditor after discard. Test first: as above.
- **Size:** S. **Milestone:** M2

### DAT-09 Two saves of one dashboard with the same revision are both accepted
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `cp/routes/dashboards.ts:376-398` (the revision is compared before the transaction, and the update has no `where revision`).
- **Evidence:** four PUTs at once with `revision: 1`: two answered 200 with revision 2, and one change was lost with no word.
- **Fix:** `.where("revision", "=", current.revision)` and 409 when no row is updated. Siblings: list any other table with a hand-made revision. Test first: as above, exactly one 200.
- **Size:** S. **Milestone:** M2

### DAT-10 Deleting a file leaves a row that names nothing
- **Outcome:** reproduced (what to do: DAT-Q3)
- **Severity:** data
- **Where:** `cp/routes/sources.ts:619-645`. Replaced files are kept for the row's history (phase 23); a direct delete looks at neither rows nor `row_file_history`.
- **Evidence:** DELETE 204, and the row still holds the file's ID.
- **Size:** S. **Milestone:** M2

### DAT-11 "Show the rows behind" a quarter covers a year
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/kernel/data/query/inputs.ts:174-181`.
- **Evidence:** Q1 counts 2, its rows behind are 4 (the whole year).
- **Fix:** a `quarter` branch (3 months), and an exhaustive switch over `VISUAL_BUCKETS`. Sibling: `con/kit/inspector` and `rows.ts` buckets have their own lists. Test first: each bucket's end.
- **Size:** S. **Milestone:** M2

## Broken or wrong

### DAT-12 A widget over a source that cannot be reached answers 500
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `cp/kernel/data/query/inputs.ts:559-617`: `openSource` and `findRows` without `translate` and `sourceFailure` (`cp/routes/sources.ts:64` has them).
- **Evidence:** `widget-data` 500 `internal_error`; the rows API gives 502 `source_unreachable` for the same source.
- **Fix:** move `onSource` to the kernel and use it in both; list `worker.ts` sources too. Test first: 502 with the same words.
- **Size:** S. **Milestone:** M6

### DAT-13 A source's health stays "reached" after it is changed, and a check of nothing is kept
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/routes/sources.ts:193-227, 238-262` (no `forgetHealth`, which is written for `connection` only, `cp/kernel/data/health.ts:101`); `checkSource` records any path.
- **Evidence:** changed to a dead host: still `ok: true`; unbound and bound again: the old answer; `data-source-checks/never/declared` 200 and a `health_check` row kept. Connections already forget theirs (`execution.ts:2570`).
- **Fix:** `forgetHealth` takes the kind; call it on rebind and unbind; 404 for a path that is not bound. Test first: health is null after a change.
- **Size:** S. **Milestone:** M6

### DAT-14 A typed value that does not fit its parameter is sent as something else
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `con/screens/Queries.tsx:70-76`.
- **Evidence:** "abc" for an integer is sent as `null` and the query runs; any other word for a boolean is `false`.
- **Fix:** say it on the field, with the words of `misfit` (`cp/routes/queries.ts:536`) moved to the manifest; give dates and yes/no their own fields. Test first: no request, and the field says why.
- **Size:** S. **Milestone:** M6

### DAT-15 Parameters are counted by a regular expression that misreads SQL
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `con/screens/Queries.tsx:79-89`.
- **Evidence:** an apostrophe in a `--` comment hides `$1` after it (0 found, so no field, and Run is refused); `/* costs $2024 */` draws 2,024 fields; `"$5000000"` asks for five million and locks the tab.
- **Fix:** one scanner of strings, quoted names, both comments and dollar quotes, capped at 20 (the saved limit). Sibling: SQL in a dashboard widget (`con/kit/inspector`). Test first: the three texts.
- **Size:** S. **Milestone:** M6

### DAT-16 Days and months of a timestamp are the database's, not UTC
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/kernel/data/rows.ts:203-233` (`withData` sets no time zone); `visual.ts` buckets and `::date` comparisons; `rows.ts` aggregates.
- **Evidence:** with the database's `timezone` at America/New_York, a row at 2026-03-01T02:00Z is counted in `2026-02-01`. `filters.ts` and `visual.ts` say days are UTC.
- **Fix:** `set_config('TimeZone','UTC', true)` in `withData`. Source rows: `options` in `external.ts`. Test first: as above.
- **Size:** S. **Milestone:** M6

### DAT-17 A widget ignores a saved query's `required` and its parameter types
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/kernel/data/query/widget.ts:270-282`.
- **Evidence:** a required parameter with no value: `queries/saved` 400 "a value is required"; the widget runs with null and gives 4 rows. "abc" for a number: 400 "A value does not fit its column." with nothing that names it. An unknown name in `values` is silently ignored.
- **Fix:** one function reads a saved query's parameters for both; the widget says "Choose …" when a required one has no value. Test first: the widget refuses as the route does.
- **Size:** S. **Milestone:** M6

### DAT-18 "Show the rows behind" is offered, saved and then refused for a query or SQL
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `con/kit/inspector/actionModel.ts:86-95` (looks at the event, not the source); `cp/kernel/data/query/inputs.ts:764`; `packages/manifest/src/page.ts:944` does not check it.
- **Evidence:** a chart on a saved query with the step saves (200); the click answers 400 "Only figures read from a table have rows behind them."
- **Fix:** offer it only for a table source, and an issue in `checkDashboard`/`checkInterface` (a draft is kept, a deploy is refused). Test first: `stepKindsFor` with a query source.
- **Size:** S. **Milestone:** M6

### DAT-19 A list over a source's table pages past its limit
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/kernel/data/query/inputs.ts:610-614`.
- **Evidence:** `limit: 3` gives 3 rows and a `next`, whose page is the 3 after. No total is sent either.
- **Fix:** no `next` past `visual.limit`. Test first: as above.
- **Size:** S. **Milestone:** M6

### DAT-20 A table whose path is over 63 bytes is offered, and cannot be queried or put on a page
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `cp/kernel/data/query/views.ts:16`; `queries/schema` (`cp/routes/queries.ts:277`) lists it; a path may be 255.
- **Evidence:** `schema` offers it; `run` and a table widget answer 400 "There is no table" with the name cut at 63.
- **Fix:** a view under a short name, mapped when the text is rewritten; failing that, leave it out of `schema` and say why on the table's page. Test first: a 75-letter path in a widget.
- **Size:** M. **Milestone:** M6

### DAT-21 A source's table with a space, dash or other mark in its name is listed and cannot be opened
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `cp/routes/sources.ts:45` (`TableName`); `sourceTables` lists all.
- **Evidence:** `order items` is listed; its rows answer 400 "must match pattern". The console's link also does not encode it (`con/screens/Data.tsx:2651`).
- **Fix:** accept any name of 1 to 63 bytes (it is looked up in the list before use) and encode it in the path. Sibling: `visual.table` PATH pattern, so it stays off pages. Test first: the rows are read.
- **Size:** S. **Milestone:** M6

### DAT-22 Columns of a SQL result can change order
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/kernel/data/query/run.ts:148, 160` (a JSON object's whole-number keys come first in JavaScript).
- **Evidence:** `select 'x' as name, 1 as "2025", 2 as "2024"` answers `2024, 2025, name`, so a chart takes a number as its first breakdown. Also: `9007199254740993` comes back as `…992`. Same-named columns collapse to the last one with no word (said in the code, not to the person).
- **Fix:** read the names from the statement's result description, rows as arrays (`json_build_array`), which also keeps same-named columns and gives the columns of an empty result. A whole number over 2^53 as text. Test first: the three queries.
- **Size:** M. **Milestone:** M6

### DAT-23 The no-primary-key note says rows can be added, and nothing adds them
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `con/screens/Data.tsx:215, 360, 2663`. The API takes it (`data-access.test.ts:338`).
- **Fix:** offer Add row when only the key is missing (missing part 6). Until then the note says "read". Test first: Add row on a table with no key.
- **Size:** S. **Milestone:** M6

### DAT-24 Save and New dashboard are offered to people who may not use them
- **Outcome:** reproduced (offered); the refusals are by code
- **Severity:** rough
- **Where:** `con/screens/Queries.tsx:356` (also production workspaces, and Mod+S on an empty query asks for a name); `con/screens/Dashboards.tsx:81-117`. `Interfaces` is told whether the workspace is dev (`con/screens/Tenant.tsx:565`); Queries is not.
- **Evidence:** no permission is read; Save is enabled without `resource:write`, without `sql:read`, and in production; the server's 403 comes after typing. A code-owned query also offers Save without saying it takes it over (POLISH-010, H12-49): `FlowEditor.tsx:1965` says it.
- **Fix:** pass the workspace type; add `may` to `queries/schema` and to the dashboards list; the take-over notice as in flows. Siblings: Connect database, Change, Unbind, Add row for a viewer.
- **Size:** M. **Milestone:** M6

### DAT-25 A renamed, undeployed query is listed twice
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `cp/routes/queries.ts:417-432` (matched by path, not key).
- **Evidence:** after a rename draft: `reports/q` with no draft, and `reports/renamed` as "Draft, never deployed". Discard on it says "One that was never deployed is gone", which is untrue.
- **Fix:** match by key, and one row with its new path and where it came from. Sibling: other lists made from `resource` and `resource_draft`. Test first: one row.
- **Size:** S. **Milestone:** M6

### DAT-26 `?query=` of one that is not there shows "A new query"
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `con/screens/Queries.tsx:108, 292`.
- **Fix:** say "There is no query at …", with New query. Test first: as above. **Size:** S. **Milestone:** M6

### DAT-27 A dashboard reads on a timer in a hidden tab
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `con/screens/Dashboards.tsx:233-237`; `dashboards.md` and `sdk-guide.md` say "while it is on show".
- **Evidence:** with the document hidden, a tick reads the widget again. No console code looks at visibility.
- **Fix:** a shared `useEvery` that waits while hidden and asks once on return if due; list the other `setInterval`s that read. Test first: no read while hidden. **Size:** S. **Milestone:** M6

### DAT-28 Figures over a source's table say the table is not there
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `cp/kernel/data/query/inputs.ts:824` (a summary never reaches `external`), so the words at `:555` are never shown; a member's dashboard with an unknown table is saved without a word (`cp/routes/dashboards.ts:176`).
- **Evidence:** a stat over `<source>/<table>` saves 200 and reads 400 "there is no table … you may read here".
- **Fix:** the refusal before `inputQuery`; `missingTables` as problems in the dashboard's answer (kept, not refused). **Size:** S. **Milestone:** M6

### DAT-29 Pages of a source's table with no key may repeat or skip rows
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `cp/kernel/data/rows.ts:575-618`: offset paging with no order when `key` is null.
- **Fix:** order by every orderable column when there is no key. **Size:** S. **Milestone:** M6

### DAT-30 A saved query's title is not in the Queries list
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `cp/routes/queries.ts:380-415` (no `title`); "Name and path" sets one.
- **Fix:** give and show `title`, with the path under it, as other lists. **Size:** S. **Milestone:** M6

### DAT-31 F1 on a viewed dashboard opens the editor's help
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `con/nav.ts:298`: `dashboards/.+` whatever `?edit` is. It is also treated as an editor while only viewing.
- **Fix:** `DashboardView` passes its own topic by mode. **Size:** S. **Milestone:** M6

### DAT-32 A member without `group:read`, or with over 200 groups, is not told what Share leaves out
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `con/screens/Dashboards.tsx:643-667` (an error, a load and none all draw nothing; `limit=200`).
- **Fix:** the kit's group picker with search; say when groups cannot be listed. **Size:** S. **Milestone:** M6

### DAT-33 Names of a dashboard over 100 letters are refused after the dialog closed
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `con/screens/Dashboards.tsx:66-80, 333-343` (no `submit`, no maximum), unlike "Keep it as a resource".
- **Fix:** `ask.prompt` with `submit`, so the refusal is on the field and what was typed stays. **Size:** S. **Milestone:** M6

### DAT-34 Docs that say what is not so
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where and what:**
  - `dashboard-builder.md`: "saved as a draft" (it saves live); title and description "in its settings" (Rename only); shared "from the dashboards screen"; the Phone and Tablet header, View as and restoring a draft (`Dashboards.tsx:443-476` passes no `frame` or `layout`); "Reset" (Clear); old step names; filters are in Display; Goal is missing.
  - `data-sources.md`: a reference column "is named" (a source's columns have no references); "reads" (it writes too).
  - `queries.md`: nothing on running, parameters or limits; a rename also drafts interfaces.
  - `docs/sdk-guide.md:192-230`: dashboard YAML of versions 1 and 2, where the only version registered is 3; `sql:read` at deploy (DAT-02).
- **Fix:** phase 31's pages. **Size:** S. **Milestone:** phase 31

## Not a bug

| Item | Why |
|---|---|
| E10, `MAX_SEARCH_COLUMNS` 12 against 10 | The schema's 10 is what is met first; 12 can never be reached. One constant is tidier |
| C, two people see different numbers | Decided (0003, phase 18) |
| C, a member's dashboard saves unfinished and a deploy refuses | Said at `dashboards.ts:187`. See DAT-28 for the unsaid part |
| C, an app's page refuses SQL | Decided (phase 25) |
| C, last-N includes today, filter days are UTC | Decided; DAT-16 is where it is untrue |
| C, rows behind only for a table | Decided; offering it is DAT-18 |
| B, dashboards have no schedule, publish cycle or public link | New capabilities |
| B, row changes in a source are not audited | Workspace rows are not either (`cp/routes/data.ts:779` says why) |
| B, Change closes the pool | Other replicas compare `updated_at` before use |
| B, `sources/<path>` has no topic of its own | It falls to the section's, which covers it |
| B, the limit of 20 dashboards | 23 made at once: held at 20 |
| B, private CAs are refused under TLS | Said nowhere, but a deliberate check; a page's job |

## Missing parts

1. **Data sources are not declared in the console.** `drafts/*` takes `data_source` (`packages/manifest/src/kinds.ts:1215`); `EDITED_KINDS` (`con/screens/ResourceEditor.tsx:36`) leaves it out, so "Connect database" has nothing to offer unless code declares one. Belongs: Data sources, New source, with description, Name and path, Remove. `resource:write`. M
2. **A resource dashboard cannot be changed, renamed or removed in the console**, and its draft is not listed (`cp/routes/dashboards.ts:133` reads deployed only; "Keep it" again is `path_taken`). Belongs: the same editor over `drafts/*`, with revision, Discard, Name and path, Remove; a code-owned one says it is taken over. `resource:write`, dev. L
3. **A query's description and its parameters' name, type, label, default and required** (`packages/manifest/src/kinds.ts:921-962`) have no controls. Belongs: Queries, a Parameters panel. `resource:write`. M
4. **Files have no screen** (`cp/routes/sources.ts:494-646`), and the list stops at 200 with no cursor. Belongs: Data, Files: list, upload, download, delete, what names it. `file:*`. CLI has none either. M
5. **A stored source password cannot be removed** (`password: null`, `cp/routes/sources.ts:186`). Belongs: Change. Sibling: who set it and when (`CredentialSet` is in the answer, shown for connections and git, not here). S
6. **Adding a row to a source's table with no key** (`cp/routes/sources.ts:381`). Belongs: RowsBrowser. `data_source:write`. S
7. **Running a saved query without `sql:read`** (`queries/saved/*` asks only `data:read`): Run is disabled for it (reproduced), though the screen says "by anyone who may read its tables". Belongs: Queries, Run of an unchanged saved query. S
8. **`limit` up to 10,000 on a run** (`cp/routes/queries.ts:119`): the screen always takes 1,000 and says only "cut short". S
9. **A dashboard's `description`** (`dashboardBodySchema`, `packages/manifest/src/page.ts`) has no field and is never shown. Belongs: Rename, and under the title. S
10. **A source's table in "Where it reads from"** (`inputs.ts:534` reads it, the menu does not offer it). Belongs: the picker, list and table only. After DAT-Q1. M
11. **An unbound source's own Connect** (the row has no action; only the header's picker). S

Totals: 11 (S 6, M 4, L 1).

## Owner decides

- **DAT-Q1 What must a reader hold to see a data source's rows on a page?** (a) `data_source:read`, so apps for end users need it made app-facing; (b) the author must hold `data_source:read` and the reader `data:read`; (c) `data:read` for both, as now, said plainly in the permission. Recommended: (b).
- **DAT-Q2 Does SQL in a repository deploy need `sql:read` of whoever deploys it?** (a) no, as code review is the gate, and fix the guide; (b) yes. Recommended: (a), with console drafts and console deploys asking (DAT-02).
- **DAT-Q3 Should files follow the rows that name them?** (a) list and delete need a stronger permission (`data_all:*`) and a reader gets a file through a row they may read, or one they uploaded, with a delete refused while a row names it; (b) keep, say "every file of the workspace", and make `file:*` not app-facing. Recommended: (a).
- **DAT-Q4 Should "Encrypt the connection" start at Yes?** (a) Yes, with certificate check (private CAs then fail until No is chosen); (b) No, as now, with a warning for a public host. Recommended: (a) for new sources.
