---
title: Store and delete files
description: Attach a file to a row, upload one on the Files screen, find it, and delete it, and what keeps a file until you do.
subjects: [tables, data]
topic: volvel-data-files
---

## Store and delete files

By the end you will have attached a file to a row, uploaded another on the **Files** screen, seen which one a row keeps, and deleted the one nothing names.

A workspace keeps the files that people put in a table's file column, that a script saved, and that were uploaded on the **Files** screen. A file is at most 25 MB and has a name of at most 255 characters. It is always downloaded as an attachment, and never shown as a page.

## Before you start

- You hold `file:write` to upload. To see the **Files** screen you also need `data_all:read`; to delete a file, `data_all:write` too. A person with only `file:read` can download a file they uploaded, or one that a row they may read names, but sees no list. See the [permissions reference](../../../administer/reference/permissions).
- A table with a column that holds a **File**. Add one as in [Change a table's columns](table-definition): choose **File** under **It holds**. A file column has no **Rules** and cannot be unique or hold a value when none is given.

## Attach a file to a row

:::steps
1. Open the table and press **Add row**. A file column shows **Choose a file** and "No file chosen".
2. Press **Choose a file** and choose the file. The sheet shows its name with **Replace** and **Remove**.
3. Press **Add row** at the foot of the sheet. The file is uploaded when the row is saved. The grid shows **Download** in the cell.
:::

To change the file of a row that exists, click the row. In the inspector press **Replace** and choose a file, or press **Remove**. The console then asks first: "Replace the file in attachment?" with "notes.txt takes its place. The old file stays in this row's history, until that history expires." and the buttons **Cancel** and **Replace**, or "Remove the file from attachment?" with "The row will have no file." and the button **Remove**. The console then says "File replaced." or "File removed." (a row that had no file says "File added.") A file cell is not changed in the grid itself.

## Upload a file without a row

:::steps
1. Open **Data**, then **Files**. The screen is titled **Files**.
2. Press **Upload file** and choose a file. The console says "price-list.txt was uploaded." and the file is first in the list.
:::

A file over 25 MB is refused with "… is over 25 MB, the most a file can be." and an empty file with "… is empty. Choose a file with something in it."

## Find a file and see what names it

The list shows newest first, 50 at a time. Press **Show more files** for the rest. Type part of a name in **Find a file by name**, such as `.pdf`; "No file has that in its name" says nothing matches. Each line has:

| Column | Says |
| --- | --- |
| **Name** | The file's name. Select it to download. |
| **Type** | Its content type. |
| **Size** | How big it is. |
| **Uploaded** | When. |
| **Named by** | The table and column of each row that holds it and how many rows, such as "thow-docs, attachment (1 row)". "No row" when none does. |

## Delete a file

:::steps
1. Find the file. Its **Delete** button is grayed out while **Named by** names a row, with the tooltip "A row still names this file. Change the row first."
2. To free one, change the row: replace or remove the file in the inspector, or delete the row (see [Work with a table's rows](table-rows)).
3. Press **Delete** on the file's line. The console asks "Delete" the file's name "?" and says "The file is gone for good. Nothing that names it is left: no row holds it."
4. Press **Delete**. The console says "… was deleted."
:::

## What keeps a file

- **A row that names it.** The file cannot be deleted, here or through the API, while any row of any table of the workspace names it, even a column that is retired.
- **A row's history.** A file that a row replaced or removed, and the file of a row that was deleted, is not deleted at once. It is noted as the row's, and kept as long as the tenant keeps its audit log: 400 days unless [retention](../../../administer/reference/screens/retention) says otherwise. It shows on the **Files** screen as "No row" meanwhile, and can be deleted sooner there. After that the file is removed with the note, unless a row names it again. This also holds for rows that a reference's rule deleted, and for a table or column that was deleted for good.

There is no screen that shows a row's history or puts a file back.

## The result

The file is attached to its row, or listed on **Files** with "No row", or gone. The audit log has `file.uploaded` for an upload and `file.deleted` for a deletion.

## If it does not work

- **The **Upload file** button is grayed out.** You lack `file:write`. The tooltip says so.
- **The **Delete** button is grayed out.** Either a row still names the file, or you lack `file:write`. Through the API the instance answers 409 "A row still names this file. Change the row to another file or none, or delete the row, and then delete the file."
- **The screen cannot be opened, or a file is "not found".** Without `data_all:read` the list is not given, and a file is found by its ID only through a row you may read, or because you uploaded it.
- **A file column cannot be changed in the grid.** Use the inspector, or **Add row**.
