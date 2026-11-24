---
title: Database locations
topic: instance-databases
description: "Every control, state and permission of the Database locations screen: registering a database, editing it, the inspector, removing it, and what registering does to the database."
subjects: [instance, database-locations]
moved_from:
  - instance/databases
---

The **Database locations** screen lists the Postgres databases, other than the instance's own, where a tenant's custom tables can live. By default every tenant's tables are in the instance's own database. An operator registers another database here, and a tenant is placed in it when the tenant is created or imported. It is the way to give a tenant a database of its own. It covers custom tables only: the tenant's other data stays in the instance's database.

The screen is in the **Instance** area. F1 (**Help for this page**) opens the help topic `instance-databases`.

::screenshot{name=self-host/instance-databases alt="The Database locations screen with one location chosen: its name, what it is for, the database and host, how many tenants keep tables there and Reached, and the inspector listing the tenants there."}

## Controls

The title is **Database locations**. The description reads "Databases, other than the instance's own, where a tenant's custom tables can live. A tenant is placed in one when it is created or imported." The description shows the first time you open the screen. On later visits it is folded behind the **About Database locations** button (the circled i) beside the title.

| Control | What it does |
| --- | --- |
| **Register database** | Opens the dialog below. It is also the button in the empty state. |
| **Edit** | In each row. Opens the dialog "Edit location". |
| **Remove** | In each row, only while no tenant keeps tables there. Asks `Remove "NAME" from this instance? Nothing in that database is touched.` |

The list has no search box. The columns. **For**, **Database** and **Tenants** give way on a narrow window.

| Column | What it shows |
| --- | --- |
| **Name** | The location's name, in code style. |
| **For** | What it is for, in plain words. |
| **Database** | "DATABASE on HOST", or nothing when the stored address cannot be read. |
| **Tenants** | How many tenants keep tables there. |
| **Status** | **Reached**, or a **Failed** pill with the problem. |

Each address is opened on its own when the list is read, so a database that is down shows as **Failed** on its row and does not stop the page.

Choosing a row opens the inspector (eyebrow **Database location**, title the name): **For** ("Not said" when empty), **Database** (or "Its address cannot be read"), **Status** ("Reached", or "Failed: PROBLEM"), **Tenants**, and the section **Tenants here**. That section links to each tenant that keeps tables there, with its slug, and **Show them in the tenant list**, which opens [All tenants](tenants) filtered to this location ("No tenant keeps its tables here." when there is none).

### Register database

The dialog's line reads "Volvel connects first and prepares the database. The user must own it and be allowed to create roles. Registering a name again changes its address."

| Field | What it takes |
| --- | --- |
| **Name** | Lowercase letters, digits and hyphens, at most 63 characters. It is the name a tenant is placed by and cannot be renamed. |
| **What it is for** | Optional. At most 500 characters. |
| **Connection string** | `postgres://user:password@host:5432/database`, at most 2,000 characters. Stored encrypted and never shown again. |

Registering connects to the database and prepares it: a catalog of the tenants' custom tables and a restricted sign-in for row requests. The user in the connection string must own the database and be allowed to create roles. When it works the console says "Created." and the row shows **Reached**. A database that cannot be prepared is refused with "That database could not be prepared." and the reason, for example the connection refused.

A registration is refused when the address is the instance's own database ("That is this instance's own database. Register a different database for tenants' tables."), or one already registered under another name ("That is the database "NAME" already reaches. Change "NAME" instead, or use another database.").

### Edit location

The dialog says "Now DATABASE on HOST." and that the address is stored encrypted and never shown.

| Field | What it takes |
| --- | --- |
| **What it is for** | Optional. Changing only this connects to nothing. |
| **New connection string** | Optional. Empty keeps the stored address. A new address points the name at another database. |

A new address is refused unless the new database already holds every table and workspace of the tenants that keep tables under that name. The refusal reads "N tenants keep their tables under "NAME", and that database does not hold them (N tables and N workspaces missing). Restore a copy of the tenants' database there first, or move the tenants." The result is "NAME is saved."  With one tenant the sentence begins "1 tenant keeps their tables under".'

A tenant cannot be pointed at another location after it is made. To move one, see [Move a tenant](../../how-to/instance/moving-a-tenant).

## States

| State | What you see |
| --- | --- |
| Empty | "No dedicated databases", with "Every tenant's tables are in the instance's own database. Register another one to give a tenant a database of its own." |
| A location is down | The row's **Status** is **Failed** with the problem. Requests for the tables of the tenants there answer 503 `data_location_unavailable` until it is back. Other replicas notice a changed address within 2 seconds. |
| Not loaded | The error state with a retry. |
| Read only for you | A line says "You can see the database locations, not change it. It needs `instance:write`. Ask an operator of this instance to give you access." **Register database**, **Edit** and **Remove** are disabled. |
| Read only instance | The strip "The instance is read only." is on every screen. The dialogs' buttons are disabled with the reason. |

A location that holds several tenants gives each of them its own share of connections (the setting `DATA_TENANT_CONNECTIONS`).

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a location | `instance:read` at the instance. |
| **Register database**, **Edit**, **Remove** | `instance:write` at the instance. |

The list of names and descriptions that **Create tenant** and [Import a tenant](import) offer is read with `instance:read`.

## Related

- [All tenants](tenants): the **Tables kept in** column and filter, and **Create tenant**.
- [Import a tenant](import): choosing where the imported tables go.
- [Move a tenant](../../how-to/instance/moving-a-tenant): from the instance's database to a location, or the other way.
