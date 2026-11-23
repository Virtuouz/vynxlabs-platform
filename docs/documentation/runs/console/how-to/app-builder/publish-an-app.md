# Run log: console/how-to/app-builder/publish-an-app.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs) plus the working tree of the wave.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run. Apps made for the runs are named `abapp …`.
- The steps were run in pieces (several scripts), then the page was written from what was seen. A single end-to-end run of the finished text was not made.

## The steps as followed (on `abapp Visits`: a blank first page, a list page of Appointments, a side sheet and a modal)
- **View as**: the menu listed Me, Billing, Practice managers, Front desk, hilltop, northside, riverside. (A group's drawing was not looked at: the app had no group rules.)
- **Preview** (route `…/screens/screens/abapp-visits/preview`): the bar was read by script, not by eye. A first publish had not happened yet.
- **Publish**: panel "Ready to publish", "Deploys to Sandbox for the first time. Nobody sees it until then.", three passes ("All data sources found", "3 actions are complete", "New appointment form is valid"), "8 CHANGES" (Added page … Added form), **Publish 8 changes**. After adding a Button the list read "Added button" and 9 changes.
- **Publish 8 changes**: the toast "Published. People who open the app now see this." with **Open the app**; the header status read "Published."; the app's row in the list became Published v1.
- **More ways to publish**: Publish, Open the published app, Restore an earlier draft. **Restore** dialog: "Each save keeps what it replaced. Restoring one makes it the draft; Undo takes it back.", an entry "14:23 (1m ago) · Maya Brooks" with "Added page Appointments, added page Appointment detail and 4 more", Pages "abapp Visits (0)", "RESTORING IT CHANGES THE DRAFT" with seven "Removed …" lines, **Restore**, **Not now**. Restore was not pressed.
- A second publish check with a Button, a Section, Tabs and an Action group: 4 actions complete, 10 changes.

## Not run
A red row (Needs fixing) and **Show it**; **Try as … first** (no group rules); **Check again**; the 403 text; a user with only `interface:write`; **Open the published app** from Preview. These are from the code and their texts are in the record.
