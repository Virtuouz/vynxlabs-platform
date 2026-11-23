# Run log: console/how-to/data/files.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `be324f78` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No width or theme other than that was run.
- Tables made for this run are named `thow-...`. Rows that the page does not ask the reader to type (the seed of 11 rows) were put in by the API (`POST rows/<table>`, as the same signed-in person) to save typing.
- The steps were run in pieces, then the page was written from what was seen and corrected where it differed (listed under "The page got wrong"). A single end-to-end run of the finished text was not made.

## The steps as followed
1. Made `thow-docs` with columns `title` (Text) and `attachment` (File). **Add row**: the sheet showed `attachment` with **Choose a file** and "No file chosen"; after choosing `biscuit-record.txt` it showed the name with **Replace** and **Remove**. **Add row** saved; the cell read **Download**.
2. **Data > Files**: title "Files", the description, **Upload file**, **Find a file by name**; one line: `biscuit-record.txt`, text/plain, 50 B, "just now", "thow-docs, attachment (1 row)", **Delete** disabled.
3. **Upload file** with `price-list.txt`: first in the list, "No row", **Delete** enabled. Search `.pdf`: "No file has that in its name" with "Look for part of a name, such as the end of one: .pdf." Search `price`: that one line. **Delete** on it: "Delete price-list.txt? The file is gone for good. Nothing that names it is left: no row holds it." **Delete**; it left the list.
4. Inspector of the row: **Download**, **Replace**, **Remove**. **Replace** with `biscuit-record-v2.txt`: "Replace the file in attachment? biscuit-record-v2.txt takes its place. The old file stays in this row's history, until that history expires." with **Cancel**, **Replace**. **Files** then listed `biscuit-record-v2.txt` (1 row) and `biscuit-record.txt` with "No row". Deleted the old one from **Files**: it worked.
5. Deleted the row (checkbox, **Delete**, **Delete the row**): `biscuit-record-v2.txt` then read "No row".

## The page got wrong (and was corrected)
- The brief's "retention" line: the 400 days is the code's default for `RETENTION_AUDIT_DAYS` (`config.ts:323`; bounds 90 to 3,650). The page says "400 days unless retention says otherwise".
- The "toast" texts "File replaced." and "File removed." and the Files toasts were taken from the code; the script did not catch the toasts.
- A first draft said nothing keeps an unnamed file; removed, as the run and code show only history-based removal.

## Not run
**Remove** in the inspector, a 25 MB or empty file (texts from the code), **Show more files** (the list had fewer than 50), the API refusal with 409 (text from the code), the audit lines, a person with only `file:read`, a file saved by a script, retention actually removing a file.
