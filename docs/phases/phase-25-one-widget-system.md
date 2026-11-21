# Phase 25: apps and dashboards are built from one set of widgets, configured in the reader's words

Status: in progress (M2–M11 built; M12 and the full suites remain), on branch `phase-25-one-widget-system`, off `main` at `35a61cc`.
Last updated: 2026-11-21 (after the first walk)

The owner's drawings in `temp/` (six boards on Fernhill's Clinic performance, `Volvel App Builder redesign.html`, and `research.md`) ask for the builder to become an application builder: a Data, Display, Actions and Rules inspector in task words, record pages, steps run by buttons, forms made from a table, phone layouts made for you, a check before publishing. The owner then asked that apps and dashboards be one system, that widgets come from a contract developers could later use, with the built-ins as a core pack, that text be Markdown with the docs' components, and that no compatibility be kept with what was built before.

This phase builds the foundation and the inspector: one page model, the widget contract, one way of reading data, one renderer, one editor, the core pack's widgets that read, and an internal widget that proves the contract. Records and actions follow in phases 26 and 27 ([S9, Roadmap](../evolution/specs/S9-pages-and-widgets.md#roadmap)).

Spec sections: Apps and user interface (Pages and widgets, Dashboards), Extensibility (Interface widget). Design: [S9](../evolution/specs/S9-pages-and-widgets.md). Decisions: [0004](../evolution/decisions/0004-page-actions-run-on-the-server.md), [0005](../evolution/decisions/0005-the-widget-contract.md), [0006](../evolution/decisions/0006-one-page-model.md).

**Exit criterion.** On `examples/fernhill`, in a browser:

- in the app builder, on Clinic performance's Money page, "Invoiced by week" is made a line of the sum of Total by week of Issued on, in five choices, in the Data and Display tabs, without scrolling the inspector;
- on the same page, Average invoice is changed to the average of Total, and "Unpaid" to a count where Status is Unpaid;
- a widget's title is changed by clicking it on the page; a widget is moved and stretched by dragging and by keys, its size said as "8 × 5 · col 1 · row 3"; it is duplicated, removed and brought back with Undo;
- a Text widget is added from "Add to page" and written in Markdown with an alert and steps;
- the labs Goal widget is added from "Add to page", set to "Invoiced this month, of $60,000", and configured in the same inspector;
- on the dashboards screen, Clinic visits is changed in the same editor, and "Add to page" offers only widgets that read;
- Clinic performance is published, and a front-desk end user and a manager open it and see the rows their groups allow.

## Owner decisions

Answered by the owner on 2026-11-21.

| # | Area | Decision |
|---|---|---|
| 1 | Plan | A roadmap for phases 25 to 29 in S9, and this phase in full. Later phases are detailed when each starts. |
| 2 | Actions | **On the server**, from the deployed body (decision 0004). Built in phase 26. |
| 3 | Dashboards | **The same system**: one model, renderer, inspector and registry; dashboards differ by which widgets they offer. |
| 4 | Drawings | **Followed closely**: layout, wording and flows. 768 and 390 are designed in the same spirit; differences are said in Findings. |
| 5 | Compatibility | **None.** Interfaces, dashboards and member dashboards made before this phase are not read or upgraded (decision 0006). |
| 6 | Text | Markdown, with the components the documentation uses, in apps and dashboards. |
| 7 | Extensibility | A declarative contract and an SDK; the built-ins are the core pack; one internal widget proves it; how a developer's widget would be packaged and run is designed (decision 0005), not built. |

## Milestones

| # | Milestone | Decision |
|---|---|---|
| M1 | The spec says what pages and widgets are | 1, 3, 5, 7 |
| M2 | One page model for apps and dashboards | 3, 5 |
| M3 | A widget is a definition and a renderer, from a registry | 7 |
| M4 | Every widget's data is read on the server from the stored page | 3, 5 |
| M5 | One renderer and one editor draw both | 3 |
| M6 | The core pack's widgets that read | 3, 4 |
| M7 | The inspector is made from the definition: Data, Display, Actions, Rules | 4 |
| M8 | Size and place live on the page | 4 |
| M9 | "Add to page", by what it is for | 4 |
| M10 | Text is Markdown | 6 |
| M11 | A widget from another pack works the same | 7 |
| M12 | Fernhill, guides, changelog, the walk-through | all |

M2 and M3 can be built side by side; M4 needs M2; M5 needs M3 and M4; M6 needs M5; M7 to M10 can be built side by side after M6; M11 needs M7 and M9; M12 is last. Old code is deleted in the milestone that replaces it.

## M1: the spec says what pages and widgets are

**To build.** The master spec moves the builder from deferred to current, with its boundary, and names the core pack under the Interface widget extension point. S9 holds the design; decisions 0004 to 0006 hold the three choices that change how the platform works. This document.

**Built.** `docs/master-spec.md` (Current focus, Non-goals, Two tiers of app, Pages and widgets, Frontend stack, Extensibility, Deferred); `docs/evolution/specs/S9-pages-and-widgets.md`; `docs/evolution/decisions/0004-page-actions-run-on-the-server.md`, `0005-the-widget-contract.md`, `0006-one-page-model.md`.

**Tests.** `pnpm docs:check`.

**Findings.**

- The master spec still listed the drag-and-drop builder as deferred and a non-goal, although phase 7 built one; both are corrected.
- The spec's Interface widget extension point already says "if a built-in feature needs more than the interface offers, the interface grows". The contract in decision 0005 is that rule applied: the core pack's needs are what grow it.
- The drawings could not be rendered to images while planning (a tool check stopped the command); their text was read from the file. They are rendered in M12 for the walk.

**Polish gate.** Not applicable: nothing a person sees changes.

## M2: one page model for apps and dashboards

**To build.** `packages/manifest/src/page.ts`: the page and widget schema (S9, Model), `checkPage`/`checkPages` (ids, `at` inside the grid, limits, `type` known, `config` valid against its definition, data inputs naming real tables and columns), and the kinds `interface` and `dashboard` using it. `interface.ts` and the old `dashboard.ts` body, `upgradeDashboard`, `isOldDashboard` and `placeWidgets` are deleted, and their callers moved: `references.ts`, `rename.ts`, `dashboard-queries.ts`, `bundle-check.ts`, `deploy.ts`, `cli/build.ts`, `routes/interfaces.ts`, `routes/dashboards.ts`, `kernel/tenancy/tables.ts`. A migration clears member dashboards. `docs/contracts/tenant-export.md` describes the new body.

## M3: a widget is a definition and a renderer, from a registry

**To build.** `packages/widget-sdk` (`@volvel/widgets`): `defineWidget`, the hint vocabulary, data shapes, events, layout, `WidgetView` props, and the two registries (S9, The widget contract). `InterfaceWidget` and `packages/ui/src/widgets.tsx`'s registry are deleted. `enforce.test.ts`: a pack imports only `@volvel/widgets` and `@volvel/ui`.

## M4: every widget's data is read on the server from the stored page

**To build.** `routes/pages.ts`: `GET …/pages/:kind/:path/widgets/:widget/data` (S9, Reading data), on `kernel/data/query`, under `withData(scopeFor(viewer))`, draft for editors and deployed body when served; rows for external data sources through the rows path. The "until" day of a date filter is included (today it is dropped in apps). Tests: two groups see different rows of one widget; an end user can't read a draft; a widget over SQL keeps row rules; filter values out of range are refused.

## M5: one renderer and one editor draw both

**To build.** `packages/screens` draws any page by registry lookup, with the frame (title, states) every widget shares; the served runtime and the console use it. One `PageEditor` and `EditorShell` serve the app builder and dashboards; `AppBuilder.tsx` and `Dashboards.tsx` keep only what differs (pages and publishing; sharing and members' dashboards). `builder/WidgetSettings.tsx`, `dashboards/WidgetEditor.tsx` and `dashboards/Widgets.tsx` are deleted.

## M6: the core pack's widgets that read

**To build.** `packages/widgets-core`: Table, List, Stat, Chart (bar, line, area, pie, scatter, heatmap; compare with the period before; trend) and Pivot, each with a definition in the drawings' words ("Value: Sum of Total", "Break down by: Issued on · Weekly", "Chart type", "Numbers look like") and declared events for phase 26.

## M7: the inspector is made from the definition

**To build.** `apps/console/src/kit/inspector/`: the header (title, kind, ⋯ with Layout, Duplicate, Remove), the Data, Display, Actions and Rules tabs (hidden when empty, with counts), one level of "More … options", and the shared controls named by `x-volvel.control`. The Rules tab says that hiding a widget isn't security and links to the table's row rules.

## M8: size and place live on the page

**To build.** Select by clicking a widget; a chip with size and place while selected, dragged or stretched; exact values under ⋯ › Layout; arrow keys move, Shift+arrows stretch, Esc deselects, Delete removes with Undo, ⌘D duplicates; the title edited by clicking it; minimum sizes from the definition.

## M9: "Add to page", by what it is for

**To build.** A dialog with search, the registry's widgets in their categories with a line each, filtered by the surface; click places at the end, dragging places on the grid; a widget from a pack other than core shows its pack's name.

## M10: text is Markdown

**To build.** `@volvel/markup` profile `page`; `core/text` with a Markdown control (editor, preview, and the components it may use).

## M11: a widget from another pack works the same

**To build.** `packages/widgets-labs`: `labs/goal`, progress toward a target (a summary input, a target, a format, a `click` event, layout limits), registered only through `@volvel/widgets`. Fernhill's Money page uses it. Findings say what the contract had to change for it.

## M12: Fernhill, guides, changelog, the walk-through

**To build.** Fernhill's `performance` interface and `boards/clinic-visits` dashboard, `examples/acme`'s `screens/invoices`, and `examples/higher-ed-devices`' screens and dashboard rewritten; Fernhill's setup also seeds a page made in the console; `e2e/polish-setup.ts` measures the page editor; guides for building an app, a dashboard, and writing a widget; `CHANGELOG.md`; `e2e/phase-25.spec.ts`, each test named for its POLISH rule; the full `pnpm test` and `pnpm e2e`.

## Findings

Built by the integrator and five parallel work streams (control plane; renderer and core views; console; Markdown and labs; examples and end-to-end), each in its own worktree, against one written contract, then merged (`617fa6f`…`bd5d29a`).

**The walk (2026-11-21).** A throwaway instance (its own database and bucket, port 8095), seeded by `examples/fernhill/setup/setup.mjs`.

- **Builder, Money (Clinic performance) and the console-made Front desk board.** At 1440×900, 1440×640, 768 and 390, light and dark: the outline, filters, canvas and inspector are drawn as board 1. Data shows Source, "Follows the page filters", Value "Sum of Total", "Break down by Issued on · Weekly", Only include and More data options. All four tabs, "Add to page" grouped as board 2 (with the labs Goal marked "Labs pack"), click to select, the chip "8 × 8 · col 1 · row 6", → and Shift+↓, Ctrl+D, Delete and undo, and a reload.
- **The published app**, as a practice manager at 1440, 768 and 390, light and dark: the pages are tabs, the filters, stats, Goal and charts are drawn from Clinics' rows, the page stacks on a phone, and a tab survives a reload. As a front-desk end user it is refused, "Not for this account", and the portal doesn't list it.
- **A repository dashboard** (Visits by clinic) is read only, with Download.
- **Found and fixed in the walk:**
  - a widget just added or copied showed a failure until its draft was saved (`apps/console/src/screens/builder/client.ts`, test `builder-client.test.ts`);
  - the Goal's number overflowed three columns (it now uses the kit's type scale);
  - the Text widget's second line was cut off, and the Goal's title was truncated (Fernhill's Money page);
  - Download was offered for a single number;
  - Fernhill's goal of $60,000 was a quarter of a real month.
- **Found, not a defect:** an `info` alert is drawn in the plain tone, as the docs draw it.
- **Found about the instance, not the code:** an instance started without `MANAGED_WORKER_USER=same` (as `.env.example` sets) runs no scripts for Fernhill, and its setup waits forever on the first seeding run. An instance also lists its console files when it starts, so a rebuild needs a restart.
- **Not walked yet:**
  - by keyboard alone (F1, ⌘K, `/`, Tab through the inspector);
  - the network throttled;
  - the longest real values;
  - renaming on the canvas;
  - writing Markdown with steps;
  - adding and configuring the Goal from "Add to page";
  - a member's own dashboard in the editor;
  - publishing from the builder.

  The phase is not presented as finished until these and the full `pnpm test` and `pnpm e2e` have run.

**What the internal pack showed about the contract (M11).**

- **What it made easy:** a widget is a definition of about 90 lines of data plus a small view. The hints were enough, the frame drew every state, and `defineWidget` caught a missing hint at once.
- **What it lacked, now in the contract:** a shared number format (`formatValue`, `formatNumber`, `ValueFormat`), the format setting (`FORMAT_SCHEMA`) and `WidgetPack`, all in `@volvel/widgets`. The packs' class names now reach both hosts' stylesheets.
- **Still open:**
  - a view's config type is written by hand, not derived from its schema, so decision 0005's "typed from the definition" is not built;
  - a developer's widget in a sandboxed frame would need the theme as variables, not classes;
  - no pack yet raises an event that gives a record or a group to something that listens (phase 26).

**What the rebuild left out until phases 26–27** (decision 0006; nothing is upgraded):

- **Forms, buttons and row actions, editing in a table, and a widget that follows another's chosen row.** From the examples this drops:
  - Fernhill's "The visit chosen" card (a "Latest visits" list stands in) and its editable stock cells;
  - acme's "The invoice chosen" card;
  - higher-ed borrow's "Ask for a device" and "Cancel";
  - higher-ed desk's "Check out" and "Check in", its editable devices and its add form.
- **"See it as"**, the builder's preview as an end-user group: the new endpoint has no group to read as. *Asked of the owner: now, or in phase 29 with "View as".*
- **Dragging from "Add to page" onto the grid** is not built: a widget is placed at the end of the page, and the dialog says so. *Asked of the owner.*
- **The phone and tablet layout controls and priority** (board 6) are phase 29's.

**Kept from earlier phases, in the shared frame:**

- Download as CSV or a spreadsheet (phase 18), now on any widget with rows, in apps too.
- "Names `x`, now `y`: change it in the repository" (phase 24).

**Owner decisions taken while building:**

- **The Goal measures this month.** Fernhill's Money page has a "Goal month" filter that defaults to this month, because a condition can't say "this month" (an "Only include" relative to today is a candidate for phase 28).
- **No access to an interface reads as "not there" (404).** The control plane keeps answering an interface someone may not open with 404, as before, so its existence doesn't leak.

## After the owner's first look

Not yet.
