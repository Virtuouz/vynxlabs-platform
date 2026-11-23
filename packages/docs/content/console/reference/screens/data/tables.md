---
title: Tables
topic: data-tables
description: "A table holds rows the workspace owns. Its columns have types, and who may read or write its rows is decided by roles and row policies."
moved_from:
  - data/tables
---

A table holds rows the workspace owns. Its columns have types, and who may read or write its rows is decided by roles and row policies.

::screenshot{name=console/table-help alt="A table's rows, with the help for the screen open beside them."}

## Renaming, describing and taking back

A table's name and description are changed where the table is edited. Renaming moves its address, and the old one leads to the new one for a while. **Undo** and **Redo** in the table's definition and in its row rules take back any change made since the page was opened, one at a time, and the table saves as you work, so what you typed last is what is saved.

## One place to scroll

A table's screen fills the window. Its rows are the one thing that scrolls, with the column headers pinned above them, and the page around them stays where it is. The Rows and Definition tabs both work this way, on a phone as on a desktop. The column actions menu stays within reach at any width.

## Choosing a referenced row

A reference column is filled by typing. The picker asks the server for rows whose display column contains what you typed, so it finds a row however far down the table it is. It shows the first 50 and says "Type to find more". The display column is the one the table names; when it names none, the picker uses a column called `name` or `title`, or else the first text column.

## References in the grid

A reference cell in the grid shows the row it points to by name, not by its ID. Where the table names no display column, the server names rows by the same rule as the picker: `name`, else `title`, else the first text column. Exports and the rows API's `expanded` use the same rule, so a row is called the same thing everywhere.

## Replacing and removing files

A file column in the row inspector has **Replace** and **Remove**. Each asks first. A replaced or removed file is not deleted at once: it stays in the row's history, and is kept as long as that history is, which is as long as the tenant keeps its audit log (400 days unless [retention](../../../../administer/reference/screens/retention) says otherwise). After that it is removed.

A file that a worker script replaces in a row is kept the same way: it is noted in the row's history when the script updates the row, and removed once audit retention has passed. A source table's rows hold files the source owns, not Volvel, so nothing of a source's is kept or removed here.
