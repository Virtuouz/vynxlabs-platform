# Run log: start/tutorials/your-first-table

- Instance: the walk instance, `http://localhost:8091`, seeded by `examples/fernhill/setup/setup.mjs`. Code at commit `be324f78` on `phase-31-write-the-docs`. Date 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`), tenant admin. Workspace Sandbox. Headless Chromium through Playwright, 1440 x 900, light theme. The console reopened on the Sandbox overview after sign-in.
- The table was named `ttut-visit-notes` on the instance, in place of `visit-notes`, because several writers share it. Nothing else was changed.
- Run 1 was a probe of the screens. Run 2 followed the page's steps in order, after the page was written and corrected. Run 3 repeated run 2 on a clean table after the corrections below; it had no change.

## Steps as followed, and what was seen

1. Press **Data**, then **Tables**: URL `.../tables`; the list shows the Fernhill tables with **Managed in**. (The rail item is a button, not a link.) Seen: the list.
2. **Create table**, Name, What it holds, First column `summary`, **Text**. Fields as the page names them.
3. **Add another column**, "Column 2" `minutes`, "Column 2 holds" **Whole number**. Who sees rows left at the default.
4. **Create table**: the console went to `.../tables/ttut-visit-notes`, the toast "Created." showed, the header read as the page quotes, the grid said "This table has no rows yet." No deploy was needed; rows could be added at once.
5. **Definition**, **Add column** `clinic`, **One of a list**, Values `Northside, Riverside, Hilltop`, Must every row have one? **Yes**, Value when none is given **Northside**, **Add column**: the row showed **Required** and **Northside**.
6. **Rules** on `summary`, **Yes**, **Save**: the row showed **Required**.
7. **Rows**, **Add row** five times: toast "Row added."; footer "5 rows on this page, of 5". The Add row sheet had **Required** (`summary`) and **Optional** (`minutes`, `clinic`).
8. Filter `>=20` under minutes: footer "3 rows on this page, of 3 that match". URL `filter={"minutes":">=20"}`.
9. Heading **minutes** pressed twice: URL `sort=minutes`, then `sort=-minutes`. Order Moss 55, Pepper 40, Olive 25.
10. **Saved views**, **Save this view…**, name `Long visits`, **Save**: success toast.
11. **Tables**, then the table again: the footer read "5 rows on this page, of 5". **Saved views**, **Long visits**: the URL carried the filter and the sort and the footer read "3 rows on this page, of 3 that match".

No horizontal page scroll at 1440.

## What the page got wrong, and was corrected

- It said the rail item **Data** was a link and gave a topic the console does not open. The page has no `topic` now, and the step names the buttons as they are.
- Its first draft had a screenshot of the Create table panel. The screenshot manifest has no step that types into a dialog, so the picture was dropped; the words carry the fields.
- Its first draft said a view keeps "the choice of columns". The run did not show that, so it says the filter and the sort.

## Extra probes for the explanation page (same table, on the instance)

- **Retire table** on the Definition tab: confirm "Retire "ttut-visit-notes"? Its rows are kept, and nothing can read or write them until it is brought back." The table showed **Retired** in the list.
- The retired table's page: the notice "This table is retired... its 5 rows are kept. Bring it back to use it again, with its columns, its rows and who sees them as they were." with **Bring back** and **Delete for good**.
- **Bring back**: the table opened on its rows, all five present.
- **Delete for good**: asks to type the name; after it the table was gone from the list (done on an earlier copy, before the final run).
- The tenant's audit log listed `resource.created`, `resource.updated`, `resource.deleted` and `table.purged`, and no entry for a row.

## Not run

- Widths 768 and 390, dark theme and keyboard-only: not run. The steps assume a wide screen, which the page says.
- The page's screenshots were not taken: the screenshot spec (`e2e/screenshots.spec.ts`) has no scene `visit-notes` yet (see the writer's report).

## Second check: the tutorial done again (second agent, 2026-11-23)

- Instance `http://localhost:8091`, commit `be324f78` plus the page edits of this check. Maya Brooks, Sandbox, Playwright headless, light theme. Table names `chk-vn-a` (1440 px) and `chk-vn-c` (390 px) in place of `visit-notes`.
- 1440 px: every step 1 to 11 followed as written, in one run, from the Data rail button and the Tables menu to the saved view. Results: step 4 opened `.../tables/chk-vn-a` with "This table has no rows yet."; step 5 "The column clinic was added." and the row showed Required and Northside; step 6 Required on summary; step 7 "Row added." five times and "5 rows on this page, of 5"; step 8 "3 rows on this page, of 3 that match"; step 9 `sort=minutes` then `sort=-minutes`, order Moss 55, Pepper 40, Olive 25; step 10 "Saved as “Long visits”. Only you see it in this menu; its link opens it for anyone."; step 11 five rows, then **Long visits** gave the filter, the sort and "3 rows on this page, of 3 that match". No horizontal page scroll.
- What the page got wrong: step 4 said the table's header reads "What the vet wrote down ... 0 rows ...". The text is not on the page; it is in the popover of the information button **About <name>**. The step now names the button.
- 390 px: the steps can be followed with differences, which the page does not claim (it says a laptop-width screen). The rail is a menu button at the top left: it opens the menu, **Data**, then **Tables**. The list shows only Table and Rows (no **Managed in**). In the Columns table the **Rules** and **When not given** columns are hidden, so steps 5 and 6 show no **Required** or **Northside**; each column's buttons are in a menu named "Actions for summary" at the right end of the table, which has to be scrolled into view. Steps 2, 3, 4, 7, 8, 9, 10 and 11 gave the same messages as at 1440. No horizontal page scroll.
- The edited step 4 was checked on `chk-vn-a`: the button **About chk-vn-a** opened a popover reading "What the vet wrote down after a visit. 5 rows. Everyone with access. Managed in the console." (5 rows, as the table then held five). The rest of the page did not change after the run, so the run is not repeated in full.

Not run in this check: 768 px, dark theme, keyboard only.
