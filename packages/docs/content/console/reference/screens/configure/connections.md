---
title: Connections
topic: configure-connections
description: "Every control, state and permission of the Connections screen: the list, a connection's page, the sheet that sets one up, and connection groups."
subjects: [connections]
moved_from:
  - configure/connections
---

The **Connections** screen shows where each connection of one workspace points, and whether it was reached the last time it was tested. A connection is declared in code or in a draft: its name and its kind. What it points to, and its credential, are set here, in this workspace only. The same connection can point to one address in a dev workspace and to another in production. See [How a connection gets set up](../../../explanation/configure/how-a-connection-gets-set-up).

The screen is reached from **Configure**, then **Connections**. F1 (**Help for this page**) opens the help topic `configure-connections`. Under the list the screen shows **Connection groups**, described below.

::screenshot{name=console/configure-connections alt="The Connections screen: a table of connections with their health, what uses them, their kind and where they point, and the Connection groups section below it."}

## The list

The list has a description line, one button and a table.

| Control | What it does |
| --- | --- |
| **New connection** | Opens the sheet [below](#the-sheet) to set up a connection that nothing has set up yet, or to declare a new one. In a production workspace the button reads **Set up a connection**. |
| **Test** (row) | Has one of the workspace's workers try the connection and keeps what it found as the row's health. Shown for a connection that is set up here and, for an OAuth 2.0 connection, connected. |
| **Change** (row) | Opens the sheet with the connection's settings. A connection that is not set up here has **Set up** in its place. |
| **Remove from here** (row) | Asks "Remove X from here? Scripts that use it will fail until it is set up again.", then removes what was set up here: the address, the settings and the credential. The declaration stays. The question lists what uses the connection ("Used by 2: a and b."). |

In a production workspace a new connection cannot be declared: **Set up a connection** is for one that is declared and waits. When every connection is set up the button says, in a message, "Nothing waits to be set up here. A connection is declared in a dev workspace and arrives here with a promotion." and opens nothing.

The table has these columns.

| Column | What it shows |
| --- | --- |
| **Connection** | The name, as a link to the connection's page. Tags can follow it: **Arrives with the next promotion** (a linked dev workspace declares it and it is not deployed here yet; it has no page and its name is not a link), **Draft, never deployed** (declared in a draft only), **Draft** (a change waits to be deployed) and **Removing** (a draft removes it). |
| **Health** | What the last test found. See the states below. Empty for a connection that is not set up here. |
| **Used by** | Up to three scripts, flows and other things that use the connection, as links, then "and N more" linking to the connection's page. Connection groups and the workspace's default failure alert count (the alert is shown as a use by "settings"). |
| **Kind** | **HTTP**, **Mail (SMTP)**, **OAuth 2.0**, the path of a connector of your own, or **Not declared anywhere** for something set up here that no deployed resource, draft or arriving connection declares. |
| **Points to** | The connection's `baseUrl` or, for mail, its `host`. **Not set up here** when nothing is set. |

### States of Health

| Shown | Means |
| --- | --- |
| **Not tested** | Set up here and never tested, or changed since the last test. A test is forgotten when the settings, the credential or the connection changes. Saving the same settings keeps it. |
| **Reached** with "N ms · tested …" | The last test got an answer. |
| **Failed** with "tested …" and the reason in full under it | The last test did not get one. For an HTTP connection the reason is "HTTP 401: https://… answered 401." |
| **Not connected** with **Connect** | An OAuth 2.0 connection no one has signed in to the provider for. |
| **Needs reconnecting** with **Reconnect** | The provider refused to renew the sign-in, or something that identifies the authorization changed. Connect again. |

Health is what the last test found. Nothing tests a connection on a schedule, except that a refusal when an OAuth 2.0 connection renews its sign-in is written to it.

### States of the list

| State | What you see |
| --- | --- |
| Empty | "No connections yet", with "A connection is an external system a script talks to: an API, a mail server, an account at an OAuth provider. Set one up here before deploying the bundle that uses it." and the same button. |
| Loading | A loading line. |
| Not loaded | The reason in a notice, with **Try again**. |
| Read only | "You can see this workspace's connections, not change it. It needs `connection:write`." with whom to ask. There is no **New connection**, and the buttons of the rows are off. |
| Not allowed to read | A page that says "This needs the workspace:read permission." and whom to ask, for a person without `workspace:read`. |

The list reads its address for these values:

- `?setup=<path>` or `?item=<path>` opens the sheet of that connection. A refused deploy or promotion links here with `?setup=`. A path with no connection says "There is no connection X here to set up."
- `?oauth=connected` or `?oauth_error=…` with `&connection=<path>` is where the sign-in with a provider returns. The sheet of the connection opens with what the provider said, for example "The provider said no: access_denied." in part 4. The connection stays **Not connected yet**.

The navigation item shows a badge, "N not set up", while connections wait. The workspace's **Overview** says "N connection is not set up here" or "N connections are not set up here", with a link to **Configure**.

## A connection's page

A page opens from the name in the list. Its title is the connection's name. Under the title:

| Control | What it does |
| --- | --- |
| **Set up here** or **Not set up here** | A state mark, with the health beside it as in the list (including **Connect** and **Reconnect**). |
| **Test** | As in the list. Shown for a connection that is set up here, and connected if it is OAuth 2.0. Needs `run:read` too. |
| **Change where it points** | Opens the sheet. **Set up** for a connection that is not set up here. |
| **Remove from here** | The same question as in the list. |

The meta shows **Kind**, **What it is for** (the connection's description), **Credential** (**Set** or **None**), **Declared** (**Deployed**, **In a draft, never deployed** or **Only set up here**), **Connected** (the time an OAuth 2.0 connection was signed in), **Last changed**, and **Last check** (only while the last test failed, with the reason).

Two tabs follow. **Used by** lists everything that uses the connection, drafts included, each with how it uses it ("calls it"). **Where it points** shows the settings as JSON, with a **Copy** button, or "Not set up in this workspace yet." The credential is never in it. A connection with no page says "Go to the connections" instead.

## The sheet

The sheet is titled **New connection** or, for a connection that exists, **Set up X**. Its description is "What is set here applies to this workspace only: dev and production can point to different places." It has four parts. **Close** leaves; the button at the foot is **Save**, then **Save again**.

| Part | What it holds |
| --- | --- |
| **1 · What it is** | For a connection that exists: its name, kind and description. For a new one: **Connection**, a list of what is declared and not set up yet, and, outside production, **A new connection…**. A new connection has **Name** ("What scripts call it by.") and **Kind** (**HTTP**, **Mail (SMTP)**, **OAuth 2.0**, or a connector of your own, listed as "<path> (this workspace's own)"). A name takes lowercase letters, digits, dashes, underscores and slashes: "Name it with lowercase letters, digits, dashes and underscores, such as crm or google/sheets." |
| **2 · Settings** | A form drawn from the kind's settings. **Fields** shows one input for each; **JSON** shows them as JSON. The fields of each kind are in [Connectors](../../../../develop/reference/connectors). |
| **3 · Token or key**, **Password**, **Client secret** or **Secret** | The credential, named for the kind. |
| **4 · Save and test** or **Connect and test** | What saving did, and the test. |

An OAuth 2.0 connection adds **Provider** (**Google**, **Microsoft** or **Another provider**), **Directory (tenant)** for Microsoft (its ID or domain, or `common` for any account), and **Redirect address** with **Copy**. The provider fills in the addresses and scopes. The redirect address is `<instance address>/api/v1/oauth/connections/callback`; add it to the app you register with the provider, which gives you the client ID and secret.

The credential is never shown. With one stored, the part shows "Stored · set … by …" with **Replace** and **Remove**. **Replace** opens a field labeled "New …" and **Keep the stored one**. **Remove** says "The stored … will be removed when you save." with **Keep the stored one**. If you change the address so that its origin, its host, its port or its token address differs, and type nothing new, a notice says "The address changed. Saving removes the stored …, which was given for the old one: enter it again to keep using this connection." A change of path under the same origin keeps the credential.

Part 4 shows what happened, once the connection is saved:

| Shown | Means |
| --- | --- |
| **Saved** | The settings and credential are stored in this workspace. |
| **Connected**, **Not connected yet**, **Needs connecting again** (OAuth 2.0) | Whether a member has signed in to the provider. **Connected** shows the scopes the provider gave. **Connect** or **Connect again** sends the browser to the provider. |
| **Testing…**, then **Waiting for a worker…** after 20 seconds | A worker is trying the connection. A test waits up to 2 minutes for a worker, then fails with "No worker took it in time. Start a worker for this workspace, or let the instance start one." |
| **Reached (200) in 55 ms.** | The test succeeded. An HTTP connection is reached when its base address answers with any status, such as "Reached (404) in 55 ms.": the service answered, and many services answer nothing at their base while every path works. A mail connection has no status: "Reached in 6 ms." |
| **Failed (HTTP 401): …** or **Failed: …** | The test failed, with the reason. An HTTP connection fails with 401, 403 or 407, which the service gave to the credential. For anything but OAuth 2.0 a button, **Change the token or key** (or the credential's name), takes you to the credential. |
| **Not tested** with **Test** | Saved, not tested. A non-OAuth connection is tested as it is saved. An OAuth 2.0 connection is tested when the provider sends you back. **Test** is off until it is connected. |

A new connection is first declared in a draft and then set up. It shows **Draft, never deployed** until a deploy carries it.

## Connection groups

Under the list the screen shows **Connection groups**: "A group holds many connections of one kind, and a script picks one by its key when it runs. Add a member for each customer or account. It is used from the next run, with no deploy." A group is declared in a `<path>.connection_group.yaml` file, or in code with `defineConnectionGroup`. Its members, and their credentials, are added here.

| Control | What it does |
| --- | --- |
| **Add a member** | Opens the sheet **Add a member**, described "To <group>. It is used from the next run, with no deploy." |
| **Open the draft** | For a group that is a draft and never deployed: opens its editor. No member can be added until a deploy. |
| **Change** (row) | Opens **Change <key>** with what the member holds. |
| **Remove** (row) | Asks "Remove?" with `Scripts that ask <group> for "<key>" will fail until it is added again.` |

The columns are **Key**, **Name**, **Points to** (`baseUrl`, `host` or `url`) and **Credential** (**Set** or **None**).

The member sheet has **Key** ("What a script asks for: a customer's ID, a region, a shop's name."; it cannot change once the member exists: "Add another member to use a new one."), **Name**, the group's own settings form, and **Credential**. A key starts with a letter or digit, has up to 100 characters from letters, digits, dots, dashes and underscores. A name has up to 200. Adding a member with a key that exists replaces it. An empty key is refused: "Give the member a key: what a script asks for." The credential can be replaced; it cannot be removed. Moving the member to another address without typing the credential again removes the stored one, and the sheet says so.

| State | What you see |
| --- | --- |
| No groups | "No groups here. A group is declared in the workspace's code with the connection kind it holds; once deployed, its members are added here." |
| No members | "No members yet. A script that asks this group for a key will fail until one is added." |
| **Draft, never deployed**, **Draft**, **Removing** | As for connections. |
| **Not declared** | No resource or draft declares the group any more. The members that were left show "Remove them, or declare the group again as the kind they are." Each has **Remove**, none has **Change**, and there is no **Add a member**. |

A group holds a connection kind of `http`, `smtp` or your own. It cannot hold `oauth2`.

## Permissions

The console asks the instance which of these you hold, and turns off what you do not.

| Action | Needs |
| --- | --- |
| See the list, a connection's page and the groups | `connection:read` |
| Set up, change or remove a connection, **Connect**, **Reconnect**, add, change or remove a group member | `connection:write` |
| Declare a new connection (**New connection** with **A new connection…**) | `connection:write` and `resource:write`, in a workspace that is not production |
| **Test** | `connection:write`, and `run:read` for the button to show |
| Set up what arrives with a promotion (production) | `connection:write` |

A Developer has `connection:write`, `resource:write` and `run:write` and every `:read`. A Workspace admin has `connection:*` and `resource:*`. A Viewer has every `:read` only. See [Who can change what in Configure](../../../../administer/reference/configure/who-can-change-what).

For a person who may only read, **Add a member**, **Change** and **Remove** of a group are turned off, with the reason and a line above them.

## Related

- [Set up a connection](../../../how-to/configure/set-up-a-connection) for the steps.
- [Variables](variables), [Secrets](secrets), [Alerts](alerts) and [Workspace settings](settings).
- [Connections in scripts](../../../../develop/reference/configure/connections-in-scripts) for `uses` and `ctx.connection`.
