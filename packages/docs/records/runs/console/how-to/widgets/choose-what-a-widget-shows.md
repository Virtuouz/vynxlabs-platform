# Run log: console/how-to/widgets/choose-what-a-widget-shows.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`. Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright. Second check, 2026-11-23.
- App `wdg Choose` (address `wdg-choose`), made with Make an app, followed from step 1 to 8 as the page now reads, at 1440 px light; the served result seen at 1440, at 390 px light and dark. Served Download as CSV saved and opened (`table.csv`, 25 rows plus header).
- Steps run: Add to page > Table; Source Appointments; Condition Species is Dog; Sorted by Then by Starts at newest, Show at most 25 ("Starts at, newest first · at most 25"); Display column editor and + Column; Group rows by Status (and Starts at to see Day, Week, Month and First); Compact, Rows at a time (5 to 200), When empty, Stripe rows; Hide on phones on Client code; Publish.

## What the page got wrong, and the correction
- A date column's Group rows by offers Day, Week or Month, not quarter.
- Rows at a time is 5 to 200.
- With Show at most 25 the Table does not say "Showing 25 of ..."; the page now says it appears when there are more rows.
- The result is the 25 newest dog appointments, and the phone list drops the hidden column.

## Not run
Colored badges, Align and Width, the 5, 10, 50, 100, 500 and 1000 limits, a production workspace (read only).
