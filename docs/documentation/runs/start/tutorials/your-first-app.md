# Run log: start/tutorials/your-first-app

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. Maya Brooks, Fernhill Sandbox, Playwright headless, 1440 x 900, light. App `tut Visits`, address `tut-visits`.
- Followed in four scripts (make the app, add and source the table, title and columns, publish and open) against one app, not one continuous script. A first attempt used the "A list of ..." page start instead; it made a second app `tut Visit list` (not used by the page) with a Schedule page, a detail sheet and a New appointment modal, and an empty first page. The page uses the plain Table path.

## Seen

1. Sandbox > Build > App Builder: list "Apps over this workspace's tables, built without code", button **Make an app**.
2. Dialog: Name, Address (a hint "The app's address ends with this. Lower-case letters, digits and dashes."), "0 of 100"; Address filled in as `tut-visits`; **Make the app**. The builder: "tut Visits", "1 draft change", "Saved. Not published yet.", the page list `tut Visits` (Page), "Nothing yet." on the outline.
3. **Add to page**: the dialog lists SUGGESTED FOR THIS PAGE, WORK WITH RECORDS (Table, List, Record detail, Form), UNDERSTAND DATA, TAKE ACTION, ORGANIZE AND EXPLAIN. Table added; settings read "Table needs a source to show." and ROWS IT USES / Source / Not set.
4. **Source** opened "Where it reads from", listing the workspace's tables (the instance had many other writers' tables), then queries. **Appointments** filled the table.
5. Display tab: COLUMNS "8 of 8 shown", LOOK, HEADING / Title. Title opens an editor "Or click the title on the page." and accepts text and Enter.
6. The eye buttons are named "Hide <column>". After Pet and Client code: "6 of 8 shown".
7. **Publish**: "What publishing does / Ready to publish / Deploys to Sandbox for the first time. Nobody sees it until then.", "Passed: All data sources found", "2 CHANGES: Added page tut Visits, Added table Visits", button "Publish 2 changes"; then "Published. People who open the app now see this."
8. `/apps/fernhill/sandbox/tut-visits/` as Maya: header "tut Visits", her address, Sign out; table "Visits" with Number, Pet name, Status, Starts at, Species, Clinic. The Apps list shows it as APP BUILDER, address `localhost:8091/apps/fernhill/sandbox/tut-visits`.

## What the page got wrong, and was corrected
- Nothing was written ahead of the run; the permissions were corrected to `deployment:write` from the generated permissions list.

## Not run
Opening the app as Rowan or a phone width; 768 and 390 px; dark; keyboard-only; promoting the app. The app was later marked for removal in the list (**Remove**: "This saves a draft that removes it. Nothing changes until that draft is deployed.") to see the dialog; the removal draft was not deployed.

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Second pass: steps 1-8 run as tut Visits 2; the app opened at 1440, 390 and in dark.
