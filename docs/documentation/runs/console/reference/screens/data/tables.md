# Walk: console/reference/screens/data/tables (with column-types and filter-syntax)

Instance: the throwaway instance at `http://localhost:8091` (Fernhill seeded), commit `be324f78`, Playwright headless at 1440 by 900. Signed in as Maya Brooks (tenant admin), also as Sam Reyes and Devi Shah for permissions. Workspace: Fernhill's Sandbox. Own names start with `tref`.

What was done and seen:

- Tables list at `/tables`: columns, "Managed in" Repository for Fernhill's tables, Console for three console tables, row counts. Create table dialog read in full. Made `tref-notes` with a first column and three more (One of a list with values, Whole number, Date). The table page opened.
- Create table refusals: a name already in use gave 'Something is already at "tref-notes". Choose another name, or change what is there.'; a first column named `id` gave 'There is already a column called "id". Choose another name.'
- Add row sheet read, three rows added. Row inspector read (Save row, Delete row; Discard shows when changed). Keys popover read. Columns dialog read. Checking one row showed "1 row checked", Delete, Uncheck all; Delete asked "Delete this row?" and was canceled.
- Filters on `tref-notes`: `vet` (1), `!~vet` (2), `!Order food` (2), `order | call` (2), `> 1` (2), `1..3` (2), `..3` (2), `!empty` (3), `abc` on a number ("size: Enter a number."), `open`, `!open`, a date range (2), `!~x` on a date ("due: Only text can be searched with !~.").
- Definition view of a repository table (clients): notice, read only columns, Indexes listed, Who sees rows, See it as, Where it is stored. Of `tref-notes`: Rename table dialog ("Name and path of tref-notes", Key, Path, Title, "Save as a draft", old path answers 90 days), Describe, Values dialog, Rules dialog, Change type dialog (Whole number offers Number and Text), Add column (a list column made, "The column tags was added."), duplicate name refused, Rules to make `title` required (hint seen, saved), Undo took it back, Redo put it back, Retire a column (confirm text seen), the Retired columns table, Bring back, Add an index dialog.
- A scratch table `tref-scratch` was made through the API as a console resource, retired from the Definition view (confirm text seen), its retired page read (notice, Bring back, Delete for good, definition read only), and deleted for good by typing its name.
- Permissions: Sam Reyes sees the list and rows with Create table and Add row disabled and the lines "You can see … not change it. It needs …" (`data:write`, `resource:write`). Devi Shah (developer) can create and edit.

Not walked: the phone width, dark theme, a reference column (no second table of my own), See it as, Bring back of a table (not run: the retire/bring back of `tref-scratch` stopped at Delete for good), CSV download, saved views items, cell editing in the grid, the too-slow state, sorting arrows, keyboard keys of the grid. Those are from the code, as the record says.

What the page got wrong at first and was corrected: Undo does cover a saved change to who sees rows (the inventory said it does not); the file field in the inspector has **Replace** even with no file, not **Choose a file**; the file name is cut to 255 characters, not refused; `in` takes at most 200 values.

Screenshots: three shots were added to the manifest. They were not taken (the spec runs on its own instance with `pnpm docs:screenshots`).
