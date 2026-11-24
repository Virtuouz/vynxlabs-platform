---
title: How a connection gets set up
description: "Why code declares a name and a kind while each workspace sets the address, credential and value, and what that means for a deploy, a promotion, a clone and a test."
subjects: [connections, variables, secrets, workspaces]
---

A script that calls an API needs three things the code should not hold: where the API is, how to sign in to it, and numbers that differ from one place to the next. Volvel keeps these out of the repository. The code says what it needs. Each workspace says what that is, there.

## The idea

Code declares a **name and a kind**. A connection called `stock-orders` of kind HTTP says "a script talks to an HTTP API and calls it this". A variable called `stock/reorder-quantity` says "a script reads a number here", and may give a default. A script lists, under `uses`, which of them it reads, and the names of the secrets it reads.

A workspace sets **the rest**: the address and the credential of a connection, the value of a variable, the value of a secret. The same code runs in a dev workspace and a production workspace and reaches two different systems. A test of a new supplier can point at a sandbox address while production keeps the real one. Nothing in a bundle changes when an address does, so a changed address is not a deploy.

A secret is the one thing code cannot declare. A script names the secret it reads, and the value is set in the workspace.

Because the value belongs to the workspace, it does not travel with the code. A promotion sends the same bundle to the linked workspace. It does not send addresses, credentials, secrets or variable values. Each workspace holds its own.

## What a deploy checks

A deploy looks at what the bundle's code reads and at what the workspace has set.

- To a **dev workspace**, a deploy goes ahead. It says what is missing as a note: `the connection "stock-orders" is not set up in this workspace`. A run that reaches the missing thing fails with the same words.
- To a **production workspace**, and for a **promotion** of any workspace, it refuses with `bindings_missing`: "The workspace is missing something this bundle needs. Set up each one, then deploy again." The refusal lists each one with a link, **Set up**, to the screen that sets it.

What is checked is what code needs: the connections, secrets and variables each script lists, the connections its `onFailure.notify` posts to, what each trigger source lists, the secret a webhook's `verify` is checked against, the data sources a script lists, and the connections a flow step hands to its script. A variable with a default in the code needs no value. A connection group needs nothing: its members are added when they are wanted, with no deploy. A second check, `bindings_invalid`, refuses a deploy to any workspace when something set up does not fit the connector the new bundle gives it, for example a connection set up for one kind and now declared as another.

## Why production waits for a promotion

A connection is declared in a dev workspace, where its name and kind are made. In production there is nothing to declare: **Connections** shows the connection as **Arrives with the next promotion**, with its name in code style and no page of its own. You can set it up in production before the promotion, from its row or from the refusal. That is how a first promotion goes: promote, read what is missing, set it up, promote again. A new connection cannot be started in production, because it would have no declaration to be set up against: "Nothing waits to be set up here. A connection is declared in a dev workspace and arrives here with a promotion."

## Reading a value

A script is pinned to the bundle it started with, and `uses` comes from that bundle. What a script reads is read **live**: if you change a variable's value, replace a secret or change where a connection points, the next read gets the new one. A run in progress that has already read a value keeps it. Group members work the same way, so a new member is available from the next run without a deploy.

A connection's client is made on a worker. The address in the connection is reached **from the worker**, so `localhost` is the worker's. What a worker may reach is the worker host's firewall, not Volvel's: without `WORKER_EGRESS_ALLOW`, a script reaches no private, loopback or link-local address. The instance's own reach, for an OAuth token address, an identity provider, Git or a data source, is `EGRESS_ALLOW`. See [Settings](../../../self-host/reference/settings).

A **Test** also runs on a worker, one that could run a script using the connection, so it speaks for the network a script would. It waits up to 2 minutes for one.

## OAuth 2.0 connections

An OAuth 2.0 connection is set up in two parts. Settings and the client secret are saved as for any connection. Then a member signs in at the provider, and the provider sends the browser back to the instance's one redirect address, `<instance address>/api/v1/oauth/connections/callback`. The sign-in uses the authorization code flow with PKCE (S256). The member who started it has 10 minutes to finish it, and the same signed-in member must.

The tokens are kept sealed. The access token is renewed 2 minutes before it ends, once at a time for a connection. A worker is given the access token and the settings, never the refresh token and never the client secret. If the provider refuses the renewal, the connection reads **Needs reconnecting** and a member connects it again. Changing the authorization address, the token address, the client ID or the scopes forgets the tokens, because they were given for something else.

## What a change takes with it

- **Another address.** A credential given for one origin is not sent to another. If a change of settings moves a connection to a different origin (or host, port or token address) and no new credential is typed, saving removes the stored one. The sheet says so first. A change of path under the same origin keeps it.
- **A rename.** A connection renamed in code keeps what was set up, its group members, and its place in the workspace's default alert. Credentials are sealed under the row, not under the name, so a rename, a promotion or a clone does not make one unreadable. A secret is not renamed: make a new one.
- **A clone.** A clone always has the variable values. With **Safety** on it has no connection, data source, group member or secret value. With it off it has this workspace's, sealed again for the copy; an OAuth 2.0 connection is copied without its tokens. See [Workspace settings](../../reference/screens/configure/settings).
- **Remove from here.** It takes the settings and the credential from this workspace. The declaration stays. A script that uses it fails until it is set up again.

## Related

- [Set up a connection](../../how-to/configure/set-up-a-connection) and the screens under [Configure](../../reference/screens/configure/).
- [How secrets and credentials are kept](../../../administer/explanation/configure/how-secrets-are-kept).
- [Connections, secrets and variables in code](../../../develop/reference/configure/connections-in-scripts).
