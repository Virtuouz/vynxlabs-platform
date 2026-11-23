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
