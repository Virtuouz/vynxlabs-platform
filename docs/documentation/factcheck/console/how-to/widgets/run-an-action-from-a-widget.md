# Fact-check record: console/how-to/widgets/run-an-action-from-a-widget.md

Code as of the working tree of branch `phase-31-write-the-docs`, 2026-11-23. Paths are under `apps/console/src` unless they start with `packages` or `apps/control-plane`. Second check: every row below was read in the code and, where it says run, done on http://localhost:8091.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Actions tab: Row actions, + Row action, "Shown at the end of the row on hover, and in the detail sheet." | `kit/inspector/widgets/tableDrawer.tsx:569-571` | second agent, 2026-11-23 | holds as run |
| Says; heading becomes "What Mark done does"; Add a step menu: Ask to confirm, Update the record, Make a record, Remove the record, Run a flow, Run a script, Open a page, Show a message | `kit/inspector/actionModel.ts:71-100` | second agent, 2026-11-23 | holds as run |
| Update the record: "The clicked appointment", + Set another field > Status, the value beside "becomes" opens "Status becomes" with a box; Done | `kit/inspector/actionControls.tsx:227` | second agent, 2026-11-23 | holds as run |
| Ask to confirm is put first; default words made from the record ("Mark done for the appointment A-7685 of Rosie on Dec 3?"); Cancel and Mark done | `packages/screens/src/confirmWords.ts` | second agent, 2026-11-23 | holds as run; fault: widgets confirm text date (a 6:20 PM row reads Dec 4 for a cell Dec 3) |
| If it fails: Show the error and stop; When it is done, say shows a notice ("Marked done.") | `actionControls.tsx:1234,1244` | second agent, 2026-11-23 | holds as run |
| Can be pressed when > Only when… starts with "Current user is in billing"; rule changed to A field of a record, Status, is, booked: the button is grayed for a row that is not booked | `actionControls.tsx`; `act.ts` | second agent, 2026-11-23 | holds as run (disabled button on a done row); tooltip text not read |
| Who can run it > Group lists the workspace's groups; a person outside the group sees the button grayed; publish check says "Try as Front desk first" | run | second agent, 2026-11-23 | holds as run (Maya not in Front desk: disabled) |
| An action has up to eight steps; data steps run in one transaction: a refused step saves nothing, not even earlier steps | `packages/manifest/src/action.ts:340`; `act.ts` | second agent, 2026-11-23 | holds as run (a Make a record with no fields after an Update: error notice, the row unchanged) |
| After the action the page reads again; booked group went from 24 to 22 after two presses | `packages/screens/src/actions.tsx:691` | second agent, 2026-11-23 | holds as run |
| "An action has no steps yet." under Needs fixing | run | second agent, 2026-11-23 | holds as run |
| Row actions are not pressable in the builder | run | second agent, 2026-11-23 | holds as run (earlier run) |
| When a row is clicked > Do: Do nothing, Open record detail, Go to a page, Run an action | `tableDrawer.tsx:514-535` | second agent, 2026-11-23 | holds as run |
| Ask for a field, Run a flow, Run a script steps | `actionModel.ts:71-100` | second agent, 2026-11-23 | menu seen; not run |

Checked by: second agent, 2026-11-23
