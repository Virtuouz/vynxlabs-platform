---
title: Choose what a widget shows
description: Point a Table at a source, keep the rows you want, sort and limit them, choose and group its columns, and say what an empty table reads.
subjects: [widgets, app-builder]
---

## Choose what a widget shows

By the end you will have a Table on an app page that reads the Fernhill appointments, keeps only dogs, shows the newest 25, groups them by status and hides a column on phones.

## Before you start

- You are signed in to the console and the **Sandbox** workspace is open. The App Builder needs `resource:write` or `interface:write` in the workspace; without one it opens read only. In a production workspace it is always read only: you change an app in a dev workspace and it arrives by promotion. See the [permissions reference](../../../administer/reference/permissions).
- An app with a page. To make one, open **Build**, then **App Builder**, press **Make an app**, give it a name and an address, and press **Make the app**. It starts with one empty page.
- To read a table the widget's reader needs `data:read`; hiding a widget is not security (see [How widgets get their data](../../explanation/widgets/how-widgets-get-their-data)).

## Show rows in a Table

:::steps
1. Open the app in the App Builder and press **Add to page**. The window lists widgets under **Work with records**, **Understand data**, **Take action** and **Organize and explain**. Choose **Table**. It is put at the end of the page and chosen, and its settings open on the right with the tabs **Data**, **Display**, **Actions** and **Rules**.
2. The **Data** tab says "Needs fixing: Table needs a source to show." Under **Rows it uses**, press **Source**. The window **Where it reads from** has a box, **Find a table or query**. Type `appointments` and choose **Appointments**. The table fills with rows.
3. Keep only some rows. Under **Only include**, press **Condition**. The window **Only include rows where** has a column list, a test and the values. Choose **Species**, leave the test **is**, tick **Dog** and press **Add**. A chip, "Species is Dog", appears. Press the chip to change it, or its cross to remove it. A query holds up to 20 conditions, and they all must hold.
4. Sort. Press **Sorted by**. In the window, press **Then by**, choose **Starts at**, and choose **Newest** or **Oldest**. Add up to four sorts; press the cross beside one to take it away. Under **Show at most**, choose how many rows to read: **All rows**, 5, 10, 25, 50, 100, 500 or 1000. Press **Done**. The row now reads "Starts at, newest first · at most 25".
5. Open the **Display** tab. Under **Columns** are the columns the table draws. Drag a column by its handle to move it, press the eye to hide it, or press its name to open **Column** and rename it, change **Shown as** (**Text** or **Badge**, or a number's format), **Align**, **Width**, turn **Sort by clicking the heading** off, or turn **Hide on phones** on. Press **+ Column** to add one the table does not draw yet.
6. Group rows. Under **Look**, press **Group rows by** and choose a column, for example **Status**. Each value gets a heading with how many rows it has. A date column also asks whether each group is a **Day**, **Week** or **Month**. **First** says whether the groups run from the earliest or the latest. **Nothing: one list** puts the rows back in one list.
7. Under **Look** also set **Row height** (**Comfortable** or **Compact**), **Rows at a time** (5 to 200; the table shows that many and, when the source has more, says "Showing 25 of 3,708" and offers **Show 25 more**; **Show at most** on the **Data** tab stops it at its limit), **When empty** (the words shown when no rows are found) and **Stripe rows**.
8. Press **Publish**. The check lists what will change; press **Publish N changes**. Open the app from **Apps**.
:::

::screenshot{name=console/widgets-table-data alt="The App Builder with a Table of appointments selected: the Data tab shows Source Appointments, the condition Species is Dog and Sorted by Starts at, newest first, at most 25."}

## The result

The page shows the 25 newest appointments of dogs, under a heading for each status with its row count. A person who opens the published app sees the same rows, and on a phone the Table is a list without the column you hid. The heading carries a download button, **Download as CSV** or **Download as a spreadsheet**, that saves the rows the widget has read, up to 10,000.

## If it does not work

- **"Table needs a source to show."** The widget has no **Source**. A widget with no source says "Choose what it shows in Data." on the page.
- **A condition you added removes every row.** All conditions must hold. Remove one to see which one.
- **A column you chose in Data does not appear.** **Data** reads the columns; **Display** chooses which the table draws. Add it in **Display**, with **+ Column**.
- **The builder is read only.** You lack `resource:write` and `interface:write`, or the workspace is production.
- To show columns of another table, see [Show columns from another table](show-columns-from-another-table).
- To lay the page out for phones, see [Set the phone and tablet layout](../app-builder/set-the-phone-layout).
