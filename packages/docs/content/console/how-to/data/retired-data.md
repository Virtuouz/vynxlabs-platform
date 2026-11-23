---
title: Retire a table or a column, and bring it back
description: Take a table or a column out of use without losing what it holds, bring it back with its rows, or delete it for good.
subjects: [tables, data]
---

## Retire a table or a column, and bring it back

By the end you will have retired a table and a column, brought each back with its data, and deleted one for good.

Nothing a definition stops listing is dropped. A table or a column that leaves is **retired**: it is hidden, nothing can read or write it, and what it held is kept. **Delete for good** is the one step that destroys the data.

## Before you start

- The table was made in the console, and you hold `resource:write` to retire and bring back. A table defined in the repository is retired when a deploy no longer lists it, and brought back by deploying a definition with the same name. See the [permissions reference](../../../administer/reference/permissions).
- **Delete for good** needs `table:write`. The `workspace_admin` role has both. A person without `table:write` sees the button grayed out, with the reason.
- Open **Data**, then **Tables**.

## Retire a table

:::steps
1. Open the table and its **Definition** tab. Go to **Retire this table** and press **Retire table**.
2. Read "Retire "thow-old"? Its rows are kept, and nothing can read or write them until it is brought back." and press **Retire table**.
3. The console goes to the list of tables. The table is still there, with a **Retired** pill by its name.
:::

A table that another table points to cannot be retired. The console says which: "The table "thow-scratch" cannot be deleted: "thow-visits" (column "note_ref") refers to it. Delete or change those references first." Change or retire that column first.

## Bring a table back

:::steps
1. In the list of tables, open the retired table. Its page says "This table is retired. It left its definition, so nothing can read or write it, and its 3 rows are kept."
2. Press **Bring back**. The console says "The table thow-old is back, with its rows." and the table opens on its rows.
:::

**Bring back** is there only for a table that was made in the console. A table of the repository says "Deploying a definition with this name brings it back."

Bring back saves the definition the table had: its columns, rules, defaults, references, values, who sees rows, what stands for a row and its indexes. Its description does not come back, and nor do columns that were retired before. A row that points to a row that is gone is left as it is. Every row written from then on is held to the reference.

## Retire a column

:::steps
1. Open the table's **Definition** tab. On the column's line press **Retire**.
2. Read "It is hidden and its data kept. You can bring it back." and press **Retire**.
3. The column leaves the **Columns** table and appears in **Retired columns** with its type under **Held** and how many values it **Still holds**, for example "1 value".
:::

The last column of a table cannot be retired, and a column that a rule of **Who sees rows** names cannot either. Retiring a column takes it out of any index and out of the display column, and drops its **Required**, **No two rows alike**, default and reference rules from the database.

## Bring a column back

:::steps
1. In **Retired columns** press **Bring back** on the column's line.
2. The column is in the **Columns** table again, and the rows show what it held.
:::

Bring back writes the column with its type, the table it points to, and every value its rows may hold. Its **Required**, **No two rows alike** and **When not given** settings and its rule for a delete are not restored: set them again with **Rules** and **On delete**. See [Change a table's columns](table-definition).

## Delete for good

:::alert[This cannot be undone]{type=danger}
**Delete for good** removes the retired table or column and every row it held. It is the one action in the tables that destroys data. The audit log records it as `table.purged`.
:::

:::steps
1. Open the retired table, or find the column in **Retired columns**, and press **Delete for good**.
2. Read "Delete the retired table "thow-old" and everything in it? This is the one action that destroys data, and it cannot be undone." for a table, or the same words for "the retired column "coat"".
3. Under "Type … to confirm" type the table's name or the column's name. The **Delete for good** button is off until it matches.
4. Press **Delete for good**. After a table, the console goes to the list of tables, and it is not there.
:::

A table that another table still points to is refused with "Another table still refers to" and its name, then "Remove that reference column first." A file that a deleted row named is not deleted at once: see [Files](files).

## The result

A retired table or column is out of use and still holds its data. A table or column that you brought back is as it was, with its rows. One you deleted for good is gone, and so are its rows.

## If it does not work

- **The **Bring back** button is missing on a retired table.** The table was defined in the repository. Deploy a definition with its name instead.
- **The **Bring back** button is grayed out.** You do not hold `resource:write`.
- **The **Delete for good** button is grayed out.** You do not hold `table:write`.
- **Two retired tables, or two retired columns, have one name.** They were retired at different times. The list opens the one it shows by its ID, in the address (`?id=`), and a column in **Retired columns** is deleted from its own line.
- The console has no screen that lists a table's deleted rows, and none that puts a deleted row back.
