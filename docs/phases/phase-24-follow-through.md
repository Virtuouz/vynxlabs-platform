# Phase 24: the follow-through on phase 23's open items

Status: planned, on branch `phase-24-follow-through`, off `phase-23-owner-decisions` at `c846b34`.
Last updated: 2026-11-20

Phase 23 ([its document](phase-23-owner-decisions.md)) built the owner's eight decisions and left five items, each set out with options. The owner chose one for each. For the first, they asked to keep a readable path and the durability of a key together.

**Exit criterion.** On `examples/fernhill`, in a browser:

- a query used by a console-made dashboard is renamed. The dashboard's widget is a draft with the new path, deployed with the rename. A widget whose path was not updated still runs after its alias has expired;
- a dashboard defined in the repository that names a renamed query keeps working, and says which path to change;
- a file replaced by a worker script is kept until the tenant's audit retention ends, then removed, as one replaced in the console is;
- a doc writer turns on page feedback for a site, and deploys it, alone;
- two sites with feedback on write to one `docs-feedback` table, and a renamed site's answers stay its own;
- a data source's tables are browsed with one scroller, as a table's rows are;
- a reference to a table that names no display column shows the row's name in the grid, as the picker does.

## Owner decisions

Answered by the owner on 2026-11-20.

| # | Area | Decision |
|---|---|---|
| 1 | A dashboard after its query is renamed | **Both.** The file keeps the readable path. The server also records, for each widget, the key of the query its path names, so a widget follows a rename for good. A rename drafts console-made dashboards with the new path, and the rename dialog names them first. A dashboard from the repository keeps working through the recorded key, and its page says which path to change there |
| 2 | Files changed by a worker script or a source table | Both go through `updateRowKeepingFiles`. A source table is left out if its files are not stored by Volvel |
| 3 | Page feedback | **One table per workspace, `docs-feedback`.** It is made the first time a site turns feedback on, and every site with feedback on writes to it. It names the site by **key**, so a renamed site's answers stay its own, with the site's name in a column beside it for people to read. A doc writer may draft and deploy that table, with exactly its columns, and no other. No migration: there are no instances whose data must be kept (the owner, 2026-11-20). Per-site `<site>-feedback` tables are no longer made |
| 4 | The source-table browser | Fills the window as a table's rows do (phase 23 M1) |
| 5 | Reference cells in a grid | Where a table names no display column, the server names rows by the same rule as the picker: `name`, else `title`, else its first text column. The rule lives in one place for both |

## Milestones

| # | Milestone | Decision |
|---|---|---|
| M1 | A widget follows its query, by path and by key | 1 |
| M2 | One feedback table for a workspace's sites | 3 |
| M3 | Files kept and removed the same way, wherever a row changes | 2 |
| M4 | The source browser fills, and references are named by one rule | 4, 5 |
| M5 | Guides, Fernhill, changelog, the walk-through | — |

M1 to M4 touch separate code and can be built side by side. M5 is last. Per the gate's step 6, each milestone runs a typecheck, the tests of what it touched, and its walk. The full `pnpm test` and `pnpm e2e` run once, at the phase's end.

## M1: a widget follows its query, by path and by key

**To build.**
- **A record of what a path named.**
  - A table beside the existing aliases: for each deployed dashboard, each widget's query path, and the key of the query that path named when the dashboard was deployed. It is written when a dashboard is deployed (`kernel/execution/deploy.ts`) and removed with the dashboard.
  - Migration `0084_…`.
- **Running a widget.** `kernel/data/query/widget.ts:205` looks up the path through `resolveResource`, as now. When that finds nothing, it looks up the recorded key (`(workspace_id, key)` is indexed; see `parseRef` in `kernel/resolve.ts`), and runs that query.
- **A rename.** Renaming a query (`ResourceIdentity`, phase 23 M4; the server's `moveTo` in `kernel/authoring.ts`) finds the console-made dashboards whose widgets name the old path, and saves each as a draft with the new path, in the same request. The rename dialog lists them first. Discarding the rename's draft discards those drafts too.
- **A dashboard from the repository.** It cannot be drafted from the console. Its page says, for each widget that ran through a recorded key, "names `<old>`, now `<new>`: change it in the repository".
- **Not in this phase.** Other resources that name another by path (an app and its tables, a flow and its scripts) are noted as candidates for the same record. They are not built here.

**Tests.**
- Kernel and route tests:
  - the record is written on deploy;
  - a widget runs through the key once the alias has expired (expire it by date in the test);
  - a rename drafts the console-made dashboards and not the repository ones.
- Console tests: the rename dialog lists the dashboards; a repository dashboard shows the notice.

**Polish gate.** To be answered, steps 1 to 7 of [the template](TEMPLATE.md). Rules: 002, 003, 010.

## M2: one feedback table for a workspace's sites

**To build.**
- **The table `docs-feedback`.** Columns:
  - `site_key`: the site app's key, which a rename keeps;
  - `site`: the site's name when the answer was given, for people to read;
  - `page`, `helpful`, `version` and `at`, as today.
- **Turning feedback on.**
  - The Documentation section's switch (`FeedbackDialog`, `apps/console/src/screens/docs/Docs.tsx:1303`) drafts `docs-feedback` when the workspace has none, and sets the site's `feedback` to it.
  - When the table exists, only the site changes. The dialog says which of the two it does.
  - `<site>-feedback` (`Docs.tsx:1317`) is no longer made.
- **Recording an answer.** The served site (`apps/control-plane/src/kernel/apps/front.ts`, around 1127–1185) writes `site_key`, from the app it serves, and `site`, its name.
- **The doc writer.**
  - The deploy's exception (phase 23 M4, `isFeedbackTableOf` in `routes/authoring.ts`) and the draft check (`fits`, `routes/authoring.ts:250`) allow exactly `docs-feedback` with exactly its columns, for a caller who may change a docs site.
  - One shared check serves both.
  - Any other table stays refused.
- **What reads the answers.** Anything that reads feedback per site filters on `site_key`: the console's view of a site's answers, if there is one, and the guides.
- **No migration.** Per-site tables already made stay as they are on dev instances, and are not read.

**Tests.**
- Route tests:
  - two sites, one table;
  - a renamed site's answers keep its `site_key`;
  - a doc writer drafts and deploys `docs-feedback`, and is refused another table, or one with other columns.
- Console tests for the dialog's two wordings.
- `e2e/phase-24.spec.ts`.

**Polish gate.** To be answered. Rules: 002, 003, 010.

## M3: files kept and removed the same way, wherever a row changes

**To build.**
- A worker script's row update (`apps/control-plane/src/routes/worker.ts:897`) goes through `updateRowKeepingFiles` (`kernel/data/files.ts`).
- **Source tables.** First check whether a source table's file column holds files Volvel stores. If it does, the source row update (`routes/sources.ts:451`) goes through it too. If the files are the source's own, it is left out, and the reason is written beside the call.

**Tests.** A kernel test: a file replaced by a worker script is noted, survives a prune inside the window, and goes after it.

**Polish gate.** To be answered. Rules: 002, 013.

## M4: the source browser fills, and references are named by one rule

**To build.**
- **The source browser.**
  - The data source page (`SourceView`, `apps/console/src/screens/Data.tsx:2581`) is a workbench (`nav.ts`).
  - Its rows browser takes `fill`, as a table's does since phase 23.
  - Its list of tables scrolls on its own beside it.
- **One rule for references.**
  - The rule `displayGuess` (`Data.tsx`) moves to one shared place, `packages/manifest` or the data kernel.
  - The rows route's `expanded` labels (`apps/control-plane/src/routes/data.ts`, around 585) use it when a table names no display column.
  - The grid's reference cells (`Data.tsx:441`), exports and the picker then name a row the same way.

**Tests.**
- `polish.spec.ts` measures a source page as a workbench, with one scroller.
- A route test: `expanded` names rows by `name` when the table names no display column.
- The unit test of the rule, in its new place.

**Polish gate.** To be answered. Rules: 002, 004, 005, 013.

## M5: guides, Fernhill, changelog, the walk-through

- `CHANGELOG.md`.
- Guides:
  - dashboards and queries: what a rename does to them;
  - documentation: one feedback table, and a doc writer turning it on;
  - tables: references named without a display column;
  - data sources.
- Fernhill:
  - a console-made dashboard over a query, to rename;
  - two docs sites, or the handbook and a second, with feedback on;
  - Sam, the doc writer, turns feedback on in the walk.
- `e2e/phase-24.spec.ts` walks the exit criterion, each test named for its POLISH rule.
- The full `pnpm test` and `pnpm e2e` once, at the end, on a throwaway instance seeded with Fernhill.

**Polish gate.** To be answered. Rules: 014, 015.

## Findings

None yet.

## Traceability

| Item from phase 23 | Milestone |
|---|---|
| A dashboard follows a renamed query for 90 days only | M1 |
| A file replaced by a worker script or source table is kept forever | M3 |
| A doc writer deploys a feedback table but cannot draft one | M2 |
| The source browser does not fill | M4 |
| Grid reference cells show IDs | M4 |
