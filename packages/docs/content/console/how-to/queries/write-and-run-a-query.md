---
title: Write, run and keep a query
description: Write a SQL query over a workspace's tables, give it a parameter, run it, and save it by name as a draft.
subjects: [queries, sql]
---

## Write, run and keep a query

By the end you will have a query that counts Fernhill's visits by clinic from a day you choose, saved by name as a draft that a dashboard can use once it is deployed.

## Before you start

- You are signed in to the console and a dev workspace is open, such as Fernhill's Sandbox.
- You hold `sql:read` to write and run SQL, and `resource:write` to keep a query. `sql:read` is held by the roles `tenant_admin`, `workspace_admin` and `developer`; a wildcard does not give it. See [SQL and data source permissions](../../../administer/reference/queries/sql-and-source-permissions).
- The tables you will read exist, and you may read their rows (`data:read`). Fernhill has `appointments`.

## Write the query and run it

:::steps
1. Open **Data**, then **Queries**. The editor is empty and says "Write a query and press Run, or Ctrl+Enter in the editor."
2. Click in the editor and write one `select`. Name a table by its path, and write each value that changes as `$1`, `$2` and so on, with a cast so the database knows its type:

   ```sql
   select clinic, count(*) as visits
   from appointments
   where starts_at::date >= $1::date
   group by clinic
   order by visits desc
   ```

   A field appears under the editor for `$1`, labeled `$1`. Until you name a parameter in the next step, it is saved as `p1` and a saved query's field reads **p1**.
3. Open **What each parameter is**. Set **Name of parameter 1** to `since`, **Type of parameter 1** to `date`, **Label of parameter 1** to `From` and **Default of parameter 1** to a day, such as `2026-09-01`. The field above now reads **From** and holds that day.
4. Leave **Rows to return** at 1000, or set a whole number from 1 to 10,000.
5. Press **Run**, or :kbd[Ctrl+Enter] (:kbd[⌘↵]). A line under the fields says "3 rows · 25 ms · read appointments" with the time the run took, and a table shows `clinic` and `visits`.
6. To try another day, change **From** and press **Run** again.
:::

## Keep it as a draft

:::steps
1. Press **Save as…**. The dialog "Save this query" asks for **Name, such as reports/fees**. Type a path and press **Save**. Use lowercase letters, digits, dashes and underscores, with a slash between parts.
2. A notice says "<path> is saved as a draft. It can be run by name once it is deployed." with **Review and deploy**, which opens the **Deploy** screen. The header now shows the path and **Draft, never deployed**.
3. Type a line in **What it is for**, up to 500 characters, and press **Save**. It is shown beside the query in **Saved queries**.
4. To deploy it, press **Review and deploy** and follow the **Deploy** screen of the workspace. A query is not used by a dashboard until it is deployed.
:::

::screenshot{name=console/queries-parameters alt="The Queries screen with the What each parameter is panel open: name, type, label, default and needed for parameter 1, with the date field above it."}

## The result

The query is in **Saved queries** with its path and description. **Used by** says "Nothing uses it, deployed or in a draft." until a dashboard or an app names it. Once it is deployed, anyone who may read its tables can run it by name, without `sql:read`. The parameter has a name, a type, a label and a default, and each run asks for a value that fits.

## If it does not work

- **"Line 1, column 15: There is no table "…" in this workspace. A table is named by its path, in double quotes when it has a "/" or a "-"."** The name is not one of the workspace's tables, or it is one you may not read. Open **Tables** in the aside for the names.
- **"Only SELECT is allowed. A query reads, and changes nothing."** A query is one `select`. Other statements, `select … into`, `for update`, and several statements in one are refused. See the [SQL reference](../../../develop/reference/queries/sql-reference).
- **"The function pg_sleep() is not one a query may call."** Only the functions in the [generated list](../../../develop/reference/sql-functions) are allowed.
- **"Must be a date, such as 2026-01-31."** (or another type) The value in a parameter's field does not fit its type. Correct it. **Run** sends nothing until every field fits.
- **"A value is needed."** The parameter is marked **Parameter 1 is needed** and its field is empty.
- **"The query takes 2 parameters, …"** is said by the API when the number of values differs from the highest `$n`. In the console, the fields follow the text, so it does not arise.
- **The editor is read-only and a notice says you cannot write or run SQL.** You lack `sql:read`. A deployed query with no unsaved change can still be run by name.
- **Save as… is off.** The editor is empty, or you lack `resource:write`, or the workspace is a production workspace: queries are written in a dev workspace and promoted.
- **"Something already exists at this path. Choose another, or open that one."** The name is taken. The dialog keeps what you typed.
- **"Leave without saving?"** You pressed **New query** or chose another query with text you have not saved: "Your changes to <path> are not saved." **Stay** keeps it, **Leave** drops it.
- **"Someone else saved this query after you opened it."** Someone saved the draft first. Nothing of theirs was overwritten. **Copy what I wrote** keeps your text, then **Load their version**.
- **Tab does not leave the editor.** In the editor :kbd[Tab] indents, and a line under the editor says "Tab indents. Press Ctrl+M, then Tab, to move on." while it has focus. :kbd[Ctrl+M] turns that off, and on again.
- **The result says "and there were more: the result was cut short".** More rows than **Rows to return**, or more than 5 MB. Raise the number up to 10,000, or add `where` or `limit` to the query.
