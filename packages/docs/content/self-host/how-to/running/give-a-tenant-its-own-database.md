---
title: Give a tenant a database of its own
description: "Register a Postgres database as a location and place a tenant's custom tables in it."
subjects: [database]
---

## Give a tenant a database of its own

By the end a tenant's custom tables live in a database other than the instance's. The instance's records, the queue and sign-in stay where they are.

## Before you start

- You are an operator who holds `instance:write` (an operator admin does).
- A new, empty Postgres database, and a user that owns it and may create roles. The address must not be the instance's own database.
- The tenant is new, or you are importing it. A tenant's location is chosen once.

## Do it

:::steps
1. In the console, open **Instance**, then **Database locations**, and press **Register database**.
2. Give a **Name** (lowercase letters, digits and hyphens), what it is for, and the **Connection string**: `postgres://user:password@host:5432/database`. The instance connects, prepares the database and stores the address encrypted with the master key. When it works the row shows **Reached**.
3. Give the name when you create the tenant (**Create tenant**), or when you import one (`volvel tenant import acme.tar --location acme-db`).
:::

To move a tenant that already exists, export it, delete it here once its runs have ended, and import it again with the location you want. An import is refused while the tenant is still on this instance.

## The result

The tenant's custom tables are in that database. The location's row shows how many tenants keep tables there, and several tenants may use one database. Each has a share of its connections.

If a dedicated database is down, the tenants in it get an error for their tables, and everything else keeps working. The row shows **Failed** with the problem.

A deploy that changes tables in a dedicated database commits there first and in the instance's database second. If the instance fails between the two, the workspace shows the earlier bundle while its tables are already changed. Nothing is lost: deploy the bundle again and it completes.

## If it does not work

- **"That database could not be prepared."** The reason follows it, for example the connection refused. The user must own the database and be allowed to create roles.
- **"That is this instance's own database."** Register a different one.
- **A restore.** Restore each dedicated database from the same moment as the instance's. The instance's database holds only their addresses. See [Restore an instance](restore-an-instance).

Related: [Database locations screen](../../reference/console/databases), [Sizing and scaling](../../explanation/running/sizing-and-scaling).
