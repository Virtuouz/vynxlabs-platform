---
title: Your first table
description: Make a table of visit notes in Fernhill's Sandbox, add columns with a rule, add rows, filter and sort them, and save the view.
subjects: [tables]
---

You will have a table of visit notes in Fernhill's Sandbox workspace, with five rows in it, and a saved view that shows only the long visits, longest first. It takes about 15 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, the tenant admin of Fernhill. The password on the seeded example is `fernhill-demo-2026`. Making and changing a table needs `resource:write`, which a tenant admin has. See [how tables work](../../console/explanation/how-tables-work) for the rest.
- Fernhill is set up, with its Sandbox :term[workspace]{id=workspace}. The Sandbox is a :term[dev workspace]{id=dev-workspace}, so you can change it freely.
- A browser at least as wide as a laptop screen. The steps name the controls as they are on a wide screen.

:::steps
1. **Open the Tables screen.** Sign in as Maya. The console opens where she was last. Check that the bar at the top shows the **Sandbox** workspace. In the narrow bar on the left, press **Data**, then choose **Tables** in the menu beside it. The list shows Fernhill's tables, and the column **Managed in** says **Repository** or **Console** for each.

2. **Start a table.** Press **Create table**. In the panel that opens, fill in:
   - **Name**: `visit-notes`. It takes lowercase letters, digits and dashes.
   - **What it holds**: `What the vet wrote down after a visit.`
   - **First column**: `summary`. Leave **It holds** at **Text**.

3. **Add a second column.** Press **Add another column**. Name it `minutes`, and set **Column 2 holds** to **Whole number**. Leave **Who sees rows** as **Everyone who may use the table sees every row**.

4. **Create it.** Press **Create table**. The table opens on **Rows** and the grid says "This table has no rows yet." Press the information button beside the table's name, named **About visit-notes**. It reads "What the vet wrote down after a visit. 0 rows. Everyone with access. Managed in the console." The table is in use at once. You do not deploy it.

5. **Add a column with a rule.** Choose **Definition**. Under **Columns**, press **Add column**. Fill in:
   - **Name**: `clinic`
   - **It holds**: **One of a list**
   - **Values**: `Northside, Riverside, Hilltop`
   - **Must every row have one?**: **Yes**
   - **Value when none is given**: **Northside**

   Press **Add column**. The message "The column clinic was added." appears. In the **Columns** table the row for `clinic` shows **Required** under **Rules** and **Northside** under **When not given**.

6. **Add a rule to an existing column.** On the `summary` row press **Rules**. Set **Must every row have one?** to **Yes**. Press **Save**. The row now shows **Required**.

   ::screenshot{name=start/visit-notes-definition alt="The Definition tab of visit-notes: the columns summary, minutes and clinic, with summary and clinic marked Required and clinic defaulting to Northside"}

7. **Add five rows.** Choose **Rows**. Press **Add row**. The panel lists **summary** under **Required**, and **minutes** and **clinic** under **Optional**. Fill in the first row from the table below and press **Add row**. The message "Row added." appears. Repeat for each row.

   | summary | minutes | clinic |
   | --- | --- | --- |
   | Biscuit: ear check, drops sent home | 15 | Northside |
   | Juniper: booster shot | 10 | Riverside |
   | Pepper: limping on the left hind leg | 40 | Hilltop |
   | Moss: dental clean | 55 | Riverside |
   | Olive: annual check | 25 | Northside |

   The footer reads "5 rows on this page, of 5".

8. **Filter.** Under the **minutes** heading, in the box that says **Filter**, type `>=20`. After a moment the footer reads "3 rows on this page, of 3 that match": Pepper, Moss and Olive.

9. **Sort.** Press the **minutes** heading. The rows go from the smallest minutes up. Press it again. They go from the largest down: Moss (55), Pepper (40), Olive (25). An arrow beside the heading shows the direction.

   ::screenshot{name=start/visit-notes-filtered alt="The visit-notes rows filtered to minutes of 20 or more and sorted from the largest down, showing three rows"}

10. **Save the view.** Press the bookmark button at the right of the toolbar, which is named **Saved views**. Choose **Save this view…**. In **Name** type `Long visits` and press **Save**. The message "Saved as “Long visits”. Only you see it in this menu; its link opens it for anyone." appears.

11. **Come back to it.** Reload the page without the filter: choose **Tables** and then `visit-notes` again. All five rows show. Open **Saved views** and choose **Long visits**. The filter and the order come back, and the footer reads "3 rows on this page, of 3 that match".
:::

## What you built

- A table, `visit-notes`, managed in the console, with the columns `summary`, `minutes` and `clinic`, and the three columns every table has: `id`, `created_at` and `updated_at`. You find it under **Data**, **Tables**.
- Two column rules: `summary` and `clinic` must have a value, and `clinic` is `Northside` when none is given.
- Five rows.
- A view named **Long visits**, which only you see in the **Saved views** menu. The view is the filter and the sort kept under a name.

Next, read [how tables work](../../console/explanation/how-tables-work) for what a table is and what happens to its data when you retire it.
