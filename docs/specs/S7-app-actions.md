# S7: Actions in the App Builder

Roadmap item (the 2026 roadmap, in volvel-internal): P1-7. Priority P1. Complexity M.

## Problem (observed)

The App Builder palette is Table, Card, Cards, Chart, Figure, Form and Text. Form only inserts a row. A no-code tool therefore cannot do anything beyond editing rows, such as "resend reminder", "refund invoice" or "approve order". Today the work-arounds are:
- a form trigger URL on a separate page with no app chrome;
- a code app (repository, React, CLI).

This is the biggest gap between the platform's automation and its apps. Retool's whole model rests on it: event handlers run queries or workflows, with confirmation ([event handlers](https://docs.retool.com/apps/guides/interaction-navigation/event-handlers), [run behavior](https://docs.retool.com/queries/guides/run-behavior)).

## Design

### Manifest (`interface` kind)

New widget `action`, and a new optional property `actions` on `table` widgets.

```yaml
- type: action
  label: Resend reminder
  target: { kind: script, path: reminders/send-one }   # or { kind: flow, path: … }
  input:                       # a dotted path into page state, or { value: <constant> }
    visitId: "selection.visits.id"
    channel: { value: "sms" }
  confirm: "Send a reminder text to {{selection.visits.client_name}}?"   # optional
  result: { show: toast | output, refresh: [visits] }  # refresh widgets after success
  enabledWhen: "selection.visits"   # optional: a path that must be set (not null or empty)
```

- **Table row actions** use the same shape, with `row` in scope instead of `selection`.
- **Fields** of the target's input that `input` does not map are asked for in a SchemaForm (S6) when the action is clicked.

### Runtime (`packages/screens`)

- The action calls the existing `@vynxlabs/app` `runScript` or `startFlow` (`packages/app/src/client.ts:318`) as the viewer.
- **Authorization** is the existing binding check on starting that target. The builder warns at design time when an audience bound to the app cannot start the target. It reuses the "see it as group" preview data.
- **Result display:**
  - **Members** get a toast with "Open run".
  - **End users** get a success toast with the target's description; on failure, a generic message with the run ID to quote.
- **Refresh:** after success, the listed widgets reload.
- **Mapping (owner decision, 2026-11-14):** plain dotted paths (`selection.visits.id`, `row.client_name`, `filters.from`) and constants. No expression language in the browser yet. CEL can be added later as a third mapping form without changing the first two.

### Builder (`screens/Interfaces.tsx`)

- **Action** joins the palette.
- The settings panel has:
  - a target picker (scripts and flows with manual triggers);
  - an input mapping table: target field, then a page value picker or a constant;
  - confirm text;
  - result options;
  - an enabled condition.
- The preview runs the action **only** in a dev workspace and labels it "Runs for real".

## Acceptance criteria

1. In Fernhill's sandbox, a member adds a "Resend reminder" row action to a visits table, publishes, and an end user in the front-desk group can run it from the app on a row of their own clinic.
2. An end user without permission to start the target does not see the action. The builder shows a warning naming the group.
3. Unmapped required inputs are asked for in a form. Confirmation text renders with row values.
4. After success, the mapped table reloads and shows the change.
5. The run's audit entry and `started_by` name the end user, not the app.
6. `schemas/kinds/interface.v1.schema.json` is regenerated, and old interfaces without actions still validate.

## Dependencies and risks

- **Dependencies:** S6 (SchemaForm).
- **Risk: end users starting expensive or unsafe targets.** This is governed by bindings, as for code apps today. The builder's warning makes the exposure visible.
- **Risk: path mapping is too weak for some pages.** A script can take the raw row and do the logic itself. CEL comes later if clients need it.
