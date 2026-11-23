# Lane dat: fixed

Rows DAT-01, 02, 03, 04, 09, 11. Decisions D10, D24, D25. No migration. No schema or contract change.

## DAT-11 "Show the rows behind" a quarter covers a year
- `apps/control-plane/src/kernel/data/query/inputs.ts:175` `periodEnd` is exported, takes a `VisualBucket`, and is an exhaustive switch with a `quarter` branch (3 months).
- Test: `kernel/data/query/period.test.ts`, "a %s ends where the next begins" for each of `VISUAL_BUCKETS`, and "a quarter that starts in the last months of a year". Before the fix the quarter fell into the year branch.
- Siblings: `con/kit/inspector` and `rows.ts` buckets have their own lists and were not changed (not this row's code).
- A person sees: the rows behind a quarter's count are that quarter's.

## DAT-09 Two saves of one dashboard with the same revision are both accepted
- `routes/dashboards.ts` PUT: the update has `.where("revision", "=", current.revision)` and answers 409 when no row changed.
- Test: `data-standing.test.ts`, "a dashboard saved twice with one revision / is accepted once" (four at once: one 200, three 409).
- Siblings looked at: `draft` saves compare the revision under `forUpdate` (kernel/authoring.ts), so they were not open; other hand-made revisions not listed beyond this table (`member_dashboard`).

## DAT-01 A widget reads a bound data source with `data:read` alone (D24)
- New `kernel/pages/standing.ts` `requireStanding` (one function, one new file): a page that puts a bound source's `<source>/<table>` on it needs `data_source:read` of whoever saves it. Reader stays at `data:read`.
- Called from: member dashboard save (`routes/dashboards.ts` `checked`), `PUT drafts/*`, `POST drafts/batch`, `POST draft-history/:id/restore`, `POST changes/deploy` (all `routes/authoring.ts`), `PUT resources/*` (`routes/workspaces.ts:618`). Repository deploys are not asked (D25).
- Tests: `data-standing.test.ts` "a data source's table on a page" (dashboard 403, draft 403, resource 403, deploy 403, a workspace table 200).
- Siblings: widget-data, rows download and filter options read as `data:read` and are unchanged by D24. Dry run `GET changes/preview` is not asked (it needs `deployment:read` and shows what a deploy says; it will not show this refusal). Git pull of console edits not changed.

## DAT-02 SQL written and run without `sql:read` through drafts and deploys (D25)
- Same `requireStanding`: `sql:read` for a dashboard whose widget holds `sql`, and for a `query` whose `sql` is not what it was (the draft's, else the deployed one; a deploy compares with the deployed one). `checked()` in dashboards now uses it instead of its own check.
- Tests: `data-standing.test.ts` "SQL written in the console" (draft of dashboard and query 403; deploy by someone without it 403; a query changed only in its description allowed; restore).
- Left out: `docs/sdk-guide.md:220` states the check; the page's text now matches, to be confirmed by phase 31. Run-audit of drafted SQL is not added.
- Shared file another lane may touch: `routes/authoring.ts` (four call lines), `routes/workspaces.ts` (one).

## DAT-03 "Change" keeps a stored password for a new host (D10)
- `kernel/data/sources.ts` `pointsElsewhere` and `bindSource`: a kept password with a different host, port or user, or `ssl` turned off, is 400 on `/password` ("type the password again").
- Tests: `data-standing.test.ts` "a source's stored password".
- Copy: `apps/console/src/screens/Data.tsx` (Change and Connect database dialogs): "Leave the password empty to keep the stored one, unless the host, port or user changes or encryption is turned off: then type it again." API description in `routes/sources.ts` PUT.
- Siblings for the CFG lane: `bindConnection` (`kernel/execution/bindings.ts:48`), connection group members, git URL, SSO issuer, mail. `pointsElsewhere` is source-specific; the rule is the same.
- Screens to walk: Data > Data sources > Change (edit only Host: error shown at Password; type it: saved), Connect database over a bound source.

## DAT-04 Query routes answer a stranger about tables and saved queries
- `routes/queries.ts`: `standing()` first on `schema`, `visual` and `saved`: no standing in the tenant is the same 404 "The tenant was not found" before anything is read. `visual` is compiled against only the tables the caller may read (a table they may not read is "there is no table ... you may read here", as one that is not there). `saved` checks the tables' `data:read` before it speaks of parameters.
- Tests: `data-standing.test.ts` "what the query routes tell a stranger".
- Siblings: `inputs.ts` record paths are behind `locatePage` and untouched; `queries/run` is behind `sql:read`.

## Polish gate (screens: Data sources Change dialog)
States: error on the Password field after refused Change. Lifecycle: Change then retype. Keyboard: unchanged dialog. Copy: above. Not walked in a browser (no server allowed in this lane).

## Found
- A member whose role lacks `data:read` anywhere now sees 400 "there is no table" from `queries/visual` (was 403 naming the table).
- Lanes share one `git stash` list across worktrees: a `stash pop` in a lane can apply another lane's work. Dat popped the files lane's stash once and put it back (stash entry "FILES LANE work", also /tmp/claude-1000/files-lane-work.patch).
