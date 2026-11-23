---
title: Write a connector or a trigger source in the console
description: Make a connector or a trigger source in the editor, deploy it, and use it from a connection, a webhook or a schedule.
subjects: [extensions, connectors]
---

## Write a connector or a trigger source in the console

By the end you will have a connector or a trigger source deployed in a dev workspace, and a connection, a trigger or a schedule that uses it.

## Before you start

- You are signed in and a dev workspace is open, such as Fernhill's Sandbox. Production workspaces change by promotion only.
- You need `resource:write`, `code:write` and `deployment:write` in the workspace. See the [permissions reference](../../../administer/reference/permissions).
- The tenant's switch **Code in the console** is on. If it is off, saving is refused with "Writing code in the console is turned off for this tenant." A tenant admin turns it on under **Repository**.
- You know what the extension is for. If you are not sure you need one, read [What an extension is](../../../develop/explanation/extensions/what-an-extension-is) first. HTTP, mail and OAuth 2.0 connections need none.

## Write a connector

:::steps
1. Open **Build**, then **Extensions**, and press **New connector**. The editor opens with the title **New connector**, the pill **Not saved**, a **Path** field and a starter.
2. Type the **Path**, for example `connectors/shop`. Open **Settings** if it is closed and write what it is for under **What it does**.
3. Read **What a connection is set up with, as JSON Schema**. The starter asks for a required text field `baseUrl`. Change it to the settings your outside system needs. The **Connections** screen draws its form from this schema, and a secret is not part of it.
4. Write the code. The default export builds the client a script is given: `(config, credential, signal) => client`. An optional `test` export is what **Test** on a connection runs. Import only from `@volvel/sdk` and `node:`.
5. Press **Save draft**, or :kbd[Ctrl+S]. The title becomes the path and the pill says **Draft**.
6. Press **Deploy**, then **This change only**. A toast says "Deployed connectors/shop as version N."
7. Make a connection that uses it. Open **Build**, then **All resources**, press **New**, then **Connection**. Type a **Path**, such as `shop/main`, and under **What kind of connection** choose `connectors/shop`. Press **Save draft**, then **Deploy** and **This change only**.
8. Open **Configure**, then **Connections**. The new connection says **Not set up here**. Press **Set up**, fill in the settings the form shows, and press **Save**. Press **Test again** to try it.
:::

The **New connection** panel on the **Connections** screen offers only HTTP, mail and OAuth 2.0 as a kind. A connection of your own connector is made as a resource in step 7, and set up here.

## Write a trigger source

:::steps
1. Open **Build**, then **Extensions**, and press **New trigger source**.
2. Type the **Path**, for example `sources/payments`.
3. Under **Settings**, choose what it is **handed**: **Each request to a webhook** or **Each tick of a schedule**. Set **Give up after (seconds)** (1 to 300, 30 to start), and under **Connections it uses**, **Secrets it reads** and **Variables it reads** name every one the code reads. The code reaches only what is named.
4. Write the code. A webhook source returns `{ accept: false, reason }`, `{ input }` or `{ inputs }`. A poll source returns `{ items, cursor }`. Return at most 100 inputs or items.
5. Press **Save draft**, then **Deploy** and **This change only**.
6. Name it. For a webhook source, open **Build**, **All resources**, **New**, **Trigger**. Under **It starts the script** choose **When its address is called**, choose **The script it starts**, set **Each request is checked** to **By a trigger source of your own**, and choose the source under **Trigger source**. For a poll source, open **New**, **Schedule**, set when it runs, and choose the source under **Trigger source (optional)**. Press **Save draft**, then deploy it.
:::

A trigger source is offered in these lists once it exists as a draft or deployed, and only if its mode fits: a webhook is offered the sources handed requests, a schedule the ones handed ticks.

## The result

The **Extensions** list shows the extension with the state **Deployed** and, for a trigger source, **Trigger source for a webhook** or **Trigger source for a schedule**. A connection of your connector shows **Reached** on **Connections** once **Test** passes. A trigger that names a trigger source appears on **Triggers**.

Nobody starts a trigger source by hand. It runs when a request reaches the webhook or the schedule ticks. A refusal is shown on **Triggers** as **Last refused**.

Deploy to a production workspace by promotion: after the toast, press **Promote to** the linked workspace.

## If it does not work

- **"Give the connector a path: lowercase letters, digits, hyphens and underscores, in folders. For example connectors/shop."** The path has a capital, a space or another character. Fix the path and save again.
- **"Something already exists at this path. Choose another, or open that one."** Another resource has the path. Choose another path.
- **"The schema is not valid JSON."** The schema field is not JSON. Fix it and save.
- **"<path> cannot be deployed alone"** with a line such as `connectors/shop.connector.ts:1 Code written in the console may import only @volvel/sdk and node: modules, not "lodash".` The code imports something else, or does not build. The same line is under the code in **Problems**. Put shared code and packages in the repository, or remove the import.
- **A trigger source or connector is not offered** when you choose a kind or a source. It must exist as a draft or be deployed, and for a trigger source its mode must fit what names it.
- **"Writing code in the console is turned off for this tenant."** Ask a tenant admin to turn on **Code in the console** under **Repository**.
- **The editor says "Someone else saved this connector after you opened it."** Choose **Copy what I wrote**, then **Load their version**.

For every field, see [the extension editor](../../reference/screens/build/extension-editor) and [Extensions](../../reference/screens/build/extensions).
