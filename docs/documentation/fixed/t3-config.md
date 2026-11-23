# Lane t3-config

## CFG-MP4 = REL-MP5: run limit in Workspace settings
- Test: `Environments.test.tsx` "a workspace's run limit is set from its settings, from 1 to 1000, saved with the others (CFG-MP4)". Failed before (no "Runs at once" field).
- Change: `apps/console/src/screens/Environments.tsx` `WorkspaceSettings` (Run limit section, `NumberField`, saved by the same SaveBar as name and zone; PATCH sends `concurrencyLimit`). Route already took 1 to 1000; unchanged.
- Siblings: the only workspace settings page is this one; `Tenant.tsx` has no such field (the row's "verify" resolved: it was not there).
- Seen: a "Run limit" section below Time zone; 0 or 2000 shows "A whole number from 1 to 1000." and blocks Save.
- Polish: states: loading (empty until the workspace loads), invalid (error text), saving (bar); keyboard: native number input; copy plain. Walk: Workspace settings at 390/768/1440, light/dark, reload shows the saved value.

## CFG-MP1: Unbind on a connection's page
- Test: `ObjectPages.test.tsx` "a bound connection's page has Unbind ... (CFG-MP1)". Failed before.
- Change: `apps/console/src/screens/ObjectPages.tsx` `ConnectionPage` uses the shared `RemoveButton` and `useReferences`, as the list does (`Execution.tsx` ~840).
- Siblings: the list in Execution.tsx and the database-source list in Data.tsx:2804 already unbind. Not on the page: Variables, secrets pages.
- Seen: Unbind button next to "Change where it points"; confirmation names what uses it; afterwards the page says "Not set up here".
- Polish: refused/failed shows the error toast (RemoveButton); keyboard via dialog. Walk: a bound connection's page at 390 px (actions wrap).

## Found
- `ObjectPages.test.tsx` "no kind is sent to an editor that does not exist for it (REL-07)" fails on the phase branch already (objectHref of `connection_group` gives the connections list, test expects `resources/edit/connection_group/...`). Not mine.

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
