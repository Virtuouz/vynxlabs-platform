---
title: Queries
topic: data-queries
description: "Every control, state and permission of the Queries screen: the SQL editor, a query's parameters and rows, saving it as a draft, renaming and removing it."
subjects: [queries, sql]
moved_from:
  - data/queries
---

The **Queries** screen is where a question about a workspace's tables is written in SQL, run, and kept by name. A query only reads. It names a table by its path, and each table's rules for who sees which rows apply to whoever runs it. A query that is kept is a :term[resource]{id=resource} of the workspace: a draft until it is deployed, then versioned, deployed and promoted with the rest of the workspace.

The screen is reached from **Data**, then **Queries**. F1 (**Help for this page**) opens the help topic `data-queries`. An address can name the query to open: `queries?query=<path>`.

::screenshot{name=console/queries-editor alt="The Queries screen with a query written in the editor, a date field for its parameter, a result of three rows under the editor, and the list of saved queries and tables beside it."}

## Layout

The page has the editor and its controls on the left. On a narrow window the aside goes under them. The aside has three lists:

| List | What it shows |
| --- | --- |
| **Saved queries** | Every query of the workspace, by title when it has one, with its path under it, "Renamed from X, once deployed." for a query a draft renames, and its description. A query that has a draft is in the list too. Choosing one opens it. "None yet. A query that is saved can be run by name, by anyone who may read its tables." when there are none. |
| **Used by** | Shown when a query is open. What uses it, deployed or in a draft, each as a link with its kind and how: "Nothing uses it, deployed or in a draft." when nothing does. "What uses it could not be read: …" with **Try again** when the read fails. |
| **Tables** | The tables you may read. Each opens to its columns with their types, and a reference column shows `→` and the table it points to. A table whose path is over 63 bytes is left out: it can be put on a page and cannot be written in SQL. "This workspace has no tables you may read." when there are none. |

## Controls

From the top, left to right. The first line is the query's path, or "A new query" for one that has no name yet.

| Control | What it does |
| --- | --- |
| State pill | **Draft, never deployed** for a query that exists only as a draft, **Draft** for a deployed query with a draft that changes it, **Removing** for one a draft removes. |
| **New query** | Opens an empty editor. Shown when a query is open, and when the address names a query that is not there. It asks "Leave without saving?" first when what you typed is not saved. |
| **Name and path** | Opens "Name and path of …". See below. Shown when a query is open. |
| **Discard draft** / **Remove** / **Keep this query** | **Discard draft** is shown for a query that has a draft, and asks "Discard this draft?": "The query goes back to how it was last deployed. One that was never deployed is gone." **Remove** is shown for a deployed query with no draft, and asks "Remove this query?": "This saves a draft that removes it. Nothing changes until that draft is deployed." **Keep this query** is shown for one a draft removes, and asks "Keep this query?": "This throws away the draft that removes it. The query stays as it was last deployed." A query managed in the repository shows "Managed in the repository: the query is removed there." in place of all three. |
| **Save as…** / **Save** | **Save as…** is for a query that has no name. It opens "Save this query", with the field **Name, such as reports/fees**. **Save** is for an open query and saves its text, description and parameters as a draft on the revision you opened. It is off when the editor is empty, when the query is being removed, and when you may not keep queries. |
| **Run** | Runs the query once and shows the result under it. See [Run](#run). |

Saving says "<path> is saved as a draft. It can be run by name once it is deployed." with the link **Review and deploy**, which opens the **Deploy** screen of a dev workspace. Nothing is deployed by saving.

### Name and path

"Name and path of <path>" says "It stays the same query: its history, its data and what is bound to it come along, and <path> keeps answering for 90 days. Nothing changes until the draft is deployed."

| Field | What it takes |
| --- | --- |
| **Key** | Shown, not editable. What the resource is, whatever it is called. It never changes. |
| **Path** | Where the query is found, up to 255 characters. |
| **Title** | What people read in lists, up to 200 characters. Empty is none. |

**Save as a draft** is the one action. When the path changes, the dialog lists the dashboards that name the query: "These dashboards are saved as drafts with the new path" ("This dashboard is saved as a draft with the new path:" for one) for dashboards kept by the console, and "These dashboards are the repository's, so they are not changed here" for the repository's, which find the query by its key until the path is changed in the repository. After **Save as a draft** the screen stays at the old address and says "There is no query at <old path>." until you choose the query by its new path in **Saved queries**. See [Rename or remove a query](../../../how-to/queries/rename-or-remove-a-query).

The button is off, with its reason as a tooltip, for a query defined in the repository's code ("It is defined in the repository's code. Change its path or title there, and give it key: …"), for one being removed, and while the editor has changes you have not saved ("Save the draft first.").

## The editor

The editor is labeled **The query**. It completes tables, columns and functions from what the workspace has. Keys:

| Key | What it does |
| --- | --- |
| :kbd[Ctrl+Enter] (:kbd[⌘↵]) | Runs the query. |
| :kbd[Ctrl+S] (:kbd[⌘S]) | Saves it, as **Save** or **Save as…** does. It does nothing on an empty editor. |
| :kbd[Ctrl+K] (:kbd[⌘K]) | Opens the console's search and jump list. |
| F1 | Opens help for the page. |
| :kbd[Ctrl+M] | Monaco's own key: :kbd[Tab] then moves focus on instead of indenting, until you press :kbd[Ctrl+M] again. In the editor :kbd[Tab] indents and :kbd[Esc] does not leave it. |

The editor is read-only for a query being removed and for someone who may not write SQL. The SQL it takes, and what it refuses, is in the [SQL reference](../../../../develop/reference/queries/sql-reference).

Under the editor, for a query that is open and not being removed, **What it is for** takes a description of up to 500 characters. It is saved with the query and shown beside it in the list.

## Parameters

A query has one parameter for each `$1`, `$2`, … in its text. Counting skips strings, comments and dollar-quoted text, and stops at 20.

- A **field** for each parameter is shown under the editor. Its label is the parameter's label, else its name, else `$1`. A parameter you did not name is saved as `p1`, `p2`, so a saved query's field reads **p1**. A **Yes or no** parameter is a menu with **Not set**, **Yes** and **No**. A **date** is a date field. Others are text, with the type as a hint. A value that does not fit is said as you type, for example "Must be a whole number.", and **Run** sends nothing until it does. A parameter marked needed and left empty says "A value is needed." A field you leave empty starts as the parameter's default.
- **What each parameter is** is a panel under the fields, shown when the query has parameters. For each one it has **Name of parameter n**, **Type of parameter n**, **Label of parameter n**, **Default of parameter n** and **Parameter n is needed**. They are saved with the query. A save is refused while a name or default is wrong, and says so on the field.

The fields, types and limits are in [Query parameters](../../queries/query-parameters).

## Rows to return

**Rows to return** is a whole number from 1 to 10,000 and starts at 1,000. Outside that range the field says "Must be a whole number from 1 to 10,000." and **Run** sends nothing.

## Run

**Run** asks for the query's rows and shows:

- a line: "N rows", then ", and there were more: the result was cut short" when more rows or more than 5 MB of JSON were left out, " · N ms", and " · read" with the tables the query read;
- a read-only table of the result. The columns keep their order and a column keeps its place when two have the same name. A whole number too large for a number to hold exactly (above 2^53) comes back as text. A day or month taken from a time in SQL is in UTC.
- for a query that ran and gave nothing: "The query ran and gave no rows." The column names are still returned by the API.

A refusal is shown in a red notice: "Line n, column n: …" with the text of the reason, and the editor scrolls to the place. A query that the database cannot run, such as a division by zero, says "The query cannot be run." with the database's own words. The result is a table only: there is no chart, export or builder on this screen. To chart a query, put it on a [dashboard](dashboards).

Without `sql:read`, **Run** runs a deployed query by name. See Permissions.

## States

| State | What you see |
| --- | --- |
| Loading, or failed | The page's loading state, or the error with a retry. |
| A query not there | "There is no query at X." and a notice: "There is no saved query at X. It was discarded or removed, or the address is wrong. This is a new query." |
| Removing | "This query is removed in your drafts. Nothing changes until that draft is deployed. The text shown is what is deployed now. Keep this query to take the removal back." The editor is read-only. |
| Managed in the repository | "This query is managed in the tenant's repository. Saving a draft of it takes it over." |
| Someone saved first | "Someone else saved this query after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." with **Copy what I wrote** (puts your text on the clipboard) and **Load their version** (asks "Load their version?" and replaces what you changed). |
| Cannot keep queries | "You can run queries here but not keep them: that takes the permission to write resources (`resource:write`). Ask whoever manages roles in this tenant." |
| Production workspace | "Queries are written in a dev workspace and promoted to this one, so they are not saved here. They can be run by name once they are promoted." **Save** is off. |
| Cannot write SQL | "You cannot write or run SQL: that takes the permission to read with SQL (`sql:read`), which a role has only when it names it." It goes on to say whether the open query can be run by name. |
| Nothing run yet | "Write a query and press Run, or Ctrl+Enter in the editor. Start with `select * from ` and the editor offers the tables." |

## Permissions

| Action | Needs |
| --- | --- |
| See the list of saved queries | `resource:read` |
| Write and run SQL | `sql:read`. A wildcard does not give it. The built-in roles `tenant_admin`, `workspace_admin` and `developer` hold it. |
| Run a deployed query by name, with no draft and no unsaved change | `data:read` on each table it reads, at the workspace or the table. A query that reads no table needs `data:read` at the workspace. |
| **Save**, **Save as…**, **Name and path**, **Remove**, **Discard draft** | `resource:write`, in a dev workspace. Saving SQL, or changing it, also needs `sql:read`. |
| See a table's columns in the aside | `data:read` on the table. A person with no standing in the tenant is told nothing. |

Each table the query reads needs `data:read`, and each table's rules for who sees which rows apply to the person who runs it. `data_all:read` sees every row. A run of SQL from here is written to the audit log as `sql.run` with the SQL, its hash, the tables and the number of rows, and never the result. A deployed query run by name is not recorded. See [SQL and data source permissions](../../../../administer/reference/queries/sql-and-source-permissions) for the whole list.

## Limits

| Limit | Value |
| --- | --- |
| SQL text | 20,000 characters |
| Parameters of a saved query | 20 |
| Rows returned | 1,000 by default, 10,000 at most |
| Result size | 5 MB of JSON, then the result is cut short |
| Time for one run | 15 seconds by default (the operator sets it, from 1 second to 10 minutes) |
| Description | 500 characters |

## Related

- [Write and run a query](../../../how-to/queries/write-and-run-a-query)
- [Query parameters](../../queries/query-parameters)
- [SQL reference](../../../../develop/reference/queries/sql-reference)
- [Dashboards](dashboards): where a query's answer is drawn.
- [How a query is answered](../../../explanation/queries/how-a-query-is-answered)
