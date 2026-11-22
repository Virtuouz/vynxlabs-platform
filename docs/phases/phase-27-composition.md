# Phase 27: a page is composed of sections, tabs, a search bar and toolbars, helped by suggestions

Status: in progress, on branch `phase-27-composition`, off `phase-26-records-and-actions` at `985e82b`.
Last updated: 2026-11-21

Phase 26 made the builder an application builder for one record at a time. This phase is about the page as a whole. A page holds its widgets in Sections and Tabs, and its search box and filters are a widget that sits on the page. Related buttons are one toolbar, an Action group. Suggestions help a maker start a page from a table, and group what belongs together. The research's "six that change the nature of the product" are finished here: Record detail and List came in phases 25 and 26, and Section, Tabs, Search and filter and Action group come now. The drawings are boards 2 (the "Organize" group of "Add to page", and the search bar across Money) and 3 (the invoice sheet's Action group) in `temp/`. The roadmap is in S9.

Spec sections: Apps and user interface (Pages and widgets). Design: [S9](../evolution/specs/S9-pages-and-widgets.md). Decisions: [0005](../evolution/decisions/0005-the-widget-contract.md) (a widget's role is the platform's), [0006](../evolution/decisions/0006-one-page-model.md) (no compatibility).

**Exit criterion.** On `examples/fernhill`, in a browser:

- **Money:** a bar reading "Search invoices · Clinic · Issued · Status" across the top narrows every stat, chart and table on the page. Typing a client code narrows the Invoices table. A reload and a shared link keep what was typed and chosen.
- **Visits:** the page is a Section, "Today at the clinics", holding the stats, and a Tabs widget, "By status · By reason · Every visit", where each tab holds its own widgets. The open tab is in the address. A Section folds, and stays folded after a reload.
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

## Findings

To be written as the phase is built.

## After the owner's first look

Not yet.
