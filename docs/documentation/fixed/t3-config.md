# Lane t3-config

## CFG-MP4 = REL-MP5: run limit in Workspace settings
- Test: `Environments.test.tsx` "a workspace's run limit is set from its settings, from 1 to 1000, saved with the others (CFG-MP4)". Failed before (no "Runs at once" field).
- Change: `apps/console/src/screens/Environments.tsx` `WorkspaceSettings` (Run limit section, `NumberField`, saved by the same SaveBar as name and zone; PATCH sends `concurrencyLimit`). Route already took 1 to 1000; unchanged.
- Siblings: the only workspace settings page is this one; `Tenant.tsx` has no such field (the row's "verify" resolved: it was not there).
- Seen: a "Run limit" section below Time zone; 0 or 2000 shows "A whole number from 1 to 1000." and blocks Save.
- Polish: states: loading (empty until the workspace loads), invalid (error text), saving (bar); keyboard: native number input; copy plain. Walk: Workspace settings at 390/768/1440, light/dark, reload shows the saved value.

## CFG-MP1: Unbind on a connection's page
- After the merge with the phase branch: cfg2 brought the same button in (`Configure.test.tsx` "WLK-cfg2: a connection's page can unbind it"); both changes were identical in `ObjectPages.tsx`, so one remains. My test stays as a second check that the confirmation names its users and the page ends "Not set up here".
- Test: `ObjectPages.test.tsx` "a bound connection's page has Unbind ... (CFG-MP1)". Failed before.
- Change: `apps/console/src/screens/ObjectPages.tsx` `ConnectionPage` uses the shared `RemoveButton` and `useReferences`, as the list does (`Execution.tsx` ~840).
- Siblings: the list in Execution.tsx and the database-source list in Data.tsx:2804 already unbind. Not on the page: Variables, secrets pages.
- Seen: Unbind button next to "Change where it points"; confirmation names what uses it; afterwards the page says "Not set up here".
- Polish: refused/failed shows the error toast (RemoveButton); keyboard via dialog. Walk: a bound connection's page at 390 px (actions wrap).

## Found
- `ObjectPages.test.tsx` REL-07 failed on the phase branch before the second merge; it passes after it.

## CFG-MP3: set a variable where it is
- Test: `Configure.test.tsx` "CFG-MP3: a variable is set where it is, on its row and on its page, prefilled and over several lines". Failed before (no Change button, no page action).
- Change: new shared `apps/console/src/screens/VariableSheet.tsx` (textarea, prefilled with the current value, shows the default, saving/failed states); `Execution.tsx` `Variables` row actions "Set"/"Change" (drafts new/removed get none) plus `Closing` sheet; `ObjectPages.tsx` `VariablePage` action "Change value"/"Set value".
- Siblings: the "Set variable" create form in the list still has a one-line Value (left: ListScreen fields have no multi-line kind; a person with a long value uses Change). Secrets page `ReplaceSecret` is another piece, not changed.
- Seen: each row has Set or Change; the page has a button; the sheet starts with what is stored and may hold several lines.
- Polish: states: saving disables Save, failure shown in the sheet; lifecycle: set, change, Use default (existing); keyboard: sheet focuses the field. Walk: Variables at 390 px (row actions wrap), page, reload.

## CFG-MP5 = DAT-MP5: remove a stored credential
- Tests: `Connections.test.tsx` "a stored credential is removed from the connection's sheet ... (CFG-MP5)"; `Data.test.tsx` "a data source's stored password is removed from its Change form ... (DAT-MP5)". Both failed before (no control).
- Change: shared `apps/console/src/kit/SecretField.tsx` gets `removed` and `onRemove` (Remove beside Replace; a "will be removed when you save" state with Keep the stored one). `ConnectionWizard.tsx` sends `credential: null`. `Data.tsx` `ChangeSource` adds a "Remove the stored password" checkbox when one is stored and sends `password: null`; typing a password and ticking it is refused in words. Routes unchanged (they already take null).
- Siblings looked at, left: `GroupMemberSheet.tsx` (member credential), `SingleSignOn.tsx` (client secret), `Git.tsx` (token): they use SecretField without `onRemove`, so no Remove appears. Their routes were not checked for null.
- Seen: a Remove button next to Replace on a connection's credential; a checkbox on the source's Change form.
- Polish: states: pending removal is shown and can be undone; keyboard: plain buttons; copy says what happens. Walk: Connections > Change on a bound http connection, Sources > Change, at 390 px.

## REL-MP3: repository fields
- Test: `Git.test.tsx` "REL-MP3: the repository form has the user name, the release and access branches, and a check ...". Failed before.
- Change: `apps/console/src/screens/Git.tsx` `RepositorySettings`: User name (write-only: the API does not return it, so it is sent only when typed), Release branch, Access branch (sent only when changed, empty sends null), "Check the connection" (POST `git-repository/check`), and "last reached ... ago" from `verifiedAt`. API unchanged.
- Siblings: the Release branch is read in `GitSync.tsx` `ReleaseBranch` (its empty state said "A release branch is set on the tenant's repository", which is now true); nothing else edits the repository.
- Left: the stored user name is not shown because the repository response has no `username`; adding it is a contract change not asked for.
- Polish: states: checking (loading button), ok, problem (danger notice); copy plain. Walk: Repository at 390 px (branches stack under 640 px), reload.

## REL-MP4: Git operations history and branches overview
- Test: `Git.test.tsx` "REL-MP4: Git sync lists the workspace's pushes and pulls and every branch of the tenant". Failed before.
- Change: `apps/console/src/screens/GitSync.tsx`: `GitHistory` (GET `git/operations`, last 50) and `GitBranches` (GET `/tenants/:t/git-branches`), in both the dev view and the production `ReleaseBranch` view, shown once a repository is connected. Routes unchanged.
- Siblings: `ReleaseBranch` reads the operations too for its own "last commit" line; two reads of one list (left, cheap).
- Seen: under Git sync, a History list (kind, status, commit, message, when) and a Branches list (workspace, branch, follows or release, state, error).
- Polish: states: loading text, empty ("Nothing has been pushed or pulled here yet."), error with retry. Walk: Git sync at 390 px (rows wrap), dev and production.

## REL-MP7: "Used by" for queries, sources (dashboards and docs: not possible, see Left)
- Tests: `apps/control-plane/src/summary.test.ts` "a query is used by the dashboard that shows it, and a data source by the script that reads it (REL-MP7)" (seen failing with `references.ts` reverted); `Queries.test.tsx` "the open query says which dashboards show it, linked"; `Data.test.tsx` "a data source's row says which scripts use it (REL-MP7)". All failed before.
- Change: `apps/control-plane/src/kernel/references.ts` new targets `query` (widgets of dashboards and interfaces, via `widgetQueries`) and `data_source` (`uses.sources`), and `uses.events` now counts as "may publish it". Console: `Queries.tsx` sidebar "Used by" (shared `ReferenceList`), `Data.tsx` `Sources` "Used by" column (shared `UsedBy`). The route's contract is unchanged (`kind` is a free string).
- Siblings: connections, variables, secrets, events, scripts already show it. Queries.tsx is also in lane t3-data (one section added next to the Tables section).
- Left: dashboards and docs. Nothing in a manifest names a dashboard or a doc (an app names an interface, not a dashboard; doc links are prose and are not parsed), so there is no use to list. Asked: should an app or a doc link become a reference? Not decided here.
- Polish: states: Reading, Could not be read, "Nothing deployed uses it" in the column; "Nothing uses it, deployed or in a draft." under a query. Walk: Queries with a saved query open (aside under the editor at 390 px), Data sources at 390 px (column hidden below tablet).

## APP-MP3: Apps list sort, filter, search, Delete
- Test: `Portal.test.tsx` "APP-MP3: apps are searched, filtered by how they are built, sorted, and a console-made one is removed". Failed before.
- Change: `apps/console/src/screens/Apps.tsx` `AppList`: search box ("Find an app"), "Built" filter chips with counts, sortable App and Built headers, "No app matches" empty state, and in the inspector the shared `RemoveDraftButton` (kind `app`) for apps made in the console, or "Managed in the repository" for repository apps. `apps/control-plane/src/routes/apps.ts`: the `/apps` item gains `ownership` (additive).
- Siblings: the same shared piece removes flows (`Flows.tsx`) and scripts; dashboards and queries lists have their own removal (other lane).
- Left: Unpublish. Only a documentation app has a `published` flag, set in the repository. A console-made app has no switched-off state: taking it out of service is removing it (the Remove button, deployed with the next release). Adding a published flag to builder apps changes the app kind's schema; asked, not built.
- The list shows deployed apps, so a removed one stays listed until its removal draft is deployed (the notice from the shared button says so).
- Polish: states: loading, empty, no match, error; keyboard: search and chips are native; Walk: Apps at 390 px (toolbar wraps), inspector Remove, reload keeps nothing (search is not in the URL).

## EXT-MP4 = EXT-12: Problems for extensions, with line jump
- Test: `ExtensionProblems.test.tsx` "EXT-MP4: an extension's code that does not build lists where, in a Problems tab, each line a way to it" (own file, the editor stubbed as a text box: Monaco's stand-in depends on whether it has loaded, which made it flaky beside other editor tests). Failed before (no Problems).
- Change: `apps/console/src/screens/Authoring.tsx`: the Problems list (`ProblemList`) is under the code of a connector and a trigger source too, with editor diagnostics and build errors; build errors are matched by `<path>.<kind>.ts`, not only `.script.ts` (the shared filter in `problemCount` and the script test pane both use it now). Each line jumps to its line in the editor.
- Siblings: script test pane (same list, same filter); docs editor has its own "Problems" (DocEditor.tsx), untouched.
- Left: nothing in the console raises a build error for a connector on save (only preview/deploy and a connection Test do), so the list shows editor diagnostics until a refused save names files; it is the same for scripts' saves.
- Seen: "Problems" or "Problems (n)" under the code of an extension. Walk: connector editor at 390 px.

## SCR-08 = SCR-MP1, EXT-MP3: script and extension Settings
- Test: `Authoring.test.tsx` "SCR-08, EXT-MP3: a script's memory, concurrency, worker pool, ... are set in Settings". Failed before (no such fields).
- Change: `apps/console/src/screens/Authoring.tsx`, the Settings shared by script, connector and trigger source: Worker pool (script and trigger source; from `/tenants/:t/worker-pools`, a pool named but not listed stays shown), and for scripts Memory (MB), Runs at once, "One lane for each value of", tables, data sources, events, connection groups, and `onFailure` (script and notify). Retry delay and backoff were already there. Body types `Uses` and `ScriptBody` extended. API and manifest unchanged.
- Siblings: the list inspector for scripts (`ObjectPages.tsx` `ScriptPage`) shows none of these settings; the row said it "also reads" the shared set, and it does not read these yet (left: a read-only list of the same fields on the script's page). `ResourceEditor.tsx` has no pool field for a trigger source: a trigger source is made in this editor, so its pool is here. Flows pick pools nowhere.
- Seen: Settings has new fields under the timeout and "uses"; saving writes `memoryMb`, `concurrency`, `worker`, `onFailure`, `uses.*`.
- Polish: states: empty means default or no limit (each hint says so); refusal: server field errors show under memory and concurrency; keyboard: native fields. Walk: a script's Settings at 390 px (two-column rows hold two fields).

## Found
- `Interfaces.test.tsx` "widgets are added and removed, and what is wrong is said before anything can be published" times out on the phase branch already.
- `Authoring.test.tsx` ends with unhandled Monaco worker errors ("Worker is not defined", "clearRect") and exit code 1 on the phase branch already (11 before this lane, more after, from tests that stay open longer).
