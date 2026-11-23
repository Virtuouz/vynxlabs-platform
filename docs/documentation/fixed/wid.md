# Fixed: lane wid

Commits are named by the row in their subject: `git log --grep "(WID-01)"`.

## WID-01 Own-record widget actions ran on anyone's readable record
- **Test:** `page-actions.test.ts` > "a detail of the user's own record" > "a button runs on the user's own record, and on no one else's, even one they may read" (404 before the fix: 200).
- **Changed:** `apps/control-plane/src/kernel/pages/act.ts` (the own check, in the round loop): moved out of `if (editing)` to every action of a widget whose source is `own`; checks `records.this` for an edit in place, `records.event` (each of `events`) otherwise. Case-blind as before.
- **Siblings looked at:** a Form in edit mode on an `own` source sends `record` as `event`: covered. `on/*` events of such widgets: same path. Table row actions on an `own` source: same path (each round). `this` is the page's record, not the widget's, so it is not held to ownership.
- **A person sees:** the button on another person's row answers "The record was not found" (404) and changes nothing.
- **Left out:** nothing. No screen change.

## WID-02 A Form whose submit asks to confirm sent none of what was typed
- **Test:** `packages/screens/src/form.test.tsx` > "a form whose submit asks to confirm" (2 tests: "sends what was typed once confirmed", "a refusal of a field is handed back to the form, which keeps what was typed"); both failed before.
- **Changed:** `packages/screens/src/actions.tsx` (the `Confirmation`'s `submit`, in `useActions`): merges `{...held.request.inputs, ...inputs}`; a refusal that names a field the confirmation did not ask for closes the dialog and resolves `{ok:false, message, fields}` so the form draws it beside the field and keeps what was typed.
- **Siblings looked at:** table buttons, row actions, detail actions carry no `request.inputs`: unchanged. Approvals ask their own way (not this path).
- **A person sees:** Save, confirm: the row is made with what they typed; a refused field is drawn at the field, not an empty row and a cleared form.
- **Walk:** a form on a page with "Ask to confirm" on its submit (inspector: form, Submit action), required field emptied then confirmed; 1440/390, light/dark, keyboard (Enter in the dialog, Escape cancels), reload. Polish gate: states (busy, refused field, cancelled) answered by the tests; lifecycle: form keeps values after a refusal; copy unchanged.
- **Left out:** the walk was not run in a browser by this lane.

## WID-03 Confirming an action on several rows named only the first
- **Test:** `packages/screens/src/row-actions.test.tsx` > "confirming an action on several rows" (2 tests, failed before: "Remove the invoice INV-1?"); `confirmWords.test.ts` > "several records".
- **Changed:** `packages/screens/src/confirmWords.ts` (`ConfirmInput.count`, `recordWords`, new `nounsOf`, exported from `index.ts`); `packages/screens/src/actions.tsx` (`Confirmation` passes the count and no row when `records` has more than one; `fillText` takes `several` and leaves `{column}` out and tidies spaces).
- **Siblings looked at:** the inspector's confirm preview (`apps/console/.../confirmPreview.tsx`, `actionControls.tsx:1095`) calls `confirmWords` with a sample record only and does not offer a count, so it is unchanged and still right for one row. Single-row paths are unchanged.
- **A person sees:** two rows chosen, Remove: "Remove 2 invoices?"; the author's `{column}` words read without the column.
- **Walk:** table with "Choose rows" on and a Remove action with Ask to confirm; choose 2, press Remove; 1440/390, light/dark, keyboard (Tab to the bar, Enter), reload.
- **Left out:** the preview does not show the several-rows wording.

## WID-04 A flow or script that refuses its input did so after the data was saved
- **Tests:** `apps/control-plane/src/page-actions.test.ts` > "a flow or script that refuses its input" (flow pressed twice: made 2 rows before; script: made a row before; third test: a start with its input given still works); `apps/console/src/kit/inspector/tabProblems.test.ts` > "an action that starts a flow or script without what it needs..."; `packages/screens/src/actions.test.tsx` > "an action saved but not started says so".
- **Changed:** `kernel/flows/engine.ts` (`checkFlowStart`, the refusals of `startFlowRun` taken out, used by it), `kernel/execution/runs.ts` (`checkRunStart`, same for `startRun`); `kernel/pages/act.ts`: the check runs for every start after the data steps and before the audit and commit, inside `withData`, so a refusal rolls the data back (400, nothing saved); a start that still fails after the commit is answered 200 with `notStarted: [{do, path}]` and the data kept; `routes/page-actions.ts` (response `notStarted`); `packages/screens/src/types.ts`, `actions.tsx` (danger toast "Saved. The flow X could not be started.", page read again as always); console `publishCheck.ts` (`Known.inputsNeeded`, `inputsNeededOf`), `PublishCheck.tsx`, `kit/inspector/tabProblems.ts`, `model.ts` (`required`): "starts X without why, which it needs".
- **Siblings looked at:** `startFlowRun`/`startRun` callers (flows tests, runtime tests pass); the flow-step and trigger callers use the same functions and refusals unchanged. Only a `required` list is checked in the publish check, not types.
- **A person sees:** the press says what the flow refuses and nothing is saved; a start that fails later says "Saved. The flow ... could not be started." and the page shows the saved data.
- **Walk:** button with create then a flow needing a field, pressed with and without it; publish check lists it. 1440/390, light/dark, keyboard, reload. Not run in a browser.
- **Left out:** the check uses the input as the steps resolve it before the commit; a flow that changes between the check and the start is the "fails after" case. Reading `notStarted` is not in the SDK's client yet (only screens).

## WID-05 An edit form started again, losing what was typed, when its record was read again
- **Tests:** `packages/screens/src/form.test.tsx` > "an edit form whose record is read again" (3 tests; the first two failed before).
- **Changed:** `packages/widgets-core/views/form.tsx`: `FormView`'s key is the mode and the record's id, not the whole record; `FormBody` has an effect on a new read: an untouched field takes the new value, a touched one keeps what was typed and the form says "<Field> was changed by someone else. What you typed is kept."
- **Siblings looked at:** the create form (key was already stable for `{}`; unchanged, still resets after saving); the Detail's in-place editor is a separate component (not keyed by record JSON). The page's re-reads after an action and at 1, 3 and 8 s after a start go through this one view.
- **A person sees:** typing in an edit form is no longer undone by another widget's action or a flow kick-off; a field changed elsewhere that they had typed in is named.
- **Walk:** an edit form beside a button that starts a flow; type in a field, press the button, wait 8 s; 1440/390, light/dark, keyboard, reload. Not run in a browser.
- **Left out:** the note shares the "Nothing has changed yet" line and clears on the next edit.

## WID-06 "Sort by clicking the heading" drawn on and doing nothing
- **Test:** `packages/screens/src/tables.test.tsx` > "a heading sorts unless it is turned off, and not for a column with no order" (failed before: no heading button for an unset `sortable`); the older test now turns it off with `sortable: false`.
- **Changed:** `packages/widgets-core/views/cells.tsx` (`sortableColumn`), `table.tsx` (the heading and the sorting both use it); schema comment in `packages/widgets-core/src/index.ts`. Unset means sortable, as the drawer and `tidyColumn` already say; json and enum_list columns never.
- **Siblings looked at:** Dashboard tables (same view); the phone list is not sorted by heading; the drawer `ColumnEditor`/`columnModel` already read unset as on; console `Data.tsx:261` has the same json/enum_list rule.
- **A person sees:** headings are buttons by default; "Sort by clicking the heading" off removes them.
- **Walk:** a table with no `sortable`; click a heading three times; drawer toggle; 1440/390, keyboard Enter on a heading, reload. Not run in a browser.

## WID-07 On a dashboard "Who can see it" and "user is in group" hid the widget from everyone
- **Tests:** `apps/console/src/Dashboards.test.tsx` > "a widget limited to a group is drawn to a member in that group, and not to one outside it" (failed before: drawn to nobody); `apps/control-plane/src/me-groups.test.ts` (the new route).
- **Changed:** new `GET /tenants/:t/me/groups` in `apps/control-plane/src/routes/tenants.ts` (access: signed in; the caller's own member groups, key and name; nothing for others); `apps/console/src/viewer.ts` (`useViewer(root)`: the member from `/me` plus those groups, with `groupNames` by path); used by `screens/Dashboards.tsx` (also `foldKey` `dashboard.<id>`, so a Section's fold and a Tabs' remembered tab are kept per dashboard: the fix for the fold and for WID-21's dashboard half) and `screens/builder/SheetPreview.tsx` (sheet preview).
- **Siblings looked at:** `AppPreview.tsx:111` passes `user={undefined}` on purpose (it has "View as"); left to BLD-04 as the row says, it can call `useViewer` too. `/me` carries no groups, so the new route is the one place the console learns them. This is a new route, not a contract of a kind or worker.
- **A person sees:** a member in the group sees the widget on the dashboard; one outside does not; folds are remembered per dashboard.
- **Walk:** a dashboard with a widget limited to a group and a Section folded; as a member in and out of the group; 1440/390, light/dark, reload (the fold stays). Not run in a browser.
- **Left out:** end users have no dashboards, so only members are handled; the user is read once per page load.

## WID-18 "The user's own record" found only when the email's capitals matched
- **Test:** `apps/control-plane/src/widget-data.test.ts` > "the user's own row is found whatever the capitals of the email held" (failed before: empty).
- **Changed:** `kernel/data/query/inputs.ts` (the own source's filter is `ieq`), `kernel/data/query/visual.ts` (`ieq`: `lower(col::text) = lower($n)`). `ieq` is the server's own and not in the SDK's `VISUAL_OPERATORS`, so no manifest can write it and no schema changed. The edit's check in `act.ts` was already case-blind (and now also guards every action: WID-01), so both agree.
- **Siblings looked at:** other `eq` filters on text are exact on purpose.
- **A person sees:** their own record when the stored email has other capitals.

## WID-09 Hidden detail fields opened an editor that could not save
- **Test:** `packages/screens/src/core-actions.test.tsx` > "a hidden field is shown to read and is not edited in place: the server refuses it" (failed before: "Edit Internal code" was drawn).
- **Changed:** `packages/widgets-core/views/detail.tsx` (`canEdit` is false for a field with `hidden`).
- **Siblings:** the server's refusal (`act.ts`) is as built; the Form has no hidden state.
- **A person sees:** a field behind "Show another field" is read only.

## WID-11 A pivot cell sent "—" for an empty group, and every number heading as text
- **Test:** `packages/screens/src/widgetOptions.test.tsx` > "the pivot" > "a click on a cell gives each heading's own stored value..." (failed before).
- **Changed:** `packages/widgets-core/views/pivot.tsx`: `turn` keeps each heading as its stored value (`Turned.columns`, `rows[].headers` are `unknown`), keyed by JSON so an empty group, the text "—", 3 and "3" are four headings; the words still come from `headingWords`; `cellClick` carries the stored values.
- **Siblings looked at:** the drawer's small grid does not call `turn`; chart points already give stored values. The server side (`inputs.ts` null is "is empty") needs no change.
- **A person sees:** Rows behind an empty group or a numbered heading finds those rows.

## WID-13 An action's typed value of digits or "true" was kept as a number or boolean, whatever the column
- **Test:** `apps/console/src/kit/inspector/actionModel.test.ts` (new; the first test failed before: `typedConstant("007","text")` was 7).
- **Changed:** `kit/inspector/actionModel.ts` (`typedConstant(text, type?)`: by the column's type; a several-choice column is a list), `kit/inspector/actionControls.tsx` (`ValuePicker` takes `type`; the "set a column to" site passes the column's).
- **Siblings looked at:** the flow and script input rows (`actionControls.tsx` ~565) pass no type and still read the text as it looks: the control does not know the input's type there (the schema's `properties` could give it; left, see Found). Condition values and filter "Starts as" use other controls.
- **A person sees:** "Code becomes 007" is stored "007" and runs.
- **Found:** flow and script inputs are typed by how the text looks; their schemas' property types (`FlowChoice.manualInput`, `ScriptChoice.inputSchema`) could be passed as `type` the same way.
