---
title: Tables
topic: data-tables
description: "Every control, state and permission of the Tables screen and of a table's page: its rows, its definition, who sees rows, and what a retired table offers."
moved_from:
  - data/tables
---

The **Tables** screen lists the tables of one workspace. A table holds rows the workspace owns. Its columns have [types](../../column-types), and who may read or write its rows is decided by roles and by the table's rules for who sees rows. Opening a table shows its page, with two views, **Rows** and **Definition**.

A table is managed as **Files** or as **Code**. A table made on this screen, or written as a `<path>.table.yaml` file in the tenant's repository, is **Files**: the console and the repository both edit it. A table written with `defineTable` in the repository is **Code**: it changes when a version is deployed, and the console does not change its columns. In a dev workspace the console can take a table of Code over, from its **Definition** view, and then it is Files. Rows of either kind are edited here. See [Definitions in code](../../../../develop/explanation/cli/definitions-in-code).

Nothing is dropped by a deploy. What leaves a definition is retired and its data is kept.

The screen is reached from **Data**, then **Tables**. F1 (**Help for this page**) opens the help topic `data-tables`, also from a table's page and from the **Files** screen.

::screenshot{name=console/tables-list alt="The Tables screen: a list of tables with what each holds, where it is managed, who sees its rows, and its column and row counts."}

## The Tables list

The list has a description line, a **Create table** button and a table with these columns. A column that does not fit on a narrow window gives way; **Table** and **Rows** stay.

| Column | What it shows |
| --- | --- |
| **Table** | The table's name, as a link to its page. A retired table has a **retired** pill after the name. |
| **What it holds** | The table's description. |
| **Managed in** | **Files** or **Code**. A retired table says how it was managed. |
| **Who sees rows** | **Everyone with access**, **Each person sees their own rows (column)**, or **By N rules**. |
| **Columns** | How many columns the table has, not counting `id`, `created_at` and `updated_at`. |
| **Rows** | How many rows it holds. |

Two retired tables can have had one name. The list opens the one you chose by its ID.

### Create table

**Create table** opens a dialog. A table made here is managed as files, which the console and the repository both edit. It needs `resource:write`; without it the button is disabled and its tooltip says what is needed.

| Field | What it takes |
| --- | --- |
| **Name** | Lowercase letters, digits and dashes. It is the table's address. |
| **What it holds** | Optional. Plain words shown under the name. Only the first 500 characters are kept. |
| **First column** | The name of the first column. A table needs at least one. |
| **It holds** | The first column's type, one of the twelve in [Column types](../../column-types). |
| **Which table** | For **Row of another table**: the table it points to. A retired table is not offered. |
| **Values** | For **One of a list** and **Several of a list**: the values, separated by commas. |
| **More columns** | **Add another column** adds a column with its own name, type, values or table, and **Remove**. |
| **Who sees rows** | **Everyone who may use the table sees every row**, or **Each person sees only the rows they added**. The second adds a column `owner_id` of type ID and an owner rule. Rules are changed later, under **Definition**. |

The dialog refuses, and sends nothing, for an empty column name ("Name every column, or remove the empty one."), a column name used twice or one of `id`, `created_at` and `updated_at` ("There is already a column called "…". Choose another name."), and a reference with no table ("Choose the table that "…" points to."). A table name already in use is refused with 'Something is already at "…". Choose another name, or change what is there.' When it works, the table's page opens.

### States of the list

| State | What you see |
| --- | --- |
| Empty | "No tables yet", with the text "Define a table in the tenant's repository with defineTable and deploy it, or create one here to try things out." |
| Read only | A line says you can see the workspace's tables, not change them, and what is needed (`resource:write`). **Create table** is disabled. |
| Not loaded | The list's error state, with a retry. |

## A table's page

The page's title is the table's name. Under it: its description, how many rows it holds, the sentence for who sees rows, and how it is managed ("Managed as files." or "Managed as code."). A retired table says "Was managed as files." or "Was managed as code.". Documentation pages that are about the table are shown under the title.

The page fills the window. The rows are the one thing that scrolls, with the column headings pinned above them, and the page around them stays still. The **Rows** and **Definition** views both work this way, on a phone as on a desktop. The view is in the address (`?view=definition`).

A retired table has no tabs. It shows a notice, "This table is retired. It left its definition, so nothing can read or write it, and its N rows are kept." (it goes on to say how the table comes back), with **Bring back** (only for a table managed as files) and **Delete for good**, and its definition below, read only. See Retired tables below.

## Rows

::screenshot{name=console/table-rows alt="A table's Rows view: filter boxes under the column headings, the rows, and the toolbar with Keys, Columns, Compact rows, CSV and Add row."}

### Controls in the toolbar

From left to right:

| Control | What it does |
| --- | --- |
| **Rows**, **Definition** | The two views of the table. |
| **Keys** | A popover with the keys of the grid and the filter forms. See [Filter syntax](../../filter-syntax). |
| **Columns** | A dialog to show or hide a column with its checkbox, put columns in order (drag the handle, or press the up and down arrows: **Move X up**, **Move X down**), **Lock the first column**, **Show every column** and **Done**. |
| **Compact rows** / **Standard rows** | Switches the row height. |
| **Rows must match** | **every filter** or **any filter**. It appears when two or more filter boxes are in use. |
| **Saved views** | **Save this view…**, **Save over “X”**, **Rename “X”…**, **Delete “X”** and **Copy a link to this view**. A view keeps the filters, sort, columns and density. It is private to the member who saved it; its link works for anyone who may open the table. A view belongs to the table's ID, so renaming the table keeps its views. |
| **CSV** | Downloads the rows that match the filters, in the sort shown, as a file. It is disabled while a filter box cannot be read. |
| **Add row** | Opens the **Add row** sheet. |

**Lock the first column** keeps the first column in view when the grid is scrolled sideways. It is on until you turn it off.

Everything that shapes the view is in the address: `sort`, `filter`, `page`, `back` (the pages before this one, for **Previous**), `cols`, `match`, `unlock`, `density` and `row`. A link opens the same view. A link to a row opens the row only if it is on the page shown or can be read by its ID.

### The grid

- **Sorting.** Press a heading to sort up, then down, then not at all. Shift with a press, or Shift with Enter, adds the column to the sort; a number beside each arrow shows the order. A **One of a list** column sorts by the spelling of its values, not by the order they are offered in. [Column types](../../column-types) says which types sort.
- **Filtering.** Each column except **JSON** has a box under its heading. The forms are in [Filter syntax](../../filter-syntax).
- **Checking rows.** Each row has a checkbox, and the heading's box checks every row shown. A checked row belongs to the page, sort and filter it was checked on, so a delete cannot take rows that are not shown.
- **Editing in place.** Double-click a cell, or press Enter or F2 on it. A choice cell is a select. A list, a row of another table, a date and a date and time open a small dialog with the same field the inspector has. A **Yes or no** cell toggles with Enter, F2 or a double-click; where it may be empty it goes yes, no, empty. Escape puts the cell back. `id`, `created_at`, `updated_at` and a **File** column are not edited in the grid.
- **References.** A reference cell shows the row it points to by name, not by ID. The name is the column the table chooses under **What stands for a row**, or else a column called `name`, or `title`, or the first text column. Exports and the rows API's `expanded` use the same rule.
- **Files.** A **File** cell shows a **Download** link.
- **Times.** A **Date and time** value is shown, and read when typed, in your own clock. Hovering it gives the UTC moment. A **Date** has no time and is shown as it is stored.
- **Column descriptions.** A column with a description shows it from an information control on its heading.

The **Keys** popover lists the main keys. Beyond them: Home and End go to the first and last cell of the row (with Ctrl, of the grid), PageUp and PageDown move ten rows, Space checks the row, and Enter on a cell that cannot be edited opens the row.

### Footer

"N rows on this page, of N that match" (or "of N" with no filter), then **Previous** and **Next**. A page holds 50 rows.

### The checked rows bar

When rows are checked, a bar says "N rows checked" and offers **Delete** and **Uncheck all**. **Delete** asks "Delete these N rows?" and says "They are removed for everyone. This cannot be undone." Then it says "N rows deleted." and, if some were not deleted, "N were gone already, or were not yours to delete." One delete takes at most 1,000 rows.

### The Row inspector

Choosing a row opens the **Row** inspector beside the grid, with the row's ID above its title. It has a field for each column as its type has it, then the three columns the table fills in. Its buttons are **Save row**, **Discard** and **Delete row**. **Delete row** asks "Delete this row? It is removed for everyone. This cannot be undone." Closing the inspector or choosing another row with unsaved changes asks "Leave without saving?" with **Leave** and **Stay**.

Two fields have more to them:

- **A row of another table** is filled by typing. The picker asks the server for rows whose name contains what you typed, so it finds a row however far down the table it is. It offers the first 50. When the table has more, the field's hint reads "A row of X. Type to find more." The picker waits 250 ms after you stop typing.
- **A file** shows a **Download** link, or a dash when there is none, with **Replace** and, when there is a file, **Remove**. **Replace** is shown when the row has no file too, and then it adds one; the **Add row** sheet words the same button **Choose a file**. Each asks first. A replaced or removed file is not deleted at once: it stays in the row's history for as long as the audit log is kept, 400 days unless [retention](../../../../administer/reference/screens/retention) says otherwise, and is then removed. A file a worker script replaces is kept the same way. The console has no screen that shows a row's history or puts a file back.

### The Add row sheet

**Add row** opens a sheet that says "Required values first. A value left empty is stored as none, or the column's default." Its fields are in two groups, **Required** and **Optional**. A file is uploaded when the row is saved. The sheet's own **Add row** button saves it. A **File** field there has **Choose a file**, then **Replace** and **Remove** for the file chosen.

### States of Rows

| State | What you see |
| --- | --- |
| Empty | "This table has no rows yet." |
| No match | "No rows match the filters." |
| A filter box cannot be read | A red notice names the column and the reason, for example "size: Enter a number.". The box is marked invalid, nothing is asked of the server, no rows are shown and **CSV** is disabled. |
| A reference filter that is not an ID | "A reference is found by its row's ID, or by empty. Open the row to copy its ID." |
| A read took too long | The error state, and for a table managed in the console the line "An index on the columns you filter and sort by makes this faster." with the link **Add an index**, which opens the Indexes section of **Definition**. |
| A linked row is gone | "That row is gone: it was deleted, or its ID is not one of this table's." with **Close**. |
| Read only | A line says you can see the rows of the table, not change them, and that it needs `data:write`. **Add row** is disabled, and cells, checkboxes and **Delete row** are not offered. |

## Definition

The **Definition** view is where a table managed as files is changed. A table of Code shows the notice below instead, and a person without `resource:write` sees a line that says what is needed. Everything else on the view is shown, read only.

### Take over a table of Code

A table that a deploy defines with `defineTable` shows this notice on its **Definition** view: "This table is defined in code, in the tenant's repository. To change it, change `defineTable` there and deploy, or take it over here: it is then managed as files, and a deploy that still defines it takes it back."

| Where | What you see |
| --- | --- |
| A dev workspace, with `resource:write` | The button **Take over in the console**. It asks "Take over *table* in the console?" The text says from then on the console manages the table as files and you can change it there, that a deploy of the repository that still defines it takes it back, and is refused first if you changed it there since, until you run `volvel pull`, or deploy with `--force`; to keep it, remove its definition from the code. It adds that scripts typed against the table's `defineTable` export should use `ctx.table("<name>")`, which is typed from the generated types. (The dialog's mention of `volvel pull` does not hold for a table: the pull writes no file for it. See [Definitions in code](../../../../develop/explanation/cli/definitions-in-code).) The buttons are **Take over** and cancel. Done, the console says "*table* is managed in the console now." and the view is editable. |
| A production workspace | The notice ends ". A production workspace changes by a deploy only." and there is no button. |
| Without `resource:write` | The notice and the line that says what is needed, and no button. |

The take-over saves at once: a table has no draft, so there is nothing to deploy. Its rows are not touched. **Retire table** is not offered for a table of Code: take it over first. See [Keep the console and the repository in step](../../../../develop/how-to/cli/keep-in-step) for what a later deploy does.

Every change saves as you make it, and takes effect at once, except **Rename table**, which is a draft. It is a change to the table's definition, so what a change would lose is refused, with the reason on the dialog.

At the top of an editable definition:

| Control | What it does |
| --- | --- |
| **Rename table** | Opens "Name and path of X" with the **Path** and **Title**. The table keeps its history, data and what is bound to it, and the old path keeps answering for 90 days. Its button is **Save as a draft**: nothing changes until the draft is deployed. |
| **Describe the table** (**Describe the table again** when it has a description) | Sets the description, 500 characters at most. Empty clears it. |
| Undo, Redo | Take back or redo a change one at a time. Keys: Mod+Z, and Shift+Mod+Z or Ctrl+Y, outside a text field. They take back every change made since the page was opened, including a saved change to who sees rows. If someone else changed the table after you opened it, the page says so and undo starts again from what is saved. |

::screenshot{name=console/table-definition alt="A table's Definition view: the Columns table with its Holds, Rules and When not given columns, then What stands for a row, Indexes and Who sees rows."}

### Columns

The **Columns** table lists the table's columns: **Column** (with its description), **Holds**, **Rules** (**Required**, **No two rows alike**) and **When not given**. **Add column** is above it. A column of a list type shows its values as colored chips and, under them, "No longer offered, kept on the rows that hold them" for values it has retired. A reference shows "A row of X" and what happens when that row is deleted.

Each column has these actions, as buttons, or in one menu (**Actions for X**) on a phone:

| Action | What it opens |
| --- | --- |
| **Values** | For a list type. "Values of X": for each value its **Value**, **Shown as**, **Color** (**None**, one of nine names, or **One of your own** as `#rrggbb`), move and **Remove**; **Add a value**, **Cancel**, **Save**. A renamed value says "Rows that hold X will hold Y." A value taken away says it "will no longer be offered", and the rows that hold it keep it. |
| **On delete** | For a reference. **Refuse the deletion**, **Empty this column** or **Delete this row too**. The last asks for care: "Deleting a row of X will delete every row here that points to it." |
| **Rules** | "Rules for X": **Must every row have one?**, **Must every row's value be different?** (**Yes: no two rows alike**) and **Value when none is given**. They save together. Making a column required gives the rows that have none the value; without one the change is refused. Making it unique is refused, with up to three repeated values named, if rows already share one. A **File** column has no **Rules** action. A **JSON** or **Several of a list** column is not asked whether its values must differ. A reference has no value to give for rows that have none. |
| **Change type** | "What X holds" with **It holds**. Only changes that keep every value are offered; see [Column types](../../column-types). For a reference it is **Change table**, "Which table X points to". |
| **Describe** | "What X holds": a description of 500 characters at most, shown on the column's heading. |
| **Rename** | "Rename X". Names an index, the display column or a rule uses are carried along. A name already taken is refused on the field. |
| **Retire** | "Retire X?" "It is hidden and its data kept. You can bring it back." Disabled on the last column. A column that a rule for who sees rows needs is refused, naming the rule. |

**Add column** asks for **Name**, **It holds**, **Which table** and **When the row it points to is deleted** (for a reference), **Values** (for a list type), **Must every row have one?**, **Must every row's value be different?** and **Value when none is given**. It says "A required column on a table that already has rows needs a value to give those rows." Done, it says "The column X was added." A name already used is refused on the field.

### Retired columns

A table with retired columns shows **Retired columns** with **Column**, **Held**, **Still holds** ("N values"), **Bring back** and **Delete for good**. **Bring back** writes the column again with its type, its table and every value its rows may hold; its required, unique and default rules, and its on-delete rule, are not restored. **Delete for good** needs `table:write` and deletes what the column held.

### What stands for a row

A select, **The column that stands for a row**, with **None: the row's ID** or any column except a **JSON**, **File** or **Several of a list** one. Where another table points to a row of this one, this column is shown in place of its ID. Without `resource:write` the view names the column, or says the row's ID.

### Indexes

An index on the columns rows are filtered or sorted by keeps a read of a large table from being stopped for taking too long. It makes writes a little slower. The section lists each index under **Columns, in order**, with **Remove**, or says "No indexes. Only the ID is indexed."

**Add an index** opens "Add an index" with **Columns**: up to 5, in the order they are filtered or sorted by, with the column rows are filtered by first. `created_at`, `updated_at` and `id` can be named. An index on the same columns in the same order is refused. A table has at most 20 indexes; at 20, **Add an index** is disabled and the section says "A table has at most 20 indexes. Remove one to add another." The address `?view=definition&at=indexes` scrolls to this section.

### Who sees rows

A select, **Who sees rows**, with three modes, and **Save who sees rows**. This section is saved by its button, not as you work. A saved change says "Saved. It applies from the next request."

| Mode | What it needs |
| --- | --- |
| **Everyone with access sees every row** | Nothing more. Roles still decide who may use the table. |
| **Each person sees their own rows** | **The column that holds each row's owner**, of type ID or Text. A row added with no owner is given to whoever added it. |
| **Rules decide** | One to 20 rules. Each has **Who**, **Column**, **Attribute** (for attributes) and **May**. **Add a rule** adds one; **Remove** takes one off, and the last cannot be removed. |

**Who** is one of **Everyone with access**, **The person named in a column**, **A group named in a column**, and **People with a matching attribute** (a column equals an attribute of the person, named in lower case, such as `customer_id`). **May** is **Read** or **Read and change**.

A person sees a row when any rule lets them, and changes it when a rule that says **Read and change** does. People who hold `data_all:read` and `data_all:write` see and change every row. A row added with no owner is given to whoever adds it: the owner column, or the first "person named in a column" rule that allows changes. A visitor who is nobody sees no row whose owner is empty. Rules are enforced in the database. Groups and attributes are read on every request.

When the mode is not the first, **See it as** and **See it as a group** let you check a rule before trusting it. **See it as** takes an end user, found by email; its hint lists their groups. **See it as a group** takes a group of end users or of members, and shows the rows of someone in the group who owns none. Choosing one lets go of the other. The list shows the first 20 rows, and for a group "Someone in this group would see N rows in all." Without access to end users or groups the console says what is needed, for example "The groups could not be read. Asking for access to read groups lets you check one here."

### Where it is stored, and Retire this table

**Where it is stored** gives the table's name in Postgres as `schema.table`. It is your data: you can read it there directly.

**Retire this table** (editable tables only) hides the table and keeps its rows. **Retire table** asks first. A table another table points to cannot be retired, and the refusal names each table and column.

## Retired tables

A table or column that leaves its definition is retired, by **Retire**, or by a deploy that no longer lists it. A retired table keeps its rows. Nothing can read or write them until the table is brought back. Retention does not remove retired data.

| Action | What it does | Needs |
| --- | --- | --- |
| **Bring back** | Saves the table's definition again from what the catalog holds: columns, rules, defaults, references, values, who sees rows, what stands for a row and indexes. The descriptions of the table and of its columns are not held and come back empty; retired columns stay retired. A reference whose rows hold IDs no longer in the table is refused, with the column, the table and the number of rows. Only a table managed in the console; a repository table says "Deploying a definition with this name brings it back." | `resource:write` |
| **Delete for good** | Asks you to type the table's name. It deletes the table and all its rows, and is audited as `table.purged`. It is refused while another table points to it. | `table:write` |

A retired enum value stays on the rows that hold it, can still be filtered for, and is not offered.

## What is not here

The screen has no column masks, no computed columns, no validation rules for a row, no screen of a row's history, and no CSV import. **CSV** only exports; the rows API takes up to 1,000 rows in a request.

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a table's definition | `table:read` |
| See rows, export **CSV**, and use **See it as** | `data:read` (on the workspace or on the table), held to the table's rules for who sees rows; **See it as** also needs `data_all:read` |
| **Add row**, edit a cell, **Save row**, **Delete row**, delete checked rows | `data:write` (on the workspace or on the table), held to the rules |
| See or change every row, past the rules | `data_all:read`, `data_all:write` |
| **Create table**, change a definition, **Rename table**, **Retire table**, **Bring back** | `resource:write` |
| **Delete for good** (a table or a column) | `table:write` |
| Upload a file, delete a file | `file:write` (and `data_all:write` to delete) |

See the [permissions reference](../../../../administer/reference/permissions) for what each permission is. A button a person may not use is disabled with the reason as its tooltip, and the view says so in a line.

## Related

- [Column types](../../column-types): what each type stores, how it is filtered and edited, and its limits.
- [Filter syntax](../../filter-syntax): what a filter box takes.
- [Queries](queries): a saved question over tables.
- [Data sources](data-sources): databases outside the product.
