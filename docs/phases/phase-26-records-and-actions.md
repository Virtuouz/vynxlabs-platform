# Phase 26: a record is opened, changed by a button, edited and made with a form, with no code

Status: in progress, on branch `phase-26-records-and-actions`, off `phase-25-one-widget-system` at `4e9c654`.
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

## Findings

To be written as the phase is built.

## After the owner's first look

Not yet.
