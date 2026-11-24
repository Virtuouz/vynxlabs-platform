---
title: SQL and data source permissions
description: "Which permission each action on queries, SQL, data sources and dashboards asks for, which built-in roles hold it, and what a reader needs that a writer does not."
subjects: [permissions, queries, data-sources]
---

This page lists what each action on queries, SQL, data sources and dashboards asks for. Every permission is written `kind:verb` and is defined in the [permissions reference](../permissions). A role lists permissions and may use `*` for either half. One permission, `sql:read`, is **explicit**: a wildcard does not give it, and a role has it only when it names it.

## Who may do what

| Action | Needs | Notes |
| --- | --- | --- |
| Write and run SQL on the Queries screen, or `POST queries/run` | `sql:read` | Each table it reads needs `data:read`, at the workspace or at that table. Row rules apply. `data_all:read` sees every row. Recorded in the audit log as `sql.run` with the SQL, its hash, the tables and the row count, never the result. |
| Run a saved query by name, `GET queries/saved/<path>` | `data:read` on each table it reads | No `sql:read`. Not recorded in the audit log. A query that reads no table needs `data:read` at the workspace. A person with no standing in the tenant is told nothing: the same "not found". |
| Build a query from menus, `GET queries/visual` | `data:read` on each table it reads | No `sql:read`. |
| See the tables a query can name, `GET queries/schema` | `data:read` | Lists only the tables the caller may read rows of. |
| List the saved queries | `resource:read` | |
| Keep, rename, remove or discard a query, in a dev workspace | `resource:write` | Saving SQL, or changing a query's SQL, also asks `sql:read` of whoever saves it. |
| Put SQL in a dashboard or an app page's widget and save it | `sql:read` of whoever saves it | A reader of the page needs only `data:read`. |
| See a data source, browse its tables and rows | `data_source:read` | |
| Test a data source (API) | `data_source:read` | The console disables **Test** without `data_source:write`. |
| Connect, change or remove a data source, and add, change or delete its rows | `data_source:write` | The password is stored sealed and never returned. |
| Declare a data source, and deploy the declaration | `resource:write` | |
| Put a data source's table on a page and save it | `data_source:read` of whoever saves it | A reader needs only `data:read`. |
| See dashboards | `dashboard:read` | A member's own, those shared with them, and every resource dashboard. The rows still follow `data:read` and row rules. |
| Make, change, share and delete a dashboard of your own | `dashboard:write` | A member only: a service account or an end user has none. At most 20 per member per workspace. |
| Keep a dashboard as a resource, and change one | `resource:write` | In a dev workspace. |
| List groups in the **Share** dialog | `group:read` | |

**Who saves and who reads.** A page is saved by one person and read by many. What the saver must hold is asked when a draft is saved, when drafts are deployed, when a draft is restored, when a resource is put and when a git pull brings new SQL or a data source's table. A repository deploy is not asked: code review gates it. A reader of a page is held only to the permissions of the rows.

## The built-in roles

| Role | `sql:read` | `resource:write` | `data_source` | `dashboard` | `data` and `data_all` |
| --- | --- | --- | --- | --- | --- |
| `tenant_admin` | Yes | Yes (`*:*`) | read and write | read and write | read and write |
| `workspace_admin` | Yes | Yes | read and write | read and write | read and write |
| `developer` | Yes | Yes | read | read and write | read and write |
| `viewer` | No | No | read | read | read |
| `deployer` | No | No | read | read | read |
| `app_maintainer` | No | No | No | read and write | `data` read and write |
| `portal_reader` | No | No | No | No | `data` read |
| `portal_user` | No | No | No | No | `data` read and write |

The table follows the roles as the migrations leave them. A tenant can make roles of its own and list any permission in them.

## Row rules

`data:read` is what lets a person read a table, and the table's rules for who sees which rows narrow what they get, in a table, a query, a dashboard and a widget alike. `data_all:read` and `data_all:write` go past the rules. A query is run as the person who runs it: two people running one query, or looking at one dashboard, can see different numbers.

## Related

- [Permissions](../permissions): every permission and what it allows.
- [Queries](../../../console/reference/screens/data/queries), [Data sources](../../../console/reference/screens/data/data-sources) and [Dashboards](../../../console/reference/screens/data/dashboards)
- [How a query is answered](../../../console/explanation/queries/how-a-query-is-answered)
