# Run log: console/how-to/widgets/run-an-action-from-a-widget.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright, light theme, 1440 px unless said. The app is `wdg Visits` (address `wdg-visits`) made in the App Builder for these runs.
- The steps were run in pieces and the page written from what was seen; one end-to-end run of the finished text was not made.

## The steps as followed
- Actions tab: "+ Row action" added "Action"; Says "Mark done"; Add a step menu: Ask to confirm, Update the record, Make a record, Remove the record, Run a flow, Run a script, Open a page, Show a message. Update the record: "The clicked appointment", + Set another field (the column list), Status becomes a value list (A value, Today, Now, The current user ..., Status of the clicked appointment ...). Value typed `done`.
- Ask to confirm added as step 1; the canvas showed a preview "What people will see · step 1" with Cancel and Confirm. Stray extra actions made while exploring were removed with "Remove Action 2".
- Published; in the served app a row's Mark done opened "Mark done for the appointment A-7687 of Willow on Dec 4?" with Cancel and Mark done. Pressing Mark done changed that appointment's status to `done` (this instance's Fernhill sandbox data), and the "booked" group count went from 25 to 24.

## The page got wrong (and was corrected)
- In the builder, the row's buttons are drawn grayed and cannot be pressed.
- The confirm text says Dec 4 for a row the cell shows as Dec 3, 6:20 PM (product fault, in the report, not on the page).

## Not run
Can be pressed when, Who can run it with a group, When it is done, say, Ask for a field, a flow or script step, When a row is clicked, the failure path, several rows.
