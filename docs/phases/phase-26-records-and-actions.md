# Phase 26: a record is opened, changed by a button, edited and made with a form, with no code

Status: built, on branch `phase-26-records-and-actions`, off `phase-25-one-widget-system` at `4e9c654`. Waiting for the owner's first look.
Last updated: 2026-11-21

Phase 25 built one widget system that reads. This phase makes it an application builder: the record context, actions whose steps run on the server, conditions said as sentences, and Record detail and forms made from a table. The owner merged what the roadmap called phases 26 and 27, so that a whole create, read, update and act application is built here. The drawings are boards 2 to 5 in `temp/` (`Volvel App Builder redesign.html`).

Spec sections: Apps and user interface (Pages and widgets). Design: [S9](../evolution/specs/S9-pages-and-widgets.md), "Records and actions". Decision: [0004](../evolution/decisions/0004-page-actions-run-on-the-server.md), now with its grant decided.

**Exit criterion.** On `examples/fernhill`, in a browser:

- in Clinic performance, an invoice is clicked and opens "Invoice detail" in a side sheet, which steps through the invoices ("2 of 236"); Back closes it, and a shared link opens it again;
- "Mark paid" asks to confirm, sets Status and Paid on, says so, and the table behind shows it; it can't be pressed on a paid invoice;
- "Edit" opens a form made from the table, refuses a required field left empty, and saves; "New invoice" makes one;
- a front-desk end user, who cannot edit invoices through the API, marks one of their clinic's invoices paid, and is refused on another clinic's;
- in the app builder, a table is given "When a row is clicked: Open record detail", the detail page is made for it, a form is added with "Add a form", and a button's steps are written as board 4 draws them, with no code;
- a widget shown only to Managers is not shown to the front desk;
- on Clinic visits, a number shows the rows behind it.

## Owner decisions

Answered by the owner on 2026-11-21.

| # | Area | Decision |
|---|---|---|
| 1 | Who may run an action | **The action is the grant.** Whoever may open the app may run its deployed actions; each changes only the fields it names, on rows the person may read, with its conditions checked on the server (decision 0004). |
| 2 | Scope | **The old phases 26 and 27, merged**: record pages, sheets and modals; buttons and steps on the server; conditions; Record detail; forms to create and edit; row actions; "When a row is clicked"; the rows behind a number (phase 25 decision 10). |
| 3 | Work | Built with up to ten parallel agents, as phase 25 was. |

## Milestones

| # | Milestone | Decision |
|---|---|---|
| M1 | Actions, conditions and page kinds are in the model, checked | 1, 2 |
| M2 | A page's actions run on the server, as their own grant | 1 |
| M3 | A record page reads its record; a form gets its columns; a reference offers its rows; a group shows the rows behind it | 2 |
| M4 | The renderer acts: confirmation, steps, navigation by address, sheets and modals, conditions | 2 |
| M5 | Button, Record detail, row actions, and what can be pressed looks pressable | 2 |
| M6 | A form made from a table creates and edits | 2 |
| M7 | The inspector writes actions, conditions and fields with no code | 2 |
| M8 | The builder makes record pages, detail pages and forms, and suggests them | 2 |
| M9 | Fernhill, the dropped actions restored, guides, the walk-through | all |

M1 is built first, by the integrator; M2–M9 are built side by side against a written contract, then merged.

## M1: actions, conditions and page kinds are in the model, checked

**Built.**
- `packages/manifest/src/action.ts`: `Action` (an optional confirmation that may ask for fields, steps, `when`, `done`), `Step` (`update`, `create`, `delete`, `flow`, `script`, `open`, `close`, `message`, `narrow`, `rows`), `ActionValue` (a constant, today, now, the user, a record's field, what was asked: never an expression), `Condition` as sentences, `conditionsHold`, `conditionWords`, `grantedFields`.
- `packages/manifest/src/page.ts`: page kinds `page`, `record`, `sheet` and `modal` with the table of their record; a widget's `on` and `rules`; the source `{ record: "this" }`; condition values that name the page's record or the user. The check says where a record comes from, which page an action opens, the fields it sets, that a dashboard only reads, and that an action kept in a configuration (a button's, a row action's, a form's submit) has an action's shape.
- `packages/widget-sdk`: the controls `action`, `actions`, `page`, `fields`; `act`, `can`, `listens` and `choices` for views.
- `packages/widgets-core`: `core/button`, `core/detail`, `core/form`; row actions on Table and List.

**Tests.** `packages/manifest/src/page.test.ts` (four more: a row click opening a sheet on the row; a sheet opened on no record, an update on a page with no record, an undeclared event; a row action's shape, and a dashboard refusing a change; a record page with no table).

**Polish gate.** Not applicable: nothing a person sees.

## M2: a page's actions run on the server, as their own grant

**Built.** `POST …/page-actions` (`apps/control-plane/src/routes/page-actions.ts`, `kernel/pages/act.ts`) runs an action from the stored body (the draft in the builder, the deployed body when served), never from what the browser sends. Its data steps run in one transaction under `actAs`, on rows the person may read, and change only the fields the action names. Its confirmation's asked fields are checked against the column types. Its `when` is checked again on the server. Flows and scripts start after the commit. The audit names the app, the page, the widget and the action. `kernel/pages/locate.ts` is the one place that finds a page, for reading its data and for running its actions.

**Tests.** `apps/control-plane/src/page-actions.test.ts` (20: the grant with no write permission, another clinic's row not found, a field not named refused, `when` checked again, asked fields typed, an edit form's left-out fields kept, a draft run only by its builders, the audit, flows after commit).

## M3: a record page reads its record; a form gets its columns; a reference offers its rows; a group shows the rows behind it

**Built.** `widget-data` takes `record` (a page's or a sheet's record, read with `{ record: "this" }`) and `behind` (the rows behind a group of a summary, or every row behind a number that isn't broken down). Columns say whether they are required, what they reference and their description; rows carry the names of what they reference. `widget-choices` offers a reference's rows, searched, for a form's picker and a choice filter.

**Tests.** `apps/control-plane/src/widget-data.test.ts` (the record of a page, refused off the page's table; the rows behind a group, with filters, page filters and no group; choices under row rules).

## M4: the renderer acts

**Built.** `packages/screens/src/actions.tsx`: the confirmation (with the record's words, "Mark INV-9339 as paid?", and asked fields), the call, the client steps (`open`, `close`, `message`, `narrow`, `rows`), the toast, and the rows-behind sheet. `navigation.tsx`: addresses `<base>/<page>/<record>`, `?sheet=&record=` and `?modal=&record=`, a modal over a sheet, Back closing what is open, "2 of N" through the rows that opened it. `showWhen` hides a widget served and fades it while building, with the reason said. After an action every page on screen reads again.

**Tests.** `actions.test.tsx`, `core-actions.test.tsx`, `navigation.test.tsx`.

## M5: Button, Record detail, row actions, and what can be pressed looks pressable

**Built.** `packages/widgets-core/views/button.tsx`, `detail.tsx`, `press.tsx`. Row actions on Table and List. Rows, points, cells and stats that the page listens to are focusable, take Enter, and are marked while their sheet is open. A button that may not be pressed now says why in its condition's words. A button is drawn with no card (`layout.frame: "none"`).

## M6: a form made from a table creates and edits

**Built.** `packages/widgets-core/views/form.tsx`: fields drawn by column type (text, number, money in dollars by the field's `format`, date, time, yes/no, choice, reference picker), required and length checked before sending, the server's refusal shown by field. An edit form fills from the record and sends only what changed. A form whose submit saves nothing is refused by the manifest check.

**Tests.** `packages/screens/src/form.test.tsx` (24).

## M7: the inspector writes actions, conditions and fields with no code

**Built.** `apps/console/src/kit/inspector/actionControls.tsx`, `conditions.tsx`, `fieldsControl.tsx`, `actionModel.ts`: board 4's step editor (Ask to confirm, Update the record, Make a record, Remove, Open a page, Close, Say, Start a workflow, Run a script), each value a choice of "A value", "Today", "Now", the current user or a field of the record; "Can be pressed when" and "Show this widget" as sentences; "If something fails"; "Changes no data" or what it changes.

**Tests.** `apps/console/src/inspector-actions.test.tsx`.

## M8: the builder makes record pages, detail pages and forms, and suggests them

**Built.** `apps/console/src/screens/builder/`: page kinds in the pages list and Page settings; a page that opens on a record is previewed with a sample record, chosen from its table and named as its detail names it ("Preview of Invoice detail for INV-9001"); "When a row is clicked" offers to make the detail (`RowClickOffer.tsx`); "Add a form" (`AddFormDialog.tsx`) makes a create or edit form from the table with its save step; suggestions of the next step.

**Tests.** `apps/console/src/builder-records.test.tsx`, `builder-client.test.ts`.

## M9: Fernhill, guides, the walk-through

**Built.** `examples/fernhill/src/apps.ts`: Clinic performance's invoice sheet (Mark paid, Edit), the edit and new-invoice modals, the visit sheet, stock reorder, and the `my-account` pages for pet owners; the higher-ed desk's forms save. The apps and dashboards guides. `e2e/phase-26.spec.ts` (six tests), the rows-behind test in `e2e/dashboards.spec.ts`.

## Polish gate (M4 to M9, which change what people see)

1. **Rules.** 001 (a confirmation's pending and refused states, a sheet's loading, a refused form by field, rows behind loading, empty and failed), 002 (one action model and one renderer for the builder's preview, the served app and dashboards; one inspector), 003 (a record is opened, edited, made, changed by a button, and removed by a step; a page of each kind is added, set and removed), 004 and 005 (walked at 1440, 768 and 390), 006 (a sheet and a modal are in the address; reload and a shared link reopen them), 007 (rows and stats take Enter; Esc closes a modal, then the sheet; focus goes back to the row), 009 and 010 (the boards' words), 011 (fields by column type, money in dollars), 012 (a confirmation is pending until answered; a refused action changes nothing), 013 (below), 014 (walked on a seeded instance).
2. **Siblings.** The builder's preview, the served app and dashboards share `PageView` and `actions.tsx`; the console's page client and the served app's client both read the rows behind a number, and now read them the same way (`efb8a4b`). Fixes made in the shared piece: `Tabs` (`dense`, used by the inspector; the nine other tab rows are unchanged), `SideSheet` (`returnFocus`; the help sheet and the console's sheets are unchanged), `press` (`data-record`, on every table and list row), the form view (a field with a format), `PageView` (a served overlay draws its widgets in a column).
3. **Lifecycle.** Record: open, step through, edit, make, change by a button, remove by a step: built. Bulk: left out (phase 27's Action group). Page of each kind: add, set its kind and table, rename, remove: built. Action: add, reorder, remove a step; add and remove a condition: built.
4. **States.** Sheet and modal: loading (the frame's), not found, refused. Confirmation: pending, refused with its words, by field when it asked. Form: required and length before sending, refused by field after, saving. Rows behind: loading, failed with Try again, empty. A button that can't be pressed says why.
5. **Walk.** Below, in Findings.
6. **Guards.** Typecheck, the unit tests of each milestone, `pnpm test`, `pnpm e2e` (below). The served runtime may import only types from `@volvel/manifest` (`enforce.test.ts`). No new navigation section, so nothing new in `polish-setup.ts`.
7. **Left out.** Nothing from the decisions or the exit criterion.

## Findings

Built by the integrator (M1) and parallel work streams for M2–M9, each in its own worktree against one written contract, then merged and integrated (`656f747`…`43cdfc5`).

**The walk (2026-11-21).** A throwaway instance (its own database and bucket, port 8080), seeded by `examples/fernhill/setup/setup.mjs`.

- **The served app**, Clinic performance as a practice manager, at 1440, 768 and 390, light and dark: a row opened by keyboard (Enter) opens Invoice detail in a side sheet with "1 of 100"; the address holds it, and a reload reopens it; Edit opens its modal over the sheet; Esc closes the modal and then the sheet, and the focus is back on the row. New invoice opens its form. No page overflows sideways, and no errors in the console.
- **The served app as Northside's staff**, who may only read: Mark paid works on a Northside invoice, the same call aimed at Riverside's is not found, and a paid invoice can't be paid twice (`e2e/phase-26.spec.ts`).
- **The builder**, light and dark: the pages list with each page's kind; the table's "When a row is clicked: Open a page · Invoice detail (side sheet) · On the clicked record"; Rules on "For practice managers" ("Shown only when the current user is in Practice managers", with "Hiding a widget isn't security"); "Add to page" grouped as board 2 with Record detail, Form and Button; "Add a form" with Create and Edit and the table's fields; the Invoice detail sheet previewed for a sample record; Mark paid's steps as board 4 (Ask to confirm with `{number}`, Update the record: Status becomes A value · paid, Paid at becomes Now).
- **Dashboards**: Lending's Fees opens the rows behind it, follows the page's filter, and Esc puts it away.

**Found and fixed in the walk:**

- The served app was blank: the runtime imported the action model's condition check from `@volvel/manifest`, whose validator is compiled on import, which the app's policy forbids. The model's values are now a separate entry, `@volvel/manifest/action`, the validator is compiled when first used, and `enforce.test.ts` keeps the runtime to types from the main entry.
- A confirmation said "this record": a detail's record wasn't looked up. It is now, and the page's own record too.
- The table under a sheet didn't show what the sheet's button changed. Every page on screen reads again after an action.
- An edit form refused required fields it hadn't sent. Left-out fields are kept as they are.
- A refused form was reported twice (by field and in a toast). Once, by field.
- Money was typed in cents. A form field takes a `format`, and Fernhill's total is typed in dollars; a field in another unit no longer borrows the column's note about cents.
- A modal opened from a sheet replaced the sheet. It goes over it and closes back to it.
- A button was drawn in a card too small for it. A widget may be drawn with no card.
- Fernhill's and the higher-ed desk's forms had no step that saved. They have one, and a form whose submit saves nothing is refused by the check.
- New invoice required a status it didn't ask for. It is set to unpaid by the step.
- On dashboards the page client was wrapped and lost its actions ("Actions can't be run here"), and the console read the rows behind a number as the whole answer, so the sheet was empty. The whole client is passed through, and both clients read that input's rows; a number that isn't broken down shows every row behind it.
- The sample record was named by its client code. It is named as the page's detail names it.
- The preview said actions run for real. They don't while building; it now says so.
- The inspector's four tabs didn't fit and "Data" was cut. Tabs have a dense size, used by the inspector.
- A step's title was cut ("Update…"). It wraps.
- A served sheet or modal kept its widgets' grid heights, so the edit form's modal was half empty. A served overlay draws its widgets in a column at their own height.
- Closing a sheet opened by a reload or a shared link left the focus on the page. It goes back to the row of the record the sheet was last on.
- The record widgets had the generic icon in "Add to page". They have their own.
- "Orders to VetSupply" (Stock) and the visit requests said "The query cannot be run": they list the newest first, by `created_at`, which a rows query didn't select and so couldn't sort by. Rows now sort by any column of their table, shown or not; totals still sort only by what they show (`queries.test.ts`).
- With the network throttled, a page's Text showed its raw Markdown (`:::alert[…]`) until the reader arrived. A page's text is drawn as loading instead; a script's result is still shown as written.
- "Add a form" on Money made a second modal called "New invoice", the name of one Fernhill has. The dialog says when the name is already a page's.
- The new page and action fields had no descriptions, and the docs check's share of described fields fell to 25%. The page, widget and filter fields are described; the floor is now 35.9%.

**The rest of the gate's walk**, on the e2e instance after the suite:
- At 1440×640: the builder, its outline, canvas and inspector, each scrolling on its own.
- The keys: ⌘K opens Go to; F1 opens "Building an interface", which already describes Record detail, Form and Button; `/` searches a list, and the builder has none, so it does nothing there.
- "Add a form" through to Create form: the modal page, its form with the save step, and a "New invoice" button that opens it.
- A new table on Stock: the inspector offers "Make an Inventory detail". Pressing it makes the side sheet and sets "When a row is clicked: Open a page · Inventory detail · On the clicked record".
- The served app throttled to 50 kB/s with 800 ms of latency: the Text is drawn as loading, and the sheet opens at once with "1 of 100" while its record loads.

**Not walked:** the longest real values. Fernhill's longest item names ("Gastrointestinal diet, canine, 27.5 lb bag") wrap in the Stock table at 1440. The detail and form were seen only with Fernhill's ordinary values.

**The full suites.**
- `pnpm test`: 2,363 passed and 1 failed. The failure was the route check, which didn't yet know that page actions are exercised in their own tests (`0ad8a83`). The tests of every file changed after the run pass.
- `pnpm e2e` on a fresh instance set up as CI sets it up: 125 passed, 2 failed, 2 skipped, 1 didn't run. The two failures were `documentation.spec.ts` (a page dragged to another folder) and `panes.spec.ts`, screens this phase didn't touch. Both pass on a rerun. A `pnpm build` (run by `check:schemas`) rewrote the console's files while the suite was serving them, which is the likely cause.
- After the last fixes, `phase-26`, `phase-25`, `dashboards` and `tenant-apps` were rerun: 22 passed.
- `docs:check` and `check:schemas` pass.

## After the owner's first look

Not yet.
