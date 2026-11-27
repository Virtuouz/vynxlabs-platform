# Run log: console/how-to/widgets/run-an-action-from-a-widget.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`. Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright. Second check, 2026-11-23.
- App `wdg Choose` Table, steps 1 to 7 followed and published; served at 1440 px light. Mark done on A-7685 and A-7686 (Fernhill's Sandbox rows, now `done`; the booked group went 24 to 22 and the notice "Marked done." showed). The button was disabled on a done row (Only when Status is booked). A second action "Break it" was used once to put a row I had set to `bogus` back to `booked` (Status takes any text); then changed to an Update plus a Make a record with no fields: the error notice "Some of what was typed needs another look." showed and the Update was not saved. "Desk only" with Group Front desk was grayed for Maya and the publish check said "Try as Front desk first".
- When a row is clicked > Do lists Do nothing, Open record detail, Go to a page, Run an action.
- 390 px and dark: the served Table at 390 px light and dark (list view; row buttons are on hover or touch).

## What the page got wrong, and the correction
- The rule under Only when… starts as "Current user is in billing"; the page now says how to make it a rule about the row.
- The confirm text example now reads A-7685 of Rosie on Dec 3 (a 6:20 PM row still reads one day late: product fault).
- A refused step saves nothing at all, not only that step.

## Not run
Ask for a field, Run a flow, Run a script, Open a page and Make a record with fields as steps (menu seen only); the 8-step limit.
