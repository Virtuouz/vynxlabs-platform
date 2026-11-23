---
title: Data source rows
description: "The rows grid on a data source's page: filters, sort, columns, the row inspector, Add row, delete, and what a table without a key allows."
subjects: [data-sources, rows]
---

A connected [data source](../screens/data/data-sources) has a page at `sources/<path>`. Its tables are on the left and the rows of the chosen table are on the right. The rows are read from and written to the database directly, one page at a time. The grid is the same as the one on a workspace's [Tables](../screens/data/tables) screen, with the differences listed below. For what a filter box takes, see [Filter syntax](../filter-syntax).

::screenshot{name=console/data-source-rows alt="A data source's page: the list of tables on the left, and the rows of the loans table with a filter box under each column heading and the toolbar with Keys, Columns, Compact rows and Add row."}

## What a source's rows do not have

A workspace table has these and a source's rows do not:

- No **CSV** export.
- No **Saved views**.
- No checkboxes and no deleting several rows at once. A row is deleted from its inspector.
- No count of all the rows: the footer says "N rows on this page" and never "of N".
- No file columns and no references to other tables: a source's columns are plain database types.

## The tables list

The list on the left names each base table of the source's schema, sorted by name. It scrolls on its own, and on a phone it is a row of buttons above the rows. The chosen table is in the address as `?item=<table>`. A table named in the address that the source does not list is looked up in the source's own list and refused with "The table <table> in the data source <path> was not found." A table name is 1 to 63 bytes.

## Controls

| Control | What it does |
| --- | --- |
| **Keys** | A popover "Keys in the table" with the keys of the grid and the filter forms. Hidden for a table with no primary key. |
| **Columns** | A dialog to show, hide and order the columns, **Lock the first column**, **Show every column** and **Done**. |
| **Compact rows** / **Standard rows** | Switches the row height. |
| **Rows must match** | **every filter** or **any filter**. Appears when two or more filter boxes are in use. |
| **Add row** | Opens the **Add row** sheet. It is shown for every table, with or without a key. |
| **Previous**, **Next** | Page through 50 rows at a time. |

The address holds `sort`, `filter`, `page`, `back`, `cols`, `match`, `unlock`, `density` and `row`, as on a workspace table.

## The grid

- **Filtering.** Each column except a JSON or array one has a filter box under its heading. A filter that cannot be read is said under the grid in red, and nothing is asked of the database until it is fixed.
- **Sorting.** Press a heading to sort up, then down, then not at all. Shift adds a column. A JSON column cannot be sorted.
- **Editing in place.** In a table with a key, double-click a cell, or press Enter or F2 on it. A column whose type Volvel cannot write is not edited. A key column of type UUID is shown in a fixed-width face.
- **Empty values.** An empty value shows as the word "empty" in a quiet tone.
- **The order of a table with no key** is a fixed one, so the pages do not shuffle between requests.

## The Row inspector

Choosing a row opens the **Row** inspector beside the grid, with the row's key above its title. It has a field for each column, as its type has it, then **Save row** and **Delete row**. **Delete row** asks "Delete row?": "Delete this row? It is removed for everyone. This cannot be undone." Choosing another row with unsaved changes asks "Leave without saving?" with **Leave** and **Stay**. A table with no key has no inspector action: its rows cannot be changed or deleted.

## The Add row sheet

**Add row** opens a sheet that says "Required values first. A value left empty is stored as none, or the column's default." The fields are in two groups, **Required** and **Optional**. A column is **Required** when the database says it cannot be empty, even if the database would fill it in: a column that has a default, such as a serial `id`, is still asked for, and the sheet says "<column> needs a value." until it has one. Only columns of a type Volvel can write are in the sheet.

Up to 1,000 rows are added in one request through the API.

## A table with no single-column primary key

The page says "This table has no primary key, so rows can be added but not changed or deleted." **Add row** is shown. **Keys** is hidden, cells cannot be edited and there is no **Delete row**.

## States

| State | What you see |
| --- | --- |
| Empty | "This table has no rows yet." |
| No match | "No rows match the filters." |
| The database cannot be reached | A notice with the reason, such as "The data source "<path>" could not be reached. Check its address.", and **Try again**. |
| A read took too long | The same, saying "The data source "<path>" took too long to answer." after 15 seconds. |
| A linked row is gone | "That row is not on this page, and this source cannot read one row alone." with **Close**, for a link to a row that is not in the page shown. |
| Read only | "You can see the rows of this table, not change it. It needs `data_source:write`." **Add row** is disabled and cells, the inspector and **Delete row** are not offered. |

## Permissions

| Action | Needs |
| --- | --- |
| See the tables and read rows | `data_source:read` |
| **Add row**, change a cell, **Save row**, **Delete row** | `data_source:write` |

The rows are the database's. Row rules and `data_all` do not apply to them, and changes to a source's rows are not written to the audit log. The database's own user decides what it may read and write: "The data source "<path>" does not let its user do that."

## Related

- [Data sources](../screens/data/data-sources): the list, connecting and the network rules.
- [Connect a Postgres database as a data source](../../how-to/queries/connect-a-data-source)
- [Filter syntax](../filter-syntax)
