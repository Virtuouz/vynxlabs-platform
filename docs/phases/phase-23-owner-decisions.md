# Phase 23: what the owner chose for phase 22's open items

Status: planned, on branch `phase-23-owner-decisions`, off `phase-22-polish` at `6224c6d`.
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

**Polish gate.** To be answered, steps 1 to 7 of [the template](TEMPLATE.md). Rules: 004, 005.

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

**Polish gate.** To be answered. Rules: 001, 003, 010.

## M3: Release, one list of deploys, and rollback from it

**To build.**
- On Release (`apps/console/src/screens/Release.tsx`, around 609–645), "Versions of <workspace>" is the one list.
- Each row whose bundle is not the one running offers "Activate this version", through the confirm that `Deployments` already has (`apps/console/src/screens/Execution.tsx`). That confirm is a danger in production and names the workspace (phase 22 M6).
- Bundles uploaded and never activated go in a small section under it, "Not yet run here", with the same Activate.
- The "Bundles and rollback" table goes. The page keeps one `h1`, which phase 22's enforce rule checks.

**Tests.**
- `Rollback.test.tsx` and the Release tests, updated.
- `e2e/release.spec.ts` rolls back from a row of the history.

**Polish gate.** To be answered. Rules: 002, 010.

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

**Polish gate.** To be answered. Rules: 001, 003, 006, 010.

## M5: filters on their own row

**To build.**
- `PageHeader` (`apps/console/src/kit/PageHeader.tsx:20`) and `ListScreen` put a list's filters and search on a row under the title and description, never beside the title.
- Audit, Runs, Events and every other list with filters have it from the shared header.
- The phase 16 measure "the first row of data within 160 px of the top at 1440×900" (`e2e/polish.spec.ts`) still holds. Where a second row would break it, the description folds after the first visit, as it does now.

**Tests.**
- `e2e/polish.spec.ts` measures the audit log at 1440 px with its first-visit description shown, for a member who has not seen it.
- The screenshots are taken again, after each difference is looked at.

**Polish gate.** To be answered. Rules: 004, 013.

## M6: guides, Fernhill, changelog, the walk-through

- `CHANGELOG.md`.
- The guides for tables, Release, access releases, documentation, approvals and queries say what changed.
- Fernhill:
  - a table of more than 200 rows, and a reference column to it;
  - a member who is a doc writer, if there is none.
- `e2e/phase-23.spec.ts` walks this exit criterion, each step named for the POLISH rule it checks.
- The full `pnpm test` and `pnpm e2e`, on a throwaway instance seeded with Fernhill, as phase 22 did.

**Polish gate.** To be answered. Rules: 014, 015.

## Findings

None yet.

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
