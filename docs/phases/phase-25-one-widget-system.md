# Phase 25: apps and dashboards are built from one set of widgets, configured in the reader's words

Status: built, on branch `phase-25-one-widget-system`, off `main` at `35a61cc`.
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
| 8 | "See it as" | **Deferred to phase 29**, with "View as" as the boards draw it (answered after the first walk). |
| 9 | Drag from "Add to page" | **Built in this phase**, with close attention to how it moves (answered after the first walk). |
| 10 | The rows behind a number | **Phase 26, as an action** ("Show the rows behind it"), not restored as a fixed behaviour now (answered after the full runs). |

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

**Built.** `packages/manifest/src/page.ts` (schema, `checkWidgets`, `checkInterface`, `checkDashboard`, `incomplete` while a page is made), the kinds at interface v2 and dashboard v3, `bundle-check.ts` checking dashboards too; migration `0085_one_page_model.sql`; `docs/contracts/tenant-export.md`. **Tests.** `packages/manifest/src/page.test.ts` (10). **Polish gate.** Not applicable: nothing a person sees.

## M3: a widget is a definition and a renderer, from a registry

**To build.** `packages/widget-sdk` (`@volvel/widgets`): `defineWidget`, the hint vocabulary, data shapes, events, layout, `WidgetView` props, and the two registries (S9, The widget contract). `InterfaceWidget` and `packages/ui/src/widgets.tsx`'s registry are deleted. `enforce.test.ts`: a pack imports only `@volvel/widgets` and `@volvel/ui`.

**Built.** `packages/widget-sdk/src/index.ts`: `defineWidget`, the hints and controls, data shapes, events, layout, `WidgetViewProps`, `WidgetRegistry`, and (from M11) `formatValue`, `FORMAT_SCHEMA`, `WidgetPack`; re-exported by `@volvel/sdk`. The kit's old registry and `InterfaceWidget` are deleted. `enforce.test.ts`: a pack imports only the contract, the kit, React and its own files. **Tests.** `packages/widget-sdk/src/index.test.ts`. **Polish gate.** Not applicable.

## M4: every widget's data is read on the server from the stored page

**To build.** `routes/pages.ts`: `GET …/pages/:kind/:path/widgets/:widget/data` (S9, Reading data), on `kernel/data/query`, under `withData(scopeFor(viewer))`, draft for editors and deployed body when served; rows for external data sources through the rows path. The "until" day of a date filter is included (today it is dropped in apps). Tests: two groups see different rows of one widget; an end user can't read a draft; a widget over SQL keeps row rules; filter values out of range are refused.

**Built.** `apps/control-plane/src/routes/widget-data.ts`, `kernel/data/query/inputs.ts` and `filters.ts`; `GET …/filter-options`. The old dashboard data route and `interface-targets` are gone. **Tests.** `widget-data.test.ts` (11: two groups' rows, a draft refused to an end user, SQL under row rules, the last day of a range included, bad filters, a missing widget, paging, filter options), `interfaces.test.ts`, `dashboard-follow.test.ts`, `queries.test.ts`. **Polish gate.** Not applicable: an endpoint; what it draws is walked under M5–M12.

## M5: one renderer and one editor draw both

**To build.** `packages/screens` draws any page by registry lookup, with the frame (title, states) every widget shares; the served runtime and the console use it. One `PageEditor` and `EditorShell` serve the app builder and dashboards; `AppBuilder.tsx` and `Dashboards.tsx` keep only what differs (pages and publishing; sharing and members' dashboards). `builder/WidgetSettings.tsx`, `dashboards/WidgetEditor.tsx` and `dashboards/Widgets.tsx` are deleted.

**Built.** `packages/screens/src/PageView.tsx`, `Frame.tsx`, `FilterBar.tsx`, `useWidgetData.ts`, `placement.ts`, `layout.ts`, `export.ts`; the served runtime `packages/screens/runtime/main.tsx`; one editor `apps/console/src/screens/builder/PageEditor.tsx` for `AppBuilder.tsx` and `Dashboards.tsx`. **Tests.** `PageView.test.tsx` (screens, 59 with M8–M9), `Interfaces.test.tsx`, `Dashboards.test.tsx`.

## M6: the core pack's widgets that read

**To build.** `packages/widgets-core`: Table, List, Stat, Chart (bar, line, area, pie, scatter, heatmap; compare with the period before; trend) and Pivot, each with a definition in the drawings' words ("Value: Sum of Total", "Break down by: Issued on · Weekly", "Chart type", "Numbers look like") and declared events for phase 26.

**Built.** `packages/widgets-core/src/index.ts` (definitions) and `views/` (table, list, stat, chart, pivot, text). **Tests.** In `PageView.test.tsx`: each view from wire data.

## M7: the inspector is made from the definition

**To build.** `apps/console/src/kit/inspector/`: the header (title, kind, ⋯ with Layout, Duplicate, Remove), the Data, Display, Actions and Rules tabs (hidden when empty, with counts), one level of "More … options", and the shared controls named by `x-volvel.control`. The Rules tab says that hiding a widget isn't security and links to the table's row rules.

**Built.** `apps/console/src/kit/inspector/` (`Inspector.tsx`, `controls.tsx`, `dataControls.tsx`, `model.ts`). **Tests.** `inspector.test.tsx` (16), including a made-up pack's widget drawn with no code of its own.

## M8: size and place live on the page

**To build.** Select by clicking a widget; a chip with size and place while selected, dragged or stretched; exact values under ⋯ › Layout; arrow keys move, Shift+arrows stretch, Esc deselects, Delete removes with Undo, ⌘D duplicates; the title edited by clicking it; minimum sizes from the definition.

**Built.** In `PageView.tsx` and `placement.ts`: click to select, the chip, arrows and Shift+arrows, Esc, Delete, ⌘D, renaming on the canvas, sizes from the definition; what is in the way moves aside while a widget is held; a held pointer scrolls the page at its edges. **Tests.** `PageView.test.tsx` (the canvas), `e2e/phase-25.spec.ts`, `e2e/dashboards.spec.ts`.

## M9: "Add to page", by what it is for

**To build.** A dialog with search, the registry's widgets in their categories with a line each, filtered by the surface; click places at the end, dragging places on the grid; a widget from a pack other than core shows its pack's name.

**Built.** `AddToPage.tsx`: search, categories, a pack's name; a click adds at the end; dragged out of the list a widget is carried onto the page (owner decision 9), with a placeholder, the chip, room made as it travels, a fade where it lands, Esc and off-page cancelling. **Tests.** `add-to-page.test.tsx`, `PageView.test.tsx` (carrying), `e2e/phase-25.spec.ts` (POLISH-008).

## M10: text is Markdown

**To build.** `@volvel/markup` profile `page`; `core/text` with a Markdown control (editor, preview, and the components it may use).

**Built.** `packages/markup` profile `page`; the kit's `Markdown` takes a profile; `core/text` draws with it. **Tests.** `packages/markup/src/markup.test.ts`; `e2e/phase-25.spec.ts` (POLISH-011).

## M11: a widget from another pack works the same

**To build.** `packages/widgets-labs`: `labs/goal`, progress toward a target (a summary input, a target, a format, a `click` event, layout limits), registered only through `@volvel/widgets`. Fernhill's Money page uses it. Findings say what the contract had to change for it.

**Built.** `packages/widgets-labs` (`labs/goal`), on Fernhill's Money page. What it showed is in Findings. **Tests.** `packages/widgets-labs/src/goal.test.tsx` (10); `e2e/phase-25.spec.ts` (the Goal from "Add to page").

## M12: Fernhill, guides, changelog, the walk-through

**To build.** Fernhill's `performance` interface and `boards/clinic-visits` dashboard, `examples/acme`'s `screens/invoices`, and `examples/higher-ed-devices`' screens and dashboard rewritten; Fernhill's setup also seeds a page made in the console; `e2e/polish-setup.ts` measures the page editor; guides for building an app, a dashboard, and writing a widget; `CHANGELOG.md`; `e2e/phase-25.spec.ts`, each test named for its POLISH rule; the full `pnpm test` and `pnpm e2e`.

**Built.** Fernhill, acme and higher-ed rewritten; Fernhill seeds a console-made board; `e2e/polish-setup.ts` measures the page editor of an app and of a dashboard; guides `build/app-builder*.md`, `data/dashboard*.md`, `build/writing-a-widget.md`; `CHANGELOG.md`; `e2e/phase-25.spec.ts` (8 tests) and `e2e/dashboards.spec.ts` (filters, the file, the pivot, the canvas).

## Polish gate (M5 to M12, which change what people see)

1. **Rules.** 001 (every state drawn: loading, empty, waiting for its source, failed, forbidden, unknown type, stale "Updating…"), 002 (one editor, one inspector, one renderer for apps and dashboards), 003 (a widget is added, renamed, moved, sized, copied, removed and undone; a page and a dashboard are made, saved and published), 004 and 005 (walked at 1440×900, 1440×640, 768 and 390), 006 (filters in the address of a dashboard; a reload keeps the page and the tab), 007 (keys for every move; the dialog's click is the keyboard's way to add), 008 (what moves is played: room made while held, a fade where it lands, nothing under reduced motion), 009 and 010 (the drawings' words), 011 (Markdown profile), 012 (a slow save, a save racing a read), 013 (fixes in the shared piece: the frame, `placed`, `bindFilter`), 014 (two walks on a seeded instance).
2. **Siblings.** The app builder and the dashboards screen share `PageEditor`, `Inspector`, `PageView` and `AddToPage`; the served app shares `PageView`. Every fix above was made there and walked in both.
3. **Lifecycle.** Widget: create (click or carry), open (select), edit, rename, move, resize, duplicate, remove, undo and redo: built. Bulk: left out, as before. Page: add, rename, remove, publish: built. Dashboard: make, edit, share, remove: built.
4. **States.** Drawn by the shared frame; a slow save shows "Saving…", a failed save keeps the change and says so (unchanged from before).
5. **Walk.** Two walks, above. Screenshots were kept for the owner on request.
6. **Guards.** Typecheck, the unit tests of each milestone, `pnpm test` (above), `pnpm e2e` (below); the page editor measured in `polish-setup.ts`; the pack-imports rule in `enforce.test.ts`.
7. **Left out.** See "What the rebuild left out", each asked of the owner.

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

**The second walk**, after carrying from "Add to page" was built, on the same instance at 1440×900, light:

- **Carrying a widget in.** Dragged out of "Add to page", the list closes as it is picked up. Over the page a placeholder at its size shows where it lands, with the chip ("6 × 6 · col 7 · row 1"). The widgets in its way move aside as it travels: 43 played moves in one carry. It lands where it is let go, selected, fades in, and is announced ("Chart is added at column 7, row 1."). Esc, or letting go off the page (where a card follows the pointer), adds nothing and says so. Held at the window's bottom edge, the page scrolled from 0 to 1035. Moving a widget already on the page now moves the others aside the same way.
- **Keyboard.** F1 opens the builder's help beside it; ⌘K opens the palette; Tab goes widget by widget, each its title and then its body.
- **Throttled network.** The builder draws the kit's loading skeleton until the page arrives.
- **The longest real values.** A 62-character title is cut with an ellipsis in the outline and in full on the canvas.
- **Renaming on the canvas, Markdown with steps, the Goal from "Add to page", a member's own dashboard, publishing from the builder:** each done, and each is a test of `e2e/phase-25.spec.ts`.
- **Found and fixed in the second walk:**
  - the Publish dialog never finished loading. It read the interface as `interface`, and the control plane answers `body` since this phase (`PublishDialog.tsx`, test `publish-dialog.test.tsx`);
  - the Publish dialog asked about the app's draft even when the app is kept in a repository and has none, and so refused (this was also so before this phase);
  - a widget added to a member's dashboard before its source was chosen could not be saved, and neither could a pivot broken down one way of the two it needs. A page being made now keeps an unfinished widget and draws it as "Choose what it shows in Data."; a deploy still refuses one (`page.ts` `incomplete`);
  - a new widget did not follow the page's filters when a filter's name is not its column's ("lent" narrows `lent_on`). It now follows them as the page's other widgets on that table do (`bindFilter`);
  - a widget's fade-in was cut short by the next redraw;
  - a stat's and a goal's number is now sized by its cell's width, not its columns: large in a published app, smaller in the builder's narrower canvas (views are drawn in a container named `cell`);
  - the help said to drag a widget "by its title", named the categories otherwise than the dialog does, and said the Actions tab is not shown.
- **Untitled text** shows "Name this widget" when Tab reaches its title in the builder: an invitation, kept.

**The suites.** `pnpm test`: 2,237 passed and 3 failed, all in `interfaces.test.ts`, where a member's dashboard was expected to refuse a widget not yet told what to ask. That is now kept on purpose, and the file passes.

`pnpm e2e`, against a fresh instance on 8080 set up as CI sets one up (Keycloak, mail kept as files, Fernhill seeded): 107 passed, 4 failed, 3 skipped, 10 not run behind the failures. The four, and what was done:

- `documentation.spec` found that a published app's table no longer had the help behind a column's heading ("About Status"), which the old renderer drew from the table's definition. It is back: the data endpoint gives each column's description, the contract's `ColumnInfo` carries it, and the table view draws it with the kit's Toggletip (tests in `interfaces.test.ts` and `PageView.test.tsx`).
- `phase-25.spec`'s carry test assumed where the chart would land on a copy of the page it had walked before; it now checks the widget lands where its placeholder said.
- `polish-layout.spec` found two things. The builder's list of apps overflowed a long path and its tables at 390 px; it has always done so, and the test set-up now makes an app for the first time, so the list has a row. It now wraps. The data-source row was this machine's `E2E_SOURCE_URL` naming another database; pointed at the instance's own, as CI does, it passes.
- `tenant-apps.spec`: the served app's pictures are the new renderer's (frames, Download, a titled axis, a table as cards on a phone), reviewed and kept. It also found the builder's canvas had less than 60% of the work area at 1440; the outline is narrower and the split starts at 74%.

The four files and the specs behind them were run again: 21 passed.

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
- **"See it as"**, the builder's preview as an end-user group: the new endpoint has no group to read as. *The owner deferred it to phase 29, with "View as".*
- **A number on a dashboard no longer opens the rows behind it** (phase 18's drill-through). A click is a widget's event, and what an event does is phase 26's actions. *The owner chose phase 26, as an action ("Show the rows behind it").*
- **The phone and tablet layout controls and priority** (board 6) are phase 29's.

**Kept from earlier phases, in the shared frame:**

- Download as CSV or a spreadsheet (phase 18), now on any widget with rows, in apps too.
- "Names `x`, now `y`: change it in the repository" (phase 24).

**Owner decisions taken while building:**

- **The Goal measures this month.** Fernhill's Money page has a "Goal month" filter that defaults to this month, because a condition can't say "this month" (an "Only include" relative to today is a candidate for phase 28).
- **No access to an interface reads as "not there" (404).** The control plane keeps answering an interface someone may not open with 404, as before, so its existence doesn't leak.

## After the owner's first look

Not yet.
