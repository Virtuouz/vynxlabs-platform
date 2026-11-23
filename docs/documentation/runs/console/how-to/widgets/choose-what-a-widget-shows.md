# Run log: console/how-to/widgets/choose-what-a-widget-shows.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright, light theme, 1440 px unless said. The app is `wdg Visits` (address `wdg-visits`) made in the App Builder for these runs.
- The steps were run in pieces and the page written from what was seen; one end-to-end run of the finished text was not made.

## The steps as followed
- **Make an app**: name `wdg Visits`, address `wdg-visits`; it opened on one empty page.
- **Add to page** listed Suggested for this page (A list of ..., a record page, Approvals), Work with records, Understand data, Take action, Organize and explain. Table placed; Data said "Needs fixing: Table needs a source to show." Source window "Where it reads from" with "Find a table or query"; chose Appointments: rows appeared; Also from showed "Pets by pet".
- **Only include**: Condition opened "Only include rows where" (Field, test is / is not / is empty / is not empty, Any of with Dog 2,272 rows ...); Dog ticked, Add: chip "Species is Dog".
- **Sorted by**: window with "+ Then by", "Show at most" and the choices; Then by added a sort row (the first press added Created at, which was then removed); chose Starts at (a select) -> "Starts at, newest first"; Show at most 25 -> "Starts at, newest first · at most 25".
- **Display**: 8 of 8 columns; + Column offered Id, Created at, ... Pet name ...; Pet breed added (9 of 9). Group rows by Status (the window lists Nothing: one list and columns): heading "booked 25 rows". Column editor for a column: Heading, Shown as, Align, Width, Sort by clicking the heading, Hide on phones.
- **Publish**: the check listed 3 changes; "Publish 3 changes"; the app served at /apps/fernhill/sandbox/wdg-visits/ with a download icon in the Table heading whose menu read "Download as CSV" and "Download as a spreadsheet". The file was not opened.

## The page got wrong (and was corrected)
- A first draft said a page holds 20 conditions; the limit is per query.
- "Show more" is "Show 25 more" with "Showing 25 of 3,708".
- The Breed column added in Data did not appear in the table until it was added in Display with + Column; the page says so.
- Pet breed is empty ("—") in Fernhill's pets.

## Not run
Colored badges, Align and Width, the 5, 10, 50, 100, 500 and 1000 limits, Stripe rows, When empty, the narrow widths other than the last run, dark theme, keyboard. The Download file was not opened.
