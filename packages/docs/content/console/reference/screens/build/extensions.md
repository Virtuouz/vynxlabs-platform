---
title: Extensions
topic: build-extensions
description: "Every control, state and permission of the Extensions screen, which lists the connectors and trigger sources a workspace has of its own."
subjects: [extensions, connectors]
moved_from:
  - build/extensions
---

The **Extensions** screen lists the code a workspace has to reach outside systems that Volvel does not know. Two kinds of resource are listed:

- A **connector** says how a kind of connection reaches an outside system. A connection that names it gets the client the connector builds.
- A **trigger source** stands between the outside and what a trigger starts. A webhook or a schedule names it.

HTTP, mail and OAuth 2.0 connections come with Volvel and need no connector. The screen lists only what the workspace wrote itself or got from its repository. For what an extension is and when to write one, see [What an extension is](../../../../develop/explanation/extensions/what-an-extension-is). To write one, see [Write a connector or a trigger source in the console](../../../how-to/extensions/write-an-extension).

The screen is reached from **Build**, then **Extensions**. F1 (**Help for this page**) opens the help topic `build-extensions`. The address is the workspace's `/extensions`.

::screenshot{name=console/extensions-list alt="The Extensions screen in a dev workspace: a connector and a trigger source for a webhook, each with its description and the state Deployed, with New trigger source and New connector above the list."}

## Controls

The screen has a title, **Extensions**, and a description line: "Connectors and trigger sources of this workspace's own. A connector says how a kind of connection reaches an outside system. A trigger source stands between the outside and what a trigger starts."

| Control | What it does |
| --- | --- |
| **New connector** | Opens the [extension editor](extension-editor) on a new connector. The primary button. Shown in a dev workspace only. |
| **New trigger source** | Opens the editor on a new trigger source. Shown in a dev workspace only. |
| A row's path | A link, in code type, to the editor for that extension. |

The buttons are shown to everyone who sees the screen in a dev workspace. What a person may do when they press one is decided when the draft is saved: see Permissions.

## The list

The list is a table named **Extensions**, sorted by path. It holds both kinds together.

| Column | What it shows |
| --- | --- |
| **Extension** | The path, as a link to the editor. |
| **What it is** | **Connector**, **Trigger source for a webhook** or **Trigger source for a schedule**. A trigger source whose mode is `poll` is a trigger source for a schedule. |
| **What it does** | The extension's description. Empty when it has none. |
| **State** | **Deployed**, **Draft** or **From the repository**. |

A row for a draft reads the draft itself, not what is deployed under the same path: after you change a trigger source's mode in a draft, the row says what the draft is. Until the draft is read, a draft trigger source says only **Trigger source**.

## States

| State | What it means |
| --- | --- |
| **Deployed** | The extension was made in the console and is deployed. |
| **Draft** | There is a draft of it, or it exists only as a draft and has never been deployed. A draft that removes a deployed extension is not shown as a draft; the row keeps the state it had. |
| **From the repository** | The tenant's repository defines it. The console shows its source and does not change it. |
| Loading | The screen shows a loading mark until both the resources and the drafts are read. |
| Failed | A red notice shows the server's message above the list. |
| Empty | **No extensions yet**: "HTTP and mail connections need none. Write a connector when an outside system wants more than an address and a key, and a trigger source when a sender signs its requests in a way of its own, or has to be asked what is new." |

In a production workspace the two buttons are not shown. Opening a row there shows its code read-only, with the notice "This is a production workspace. Connector is changed in" the dev workspace "and reaches production by promotion." (For a trigger source, **Trigger source** starts the sentence.) Extensions reach production when a version is promoted.

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `resource:read` in the workspace, to read the resources and the drafts. |
| Save a draft of a connector or a trigger source | `resource:write` and `code:write`, in a dev workspace, and the tenant's switch **Code in the console** on. |
| Deploy one | `deployment:write` and `code:write`. |
| Turn **Code in the console** on or off | `tenant:write` (a tenant admin or an operator), under **Repository** on the tenant's page. |

With the switch off, a save or a deploy of code is refused with "Writing code in the console is turned off for this tenant. Code is deployed from its repository. Someone who may change the tenant can turn it on under Repository." What is already deployed keeps running. See the [permissions reference](../../../../administer/reference/permissions) and [Repository](../../../../administer/reference/screens/repository).

## Related

- [The extension editor](extension-editor): every field and control of the editor.
- [Connections](../configure/connections): where a connection that uses a connector is set up and tested.
- [Triggers](../operate/triggers): where a refusal by a trigger source is shown, as **Last refused**.
- [Flow steps from code](../../../../develop/how-to/extensions/flow-steps-from-code): a script as a step.
