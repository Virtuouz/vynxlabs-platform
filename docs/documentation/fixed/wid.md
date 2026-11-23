# Fixed: lane wid

Commits are named by the row in their subject: `git log --grep "(WID-01)"`.

## WID-01 Own-record widget actions ran on anyone's readable record
- **Test:** `page-actions.test.ts` > "a detail of the user's own record" > "a button runs on the user's own record, and on no one else's, even one they may read" (404 before the fix: 200).
- **Changed:** `apps/control-plane/src/kernel/pages/act.ts` (the own check, in the round loop): moved out of `if (editing)` to every action of a widget whose source is `own`; checks `records.this` for an edit in place, `records.event` (each of `events`) otherwise. Case-blind as before.
- **Siblings looked at:** a Form in edit mode on an `own` source sends `record` as `event`: covered. `on/*` events of such widgets: same path. Table row actions on an `own` source: same path (each round). `this` is the page's record, not the widget's, so it is not held to ownership.
- **A person sees:** the button on another person's row answers "The record was not found" (404) and changes nothing.
- **Left out:** nothing. No screen change.
