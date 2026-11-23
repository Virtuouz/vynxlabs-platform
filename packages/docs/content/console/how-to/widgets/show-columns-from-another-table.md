---
title: Show columns from another table
description: Follow a reference column to the table it points to, show its columns beside the widget's own, and filter, sort and break down by them.
subjects: [widgets, app-builder]
---

## Show columns from another table

By the end the Fernhill appointments Table shows a column of the pet each appointment is for, read from the `pets` table.

## Before you start

- A Table (or List, Chart or Pivot) on an app page that reads a table with a column that points to another table. An appointment's **Pet** column points to a pet. See [Choose what a widget shows](choose-what-a-widget-shows) for the first steps. The App Builder needs `resource:write` or `interface:write`.
- Whoever opens the app needs `data:read`. Hiding a column is not security: see [How widgets get their data](../../explanation/widgets/how-widgets-get-their-data).

## Follow a reference

:::steps
1. Select the Table. On **Data**, under **Rows it uses**, find **Also from**. It has one chip for each table the source points to, here **Pets by pet**. A widget may follow up to six.
2. Press the chip. It turns checked, and a second row of chips appears, one for each column of the pets table (**Id**, **Created at**, **Updated at**, **Name**, **Species**, **Breed**, **Born**, **Weight lb**, and so on). A column the source already has a column of the same name for is not offered: under **Name** the note says "Name is not offered: Appointments already has a column called pet_name, which this one would be called too."
3. Press **Breed**. It is checked.
4. Open **Display**, press **+ Column** and choose **Pet breed**. The column is drawn after the others. A column of another table is named after the reference, then the column: **Pet breed**.
5. The other table's columns are now also offered by **Only include**, **Sorted by**, **Group rows by** and, in a Chart, **For each** and the measures.
6. To stop following the table, press the chip again.
:::

## The result

The Table shows a **Pet breed** column read from the pets table, one value for each appointment. The widget reads both tables in one query.

## If it does not work

- **The chip is grayed and the note says "<Table> is used by Breakdown", "Values" or both: change that to stop following it.** A Chart's **For each** or a measure uses a column of the table. Change it first.
- **The chip is grayed, there is no way to check another.** A widget follows six tables at most.
- **There is no "Also from" row.** The source table has no column that points to another table, or the widget reads a saved query.
- **The column shows "—".** The other table has no value there for that row. In Fernhill's data, **Breed** is empty for the pets used in these examples.
- **In a Chart, Scatter is grayed with "needs a number" for a number column of another table.** The type is not recognized for a column that comes through **Also from**. Use a number column of the table itself, or a bar chart.
