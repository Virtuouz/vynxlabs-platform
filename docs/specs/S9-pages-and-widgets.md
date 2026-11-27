# S9: Pages and widgets

The design for apps built in the console and for dashboards, as one system. Owner's direction 2026-11-21: the drawings and notes in `temp/` (six boards on Fernhill's Clinic performance, and a research note), and the owner's decisions recorded in phase 25. Decisions: [0004](../adr/0004-page-actions-run-on-the-server.md), [0005](../adr/0005-the-widget-contract.md), [0006](../adr/0006-one-page-model.md).

## Problem (observed)

The builder answers "what should this page show?" well and "what can someone do here, on which record, and what happens next?" badly.

- **Two systems do one job.** Apps are `interface` bodies (`packages/manifest/src/interface.ts`, eight closed widget types, read from the browser through the rows and aggregate API). Dashboards are `dashboard` bodies (`dashboard.ts`, read through server-compiled queries in `kernel/data/query/widget.ts`). They have separate renderers and separate editors of 800 and 1,400 lines, sharing only the grid, `usePlacement`, `settle` and `useHistory`.
- **The inspector speaks the storage.** "Show totals in place of rows", "Group 1 → Gathered", "What to draw → Shape → Along the bottom, or each slice → How much". Geometry ("From the left", "From the top") takes as much room as meaning.
- **The extension point is a name lookup.** `InterfaceWidget {name, configSchema, render}` (`packages/sdk/src/extensions.ts:85`) has no version, category, inputs, events or layout; its config is never validated; dashboards don't use it; nothing outside the kit registers one.
- **Applications stop at the table.** No record pages, side sheets or modals; no navigation; forms only insert, with references typed as raw text; actions only start a script or flow, and their input mapping, `enabledWhen` and confirmation are enforced only in the browser.

## The product boundary

The builder is for applications made of records, collections, forms, actions, permissions, navigation and workflows. What needs frontend programming is a code app, and that is not a gap in the builder: it is what lets the builder stay small.

The test: can it be said as a business-app sentence? "Open this invoice", "when approved, set status to Approved and start Send invoice" are in. "Set variable X, map it over Y, run this script, update three widgets" is a code app.

**Refused, on purpose** (the decision log at the end says why each):
expressions and formulas as a general mechanism; variables and page state a builder names; custom CSS or per-widget styling beyond the theme; HTML; JavaScript in the builder; DOM events; absolute positioning or overlap; breakpoints; nesting beyond one level (Section and Tabs only); widgets that refer to other widgets by id; a workflow engine inside the builder; generic HTTP requests from widgets; every input type as a top-level widget.

## Model

One body shape, in `packages/manifest/src/page.ts`, for both kinds.

```yaml
# kind: interface — an app's pages
title: Clinic performance
pages:
  - id: money
    title: Money
    kind: page            # page; record, sheet and modal from phase 26
    filters:              # set by whoever reads the page
      - { name: issued, label: Issued, type: date_range, default: last_30_days }
    widgets:
      - id: invoiced-by-week
        type: core/chart
        title: Invoiced by week
        data:             # each input the definition declares, by name
          rows:
            source:       # a query: from menus (visual), saved (query), or SQL on dashboards
              visual:
                table: invoices
                measures: [{ fn: sum, column: total, as: total }]     # "Value: Sum of Total"
                groupBy: [{ column: issued, bucket: week }]           # "Break down by: Issued on · Weekly"
            filters: [{ filter: issued, column: issued }]             # the page filters that narrow it
        config:           # checked against the definition's schema
          mark: line
          format: { style: currency, minorUnits: true }
        at: { x: 0, y: 3, w: 8, h: 5 }
        # on:, rules: and phone: arrive in phases 26 and 29
```

The inspector's words are a reading of the data input, not a second store: "Value" is a measure, "Break down by" a group, "Only include" the query's conditions. The query model is the one dashboards had since phase 18 (decision 0003), so a page and a dashboard ask questions the same way.

```yaml
# kind: dashboard — one page that only holds widgets which read
title: Clinic visits
filters: [ … ]
widgets: [ … ]
```

- `type` is namespaced: `core/…` for the core pack, `labs/…` for the internal pack, a tenant's prefix later. `core/` is reserved, as it is for nodes (`bundle-check.ts`).
- `config` is validated against the widget definition's JSON Schema, at save (draft `problems`) and at deploy (`bundle-check`). An unknown type is a problem, not a crash: the page draws "There is no widget called …" in its place.
- `data` is the only place a widget says what it reads: each input is a source and the page filters bound to it, in the shape its definition asks for (below).
- A member's dashboard (`member_dashboard.body`) is the dashboard body.
- Limits: 20 pages; 24 widgets per page (Section and Tabs count their children); 8 filters per page.

## The widget contract

`packages/widget-sdk`, published as `@volvel/widgets`, re-exported from `@volvel/sdk`. A widget is two halves kept apart:

**The definition** is data. It has no React and no browser code, so the manifest, the CLI and the control plane import it.

```ts
export const chart = defineWidget({
  type: "core/chart",
  version: "1.0.0",
  title: "Chart",
  description: "A trend or a comparison",
  category: "understand",          // records | action | understand | organize | content
  icon: "chart",
  surfaces: ["app", "dashboard"],
  data: {
    rows: { shape: "summary", required: true },   // rows | record | summary | none
  },
  config: { /* JSON Schema with x-volvel hints */ },
  events: {
    pointClick: { gives: "group", label: "When someone clicks a point" },
  },
  layout: { min: { w: 3, h: 3 }, default: { w: 6, h: 5 }, phone: "stack" },
});
```

**The renderer** is a React component that gets only what the host gives it:

```ts
export const ChartView: WidgetView<typeof chart> = ({ config, data, size, emit, state }) => …
```

- `data` is already read, under the viewer's permissions, in the shape declared: `rows` (a page of rows with column info and a way to ask for more), `record` (one row), `summary` (groups and measures), or nothing.
- `emit(event, payload)` raises a declared event. The host checks the payload against the event's shape and does what the page says (`on`). A renderer has no API client, no fetch and no way to run an action.
- `state` is `loading | ready | empty | failed | forbidden` with the message to show; the frame around the widget draws loading, failed and forbidden the same way for every widget (POLISH-001, 002).
- `size` is the widget's cells and pixels, so a renderer can choose a denser drawing without media queries.

### Inspector hints

Every property of `config` and every data input carries `x-volvel`:

| Hint | Values | Meaning |
|---|---|---|
| `tab` | `data`, `display`, `actions`, `rules` | Which tab it appears under |
| `level` | `main`, `more` | Shown at once, or under "More … options" (one level only) |
| `control` | `column`, `columns`, `measure`, `breakdown`, `cadence`, `format`, `segmented`, `choice`, `text`, `markdown`, `number`, `switch`, `conditions` | Which shared control draws it |
| `label`, `help` | text | Said in the reader's terms (POLISH-009) |
| `when` | `{ property: value }` | Only shown when another property has that value (no expressions: equality only) |
| `of` | input name | A column control picks from that input's table |

The inspector is made entirely from these. A widget cannot bring inspector code of its own; when a widget needs a control that does not exist, the control set grows, for every widget (the spec's extension rule: "if a built-in feature needs more than the interface offers, the interface grows").

### Data inputs

A data input names one source:

| Source | Shapes | Read by |
|---|---|---|
| `{ visual: { table, filters?, groupBy?, measures?, columns?, sort?, limit? } }` | rows, record, summary | the query compiler over the workspace's views |
| `{ query }` (a saved query) | rows, summary | the same |
| `{ sql }` (dashboards only) | rows, summary | the same, under decision 0003 |
| `{ record: "this" }` (phase 26) | record | the page's record |

An input's `filters` bind it to the page's filters: a column for a query from menus, a parameter for a saved query or SQL. When a builder adds a filter or a widget, every input whose table has the filter's column is bound to it, so "Follows the page filters" is what a widget does unless someone changes it.

### Reading data

One endpoint reads every widget's data, on the server, from the stored body:

```
GET /api/v1/tenants/:t/workspaces/:w/widget-data?of=interface|dashboard&path=&page=&widget=&filters=&cursor=&draft=1
```

- `of` and `path` name the interface or dashboard. In the builder the draft is read (the caller needs to be able to edit it); served, the deployed body is read.
- The browser sends which widget and the filter values, never a query. The server compiles the widget's input with `kernel/data/query`, checks `data:read` on every table it names, and runs it under `withData(scopeFor(viewer))`, so each table's row policy applies.
- Who may call it: for an interface, `app:read` on an app serving it (as the interface read is checked today), or `interface:read`; for a dashboard, `dashboard:read` or the member dashboard's sharing. No new permission kind.
- The rows API stays for writes, and for tables in an external data source, which the query compiler cannot read (decision 0003); a `rows` input over such a table is read through it by the same endpoint.

## The inspector

```
┌──────────────────────────────────────┐
│ Invoiced by week               ⋯    │   title (also editable on the page), kind
│ Chart                                │
├──────────────────────────────────────┤
│ Data · Display · Actions · Rules     │   tabs; a tab with nothing is not shown
├──────────────────────────────────────┤
│ Source       Invoices        Change  │
│              Follows the page filters│
│ Value        Sum ▾ of Total ▾        │
│ Break down by Issued on ▾  Weekly ▾  │
│ Only include + Add a condition       │
│ ▸ More data options                  │   one level of disclosure
└──────────────────────────────────────┘
```

- **Data**: what it uses. **Display**: how it looks. **Actions**: what people can do with it. **Rules**: when it shows and who can use it, with "Hiding a widget isn't security" and a link to the table's row rules.
- Geometry is on the page: a widget is selected by clicking it; while selected, dragged or resized a chip says "8 × 5 · col 1 · row 3"; exact values are under ⋯ › Layout.
- Things edited on the page: the title (click it), a table's column (click its header: label, format, hide), and later a form's field and a button's action.
- Nothing is configured twice: the same property edited on the page and in the inspector is the same value.

## Adding a widget

"Add to page" opens a dialog: search, then the registry's widgets in their categories (Work with records, Take action, Understand data, Organize, Content), with a one-line description each. A dashboard only shows widgets whose `surfaces` include it. Click places the widget at the end of the page at its default size; dragging places it on the grid. From phase 28, suggestions come first ("This page shows Invoices: Invoice detail, New invoice form…"), each making correctly connected widgets.

## The canvas

Kept: drag by the widget, resize by the bottom-right corner, a twelve-column grid of 40px rows, collisions pushed down and compacted up (`packages/screens/src/layout.ts`). Added: click to select; Esc deselects; arrow keys move the selected widget a cell, Shift+arrow resizes; Delete removes (with Undo); ⌘D duplicates; minimum sizes from the definition; undo and redo for every change (`kit/history.ts`).

## Text

`core/text` is Markdown, parsed by `@volvel/markup` with a profile `page`: headings, lists, links (safe schemes only), emphasis, code, and the product components the docs use (alert, steps, tabs, details, term, kbd, field). No HTML. The same renderer as the docs (`packages/ui/src/Doc.tsx`).

## Records and actions (phase 26–27)

- A page of kind `record`, `sheet` or `modal` opens on one record of its table, passed by whatever opened it; its widgets can read `{ record: "this" }`. The record's id is in the address, so Back and a shared link work.
- A collection widget's "When a row is clicked": do nothing, open a record page (the clicked row passed along), go to a page, or run an action.
- An action is a short list of steps: ask to confirm; update this record (set fields to a value, today, now, the current user); create a record; delete; start a flow or script with this record as input; open a page; show a message; and what happens if something fails. Steps run on the server from the deployed page (decision 0004). Anything more complicated is a flow.
- Conditions are sentences: a field compared with a value, "the record exists", "the current user is in group …". They decide whether a widget shows or a button can be pressed, and, for actions, are checked again on the server.

## Responsive (phase 29)

Desktop is authored. Tablet is derived (the same grid, narrowed); phone stacks widgets in reading order. Each widget says what it does on narrow screens in its definition (`phone: stack | list | hide`) and a builder may override per widget: Keep, Full width, Stack below, Hide, and a priority. Dragging on the phone preview asks first, and marks that widget changed by hand, with "Go back to automatic".

## Developer widgets (later)

Decision 0005 designs, and does not build: a `widget` resource kind carrying a definition and a built renderer, versioned and pinned per deploy, rendered in a sandboxed frame on the app address with no network, given only its config, its resolved data and the theme, and able only to send its declared events. The builder's experience is the same for a core widget and a developer's.

## Roadmap

| Phase | At the end a person can… |
|---|---|
| 25 | build Clinic performance and Clinic visits on one system, configure any widget in Data, Display, Actions and Rules, place it on the canvas, carry it in from "Add to page", write Markdown; a widget from an internal pack works the same |
| 26 | click an invoice and see it in a side sheet, step through invoices, mark one paid from a button whose steps run on the server, edit it and create one with a form made from the table, run row actions, start a flow, open record pages and modals with Back and a shared link, show a widget only when a sentence holds; on a dashboard, see the rows behind a number (the old 26 and 27, merged by the owner) |
| 27 | build the Visits and Stock pages with Section, Tabs, Search and filter and Action group, helped by suggestions |
| 28 | use the app on a phone without arranging it by hand; publish after a readiness check; see a page as a group sees it ("View as"); restore an earlier draft |

## Decision log

| Refused or chosen | Why |
|---|---|
| No expressions or formulas | Every no-code tool that added them became programming with dropdowns. Conditions are sentences; derived values belong in a query or a flow. |
| No variables or page state named by a builder | The record context (this record, the clicked row, the current user) and page filters cover the cases the boards draw. |
| No per-widget CSS | One design system (spec, Unified experience); theme tokens are the only styling. |
| Widgets don't refer to each other by id | A detail reads "this record", passed by navigation; a chart and a table narrow together through page filters. Nothing breaks when a widget is renamed or removed. |
| Data read by the host | So a widget, a core one or a developer's, can never read more than its declared input under the viewer's permissions; and so a published page cannot be made to ask a different question from the browser. |
| Actions run on the server | Decision 0004: the browser-only checks were not a boundary. |
| One level of nesting | Section and Tabs group widgets; a section inside a tab inside a section is a layout system. |
| One level of "More options" | Nielsen: beyond two levels of disclosure, people stop finding things. |
| Apps and dashboards share everything but their widget list | The owner's decision; two editors for one job had drifted (POLISH-002). |
| No compatibility with phase 7–24 bodies | Decision 0006: no instance outside our own exists. |
