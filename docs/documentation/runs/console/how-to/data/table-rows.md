# Run log: console/how-to/data/table-rows.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `be324f78` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No width or theme other than that was run.
- Tables made for this run are named `thow-...`. Rows that the page does not ask the reader to type (the seed of 11 rows) were put in by the API (`POST rows/<table>`, as the same signed-in person) to save typing.
- The steps were run in pieces, then the page was written from what was seen and corrected where it differed (listed under "The page got wrong"). A single end-to-end run of the finished text was not made.

## Setup
1. **Data > Tables > Create table**: name `thow-visits`, first column `pet` (Text), more columns `species` (One of a list: dog, cat, rabbit), `weight_kg` (Number), `seen` (Date). The table opened on **Rows**, empty: "This table has no rows yet."
2. **Add row** (sheet titled "Add row", text "Required values first. A value left empty is stored as none, or the column's default."): pet Biscuit, species dog, weight 24.5, seen 2026-03-02 (the date box takes `2026-03-02`). The row appeared, footer "1 row on this page, of 1".
3. API: 11 more rows (Miso, Pickle, Juno, Waffles, Olive, Bramble, Moose, Pepper, Clover, Ziggy, Nori; Nori with no seen). Footer "12 rows on this page, of 12".

## The steps as followed
- **Filter**: species `dog` gave 5 rows ("5 rows on this page, of 5 that match", address `?filter={"species":"dog"}`). Added weight_kg `10..30`: 2 rows. species `dog | cat` with `10..30`: 2. species `!dog`: 7. seen `empty`: 1. pet `!~o`: 6. pet `o` with species `rabbit`: 1; **Rows must match** appeared once two boxes were used; **any filter**: 8 rows, address gained `match=any`.
- Later check with a row with no `seen` (Quill): `!2026-03-02` found 9 of 12 and did not find Quill; `empty` 1; `!empty` and `not empty` 11 each; `>= 2026-03-05` 6; pet `not containing o` 7. `seen` = `abc` gave the red notice "seen: Enter a day that exists, such as 2026-06-01." and the **CSV** button was disabled; weight_kg `abc` gave "weight_kg: Enter a number."
- **Sort**: a click on weight_kg gave ascending (1.5 first), a second descending, a third none. Click on species, then a click with Shift on weight_kg: address `sort=species,weight_kg`, headings carried 1 and 2 (`aria-sort` ascending on both).
- **Columns**: unchecked created_at and updated_at, **Move weight_kg up**, **Done**: address `cols=pet&cols=weight_kg&cols=species&cols=seen&cols=id`. **Compact rows** added `density=compact` (the button then reads **Standard rows**).
- **Change in the grid**: double-click on Miso's weight, Ctrl+A, `4.4`, Enter: the cell read 4.4. Double-click on species opened a select with No value, dog, cat, rabbit; Escape left it. F2 on a cell of Pickle opened the cell's editor.
- **Inspector**: a click on Nori opened "Row" with the fields, **Save row**, **Discard**, **Delete row**. Set seen 2026-03-11 and **Save row**: the cell showed it. Typed `Nori II` in pet and clicked another row: the dialog "Leave without saving? Your changes to this row are not saved." with **Stay** and **Leave**; **Stay** then **Discard** put `Nori` back. The toast "Row saved." was not caught by the script.
- **Export**: with species `cat` and pet `o`, **CSV** downloaded `thow-visits.csv`: header `id,created_at,updated_at,pet,species,weight_kg,seen`, then 3 rows (Miso, Olive, Nori). The hidden columns of the last step were not hidden then; the file holds every column.
- **Saved view**: bookmark button (**Saved views**) listed "Save this view…" and "Copy a link to this view"; **Save this view…** opened "Save this view" with Name and **Save**; name "Cats with an o". After a reload of the table, the menu listed "Cats with an o" and choosing it restored the filter (3 rows).
- **Delete**: ticked Nori's box: bar "1 row checked" with **Delete** and **Uncheck all**. **Delete** opened "Delete this row? They are removed for everyone. This cannot be undone." with **Delete the row**. After it: "2 rows on this page, of 2 that match".

## The page got wrong (and was corrected)
- The brief gave the confirmation as "Delete these N rows?" only; the code and the run give "Delete this row?" for one row and "Delete these N rows?" for several, with the button **Delete the row** or **Delete N rows**.
- A first draft said that the third click on a heading "goes back to the order they were added in"; the run shows only that the sort is off. The page says so.
- Home and End were first written as ends of the row only; the grid also takes Ctrl or Cmd for the ends of the grid (code `Grid.tsx:468-566`, not run).
- A date is not shown in UTC on hover; only a date and time is (`Grid.tsx:158-161`). Corrected.

## Not run
The inspector's **Delete row** (the confirm text comes from the code), a reference picker, a list-of-values cell, a phone width, dark theme, keyboard-only walk of the whole page.
