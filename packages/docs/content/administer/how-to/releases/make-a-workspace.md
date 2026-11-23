---
title: Make a workspace, clone it, or delete it
description: "Create a dev or a production workspace and set where it promotes to, copy a workspace with or without its data, and delete one."
subjects: [workspaces, promotion]
---

## Make a workspace, clone it, or delete it

By the end the tenant has the workspace you wanted, linked the way you want, or the one you did not want is gone.

## Before you start

- You hold `workspace:write`. A tenant admin does. See the [permissions reference](../../reference/permissions).
- A workspace's type, dev or production, cannot be changed after it is made. Decide first.

## Make a workspace

:::steps
1. Open **Tenant**, then **Workspaces**, and press **Create workspace**.
2. Give a **Name** and a **Slug**: lowercase letters, digits and hyphens. The slug is its address and does not change.
3. Choose the **Type**.
4. For a dev workspace, choose **Promotes to**: the production workspace, or another dev workspace. **Nothing** leaves it unlinked.
5. Press **Create workspace**.
:::

The dialog says "Workspace *name* is made." with **Open *name***. A new dev workspace starts with its triggers paused, so a schedule tried there does not run beside production's. Resume them under **Configure**, **Workspace settings**.

A common shape is a dev workspace that promotes to a production workspace. A second dev workspace, for review, can promote to production while the first promotes to it.

## Change where a workspace promotes to

:::steps
1. Open the dev workspace, then **Configure**, **Workspace settings**.
2. Under **Promotion target**, choose **Promotes to**.
3. Press **Save** in the bar.
:::

## Clone a workspace

:::steps
1. Open the workspace, then **Configure**, **Workspace settings**, and press **Clone workspace**.
2. Give the copy a **Name** and a **Slug**.
3. Choose **Rows and files**: **Leave them behind: empty tables**, or **Copy them**. Copying also needs `data_all:read` and `file:read`.
4. Leave **Safety** **On** so the copy gets no connection, data source, group member or secret value. **Off** copies them and is recorded in the audit log. It needs `secret:write` and `connection:write`.
5. Press **Clone workspace**, and wait for "Copied N resources, N rows in N tables and N files."
6. Press **Open the copy**.
:::

With **Safety** on, the sheet adds that the copy has no connections, data sources or secret values and cannot reach a real system until you set it up. With **Safety** off and something to copy, it says the connections, data sources, group members and secrets were copied and the copy can reach the same systems as the original.

The copy is a dev workspace that promotes to the workspace it was made from, and its triggers start paused. A connection that signs in with OAuth is not signed in, even with Safety off: connect it again.

## Delete a workspace

:::steps
1. Open the workspace, then **Configure**, **Workspace settings**, and press **Delete workspace**.
2. Type its slug to confirm, and press **Delete workspace**. For a production workspace the button says **Delete production workspace**.
:::

Everything in the workspace goes: its resources, secrets, run history, tables with every row, and files. It cannot be undone. Export the tenant first if any of it may be wanted.

## The result

The Workspaces list shows the new workspace, with its type and what it promotes to. A deleted one is gone from it.

## If it does not work

- **"That already exists."** The slug belongs to another workspace of the tenant. Use another.
- **"Use only lowercase letters, digits and hyphens."** Under **Slug**. A slug is lowercase letters, digits and single hyphens, at most 63 characters.
- **"That link would lead back to this workspace."** A chain of links cannot return to where it started.
- **"A clone of this workspace is still being made."** Wait until it has finished.
- **"N runs and N flow runs are still in progress."** Pause the triggers, let them finish or cancel them, then try again.
- **Deleting a production workspace is refused** with "This needs the workspace_production:write permission. …". It needs `workspace_production:write`, which no role holds until it is added to one by name. An administrator does not have it either.
- **"Waiting for another clone to finish copying."** One clone copies rows at a time. It gives up after an hour.
