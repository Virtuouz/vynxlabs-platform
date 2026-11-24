# Run log: console/how-to/widgets/show-columns-from-another-table.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`. Signed in as Maya Brooks (tenant admin), Fernhill's Sandbox workspace, headless Playwright. Second check, 2026-11-23.
- App `wdg Choose` Table (and Chart in `wdg Chart`), 1440 px light, steps 1 to 6 followed: chip "Pets by pet"; the pets columns; the Name note; Breed; Display > + Column > Pet breed ("—" in every row, Fernhill's pets have no breed); the Condition field list and the Sorted by list offer the Pet columns; a condition "Pet weight lb is more than 5" was added and read; pressing the chip again took away the condition and one sort.
- Stat, Pivot, List and Goal each show the Also from chip (checked with Appointments).

## What the page got wrong, and the correction
- Unfollowing removes conditions and sorts; a column added in Display stays in the column list and is still drawn ("—"). The page now says to remove it there (product fault, see the report).
- The widgets that offer Also from: Table, List, Chart, Pivot, Stat and Goal.

## Not run
Six followed tables (Appointments points to one table only).
