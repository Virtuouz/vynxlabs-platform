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
