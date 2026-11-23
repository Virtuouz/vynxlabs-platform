# Run log: console/how-to/widgets/show-columns-from-another-table.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright, light theme, 1440 px unless said. The app is `wdg Visits` (address `wdg-visits`) made in the App Builder for these runs.
- The steps were run in pieces and the page written from what was seen; one end-to-end run of the finished text was not made.

## The steps as followed
- The Table's Data tab showed Also from: chip "Pets by pet", unchecked until pressed; pressing it checked it.
- Checking the chip showed the pets table's columns as chips: Id, Created at, Updated at, Name, Species, Breed, Born, Weight lb, Client code, Clinic, Alert. Name was disabled with "Name is not offered: Appointments already has a column called pet_name, which this one would be called too."
- Breed checked. Display > + Column offered Pet id, Pet created at, Pet updated at, Pet name, ...; "Pet breed" added; the table drew it ("—" in every row).
- On a Chart, checking Pets by pet made For each offer Pet created at, Pet updated at, Pet born, Pet species, Pet breed, Pet weight lb ... Choosing Pet weight lb made the chip say "Pets is used by Breakdown: change that to stop following it."
- Scatter was grayed "needs a number" with For each = Pet weight lb; with For each = Minutes (own column) it was available.

## The page got wrong (and was corrected)
- The inventory said Chart, Stat, Goal and Pivot have no Also from row. The Chart has one; the page does not say otherwise. Stat, Goal and Pivot were not opened.

## Not run
Six joined tables; filtering and sorting by a joined column; a Stat, Goal or Pivot.
