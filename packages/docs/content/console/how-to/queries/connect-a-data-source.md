---
title: Connect a Postgres database as a data source
description: Declare a data source, connect it to a database, test it, change how it is reached, and remove it from a workspace.
subjects: [data-sources, postgres]
---

## Connect a Postgres database as a data source

By the end you will have declared a data source, connected it to a Postgres database you already have, tested the connection, and browsed its tables. A data source is read and written in place: nothing is copied into the workspace and Volvel never changes the database's structure.

## Before you start

- A dev workspace is open. A data source is declared in a workspace and connected in each workspace, so dev and production can point at different databases.
- You hold `resource:write` to declare it and `data_source:write` to connect, change or remove it. `workspace_admin` has both. A person with `data_source:read` can list, test and browse. See [SQL and data source permissions](../../../administer/reference/queries/sql-and-source-permissions).
- You have a Postgres database the instance can reach, the host, port, database name, a user and its password. The instance refuses private, loopback and link-local addresses unless its operator allows them with `EGRESS_ALLOW`.
- Only base tables of one schema are offered. A view is not listed.

## Declare the source

:::steps
1. Open **Data**, then **Data sources**, and press **Declare source**. The editor "New data source" opens.
2. Type **Path of the new data source**, such as `library-loans`: lowercase letters, digits, hyphens and underscores. Type a line in **What it is for**.
3. Press **Save draft**. The editor shows **Draft** and the buttons **Name and path**, **Discard draft**, **Save draft** and **Deploy**.
4. Press **Deploy**, then **This change only**. A source is declared by a deployed resource, so it appears under **Data sources** only after this step.
:::

A source can instead be declared in the repository with `defineDataSource`: see [Data as code](../../../develop/reference/queries/data-as-code). Either way, the address and the password are set under **Data sources**, never in the repository.

## Connect it

:::steps
1. Open **Data**, then **Data sources**. The source is listed as **Not set up here**. Press **Connect** on its row. **Connect database** at the top does the same and asks which declared source first.
2. Fill in **Host**, **Port** (5432 when empty), **Database** and **User**. **Password** is stored sealed and never shown again. **Schema** is the schema whose tables are offered, `public` when empty.
3. **Encrypt the connection** starts at **Yes**: the server's certificate is checked. Choose **No** for a database whose certificate a public authority did not sign, such as one with a private authority or a self-signed certificate.
4. Press **Connect <path>**. The row now says where it points, for example "library on db.example.com, as reader", **Password** says **Set**, and **Health** says **Not tested**.
5. Press **Test**. **Health** says **Reached** with the time the answer took and when it was tested. If it fails, it says **Failed** and the reason.
6. Open the source by its name. Its tables are listed on the left and the rows of the chosen one on the right. See [Data source rows](../../reference/queries/data-source-rows).
:::

::screenshot{name=console/data-source-connect alt="The Connect database dialog: Source, Host, Port, Database, User, Password, Schema and Encrypt the connection set to Yes."}

## Change how it is reached

:::steps
1. Press **Change** on the row, or on the source's page.
2. Change what moved. Leave **Password** empty to keep the stored one.
3. If you change the host, the port or the user, or turn encryption from **Yes** to **No**, the stored password is dropped and must be typed again. The dialog refuses with "The host, port, user or encryption changed, so the stored password will not be sent there. Type the password again."
4. To clear the password for a database that lets the user in without one, tick **Remove the stored password**. It cannot be combined with a new password.
5. Press **Change <path>**. Scripts that use the source read the new details at once, and the last test result is forgotten.
:::

## Remove it from a workspace

Press **Remove from here** and confirm "Remove from here?": "Remove "<path>" from here? Scripts that use it will fail until it is set up again. Nothing in that database changes." The declaration stays. The source goes back to **Not set up here**, and **Connect** sets it up again. To take away the declaration too, open it with **Edit** and press **Remove**, then deploy.

## The result

The source's row shows **Reached**. Scripts of the workspace can use it with `ctx.source(path)`. A table or list widget on a page can read one of its tables: in **Where it reads from** a table appears as "<table> in <source>". Health is tested again about every 10 minutes while the source is connected.

## If it does not work

- **Failed: "The data source "…" could not be reached. Check its address."** The host or port is wrong, or the network or the instance's egress rules refuse it. A private or loopback address needs the operator's `EGRESS_ALLOW`.
- **"The data source "…" refused the user name or password."** Press **Change** and type the password again.
- **"The data source "…" has no database by that name."** Correct **Database**.
- **"The data source "…" does not let its user do that."** The database's user lacks the right for the table or action.
- **"No password is set for the data source "…". Change it and type the password."** The address moved and the password was dropped, or none was given.
- **"The data source "…" took too long to answer."** A statement ran longer than 15 seconds.
- **Certificate errors with Yes.** The certificate is checked against the public authorities. Choose **No** for a private authority.
- **The source is not in the list of Connect database.** Only a deployed declaration is offered. Deploy it first.
- **A source's table is missing.** Only base tables of the schema are listed. Views are not.
- **The buttons on the rows are disabled.** A line above the list says "You can see this workspace's data sources, not change it. It needs `data_source:write`." Ask whoever manages roles in the tenant.
