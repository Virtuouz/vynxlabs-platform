# Phase 25: apps and dashboards are built from one set of widgets, configured in the reader's words

Status: in progress, on branch `phase-25-one-widget-system`, off `main` at `35a61cc`.
Last updated: 2026-11-21

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

To be written as the phase is built.

## After the owner's first look

Not yet.
