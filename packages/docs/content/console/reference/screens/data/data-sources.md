---
title: Data sources
topic: data-sources
description: "Every control, state and permission of the Data sources screen and of a source's own page: declaring, connecting, testing, changing and removing a Postgres database, and the network and health rules that apply to it."
subjects: [data-sources, postgres]
moved_from:
  - data/data-sources
---

The **Data sources** screen lists the Postgres databases outside Volvel that a workspace reads and writes. A data source is two things. It is **declared** by a resource of the workspace, which gives it a path and says what it is for. It is **connected** in each workspace, with an address, a database, a user and a password, so that a dev workspace and its production workspace can point at different databases. The address and the password are set on this screen, never in the repository. Rows are read and written in the database itself, and Volvel never changes the database's structure.

The screen is reached from **Data**, then **Data sources**. F1 (**Help for this page**) opens the help topic `data-sources`. A source's own page has no topic of its own. The database must be Postgres: the declaration's connector is `postgres` and there is no other.

::screenshot{name=console/data-sources-list alt="The Data sources screen: one source with its purpose, where it points, who uses it, its password and its health, with Edit, Test, Change and Remove from here on its row."}

## The list

The list has a description line, **Declare source** and **Connect database** beside the title, and a table. On a narrow window the columns **For**, **Points to**, **Used by** and **Password** give way; **Source**, **Health** and the actions stay.

| Column | What it shows |
| --- | --- |
| **Source** | The source's path. A link to its page when it is connected, plain text when it is not. The tag **Arrives with the next promotion** marks a source declared by the linked workspace and not yet deployed here: it can be connected here before it arrives. |
| **For** | What the declaration says the source is for. |
| **Points to** | "<database> on <host>, as <user>", or the pill **Not set up here** when it is not connected. |
| **Used by** | Up to three resources that use it, each a link, then "and N more" linking to the source's page. "Nothing deployed uses it", "Reading…", or "Could not be read". |
| **Password** | **Set** when a password is stored, **None** when the source is connected without one, empty when it is not connected. |
| **Health** | For a connected source: **Not tested**, **Reached** with how long the answer took and "tested <time ago>", or **Failed** with "tested <time ago>" and the whole reason under it. |

### Row actions

| Action | Shown for | What it does |
| --- | --- | --- |
| **Edit** | A source some resource of the workspace declares | Opens the resource editor of the declaration. |
| **Connect** | A source that is declared and not connected | Opens **Connect <path>**, with the same fields as **Connect database**. |
| **Test** | A connected source | Reaches the database with the smallest question there is. The button reads "Testing…" while it runs. A notice says "<path>: reached." or "<path>: <reason>", and **Health** is updated. |
| **Change** | A connected source | Opens **Change <path>** with what the source is now. |
| **Remove from here** | A connected source | Asks "Remove from here?": "Remove "<path>" from here? Scripts that use it will fail until it is set up again. Nothing in that database changes." The declaration stays and the source goes back to **Not set up here**. |

### Declare source

**Declare source** opens the resource editor "New data source": **Path of the new data source**, **What it is for** (optional), then **Save draft**. A saved draft adds **Name and path**, **Discard draft** and **Deploy**, whose menu offers **This change only** and **Review all drafts**. A source is listed on this screen once its declaration is deployed. It needs `resource:write`: without it the button is disabled and its tooltip names the permission.

### Connect database and Connect

**Connect database** connects a declared source and **Connect** does so for the row it is on, with its path already in. They take:

| Field | What it takes |
| --- | --- |
| **Source** | Only in **Connect database**. A choice of the sources a resource of the workspace declares, each with its purpose. Connecting one that is already connected replaces its details. |
| **Host** | The database server's name or address, up to 255 characters. |
| **Port** | 1 to 65535. 5432 when empty. |
| **Database** | Up to 63 characters. |
| **User** | Up to 63 characters. |
| **Password** | Optional, up to 1,000 characters. Stored sealed, never returned and never shown again. Empty keeps the stored one when the address is unchanged. |
| **Schema** | The schema whose tables are offered, letters, digits and underscores, starting with a letter or an underscore, up to 63 characters. `public` when empty. |
| **Encrypt the connection** | **Yes** or **No**. It starts at **Yes**. Yes checks the server's certificate against the public certificate authorities: a database with a private authority or a self-signed certificate needs **No**. |

The dialog's button is **Connect <path>** or **Connect database**. When it works the notice says "<path> was connected."

### Change

**Change <path>** has the same fields, filled in with what the source is now, except the password. It says "Leave the password empty to keep the stored one. It is dropped when the host, port or user changes or encryption is turned off: then type it again. Scripts that use it read the new details at once."

- The stored password is dropped when the host (compared without regard to capitals), the port, the user, or encryption changes from **Yes** to **No**. The form refuses with "The host, port, user or encryption changed, so the stored password will not be sent there. Type the password again." and the API refuses the same way.
- **Remove the stored password** is shown when one is stored. It is for a database that lets the user in without one, and it cannot be ticked while a new password is typed ("Either type a new password or remove the stored one, not both.").
- A successful change says "<path> was changed.", closes the connection pool and forgets the last test result.

### States of the list

| State | What you see |
| --- | --- |
| Empty | "No data sources yet", "Connect a Postgres database you already have. Its tables can then be browsed here and used by scripts.", with **Declare source** and **Connect database**. |
| Read only | "You can see this workspace's data sources, not change it. It needs `data_source:write`." **Declare source**, **Connect database**, **Connect**, **Test**, **Change** and **Remove from here** are disabled. **Edit** is a link and stays. |
| Not loaded | The error with **Try again**. |

## A source's page

A connected source's name opens its page at `sources/<path>`. It fills the window like a table's page. The title is the source's path, with the buttons **Test**, **Change** and **Remove from here** (which returns to the list) and the link **All data sources**. Its description says the rows are read and written in the database directly, and that Volvel does not change its structure.

Its tables are listed on the left, and the chosen one is in the address as `?item=<table>`. A name with a space, a dash or a mark is opened by its encoded name. The rows of the chosen table are on the right: see [Data source rows](../../queries/data-source-rows).

| State | What you see |
| --- | --- |
| Loading, or the source could not be reached | The page's loading state, or a notice with the reason and **Try again**. A database that does not support SSL while **Encrypt the connection** is **Yes** gives the notice "Internal Server Error", while **Test** says "The server does not support SSL connections". |
| A reader | **Test**, **Change** and **Remove from here** are offered. **Test** works. The other two are refused with "needs the data_source:write permission." |
| The schema has no tables | "No tables found": "The database was reached, but the schema it is connected to has no tables." |

## What a source can be

- **Postgres only.** The connector is `postgres`.
- **Base tables only.** Views are not listed. The tables are those of the one schema named when it was connected.
- **Types.** A column of type text, integer, number, boolean, timestamp, date, JSON or UUID is shown and can be written. A column of any other type is shown as its database type and cannot be written.
- **Keys.** A table with a single-column primary key can have its rows changed and deleted. One without says "This table has no primary key, so rows can be added but not changed or deleted."
- **Not offered here.** There is no screen for a source's views, for a database that is not Postgres, for CSV export, saved views, totals or deleting several rows at once on a source's rows.

## Network and time limits

| Rule | Value |
| --- | --- |
| Connections held per source | 4 |
| Time to open a connection | 5 seconds |
| An idle connection is closed after | 30 seconds |
| One statement may run | 15 seconds, not settable. A slower one says "The data source "<path>" took too long to answer." |
| Session time zone | UTC |
| Certificate | Checked when **Encrypt the connection** is **Yes**. There is no way to trust a private authority: choose **No**. A server that has no SSL at all fails with "The server does not support SSL connections". |
| Addresses | Loopback, private, link-local, shared and reserved addresses are refused unless the operator lists them in `EGRESS_ALLOW`. A script's own network access is held separately, by the worker host. |

A source's health is tested about every 10 minutes while it is connected, with a 5-second wait. A source that is down is said with the same words wherever it is read: "The data source "<path>" could not be reached. Check its address." (502), "…refused the user name or password.", "…has no database by that name.", "…does not let its user do that." and, with no password stored, "No password is set for the data source "<path>". Change it and type the password."

## Permissions

| Action | Needs |
| --- | --- |
| See the list, open a source's page, browse its tables | `data_source:read` |
| **Test** | `data_source:read`. The list disables **Test** without `data_source:write`; a source's own page offers it. |
| **Connect**, **Connect database**, **Change**, **Remove from here**, add, change and delete a source's rows | `data_source:write` |
| **Declare source**, **Edit**, and deploy a declaration | `resource:write` |
| Put a source's table on a dashboard or an app page | `data_source:read` for the person who saves the page. Whoever looks at the page needs `data:read`. A repository deploy is not asked. |

`workspace_admin` holds `data_source:*`. `developer` and `viewer` read only. See [SQL and data source permissions](../../../../administer/reference/queries/sql-and-source-permissions). Connecting, changing, removing and testing a source are written to the audit log as `data_source.bound`, `data_source.rebound`, `data_source.unbound` and `data_source.checked`, with where it points and never the password. Changes to a source's rows are not written to the audit log: the rows are the database's, not Volvel's.

The address and the password of a source are not part of the code. They are copied when a workspace is cloned.

## Related

- [Connect a Postgres database as a data source](../../../how-to/queries/connect-a-data-source)
- [Data source rows](../../queries/data-source-rows)
- [Dashboards](dashboards) and [Building a dashboard](dashboard-builder): a source's table in **Where it reads from**.
- [Data as code](../../../../develop/reference/queries/data-as-code): `defineDataSource`.
