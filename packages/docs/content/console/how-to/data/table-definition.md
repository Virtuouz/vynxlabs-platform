---
title: Change a table's columns
description: Add columns to a table made in the console, and set their rules, type, values, indexes and display column, and take a change back.
subjects: [tables, data]
---

## Change a table's columns

By the end you will have added a column to a table, told the table what that column must hold, and taken a change back.

## Before you start

- The table was made in the console. The list of tables says **Console** under **Managed in**. A table that a deploy defines says **Repository** and its **Definition** tab shows "This table is defined in the tenant's repository. To change it, change `defineTable` there and deploy." There is no way to change it in the console.
- You hold `resource:write` in the workspace. A person who does not sees a line on the tab saying so, and the buttons are not there. See the [permissions reference](../../../administer/reference/permissions). The `workspace_admin` role has it.
- The table is active. A retired table has no **Definition** tab: see [Retire a table or a column, and bring it back](retired-data).

Open **Data**, then **Tables**, the table's name, and the **Definition** tab.

## Add a column

:::steps
1. Press **Add column** above the **Columns** table.
2. Type the **Name**. It starts with a lowercase letter and holds lowercase letters, digits and underscores. `id`, `created_at` and `updated_at` belong to every table already and cannot be used.
3. Choose what **It holds** from the list: Text, Whole number, Number, Yes or no, Date and time, Date, JSON, ID, Row of another table, File, One of a list, Several of a list.
4. If it holds a list, type the **Values**, separated by commas, in the order they are offered. If it holds a **Row of another table**, choose **Which table**, and say what happens **When the row it points to is deleted**: **Refuse the deletion**, **Empty this column** or **Delete this row too**.
5. Choose **Must every row have one?** and, for a type that allows it, **Must every row's value be different?** and **Value when none is given**. On a table that already has rows, a required column needs a value to give them.
6. Press **Add column**. The console says "The column status was added." and the column is in the **Columns** table.
:::

## Set a column's rules

The **Rules** column of the table says "Required" and "No two rows alike" where they apply, and **When not given** shows the value a row gets when it gives none.

:::steps
1. Press **Rules** on the column's line. The dialog is titled "Rules for" and the column's name.
2. Choose **Must every row have one?**. If some rows have none now, they are given the value in **Value when none is given**.
3. Choose **Must every row's value be different?** (**Yes: no two rows alike**). A JSON column, a file column and a column of several values from a list cannot be unique.
4. Set **Value when none is given**. The control fits the type: a choice for a yes or no and for a list, a date field for a date and a date and time. A row of another table and a file have no such value, and a file column has no **Rules** button.
5. Press **Save**. All three are saved together.
:::

## Change what a column holds

:::steps
1. Press **Change type** on the column's line. The dialog is titled "What" and the column's name "holds".
2. Choose from **It holds**. Only changes that keep every value are offered: a whole number can become a number or text; a number, a yes or no, an ID, a date, a date and time and a one of a list can become text; text can become one of a list. Every other type offers nothing and says so.
3. If you chose one of a list from text, type the **Values**. It is allowed when every row already holds one of them.
4. Press **Save**.
:::

A column of a row of another table has **Change table** in place of **Change type**: choose **The table it points to** and press **Save**. For any change not offered, add a new column and copy the values across in a script, then retire the old one.

## Change the values of a list

:::steps
1. Press **Values** on the line of a column that holds a list. The dialog is "Values of" and the column's name.
2. For each value you can change the **Value**, **Shown as** (what people read), and **Color**: None, one of nine names, or **One of your own** as `#rrggbb`. Move a value with the arrows beside it, press **Remove** to take it off, and press **Add a value** for another.
3. When you rename a value the dialog says "Rows that hold" the old value "will hold" the new one. When you remove one it says the value "will no longer be offered. Rows that hold it keep it."
4. Press **Save**.
:::

A value that is no longer offered stays on the rows that hold it. The **Columns** table says "No longer offered, kept on the rows that hold them". A row that holds one keeps it when it is saved.

## Add an index

A read of a large table that filters or sorts by columns with no index can be stopped for taking too long. An index makes it faster and writes a little slower.

:::steps
1. In **Indexes** press **Add an index**.
2. Under **Columns** choose up to five, in the order the rows are filtered or sorted by, with the column filtered by first. `created_at`, `updated_at` and `id` are offered with the table's own columns.
3. Press **Add index**. It is in the list as "Columns, in order".
:::

Press **Remove** on a line of the list to take an index away. A table has at most 20 indexes. "There is already an index on these columns, in this order." is said when you choose a pair that is already there. With no indexes the section says "No indexes. Only the ID is indexed."

## Choose what stands for a row

When another table points to a row of this one, the row is named by the column you choose in **What stands for a row**: open **The column that stands for a row** and choose a column, or **None: the row's ID**. Columns of JSON, files and lists of values are not offered. Where none is chosen, the server uses a column called `name`, else `title`, else the first text column.

## Rename and describe

- **Describe** on a column's line sets what the column holds, in up to 500 characters; it shows on the column's heading in the rows. **Describe the table** does the same for the table, and the text shows under its name.
- **Rename** on a column's line asks for a **New name**. A name already used is refused on the field: "There is already a column called "pet". Choose another name, or change that one." An index, the display column or a rule that names the column follows the rename.
- **Rename table** asks for a **Path** and a **Title** and saves a draft. The table keeps its rows and what is bound to it, and the old path keeps answering for 90 days. Nothing changes until the draft is deployed from **Deploy**.
- **Retire** on a column's line hides the column and keeps what it held: see [Retire a table or a column, and bring it back](retired-data). The last column of a table cannot be retired. Retiring a column also takes it out of any index and clears the display column if it was that one. A column that a rule of **Who sees rows** names cannot be retired: the message says which rule, and you change the rule first.

## Take a change back

Every change on this tab, is saved as soon as you confirm it. Two things wait: renaming the table (a draft), and **Who sees rows**, which waits for **Save who sees rows**; once saved, that is one step of undo too. **Undo** takes the last one back and **Redo** makes it again; each button says which change, for example "Undo the change to what stands for a row". The keys are :kbd[⌘Z] or :kbd[Ctrl+Z] for undo and :kbd[⇧⌘Z] or :kbd[Ctrl+Y] for redo, when the cursor is not in a field. Undo saves the earlier definition again. It does not put back rows that were deleted or values that were changed. The list starts empty each time you open the page.

If someone else changed the table after you opened it, the page says "Someone else changed" the table "after you opened it. This page shows what is saved now, so undo and redo start again from there."

## The result

The column is in the **Columns** table, and in the grid on the **Rows** tab. The rules, indexes and display column are saved, and rows can use them at once. Only a rename of the table waits: it is a draft until it is deployed.

## If it does not work

- **"The table "…" cannot be changed: column "status" is required and the table already has rows. Give it a default, so existing rows have a value."** Fill in **Value when none is given** and save again.
- **"… column "species" is now unique, and some rows share a value: "dog" is in 5 rows …"** The message names up to three repeated values and how many rows hold each. Change those rows, then save again.
- **"… column "pet" cannot become an enum while rows hold other values: …"** A text column becomes one of a list only when every row holds one of the values. Add the values the message names, or change those rows.
- **"… is used by rule 1 of who sees rows. Change that rule, then retire the column."** The column is named by a row rule. Change the rule under **Who sees rows**, then retire the column.
- **A button is missing or grayed out.** You do not hold `resource:write`, or the table is the repository's, or it is retired.
- **The dialog says "A column of this kind cannot become another without risking what it holds."** The column's type has no change that keeps every value. Add a column of the type you want, copy the values across in a script, then retire the old one.
- The console has no computed columns, no rules that check a row before it is saved, and no history of a row. A table cannot be made from a CSV.

See [Work with a table's rows](table-rows) for the rows themselves, and [Who sees which rows](row-rules) for **Who sees rows**.
