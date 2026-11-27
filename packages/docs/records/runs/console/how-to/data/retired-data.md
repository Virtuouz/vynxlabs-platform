# Run log: console/how-to/data/retired-data.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `be324f78` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No width or theme other than that was run.
- Tables made for this run are named `thow-...`. Rows that the page does not ask the reader to type (the seed of 11 rows) were put in by the API (`POST rows/<table>`, as the same signed-in person) to save typing.
- The steps were run in pieces, then the page was written from what was seen and corrected where it differed (listed under "The page got wrong"). A single end-to-end run of the finished text was not made.

## The steps as followed
1. Made `thow-old` (column `label`) with **Create table**, 3 rows by the API. **Definition**, **Retire table**: dialog "Retire table?" with "Retire "thow-old"? Its rows are kept, and nothing can read or write them until it is brought back." and **Retire table**. The console went to the list of tables; `thow-old` showed a **Retired** pill, Managed in Console, 3 rows.
2. Opened it: "This table is retired. It left its definition, so nothing can read or write it, and its 3 rows are kept. Bring it back to use it again, with its columns, its rows and who sees them as they were." with **Bring back** and **Delete for good**, and its columns read-only.
3. **Bring back**: the table opened on its rows, with `first` among them.
4. Retired it again, opened it, **Delete for good**: dialog "Delete for good? Delete the retired table "thow-old" and everything in it? This is the one action that destroys data, and it cannot be undone. Type thow-old to confirm"; the button was disabled until the name was typed; after it the list had no `thow-old`.
5. Retire refused: `thow-visits.note_ref` refers to `thow-scratch`; **Retire table** on `thow-scratch` answered "The table "thow-scratch" cannot be deleted: "thow-visits" (column "note_ref") refers to it. Delete or change those references first."
6. Column: added `coat` (Text) to `thow-visits`, set Miso's coat to `tabby` in the inspector. **Retire** `coat`: "Retire coat? It is hidden and its data kept. You can bring it back." **Retired columns** listed `visit_count` (Number, "0 values") and `coat` (Text, "1 value"), each with **Bring back** and **Delete for good**. **Bring back** on `coat`: the column was in **Columns** again, with no rules, and Miso's row read `tabby`. Retired it again; **Delete for good**: "Delete the retired column "coat" and everything in it? ... Type coat to confirm"; after it `coat` was gone from **Retired columns**, `visit_count` stayed.

## The page got wrong (and was corrected)
- The inventory said Delete for good and Bring back carry no permission check; the code now gates both (**Delete for good** needs `table:write`, **Bring back** `resource:write`). Not run with a person who lacks them.
- The inventory said Bring back of a table refuses a reference column whose rows hold IDs no longer in the table. The code leaves such rows as they are (`apply.ts:927-929`); the page says that.
- The inventory mentioned the audit event only for a table; the route writes `table.purged` for a column too.

## Not run
A repository table (no Bring back, text from the code), two retired tables of one name, a retired table opened by a person without `resource:write`, phone width, dark theme.

## Second check (second agent, 2026-11-23)
- Instance `http://localhost:8091`, Maya Brooks, 1440 px, light. Tables `chk-vn-c` (5 rows, made in the tutorial run) and `chk-ref` (a column `ptr` pointing to `chk-vn-c`).
- Followed: **Retire table** on `chk-vn-c` (confirmation text as quoted; refused while `chk-ref.ptr` pointed to it, text as quoted); retired `ptr`; **Retire table** again (the console went to the list, "Retired" pill); opened it (notice with 5 rows, **Bring back**, **Delete for good**); **Bring back** ("The table chk-vn-c is back, with its rows.", 5 rows, Required and default restored, description not). Column: **Retire** on `status` (listed under Retired columns with "5 values"), **Bring back** (Required and default gone, as the page says), retired again and **Delete for good** (type `status`, button off until it matches, column gone).
- Not run: **Delete for good** on a whole table in this check, a table defined in the repository, two retired tables of one name, a person without `table:write`, 768 and 390 px, dark, keyboard only.
