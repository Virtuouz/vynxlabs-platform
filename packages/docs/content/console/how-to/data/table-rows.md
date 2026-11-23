---
title: Work with a table's rows
description: Find rows with filters and sorts, change them in the grid or the inspector, add and delete them, export them as CSV and save a view.
subjects: [tables, data]
---

## Work with a table's rows

By the end you will have found rows with a filter, changed one, added one, deleted one, exported the rows you found and saved the view for next time.

## Before you start

- You are signed in to the console and the workspace is open. Rows are read with `data:read` and added, changed and deleted with `data:write`, on the table or on the whole workspace. A person with the `workspace_admin` role has both. See the [permissions reference](../../../administer/reference/permissions).
- A table with rows in it. Without `data:write` **Add row** is grayed out and its tooltip says what is missing, and the cells and the inspector cannot be changed.

## Find rows, change them and export them

:::steps
1. Open **Data**, then **Tables**, then the name of the table. It opens on **Rows**. The footer says how many rows are on this page and how many there are in all, for example "12 rows on this page, of 12". A page holds 50 rows; use **Previous** and **Next** for the rest.
2. Filter. Under each column heading is a box labeled **Filter by** and the column's name. Type in it and stop: the rows follow 300 ms later, the address changes, and the footer says "of N that match". Several boxes together keep the rows that satisfy all of them. What a box understands is in the table below this list.
3. To keep the rows that satisfy any box instead, press the **Rows must match** list, which appears once two boxes are in use, and choose **any filter**.
4. Sort. Click a column heading: the rows go up, then down, then the sort is off. Hold :kbd[Shift] while you click to add a second column to the sort. A number beside each arrow shows the order. A click with :kbd[Shift] on a column already sorted turns it down, and another takes it off. A column of JSON or of several values from a list cannot be sorted.
5. Choose the columns. Press **Columns**, check or uncheck a column to show or hide it, and move one with the arrows beside it or by dragging its handle. **Lock the first column** keeps the first column in view when the table is scrolled sideways, and **Show every column** puts them all back. Press **Done**. Press **Compact rows** for tighter rows; it becomes **Standard rows**.
6. Change a value in the grid. Double-click a cell, or move to it with the arrow keys and press :kbd[Enter] or :kbd[F2]. Type the new value and press :kbd[Enter]. Press :kbd[Escape] to put the old value back. A cell of a choice, a list of values, a row of another table, a date or a date and time opens a small control of its own. A yes or no cell changes with :kbd[Enter], :kbd[F2] or a double-click. A file, `id`, `created_at` and `updated_at` are not changed in the grid.
7. Change a whole row. Click a row. The inspector, titled **Row**, opens beside the grid with a field for each column. Change what you need and press **Save row**; **Discard** puts the fields back. If you choose another row with unsaved changes, the console asks "Leave without saving?" with **Stay** and **Leave**.
8. Add a row. Press **Add row**. The sheet lists the **Required** values first and the **Optional** ones after. A value left empty is stored as none, or as the column's default. Fill in what you know and press **Add row** at the foot of the sheet.
9. Delete rows. Check the box at the start of each row you want gone. A bar says "1 row checked", with **Delete** and **Uncheck all**. Press **Delete**, read "Delete this row?" and press **Delete the row** (for several rows the button says how many). To delete the row that is open instead, press **Delete row** at the foot of the inspector and confirm.
10. Export. Press **CSV**. The file is named after the table and holds every column of the rows that match the filters, in the order you sorted them. It does not hold only the checked rows, and it ignores which columns you hid.
11. Save the view. Press the bookmark button (**Saved views**), then **Save this view…**, type a name and press **Save**. The filters, the sort, the columns and the row density are kept. Choose the name in the same menu later to open the view again.
:::

### What a filter box understands

A text column finds rows that contain what you type, ignoring capitals. Any other column finds rows that equal it. These forms work in every column that has a box:

| Type | Finds |
| --- | --- |
| `dog` | Text that contains "dog"; for other types, the rows that equal the value. A choice must be spelled as its value. A list of values finds rows that hold that value. |
| `> 10`, `>= 10`, `< 10`, `<= 10` | Numbers, dates and times above, at least, below or at most the value. |
| `10..20`, `10..`, `..20` | A range of numbers, dates or times. Both ends are included. A missing end is open. |
| `!dog` or `not dog` | Rows that are not exactly the value. |
| `!~dog` or `not containing dog` | Text that does not contain the value. Text columns only. |
| `dog | cat` | Rows that match one value or the other. |
| `empty` or `null` | Rows with no value. |
| `!empty` or `not empty` | Rows with any value. |

A row with no value in the column is not found by `!dog` or by a comparison; use `empty` for those. You cannot filter for the text "empty". JSON columns have no filter box. A box that cannot be read, such as `abc` in a number column, shows a red notice naming the column and the reason; no rows are asked for until it is fixed, and **CSV** is disabled. A column of rows of another table is found by the row's ID, or by `empty`: open the row to copy its ID.

A date and time is shown, typed and filtered in your own time zone. Hover over one for the UTC time.

Press **Keys** for a reminder of the keys and the filter forms on the screen itself. In the grid the arrow keys move between cells, :kbd[Home] and :kbd[End] go to the first and last cell of a row (with :kbd[Ctrl] or :kbd[⌘], of the grid), :kbd[PageUp] and :kbd[PageDown] move ten rows, and :kbd[Space] checks a row.

::screenshot{name=console/table-rows-filtered alt="The rows of the orders table filtered to totals from 20 to 90 and sorted by status and then by total, with a 1 and a 2 beside the two sort arrows and the footer reading '2 rows on this page, of 2 that match'."}

## The result

The rows are as you left them. A change in the grid or the inspector is saved when you press :kbd[Enter] or **Save row**: the console says "Row saved." for the inspector and the cell shows the new value. The view is in the **Saved views** menu, under your name only. To share the one you are looking at, open the menu and choose **Copy a link to this view**; the link opens it for anyone who may read the table. Views belong to the table, so renaming it keeps them.

The rows of a table that a deploy defines can be changed the same way. The columns cannot: see [Change a table's columns](table-definition).

## If it does not work

- **"No rows match the filters."** Clear a box, or change **Rows must match** to **any filter**. Two boxes that cannot both be true find nothing.
- **A red notice under the table names a column.** Its box holds text the column's type cannot read, such as a letter in a number column. Correct or clear it.
- **The rows do not load and the screen says an index makes it faster.** The table is slow to read for the filter and sort you asked for. Follow **Add an index** (a table made in the console only) or filter on fewer columns. See [Change a table's columns](table-definition).
- **"That row is gone: it was deleted, or its ID is not one of this table's."** The address of a row that was removed. Press **Close**.
- **The Delete bar does not appear.** Rows can be deleted together only in a table of the workspace and only with `data:write`. What is checked belongs to the page, sort and filter it was checked on, so changing any of them unchecks the rows.
- **"N were gone already, or were not yours to delete."** Said after a delete when some rows were removed by someone else first, or the table's row rules do not let you delete them. See [Who sees which rows](row-rules).
- A table has no screen for importing a CSV, and none for a row's history. The API takes up to 1,000 rows in one call, and the console exports only.
