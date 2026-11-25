---
title: Set up a connection
description: "Point a connection at a system in one workspace, give it its credential, and have a worker test it."
subjects: [connections]
---

## Set up a connection

By the end you will have a connection that points at a system, holds its credential, and has been reached by one of the workspace's workers. It takes about five minutes.

## Before you start

- You are signed in to the console and a dev workspace is open, such as Fernhill's **Sandbox**. Declaring a new connection needs `connection:write` and `resource:write`. A Developer and a Workspace admin have both. See [Who can change what in Configure](../../../administer/reference/configure/who-can-change-what).
- You know the system's address and its credential. This page uses Fernhill's stand-in for its supplier: the address `http://127.0.0.1:4020`, the token `vs_demo_51be22`. Start it from `examples/fernhill` with `pnpm stand-ins`.
- The workspace has a worker to run the test. An instance can start one for a workspace; if none starts, the test waits and then fails, see below.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

A connection set up in a production workspace is different: a new one cannot be declared there. See "In a production workspace" below.

## Set up an HTTP connection

:::steps
1. Open **Configure**, then **Connections**. The list shows what the workspace has set up and what is declared and waits.
2. Press **New connection**. A sheet opens with **A new connection…** chosen in **Connection**.
3. Under **1 · What it is**, type `stock-prices` as the **Name**. Keep **Kind** as **HTTP**. A name takes lowercase letters, digits, dashes, underscores and slashes.
4. Under **2 · Settings**, type `http://127.0.0.1:4020` as the **Address**. Under **How the credential is sent**, choose **Authorization: Bearer**. The sheet's **Fields** tab shows one input for each setting; **JSON** shows them as JSON.
5. Under **3 · Token or key**, type `vs_demo_51be22`. Leave it empty for an API that needs none.
6. Press **Save**. Part 4, **Save and test**, shows **Saved**, then **Testing…**, then **Reached (200)** with the time it took. The credential now shows "Stored" with **Replace** and **Remove**, and is never shown again.
7. Press **Close**. The row **stock-prices** shows **Reached**, the kind **HTTP**, the address under **Points to**, and the tag **Draft, never deployed**. **Used by** says "Nothing deployed uses it".
8. A new connection is declared in a draft. Open **Operate**, then **Deploy**, and press **Deploy 1 change**. The tag goes away when the version is deployed.
:::

::screenshot{name=console/configure-connection-sheet alt="The sheet of the HTTP connection stock-prices after Save: its address, the stored token with Replace and Remove, and under Save and test the results Saved and a passed test."}

## The result

The workspace has a connection called `stock-prices`. A script that lists it under `connections` can call `ctx.connection("stock-prices")` and get a client for `http://127.0.0.1:4020`. See [Connections in scripts](../../../develop/reference/configure/connections-in-scripts). The address and the token are set in this workspace only. A production workspace has its own.

The test is kept as the row's **Health**: **Reached**, with how long ago. It is forgotten when you change the settings or the credential, and the row reads **Not tested** until you press **Test**.

## Other kinds

**Mail (SMTP).** The settings are **Mail server**, **Port** (587 when empty), **Security** (**starttls**, **tls** or **none**; port 465 expects `tls`), **Sent from** and **User name**. The credential is **Password**. **Test** connects to the server and signs in. It sends no mail.

**OAuth 2.0.** Choose a **Provider**: **Google**, **Microsoft** or **Another provider**. A provider fills in the addresses and scopes. Register an app with the provider, add the **Redirect address** the sheet shows (use **Copy**) to it, and type the app's **Client ID** in the settings and its secret as the **Client secret**. Press **Save**, then **Connect**. The provider asks you to agree and sends you back to the console, which tests the connection and shows **Connected**. If the provider refuses, part 4 says so, for example "The provider said no: access_denied." The fields are in [Connectors](../../../develop/reference/connectors).

## Change or remove a connection

Press **Change** on the row, or **Change where it points** on the connection's page. The sheet is titled **Set up stock-prices** and holds what is set. Change what you need and press **Save again**. If you change the address so that its origin differs, and type no new credential, a notice says "The address changed. Saving removes the stored token or key, which was given for the old one: enter it again to keep using this connection." Press **Remove from here** to take the settings and the credential out of this workspace. The declaration stays, and scripts that use the connection fail until it is set up again.

## In a production workspace

A connection is declared in a dev workspace and arrives in production with a promotion. The promotion refuses until each connection it needs is set up in production, and lists them, each with **Set up**. In **Connections** a connection that is declared and not deployed here shows **Arrives with the next promotion** and **Not set up here**. Press **Set up** on its row. Or press **Set up a connection**: the sheet opens with the waiting connection chosen in **Connection**. Its name and kind are already decided. Give its settings and credential as in steps 4 to 6 above.

## If it does not work

- **"Failed (HTTP 404)".** The test asks for the address itself, and only a 2xx or 3xx answer counts as reached. An API with nothing at its base address answers 404 even though its paths work: set **Test path** to a path it answers, such as `/health`, and press **Test** again. 401, 403 and 407 mean the credentials were refused.
- **"Failed (HTTP 401)"** or another refusal. The system did not accept the credential. Press **Change the token or key** and type it again.
- **"No worker took it in time. Start a worker for this workspace, or let the instance start one."** A test waits 2 minutes for a worker. The button says **Waiting for a worker…** after 20 seconds.
- **"Name it with lowercase letters, digits, dashes and underscores, such as crm or google/sheets."** The name has a capital letter, a space or another character.
- **"Something already exists at this path. Choose another, or open that one."** The workspace has a connection or another resource with that name.
- **There is no New connection button.** You lack `connection:write`, or `resource:write` in a dev workspace. The list says "You can see this workspace's connections, not change it."
- **A connection of your own kind is not in Kind.** **Kind** offers HTTP, Mail (SMTP), OAuth 2.0 and each connector of the workspace, labeled "(this workspace's own)". Declare your own connector first; then it is listed.
