# Phase 24: the follow-through on phase 23's open items

Status: built, on branch `phase-24-follow-through`, off `phase-23-owner-decisions` at `c846b34`.
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

**Built** in `dc41627`, merged in `8f16e20`, with `9c4146c`, `234d26e` and `bb3ccea`.
- **The record.**
  - Migration `0084_dashboard_widget_query.sql`: table `dashboard_widget_query`, keyed `(dashboard_id, widget_id)`, holding the path as written and the key it named.
  - `kernel/dashboard-queries.ts` records it after each deploy's manifests, so a query applied later in path order is found. A path that names nothing keeps its earlier record.
- **Running.** `widgetQuery` runs the recorded key's query when the path answers nothing. Its answer carries `followed`.
- **A rename.** A query's rename drafts the console's dashboards that name it, in the same request. This is done only for a caller with full `resource:write`. The dialog lists them, through `GET …/rename-effects/<path>`.
- **Discarding a rename** sets aside only the dashboard drafts it wrote, as it wrote them. One changed since is kept (`9c4146c`).
- **A repository dashboard** shows "Names X, now Y: change it in the repository", in the kit's attention tone (`234d26e`).
- `PATH_EXEMPT` says why a rename leaves the record's path (`bb3ccea`).

**Tests.**
- `dashboard-follow.test.ts`:
  - the record on deploy, and gone with its dashboard;
  - the console's dashboards drafted, the repository's not;
  - discard, and an edited draft kept;
  - a widget run by key once its alias has expired, by date.
- `Dashboards.test.tsx`, `ResourceIdentity.test.tsx`.
- `e2e/phase-24.spec.ts`.

**Findings.**
- A rename of a query drafted other resources. Two cases needed handling:
  - a limited writer's rename leaves the dashboards alone;
  - a discard would have taken away later edits, which was fixed before the walk.
- Dashboards deployed before this phase get their record at the workspace's next deploy. There is no backfill.

**Polish gate.**
1. Rules: 002, 003, 010.
2. Siblings: other resources that name another by path (an app's tables, a flow's scripts) could use the same record. Not built.
3. Lifecycle: a query renamed, with its dashboards; the rename discarded, with its drafts.
4. States: the dialog lists the dashboards, and says nothing when there are none or the lookup fails.
5. Walk. On the throwaway instance (:8090, Fernhill seeded) at `7c89c66`:
   - renaming `walk/q-…` from the Queries screen listed "This dashboard is saved as a draft with the new path: Walk board";
   - the rename and the dashboard deployed together, and the dashboard named the new path;
   - **not walked:** a widget run by key after its alias expires, and the repository notice. Both need an expired alias. `dashboard-follow.test.ts` covers them.
6. Guards: as above, and `kernel.test.ts`'s rule that every path column follows a rename or says why.
7. Left out: the other resources, as above.

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

**Built** in `5f4efd9`, merged in `7c89c66`.
- **One definition.** `FEEDBACK_TABLE`, `FEEDBACK_COLUMNS`, `hasFeedbackColumns` and `isFeedbackTable` live in `packages/docs-engine/src/workspace.ts`, which the console, the served site and the server all use. The published docs engine cannot depend on the private manifest package.
- **Turning feedback on.** The dialog drafts `docs-feedback` only when there is none, and says which it does. The served site records `site_key` and `site`. Page counts filter on `site_key`.
- **The doc writer.** A doc writer may draft and deploy exactly `docs-feedback` with its columns. One check, `fits`/`screenAt`, serves both. The earlier rule that the site be in the same deploy is dropped, since the table is shared.

**Tests.**
- `docs-apps.test.ts`:
  - two sites, one table;
  - a renamed site keeps its `site_key`;
  - a doc writer drafts and deploys it;
  - refused another table, or other columns.
- The documentation screen's tests: both wordings, and the counts.
- `e2e/phase-24.spec.ts`.

**Polish gate.**
1. Rules: 002, 003, 010.
2. Siblings: everything that read a per-site table, now `site_key`.
3. Lifecycle: on, off (the table is kept), and on again for another site.
4. States: the dialog says whether it makes the table or uses it. A path already taken blocks it.
5. Walk. On the throwaway instance (:8090, Fernhill seeded) at `7c89c66`:
   - Sam Reyes, a doc writer, turned feedback on for the handbook. The dialog said it would make `docs-feedback`, with its six columns.
   - His deploy sent `["handbook","docs-feedback"]` (201).
   - An answer on the served page landed with `site_key: "handbook"` and `site: "Fernhill handbook"`.
6. Guards: as above.
7. Left out: nothing.

## M3: files kept and removed the same way, wherever a row changes

**To build.**
- A worker script's row update (`apps/control-plane/src/routes/worker.ts:897`) goes through `updateRowKeepingFiles` (`kernel/data/files.ts`).
- **Source tables.** First check whether a source table's file column holds files Volvel stores. If it does, the source row update (`routes/sources.ts:451`) goes through it too. If the files are the source's own, it is left out, and the reason is written beside the call.

**Tests.** A kernel test: a file replaced by a worker script is noted, survives a prune inside the window, and goes after it.

**Built** in `d090df1`, merged in `ba8a5c9`.
- **Worker scripts.** A worker script's row update goes through `updateRowKeepingFiles` (`routes/worker.ts`).
- **Source tables.** A source table cannot have a file column: `platformType` maps no source type to `file`. So their updates are left, with the reason beside the call (`routes/sources.ts`).
- **Other callers.** There are no other callers of `updateRow` that change files.

**Tests.** `data-access.test.ts`: a file a script replaces is noted, kept inside the window, and removed after it.

**Polish gate.**
1. Rules: 002, 013.
2. Siblings: the console, scripts and sources, as above.
3. Lifecycle: not applicable.
4. States: not applicable.
5. Walk: not a screen. The kernel test runs a real worker script.
6. Guards: as above.
7. Left out: nothing.

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

**Built** in `d586c3a`, merged in `15f178c`, with `bb3ccea` and `7ba600d`.
- **The source page.**
  - `sources/<path>` is a workbench, with `Page fill` and a filling rows browser.
  - Its table list scrolls on its own beside the rows, or above them on a phone. Its entries keep their height there (`bb3ccea`).
- **One rule.**
  - `displayGuess` lives in `packages/manifest/src/table.ts`.
  - The rows API's `expanded` uses it when a table names no display column, so the grid, the picker and the API agree.
- **The grid.** A value is cut short with its cell (`bb3ccea`).
- **The list of sources** keeps a source's name and health on a phone (`7ba600d`).

**Tests.**
- The rule's unit test in `manifest.test.ts`.
- `data.test.ts`: `expanded` names a row with no display column.
- `e2e/polish.spec.ts`: a bound source (`E2E_SOURCE_URL`) is measured as a workbench, and with one scroller.

**Findings.** The end-of-phase run was the first to bind a source. It found three defects:
- the table list crushed to an unreadable strip on a phone;
- long values running past their cells;
- the list of sources crowded at 390 px.

All three are fixed.

**Polish gate.**
1. Rules: 002, 004, 005, 013.
2. Siblings: every grid gets values cut with their cells.
3. Lifecycle: not applicable.
4. States: not applicable.
5. Walk. On the throwaway instance (:8090, Fernhill seeded):
   - at `15f178c`, `appointments`' pet column showed Pepper, Rosie, Shadow, not IDs;
   - a source bound to the instance's own Postgres had one rows scroller beside its table list at 1440, 768 and 390 px, with no page scroll, and its first row at 155 px at 1440;
   - after the fixes, `polish.spec.ts` passed in full with the source bound, at `7ba600d`.
6. Guards: as above.
7. Left out: nothing.

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

**Built** in `05a7e9d`, merged in `cb2ca93`.
- `CHANGELOG.md`.
- Guides: queries, dashboards, tables, data sources, documentation. `pnpm docs:check` passes.
- Fernhill:
  - the query `reports/visits-by-clinic`, and the dashboard `boards/clinic-visits` over it;
  - two console-made docs sites, the rota guide and the supplies guide.
- `e2e/phase-24.spec.ts`: five tests, each named for its POLISH rule.

**The end-of-phase runs.** On a throwaway instance seeded with Fernhill, with a source bound to its own Postgres. The full suites ran once, at the end.
- **`pnpm test` at `cb2ca93`:** 2194 passed, 2 failed (the path-column rule and the rename dialog, both fixed in `bb3ccea`), 2 skipped. The failed files passed again on a fresh build, 89 tests.
- **`pnpm e2e` at `cb2ca93`:** 97 passed, 2 failed, 3 skipped.
  - The single sign-on test needs Keycloak. The exit-criterion tests after it, in the same serial spec, did not run.
  - The overdraw check found the source page's defects. Its serial spec then skipped the rest of the polish tests.
- **Reruns at `7ba600d`:** `polish.spec.ts` and `phase-24.spec.ts`, 16 passed.

**Polish gate.**
1. Rules: 014, 015.
2. Siblings: not applicable.
3. Lifecycle: not applicable.
4. States: not applicable.
5. Walk: the runs above.
6. Guards: the full suites, once, as above.
7. Left out: the single sign-on test, for want of Keycloak here.

## Findings

- **Every decision is built.**
- **What walking and the end-of-phase run found after a milestone's tests had passed:**
  - the widget notice's tone, which did not exist;
  - a rename discard that would take away later edits;
  - the source page's crushed table list, and values past their cells;
  - the list of sources crowded on a phone.

  Each came from screens or states a milestone's own tests did not reach. The bound source was the biggest gap.
- **For the owner.**
  - Other resources that name another by path (an app's tables, a flow's scripts) still follow a rename for 90 days only. The record M1 built for dashboards is the way to follow them.
  - Dashboards deployed before this phase get their record at the next deploy.
- **How it was built.** M1 to M4 side by side, then M5. Each was merged, typechecked on a fresh build, its tests run, and walked. The full suites ran once, at the end.

## Traceability

| Item from phase 23 | Milestone |
|---|---|
| A dashboard follows a renamed query for 90 days only | M1 |
| A file replaced by a worker script or source table is kept forever | M3 |
| A doc writer deploys a feedback table but cannot draft one | M2 |
| The source browser does not fill | M4 |
| Grid reference cells show IDs | M4 |
