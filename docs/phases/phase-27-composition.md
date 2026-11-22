# Phase 27: a page is composed of sections, tabs, a search bar and toolbars, helped by suggestions

Status: built, on branch `phase-27-composition`, off `phase-26-records-and-actions` at `985e82b`. Waiting for the owner's first look.
Last updated: 2026-11-21

Phase 26 made the builder an application builder for one record at a time. This phase is about the page as a whole. A page holds its widgets in Sections and Tabs, and its search box and filters are a widget that sits on the page. Related buttons are one toolbar, an Action group. Suggestions help a maker start a page from a table, and group what belongs together. The research's "six that change the nature of the product" are finished here: Record detail and List came in phases 25 and 26, and Section, Tabs, Search and filter and Action group come now. The drawings are boards 2 (the "Organize" group of "Add to page", and the search bar across Money) and 3 (the invoice sheet's Action group) in `temp/`. The roadmap is in S9.

Spec sections: Apps and user interface (Pages and widgets). Design: [S9](../evolution/specs/S9-pages-and-widgets.md). Decisions: [0005](../evolution/decisions/0005-the-widget-contract.md) (a widget's role is the platform's), [0006](../evolution/decisions/0006-one-page-model.md) (no compatibility).

**Exit criterion.** On `examples/fernhill`, in a browser:

- **Money:** a bar reading "Search invoices · Clinic · Issued · Status" across the top narrows every stat, chart and table on the page. Typing a client code narrows the Invoices table. A reload and a shared link keep what was typed and chosen.
- **Visits:** the page is a Section, "At the clinics", holding the stats, and a Tabs widget, "By status · By reason · Every visit", where each tab holds its own widgets. The open tab is in the address. A Section folds, and stays folded after a reload.
- **Stock:** a search bar finds an item. "Orders to VetSupply" sits in a Section that folds. An Action group over the stock table holds "Reorder" and "Count stock".
- **The invoice sheet:** an Action group, as board 3 draws it, holds Mark paid, Edit and Void. Those that don't fit go under "More", on a phone too.
- **In the builder:**
  - a widget is dragged into a Section, onto a tab of Tabs, and out again;
  - the same moves are made from the keyboard, from ⋯ › Move to;
  - the outline shows what each container holds;
  - a container grows with what it holds;
  - duplicating or removing a container takes what it holds, and can be undone.
- **The Search and filter widget** is configured in the inspector: a search across the table's text columns, and a filter by a column. Every widget whose table has the column follows it.
- **"Add to page"** opens with suggestions for the page's table. A button offers to be grouped with the buttons beside it. "+ Page" offers "A list of Invoices" (search, table, detail sheet, New invoice form) and "An Invoice record page".
- **On Clinic visits** (a dashboard), the filters are a Search and filter widget. A Section and Tabs are used there too. An Action group is not offered.

## Owner decisions

Answered by the owner on 2026-11-21.

| # | Area | Decision |
|---|---|---|
| 1 | Filters | **The widget replaces page filters.** A page's filters are declared only by Search and filter widgets. They narrow every widget bound to them, as page filters did. Fernhill's pages and dashboards are rewritten (no compatibility owed). |
| 2 | Containers | **Containers with their own grid.** A Section, or a tab of Tabs, holds widgets on a grid of twelve columns inside it, and moves as one piece. Widgets are dragged in and out. Nesting is one level deep. |
| 3 | Dashboards | **Section, Tabs and Search and filter.** Action group, like Button, is for apps only. |
| 4 | Suggestions | **All three:** suggestions come first in "Add to page"; buttons can be grouped into an Action group; "+ Page" starts a page from a table. |
| 5 | Work | Up to ten parallel agents, as phases 25 and 26 used. |

## The contract (M1)

- **A widget in a container** says so: `in: { widget, tab? }` (`packages/manifest/src/page.ts`, `PageWidget.in`). A page's widgets stay one flat list, so an action, a data read and `locatePage` find a widget by its id as before. A widget in a container has its `at` on the container's own grid of twelve columns.
- **One level.** A container is never inside another. A child of Tabs names its tab, and a child of a Section names none. The check is `checkWidgets`.
- **A container's height** on the page's grid is `containerHeight(container, widgets)`: one heading row, plus the bottom of what it holds (`packages/manifest/src/parts.ts`).
- **A definition's `role`** (`packages/widget-sdk`), for the `core/` pack only:
  - `container`: Section and Tabs;
  - `filters`: Search and filter. Its `config.filters` are the page's filters, collected by `filtersOf(widgets, roles)`. Each name is declared once on a page, and a page has at most eight.
- **A new filter type, `search`.** A binding of a search to a visual query names `columns` (or one `column`); a row is kept when any of them holds the words. A binding to a saved query or SQL fills a parameter with the words.
- **What a view is given** (`WidgetViewProps`):
  - `place(tab?)`: a container's view renders the host's drawing of what it holds;
  - `tab: { open, choose }`: a container with tabs;
  - `filters: FilterHost` (`values`, `set`, `reset`, `options`): a filter widget.
- **New controls:** `tabs` (Tabs' list of tabs) and `pageFilters` (Search and filter's filters).
- **Four definitions** (`packages/widgets-core/src/index.ts`): `core/section`, `core/tabs`, `core/filter` ("Search and filter", app and dashboard, drawn with no card) and `core/actions` ("Action group", app only, no card). Each has a plain view (`views/compose.tsx`) until its own view replaces it.
- **`@volvel/manifest/parts`**: `filtersOf`, `filterWidgets`, `isContainer`, `tabsOf`, `childrenOf`, `topLevel`, `containerHeight`, `withFilters`. These are pure, with nothing compiled, so the served app imports them.
- **The bodies:** `Page.filters` and `DashboardBody.filters` are gone. Every example body was moved: a Search and filter widget at the top, with the other widgets moved down two rows. M8 then shapes the pages for real.

## Milestones

| # | Milestone | Decision |
|---|---|---|
| M1 | The contract: containers, filters by widget, roles, the four definitions | 1–3 |
| M2 | The server: a search narrows a visual query across columns, and fills a query's parameter; filters are read from the page's filter widgets everywhere | 1 |
| M3 | The renderer draws containers: a Section and Tabs, each on its own grid; the open tab in the address; a Section folds and stays folded; on a phone, what a container holds is stacked | 2 |
| M4 | Search and filter and Action group are drawn: the bar where the widget sits, no bar above the page, filters in the served app's address; a toolbar with "More" | 1, 3 |
| M5 | The canvas: drag into and out of a container, keyboard moves, a container grows with what it holds | 2 |
| M6 | The builder: the outline nests, ⋯ › Move to, duplicate and remove take what a container holds, "Add to page" adds into the chosen container | 2 |
| M7 | The inspector: Tabs' tabs, Search and filter's filters (a search across text columns, a filter by a column), what follows a filter | 1 |
| M8 | Suggestions: first in "Add to page"; group buttons; "+ Page" from a table | 4 |
| M9 | Fernhill (Money, Visits, Stock, the invoice sheet, Clinic visits), the other examples, the guides | all |
| M10 | The walk-through (`e2e/phase-27.spec.ts`), the specs that read a filter bar, `polish-setup.ts` | all |

M1 is built first, by the integrator. M2 to M10 are built side by side against the contract, then merged.

## M1: the contract

**Built.** As above: `packages/manifest/src/page.ts` and `parts.ts`, `packages/widget-sdk/src/index.ts`, `packages/widgets-core/src/index.ts` and `views/compose.tsx`. The bodies and test fixtures are moved, and the console keeps the page's filters in its filter widget (`withFilters`) until M7 replaces that.

**Tests.** `packages/manifest/src/page.test.ts`, "composition (phase 27)":
- containers, one level deep, with tabs named;
- filters declared by widgets, each name once, in a filter's shape;
- a search binding's columns;
- a dashboard refusing an Action group.

**Polish gate.** Not applicable: nothing a person sees, beyond plain views that M3 and M4 replace.

## M2: a search narrows a table across columns, on the server

**Built.**
- **Search value** (`apps/control-plane/src/kernel/data/query/filters.ts`): a `search` value is text of at most 200 letters and 10 words. An empty search narrows nothing.
- **Visual queries** (`visual.ts`): each word must be found in one of the binding's columns, compared as text, with `%`, `_` and `\` matched literally and the words bound as parameters. A joined column works as other filters' columns do.
- **Saved queries and SQL** (`widget.ts`): a search fills the query's parameter with the words.
- **Rows of a data source's table** (`inputs.ts`): each word becomes "contains" in any of the columns.
- **Rows sort by any column of their table**, shown or not (found in the walk): Fernhill's orders read newest first by `created_at`.

**Tests.**
- `apps/control-plane/src/widget-data.test.ts`, "a search" (9): two columns, two words, literal `%` and `_`, empty, a joined column, a saved query's parameter and SQL's, row rules for two groups of end users, too long, and filter-options refusing a search.
- `queries.test.ts`: the sort rule both ways.

## M3 and M5: containers drawn and placed

**Built.**
- **One grid** (`packages/screens/src/PageView.tsx`): `WidgetGrid` draws the page's grid and each container's. Every child is a whole cell: data, actions, conditions, events.
- **Section and Tabs** (`packages/widgets-core/views/section.tsx`, `tabs.tsx`):
  - Section folds with a short slide. Its Fold sits on its heading's row and is named by what it folds.
  - Tabs is the kit's tab strip, named by the widget's title.
- **Kept across a reload:**
  - the open tab is in the address (`tab.<widget>=<tab>`, `navigation.tsx`), so a reload and a link keep it;
  - a folded Section stays folded for its reader (`localStorage`, every access guarded).
- **Drag between grids** (`placement.ts`):
  - a widget is dragged into a Section and out again;
  - held over a tab's name, that tab opens and the widget lands on it;
  - the arrows and Shift+arrows move and size a child on its container's grid.
- **Heights** (`fitContainers`, `layout.ts`): a container is as tall as what it holds, and what is below moves down. A titled Tabs has two heading rows (`headRows`, `packages/manifest/src/parts.ts`).

**Tests.** `packages/screens/src/containers.test.tsx` (20): children on their container's grid, tabs, the address, the fold and storage that refuses, heights, dropping in and out, a container never in a container, a moved child's tab opening.

## M4: Search and filter, and Action group

**Built.**
- **Search and filter** (`packages/widgets-core/views/filter.tsx`):
  - a bar that wraps, with no card;
  - a search box with the typing pause, a clear button, Esc and `/`;
  - choice filters read their values from the column;
  - "Clear" when something differs from how the filters start.
- **Nothing above the page:** `PageView` draws no filter bar, and gives each filter widget its `FilterHost` (`filterHost.ts`).
- **The served app's address** keeps the filters (`f.<name>`, `filterAddress.ts`), so a reload and a link keep what was typed and chosen.
- **A bar that wraps** is drawn as tall as it is, with what is below moved down (found in the walk).
- **Action group** (`views/actions.tsx`):
  - buttons in their tones, disabled with their reason;
  - pending while one runs;
  - what doesn't fit goes under "More".

**Tests.** `filter-widget.test.tsx` (9), `actions-group.test.tsx` (8), `filterAddress.test.ts` (4).

## M6: the builder around containers

**Built.** `apps/console/src/screens/builder/containers.ts` and `PageEditor.tsx`:
- **Duplicate and remove** take what a container holds, in one step that can be undone, and say so.
- **⋯ › Move to** lists each Section and each tab, and the page when the widget is in a container (`kit/inspector/MoveTo.tsx`).
- **The outline** nests children under their container, by tab.
- **"Add to page"** adds into the chosen container. A Section or Tabs always goes on the page.
- **A container's header** says what it holds.

**Tests.** `builder-containers.test.ts` (12), `builder-containers.test.tsx` (8).

## M7: the inspector

**Built.**
- **Search and filter's filters** (`kit/inspector/filtersControl.tsx`): add a search (labelled by the table) or a filter by a column, whose kind follows the column's type. Each can be renamed, reordered, or removed with undo, and its name never changes.
- **Tabs' tabs** (`tabsControl.tsx`): a tab holding widgets asks whether they move to another tab or go.
- **A data widget's Data tab** lists each filter with a switch, and a search's columns.
- **The section under the canvas, "Filters for whoever reads this page", is gone.**

**Tests.** `page-filters.test.tsx` (14), and `Dashboards.test.tsx`.

## M8: suggestions

**Built.**
- **"Add to page" opens with "Suggested for Invoices"**: a search, a detail, a form, group the buttons, a section for the numbers. Each makes connected widgets in one step, and nothing is offered that the page has.
- **Grouping** (`GroupButtonsDialog.tsx`, `ButtonOffers.tsx`): a button offers to be grouped with the others, and a Record detail's actions move to an Action group above it.
- **"+ Page" starts from a table** (`NewPageDialog.tsx`, `starters.ts`): a list of it, or a record page for it, from the table the app reads most. It reuses the app's sheet and form when it has them.

**Tests.** `builder-composition.test.tsx` (13), which checks each starter's body with `checkInterface`.

## M9: Fernhill and the guides

**Built.** `examples/fernhill/src/apps.ts`:
- **Money:** "Search invoices · Clinic · Issued · Status", and a void invoice is left out of the totals.
- **Visits:** "At the clinics", which folds and holds four stats, and Tabs "By status · By reason · Every visit". It starts on the last 30 days.
- **Stock:** a search, "Reorder" and "Count stock" as an Action group, and "Orders to VetSupply" in a Section that folds.
- **The invoice sheet:** an Action group of Mark paid, Edit and Void.
- **The rest:**
  - Clinic visits (`setup.mjs`) has a filter widget and Tabs.
  - The desk example has searches.
  - The guides `build/app-builder.md`, `build/app-builder-editor.md` and `data/dashboard-builder.md` are updated.

## M10: the walk-through

**Built.** `e2e/phase-27.spec.ts` (16) walks the exit criterion. `dashboards.spec.ts` and `polish-setup.ts` declare their filters with a Search and filter widget, and the page editor is measured with a Section on it.

## Polish gate (M3 to M10, which change what people see)

1. **Rules.**
   - 001: a container that holds nothing says "Drag a widget here"; a filter that narrows everything away says so.
   - 002: one grid for the page and its containers; one filter model, the widget's; one container fit and one tab removal for the canvas and the builder; a Section's line is the widget's subtitle, not a second setting.
   - 003: containers are added, moved in and out, duplicated, removed and undone with what they hold.
   - 004 and 005: walked at 1440, 1440×640, 768 and 390.
   - 006: the open tab and the filters in the address; the fold kept for its reader.
   - 007: Move to; the arrows; Enter on a tab; Esc in a search.
   - 008: a drag over a container reaches it as the page makes room; dialogs leave as dialogs do.
   - 009 and 010: the boards' words.
   - 011: filter controls by column type.
   - 012: a search waits for typing to pause.
   - 013: below.
   - 014: walked on a seeded instance.
2. **Siblings.**
   - **Shared drawing:** the app builder's canvas, the served app and dashboards share `WidgetGrid`, `fitContainers`, `placement` and the core views. Every fix above was made there.
   - **Shared fixes:**
     - `Frame` draws no title box on any frameless widget (Button, Search and filter, Action group);
     - a tab strip is named by its widget's title, which the contract now gives every view;
     - the placement fixes hold for every drag, the page's own included.
3. **Lifecycle.**
   - Container: add, move, size, duplicate, remove and undo, with what it holds; move a widget in, between and out.
   - Tab: add, rename, reorder and remove, asking about what it holds.
   - Filter: add, rename, reorder and remove with undo.
   - Bulk: left out.
4. **States.**
   - A container waiting for widgets.
   - A filter bar loading its choices.
   - A choice filter whose values can't be read falls back to typing.
   - Tabs: the open tab's widgets are read when opened.
   - An Action group: a button pending, or disabled with its reason.
5. **Walk.** Below, in Findings.
6. **Guards.**
   - Typecheck, each milestone's tests, `pnpm test`, `pnpm e2e` (below), `docs:check` and `check:schemas`.
   - Example bodies checked with `checkInterface` and `checkDashboard`, with every container's height.
   - The served runtime imports only `@volvel/manifest/parts` and `/action`.
7. **Left out.** Nothing from the decisions or the exit criterion. The exit criterion was changed in one place, for the reason below: Visits' Section is "At the clinics" over the last 30 days, not "Today at the clinics".

## Findings

Built by the integrator (M1) and eight parallel agents for M2 to M10, each in its own worktree against the written contract, then merged and integrated (`c8ca4d7`…`bdaf3d3`, `7c9804a`).

**The walk (2026-11-21 and 22).** A throwaway instance on port 8080 with its own database and bucket, seeded by `examples/fernhill/setup/setup.mjs`.
- **Served, as a practice manager:** Money, Visits and Stock at 1440, 768 and 390, in light and dark. Searching Money, the Visits tabs, folding, and the invoice sheet's Action group. No page overflows sideways, and no errors in the console.
- **The builder at 1440, 768 and 390, in light and dark:**
  - the filter widget's inspector;
  - "Add to page" with suggestions;
  - Visits' Section and Tabs, the Tabs inspector, and the nested outline.
- **At 1440×640:** the builder, from the walk-through's builder tests.
- **By keyboard:** Move to; Shift+arrows growing a Section; Enter on a tab; the fold by Enter; ⌘D and Delete with Undo.
- **With a reload and a link:** the open tab, the filters and the fold.

**Found and fixed in the walk:**
- **"Orders to VetSupply" and the visit requests said "The query cannot be run".** They list the newest first by `created_at`, which a rows query couldn't sort by. Rows now sort by any column of their table.
- **A tab strip was named "Tabs" for assistive technology.** It is named by its widget's title, which the contract gives views as `title`.
- **A Section had two settings for its one line,** the widget's subtitle and its own description. It has the subtitle.
- **A Section or Tabs chosen in "Add to page" with a container selected was put into it.** It goes on the page.
- **A drag aimed at a Section never reached it.** The page made room for the dragged widget as it went, pushing the Section down. A drag now reaches the containers where they were when it began.
- **A widget moved onto a hidden tab left that tab closed,** so the selected widget was out of sight. Its tab opens.
- **A widget couldn't be dropped onto a tab other than the open one.** Held over a tab's name, the tab opens and the widget lands at its bottom.
- **The grouping dialog vanished without its motion,** because grouping removed the button it was about. It keeps what it asked about.
- **"+ Page" offered "A list of Appointments" on an app about invoices.** It starts from the table the app reads most.
- **Visits opened on four zeros and "Nothing matches the filters".** It defaulted to today, and Fernhill's history has no visits today. It starts on the last 30 days, and the Section is "At the clinics".
- **The fold was a bare chevron on a row of its own.** It is "Fold" or "Unfold" on the heading's row.
- **Money's filter bar was cut off at 768 and on the canvas,** where its five filters wrap to two lines. A filter widget is drawn as tall as its bar, with what is below moved down.
- **Selecting a frameless widget put a "Name this widget" box over what it draws.** A frameless widget is named in the inspector only, and says so.
- **The field-description share fell below its floor.** The filter bindings are described.
- **Mark paid's confirmation said "Mark this record as paid?"** once it moved into the sheet's Action group, which passes no record. An action given no record uses the page's record, so it names the invoice again.
- **The Data tab listed a switch for each of Money's five filters under Source,** pushing "Break down by" out of sight, against phase 25's exit criterion. It is one line again, as board 1 draws it ("Follows the page filters: All of them"), which opens to the switches.

**Not fixed, said here:**
- **Visits' pie:** the core chart gives "cancelled" and "no_show" two nearly identical greens. That is the chart's palette, from phase 25.
- **The Action group's "More" menu:** an item that can't be pressed shows why and does nothing, because the kit's menu has no disabled item.
- **Filter changes in the served app** replace the address rather than adding to the history, so Back doesn't step through them.
- **Not walked:**
  - the longest real values in a filter bar's labels;
  - the network throttled with Tabs.

**The full suites.**
- `pnpm test`: 2,454 passed and 12 failed, all in `execution.test.ts`, whose workers' timings slip under the whole suite's load. All 49 of that file's tests pass on their own; this phase didn't touch it.
- `pnpm e2e` on a fresh instance set up as CI sets it up: 131 passed, 2 failed, 2 skipped, and 11 didn't run (the tests after each failure in the same file). Both failures were real and are fixed above: phase 25's "five choices without scrolling", and phase 26's Mark paid naming its invoice.
- The grant test's direct calls now address the Action group: they had found nothing there and so passed for the wrong reason.
- Rerun after the fixes: `phase-25`, `phase-26` and `phase-27`, 30 passed.
- `docs:check` (37.0% of the kinds' fields described) and `check:schemas` pass.

## After the owner's first look

Not yet.
