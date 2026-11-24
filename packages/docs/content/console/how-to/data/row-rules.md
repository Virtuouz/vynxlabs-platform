---
title: Decide who sees which rows
description: Set who sees the rows of a table made in the console, with rules on its columns, and check the result as a person or a group before you trust it.
subjects: [tables, data]
---

## Decide who sees which rows

By the end you will have given each clinic's group the rows of its own clinic, let each client read the rows about them, and checked both by looking at the table as a person and as a group.

## Before you start

- The table was made in the console and you hold `resource:write`, as in [Change a table's columns](table-definition). The **Who sees rows** section is on the table's **Definition** tab.
- The rows say whose they are in a column. Here, a text column `clinic` holds the key of a clinic's end-user group (`northside`, `riverside`, `hilltop`) and a text column `client_code` holds a client's code. A group is named in a uuid column by its ID, or in a text column by its key.
- To check the result you need `data_all:read` on the table, `end_user:read` to pick an end user, `end_user_group:read` to list groups of end users and `group:read` to list groups of members. A tenant admin has them. See the [permissions reference](../../../administer/reference/permissions).
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

The people in the example are Fernhill's: Jess Morgan is in the group `northside`, and George Lewis is a client whose attribute `client_id` is `C-1001`. A table of notes with `clinic` and `client_code` columns, as in this page, is made by the steps in [Change a table's columns](table-definition) and [Work with a table's rows](table-rows).

## Give a group its rows and a client theirs

:::steps
1. Open **Data**, **Tables**, the table, then the **Definition** tab, and go to **Who sees rows**.
2. Under **Who sees rows** choose **Rules decide**. One rule is there already: "Everyone with access may read the row."
3. Set its **Who** to **A group named in a column**, its **Column** to `clinic` and **May** to **Read and change**. The rule's heading becomes "People in the group named in clinic may read and change the row."
4. Press **Add a rule**. Set **Who** to **People with a matching attribute**, **Column** to `client_code`, **Attribute** to `client_id` and **May** to **Read**. The heading says "People whose client_id is in client_code may read the row."
5. Press **Save who sees rows**. The rules apply from the next request. The table's list now says "By 2 rules".
:::

The rules are saved when you press **Save who sees rows**, and not as you set them. What you have set but not saved is not applied, and **Undo** does not take it back. Once saved, the change is one step of undo.

## Check it as a person or a group

**See it as** and **See it as a group** are under **Save who sees rows**. They appear whenever the table is not open to everyone.

:::steps
1. Click **See it as** and type part of an email. The console asks the instance, so an end user past the first page is found. Choose one: the hint under a name lists the groups they are in. Choosing Jess Morgan lists the rows with `northside`, the first 20 at most.
2. Search for George Lewis and choose him. The list changes to the one row whose `client_code` is `C-1001`.
3. Click **See it as a group** and choose a group. Groups of end users and groups of members are in the same list and each says which. Choosing `riverside` says "Someone in this group would see 2 rows in all." and lists them.
:::

Choosing a person lets go of the group, and the other way round. The rows are what is saved now: change a rule, save it, and look again. Someone in a group is judged as a person who is in it and owns no row, so a rule that names a column of owners ("The person named in a column") gives them nothing.

## The result

The list of tables says "By 2 rules" for the table. Someone in `northside` sees and changes the rows of Northside and no others, and a client reads only the rows that carry their code. A person with `data_all:read` still sees every row, as you do on the **Rows** tab.

## The rules, one by one

| **Who** | The row is for | Column types |
| --- | --- | --- |
| **Everyone with access** | Everyone who may use the table at all. | None. |
| **The person named in a column** | The person whose ID the column holds. | ID or text. |
| **A group named in a column** | Everyone in the group the column names. | ID or text. |
| **People with a matching attribute** | Anyone whose attribute (the **Attribute**) equals the column's value. | ID, text or whole number. |

- An attribute's name starts with a lowercase letter and holds lowercase letters, digits and underscores, up to 63 characters.
- **May** is **Read** or **Read and change**. A person sees a row when any rule lets them. A person adds, changes or deletes a row only when a rule that says **Read and change** lets them.
- A table has at most 20 rules.
- The other two choices under **Who sees rows** are **Everyone with access sees every row**, and **Each person sees their own rows** with **The column that holds each row's owner** (ID or text). A row added with no owner is given to the person who added it. With rules, it is the column of the first rule that says "The person named in a column" and **Read and change**.
- A request that comes from nobody, such as a visitor of an app, owns no row and matches no rule about a person.
- The rules are enforced by the database for every read and change, from the person's own claim. Groups and attributes are read at each request.
- A person who holds `data_all:read` sees every row and one who holds `data_all:write` changes every row, past the rules. A built-in role that holds `*:read`, such as `viewer`, holds `data_all:read` too. The rules are not a way to hide rows from it.

## If it does not work

- **The **See it as** list is empty, or it says "This tenant has no end users yet."** A table open to everyone has no **See it as**. A tenant without end users has none to pick: see the end users in the tenant's screens.
- **"The groups could not be read. Asking for access to read groups lets you check one here."** You hold neither `end_user_group:read` nor `group:read`. Ask for one of them, or check as a person.
- **"This person would see no rows." / "Someone in this group would see no rows."** No rule gives them a row. Check the column holds the group's key or the attribute's value exactly as it is written.
- **A rule names a column that is not in the list.** Only ID and text columns are offered for a person or a group, and also whole-number columns for an attribute.
- **The rows still show to someone who should not see them.** They hold `data_all:read`, or a rule that says "Everyone with access may read the row." is still there.
- The console has no column masks and no way to hide one column of a row.
