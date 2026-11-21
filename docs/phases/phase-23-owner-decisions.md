# Phase 23: what the owner chose for phase 22's open items

Status: built, on branch `phase-23-owner-decisions`, off `phase-22-polish` at `6224c6d`.
Last updated: 2026-11-20

Phase 22 ([its document](phase-22-polish.md)) closed 80 of the polish audit's 84 findings. It left eight items for the owner, each set out with its options. The owner chose one option for each, and this phase builds them.

**Exit criterion.** On `examples/fernhill`, in a browser:

- a table's rows scroll in one place, with the header pinned, at 1440, 768 and 390 px;
- a reference is chosen by typing any row's name, past the first 200;
- a file in a row is replaced and removed from the inspector, and the old file is still in the row's history;
- Release shows one list of what ran, and rolls back from it;
- going back to an access release lists what it removes before it is done;
- a doc writer deploys documentation whose site's feedback table a developer left as a draft;
- a viewer's tenant overview counts only what they may decide, and the tenant queue matches it;
- the audit log's filters never stack beside the title;
- a query is renamed, and an app's title is changed, where each is listed.

## Owner decisions

Answered by the owner on 2026-11-20.

| # | Area | Decision |
|---|---|---|
| 1 | The rows grid scrolls inside a scrolling page (A2-08) | A fill layout. The table screen fills the window, and its grid is the one scroller, with the header pinned |
| 2 | Choosing a referenced row, and files in the row inspector (A2-06) | Both. The picker searches on the server. A file is replaced and removed from the inspector. A replaced file is kept until the row's history expires |
| 3 | Release shows two lists of versions (A1-23) | One list of deploys, with "Activate this version" on each. Bundles never activated go in a small section under it |
| 4 | Going back to an access release (A3-18) | Before it is done, it lists what it removes. It is a danger confirm when anything is removed |
| 5 | A doc writer and a site's feedback table | A doc writer may deploy a site's feedback table, and only that table, when the site is in the same deploy |
| 6 | Tenant overview and tenant approvals | The workspace fix of phase 22 M5, at tenant level |
| 7 | Filters beside a list's title | Filters go on a row of their own, in the shared header, on every list |
| 8 | Renaming queries and apps | Queries are renamed now. Apps get a title change now. **Changing an app's address is deferred to a later phase**, with a redirect from the old address, which `OldPaths` already does for moved paths |

## Milestones

| # | Milestone | Decision |
|---|---|---|
| M1 | One scroller for a table's rows | 1 |
| M2 | A reference found by typing, and files changed in the inspector | 2 |
| M3 | Release: one list of deploys, and rollback from it | 3 |
| M4 | Rollback preview, the doc writer's feedback table, tenant approvals, renames | 4, 5, 6, 8 |
| M5 | Filters on their own row | 7 |
| M6 | Guides, Fernhill, changelog, the walk-through | — |

M1 to M4 touch separate files and can be built side by side. M5 changes the shared header, so it comes after them, with its screenshots taken once. M6 is last.

## M1: one scroller for a table's rows

**To build.**
- The table screen (`tables/<name>`) joins `WORKBENCHES` in `apps/console/src/nav.ts:308`, so it fills the window and does not scroll as a page.
- `Grid` takes `fill`. With it, the grid is the one scroller, filling what is left (`flex-1 min-h-0 overflow-auto`) in place of `max-h-[70vh]` (`packages/ui/src/Grid.tsx:431`). Its sticky header and column filters stay.
- The Rows and Definition tabs both fill the window.
- On a phone, the column actions menu of phase 22 M9 stays reachable.

**Tests.**
- A `Grid` unit test for `fill`.
- A table's rows and definition are added to the workbench measures of `e2e/polish.spec.ts`: the first row near the top, and one scroller.
- Screenshots of a table at 1440, 768 and 390 px.

**Built** in `159f023`, merged in `8d2b0d3`, then brought up to P4-1 after the end-of-phase run.
- **Main change.**
  - `tables/<name>` is a workbench (`nav.ts`).
  - `Grid` takes `fill`.
  - `Page` takes `fill`, and with it the workbench heading (`oneRow`) and a folding description (`helpKey`).
- **P4-1 follow-ups.**
  - `3600c8d`:
    - the keys are behind a "Keys" button;
    - the tabs share the toolbar's row;
    - the description folds after the first visit.
  - `a9e89c6`, `80754b0`: a filled page's spacing and heading.
  - `5bee09a`: a grid's filter row is one step denser, at 24 px fields.
  - `1a06dca`: the Postgres name wraps.
- **Grid rows.** A grid's rows of data are numbered from 2, since the header is row 1 (`f051013`).

**Tests.**
- `Grid.test.tsx` (`fill`) and `Shell.test.tsx` (a workbench).
- `e2e/polish.spec.ts`:
  - a table's rows are among the workbenches;
  - its rows and definition are measured;
  - "a table's screen has one scroller", at 1440, 768 and 390 px.

**Findings.**
- As a workbench, a table's first row came 305 px down, against P4-1's 160. Its header stacked five rows. It now measures under 160 px.
- `SourceView`'s table browser does not fill yet. It is a candidate.

**Polish gate.**
1. Rules: 004, 005.
2. Siblings:
   - `Grid`'s other users (`ReadTable`, widgets, the kit sheet, `SourceView`) keep their 70vh box;
   - every grid gets the denser filter row.
3. Lifecycle: not applicable.
4. States: loading and failure keep their padding in a workbench.
5. Walk. On the throwaway instance (:8090, Fernhill seeded) at `0eb0f62`:
   - `tables/appointments` at 1440, 768 and 390 px: one scroller on Rows and on Definition, the page never scrolls, the header is sticky, and Next stays in view.
   - After the follow-ups, `polish.spec.ts` passes in full at `1a06dca`, all 11 tests.
6. Guards: the polish measures above.
7. Left out: `SourceView`.

## M2: a reference found by typing, and files changed in the inspector

**To build.**
- **The picker.**
  - `ReferenceField` (`apps/console/src/screens/Data.tsx`, phase 22 M9) sends what is typed to the rows API as a filter, `{"column": <display column>, "op": "contains", "value": …}`. The API takes it already (`RowsQuery`, `apps/control-plane/src/routes/data.ts:38`).
  - The first 50 are shown, with "Type to find more".
  - Typing is debounced, as member search is in `apps/console/src/kit/paged.tsx`.
- **Files.**
  - The row inspector (`RowEditor` in `Data.tsx`) gets "Replace" and "Remove" for a file column.
  - Replace uploads through the existing file route (`apps/control-plane/src/routes/sources.ts:491`), then saves the row with the new file. Remove saves no file.
  - Each asks first, and says the old file stays in the row's history.
- **The old file is kept.** Check that a stored file a row no longer names stays while a history entry of the row names it, and goes only when that history expires. Where the retention pass does not already keep it so, it is made to.

**Tests.**
- Unit tests: the picker asks the server for what is typed; Replace and Remove send what they say.
- A kernel or route test: a replaced file is still there after the replace, and goes once the history entry that names it is pruned.
- A step of `e2e/phase-23.spec.ts`.

**Built** in `0bc5df1`, merged in `c127c69`, with `435c8f3`.
- **The picker.** It sends what is typed as a `contains` filter on the display column, debounced. It names a row it was not sent by fetching it.
- **Display column.** When a table names no display column, the picker names rows by `name`, else `title`, else the first text column (`displayGuess`, `435c8f3`).
- **Files in the inspector.** `FileField` gives "Replace" and "Remove", each asking first.
- **The server.**
  - There was no row history. Migration `0083_row_file_history.sql` notes a file a row stops naming (`updateRowKeepingFiles`).
  - `pruneFileHistory` in the retention pass deletes a note older than the tenant's audit retention (400 days by default), then the file that nothing names any more.

**Tests.**
- `Data.test.tsx`: the picker's request, replace, remove, and `displayGuess`.
- `data-access.test.ts`: a replaced file survives, and goes once its note is pruned.
- `e2e/phase-23.spec.ts`: a row past the first 50, and past the first 200, chosen by typing; a file replaced and removed.

**Findings.**
- **Found in the walk.** Fernhill's `pets` names no display column, so the picker listed IDs and could not search. Fixed by `displayGuess`.
- **Not noted.** Files changed by a worker script or in a source table are not noted, so they are kept forever, as before.
- **Inherited.** The grid's reference cells still show IDs. They did before this phase.

**Polish gate.**
1. Rules: 001, 003, 010.
2. Siblings:
   - the grid's reference cells, as above;
   - `SeeItAs` keeps its 200.
3. Lifecycle: a file is set, replaced and removed. The old file is kept, then removed with its history.
4. States:
   - the picker: "Type to find more";
   - the reference field: falls back to a text field when the table can't be read;
   - a refused save is said in the inspector.
5. Walk. On the throwaway instance (:8090, Fernhill seeded):
   - at `0eb0f62`, the picker on `appointments` listed IDs, as found above;
   - after `displayGuess`, the walk-through's picker tests passed at `c5275ea`.
6. Guards: the unit and kernel tests above.
7. Left out: the worker and source-table paths, as above.

## M3: Release, one list of deploys, and rollback from it

**To build.**
- On Release (`apps/console/src/screens/Release.tsx`, around 609–645), "Versions of <workspace>" is the one list.
- Each row whose bundle is not the one running offers "Activate this version", through the confirm that `Deployments` already has (`apps/console/src/screens/Execution.tsx`). That confirm is a danger in production and names the workspace (phase 22 M6).
- Bundles uploaded and never activated go in a small section under it, "Not yet run here", with the same Activate.
- The "Bundles and rollback" table goes. The page keeps one `h1`, which phase 22's enforce rule checks.

**Tests.**
- `Rollback.test.tsx` and the Release tests, updated.
- `e2e/release.spec.ts` rolls back from a row of the history.

**Built** in `8a72c99`, merged in `6fd8d64`.
- "Versions of <workspace>" is the one list, with `ActivateVersion` (`Execution.tsx`) on each row whose bundle is not running.
- "Not yet run here" lists bundles that no deployment names.
- "Bundles and rollback" is gone.

**Tests.**
- `Rollback.test.tsx`, `Release.test.tsx`.
- `e2e/release.spec.ts`: production rolls back from a row.
- `e2e/phase-23.spec.ts`: a dev workspace's versions step, `?step=deploy`.

**Polish gate.**
1. Rules: 002, 010.
2. Siblings: `Deployments` had no other user, and is replaced.
3. Lifecycle: activate from any row, repeated rows included.
4. States: "Not yet run here" only when there is one.
5. Walk. On the throwaway instance (:8090, Fernhill seeded) at `0eb0f62`:
   - Clinics: one `h1`, no old table.
   - It has one version, so `release.spec.ts` and the walk-through activated in the e2e run.
6. Guards: as above.
7. Left out: nothing.

## M4: rollback preview, the doc writer's feedback table, tenant approvals, renames

Small pieces, mostly on the server, each in files of its own.

**To build.**
- **Going back to an access release (decision 4).**
  - A read-only route answers what going back would do: the asks and `allowDelete` that `rollbackAsks` already computes (`apps/control-plane/src/kernel/tenant/releases.ts`), beside the rollback route (`apps/control-plane/src/routes/access-releases.ts:418`).
  - The confirm in `AccessReleases.tsx` lists "These are removed: …", and is a danger confirm when anything is.
- **The doc writer's feedback table (decision 5).**
  - In the deploy of drafts (`apps/control-plane/src/routes/authoring.ts`, the check around 905–925), a caller without `deployment:write` may deploy a `table` draft only when two things hold:
    - a site in the same `paths` names it as its feedback table;
    - its columns are exactly the feedback columns.
  - Any other table is refused, as now.
  - The `doc_writer` role (`packages/db/migrations/0081_doc_writer.sql`) says it deploys nothing else. Its description is changed by a new migration, not in place, if the repository's migration checks call for it.
- **Tenant approvals (decision 6).**
  - The tenant summary (`apps/control-plane/src/routes/summary.ts`, around 356) adds `approvalsWaitingMine` across the tenant's workspaces, through `mayDecide` (`apps/control-plane/src/kernel/flows/approvers.ts`).
  - `TenantOverview.tsx:63` words its count as the workspace overview does.
  - The tenant's `ApprovalsQueue` (`Tenant.tsx:237`, `Tenant.tsx:645`, `Operate.tsx:898`) gets "Waiting for others", read-only.
- **Renames (decision 8).**
  - **A query:** "Name and path" through `ResourceIdentity` (`apps/console/src/screens/ResourceIdentity.tsx`) beside Remove in `Queries.tsx`. Check that a dashboard's widget follows a moved query by its key.
  - **An app's title:** "Rename" in the App Builder list changes the title in the interface and the app. `ResourceIdentity` already keeps those two kinds' titles in their body (`titledInBody`). The address is unchanged, and the dialog says so.

**Tests.**
- Route tests:
  - what going back would remove;
  - a doc writer deploying a site's feedback table, and refused any other table;
  - the tenant's `approvalsWaitingMine` against the queue.
- Console tests for each screen changed.

**Built** in `4fad460`, merged in `9f7c258`, with `ab5e431`, `0eb0f62`, `4277905` and `f051013`.
- **Going back to an access release.**
  - A read-only `GET …/access/releases/:id/rollback` answers `rollbackAsks`, with readable `removes`.
  - The confirm lists "These are removed: …", and is a danger confirm when anything is.
- **The doc writer's feedback table.**
  - The deploy lets a caller without `deployment:write` deploy a table draft when a site in the same deploy names it as feedback, and it has exactly the feedback columns.
  - Migration `0082_doc_writer_feedback.sql` rewords the role.
- **Tenant approvals.**
  - The tenant summary answers `approvalsWaitingMine`. Both counts count only approvals surfaced to the tenant, as its queue lists them (`ab5e431`).
  - The tenant overview says "waiting for you" or "for someone else".
  - The tenant queue has "Waiting for others".
- **Renames.**
  - A query gets "Name and path".
  - An app gets "Rename", for its title in the interface and the app, with its address unchanged.
  - A rename's dialog leaves with its motion before the screen moves on (`onClosed` on the kit `Dialog`, `f051013`).

**Tests.**
- `access-releases.test.ts`, `docs-apps.test.ts`, `flows.test.ts`.
- `AccessReleases.test.tsx`, `TenantScreens.test.tsx`, `Approvals.test.tsx`, `Interfaces.test.tsx`, `RemoveDraft.test.tsx`.
- `e2e/phase-23.spec.ts`.

**Findings.**
- The tenant counts first counted every waiting step, more than the tenant's queue lists. Fixed (`ab5e431`).
- **A dashboard follows a renamed query only for 90 days.** A widget names its query by path, and reaches it through the old-path alias. After that, the widget needs editing. For the owner.
- A doc writer deploys a feedback table but cannot draft one. A developer drafts it.
- The end-of-phase run found a rename's dialog taken away mid-motion on Queries. Fixed, in the shared dialog.

**Polish gate.**
1. Rules: 001, 003, 006, 010.
2. Siblings:
   - every `ResourceIdentity` user gets the dialog fix;
   - the workspace and tenant queues share "Waiting for others".
3. Lifecycle:
   - a query: create, rename, remove;
   - an app: create, rename its title, remove. Its address is not changed (decision 8).
4. States: the preview's failure is shown in the release's notice.
5. Walk. On the throwaway instance (:8090, Fernhill seeded) at `0eb0f62`:
   - going back to release 1 listed "These are removed: the group of end users Front desk, … ".
   - Fernhill surfaces no approvals to the tenant, so both counts read 0 for the viewer and the owner (the walk-through's test skipped).
   - The App Builder's Rename is disabled for apps from the repository.
6. Guards: the route and console tests above, and `path-lookups.test.ts`, with the feedback check's reason beside its query (`4277905`).
7. Left out: dashboards following a query by key, as above.

## M5: filters on their own row

**To build.**
- `PageHeader` (`apps/console/src/kit/PageHeader.tsx:20`) and `ListScreen` put a list's filters and search on a row under the title and description, never beside the title.
- Audit, Runs, Events and every other list with filters have it from the shared header.
- The phase 16 measure "the first row of data within 160 px of the top at 1440×900" (`e2e/polish.spec.ts`) still holds. Where a second row would break it, the description folds after the first visit, as it does now.

**Tests.**
- `e2e/polish.spec.ts` measures the audit log at 1440 px with its first-visit description shown, for a member who has not seen it.
- The screenshots are taken again, after each difference is looked at.

**Built** in `d6dba5b`, merged in `a892a75`, with `6d153a4`.
- `PageHeader`'s workbench heading is a column:
  - the title and actions;
  - the description;
  - then the filters, in their own full-width row (`data-header-filters`).
- Every list that passes filters as its toolbar has it.
- The audit log's column and view menus sit beside CSV, not under the filters (`6d153a4`).

**Tests.**
- `Chrome.test.tsx`.
- `e2e/polish.spec.ts`, "the audit log's filters sit under its title and description on a first visit", at 1440 and 390 px.

**Findings.** With the filters filling their row, the audit log's menus wrapped to a row of their own, and its first row came to 162 px. Fixed.

**Polish gate.**
1. Rules: 004, 013.
2. Siblings: every `CollectionView` and `ListCollection` list. Non-workbench headers already had the filters under the title.
3. Lifecycle: not applicable.
4. States: not applicable.
5. Walk: the polish spec's first-visit audit check, and P4-1 on every workbench, pass at `1a06dca`.
6. Guards: as above. The lists' pictures were taken again (`c5275ea`).
7. Left out: nothing.

## M6: guides, Fernhill, changelog, the walk-through

- `CHANGELOG.md`.
- The guides for tables, Release, access releases, documentation, approvals and queries say what changed.
- Fernhill:
  - a table of more than 200 rows, and a reference column to it;
  - a member who is a doc writer, if there is none.
- `e2e/phase-23.spec.ts` walks this exit criterion, each step named for the POLISH rule it checks.
- The full `pnpm test` and `pnpm e2e`, on a throwaway instance seeded with Fernhill, as phase 22 did.

**Built** in `5c6d2a4`, merged in `485865f`.
- `CHANGELOG.md`.
- Guides: tables, Release, members (access releases), documentation, approvals, the tenant overview, queries, App Builder, the audit log. `pnpm docs:check` passes.
- Fernhill:
  - `suppliers`, 220 rows, with `name` as what stands for a row;
  - `supplier_contacts`, with a reference to it;
  - Sam Reyes, a doc writer in the sandbox.
- `e2e/phase-23.spec.ts` walks the exit criterion in 10 tests, each named for its POLISH rule.

**The end-of-phase runs.** On a throwaway instance (:8090) seeded with Fernhill. The full suites ran once, at the phase's end, as the gate now says (`589867c`).
- **`pnpm e2e` at `a3921c4`:** 75 passed, 4 failed, 2 skipped.
  - Fixed:
    - the rename dialog's motion;
    - a table's first row against P4-1, then the audit log's;
    - the phones' pictures, taken again;
    - the walk-through's Release step.
  - The single sign-on test needs the Keycloak of `e2e/README.md`, which this instance did not run. The exit-criterion tests after it, in the same serial spec, did not run.
- **Reruns of what failed, at `1a06dca`:**
  - `polish.spec.ts`: 11 passed.
  - `redesign.spec.ts`, `wide.spec.ts` and `phase-23.spec.ts`: 22 passed, 1 skipped. The skip is the viewer's tenant count: Fernhill surfaces no approval to the tenant.
- **`pnpm test`:**
  - At `c5275ea`: 2184 passed, 2 skipped.
  - The console, ui, app and screens packages again at `1a06dca`, after the last console changes: 796 passed.

**Polish gate.**
1. Rules: 014, 015.
2. Siblings: not applicable.
3. Lifecycle: not applicable.
4. States: not applicable.
5. Walk: the e2e runs above, the walk-through included.
6. Guards: the full suites, once, as above.
7. Left out: the single sign-on test, for want of Keycloak here.

## Findings

- **Every decision is built.** Decision 8's deferred part, changing an app's address, is left as decided.
- **What walking found after a milestone's own tests passed:**
  - the reference picker listed IDs for a table with no display column;
  - the tenant counts did not count what the tenant queue lists;
  - a rename's dialog was taken away mid-motion;
  - a table's first row, then the audit log's, missed P4-1;
  - a Postgres name ran past a phone's width.
- **For the owner.**
  - A dashboard follows a renamed query for 90 days only. Its widget names the query by path, and reaches it by the old-path alias. Following it by key needs the server to resolve widgets by key, or to rewrite them on a rename.
  - A file a worker script or a source table changes is not noted, so it is kept forever, as before.
  - A doc writer deploys a site's feedback table, but cannot draft one.
  - `SourceView`'s table browser does not fill the window as a table's does.
  - The grid's reference cells show IDs, as before this phase.
- **How it was built.**
  - M1 to M4 were built side by side, M5 after them, and M6 last. Each was merged and checked: typecheck, its tests, its walk.
  - M2 and M4 each added a migration `0082`. M2's became `0083`.

## Traceability

| Item from phase 22 | Milestone |
|---|---|
| A2-08: the rows grid | M1 |
| A2-06: references and files | M2 |
| A1-23: Release's two lists | M3 |
| A3-18: going back to an access release | M4 |
| A doc writer and a feedback table | M4 |
| Tenant approvals | M4 |
| Renaming queries and apps' titles | M4 |
| Changing an app's address | Deferred, by decision 8 |
| The audit log's filters | M5 |
