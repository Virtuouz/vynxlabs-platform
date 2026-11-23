---
title: Rule rows by group or attribute
description: "Show each customer only their rows, or a clinic's staff only that clinic's rows, with a table's rules for who sees rows."
subjects: [access]
---

## Rule rows by group or attribute

You decide who sees which rows of a table from the groups people are in, or from a fact about them such as the customer they belong to.

### Before you start

- You need `resource:write` to change a table's rules, and `end_user:write` or `group:write` for the people.
- The table has a column to match: for a group, a text column that holds the group's key; for an attribute, a column that holds the same value as the person's attribute.
- Groups are read on every request, so putting someone in a group or taking them out takes effect at once.

:::steps
1. Make the people: a group (see [Manage groups](manage-groups) or the **Groups** tab of **End users**), and for an attribute, give each end user the attribute (see [Invite end users](invite-end-users)), for example `client_id` with their code.
2. Open the table, then **Definition**, **Who sees rows**, and choose **Rules decide**.
3. Add a rule. **Who** is **A group named in a column** (a row whose column holds the group's key is seen by people in the group) or **People with a matching attribute** (a row whose column equals the person's attribute).
4. Choose **May**: **Read**, or **Read and change**. Press **Save who sees rows**.
5. Use **See it as** and choose an end user to check what they see before you rely on it.
:::

### Fernhill's rules

In Fernhill, clinic staff are in a group per clinic and a row holds its clinic's key, so a rule "group named in the column `clinic`" gives each clinic its own rows. A pet portal client has the attribute `client_id`, and a rule "attribute `client_id` equals the column `code`" lets them read their own record.

### The result

A person sees a row when any rule lets them. People who hold `data_all:read` and `data_all:write` see and change every row. A rename of a group does not break a rule that holds its key: a rule that holds the old name stops matching its people, so keep the key in the rows.

### If it does not work

- A person sees nothing: check **See it as** for them, then their group or attribute under **View access** or **Attributes**.
- A rule that names a group by its old name stopped matching after a rename: change the rows to hold the key.

## Related

- [Row rules](../../../console/how-to/data/row-rules), the screen's own steps.
- [End users](../../reference/screens/end-users).
