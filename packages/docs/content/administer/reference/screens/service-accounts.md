---
title: Service accounts
topic: tenant-service-accounts
description: "Every control, state and permission of the Service accounts list and of a service account's page: Identity, Keys, Access and Agent tools."
moved_from:
  - tenant/service-accounts
---

A service account is an identity for a program: a deploy pipeline, another system, an agent. It signs in with an API key and holds only the roles it is given. The nav item **Service accounts** lists them. Its description line reads "Identities for machines: a deploy pipeline, another system. They sign in with an API key." F1 (**Help for this page**) opens the topic `tenant-service-accounts`.

A key of a service account is refused on the routes that are about a person's own account, such as changing a password or listing one's own sessions. It is accepted on `GET /me` and on the batch route.

## The list

| Column | What it shows |
| --- | --- |
| **Name** | The name, as a link to the account's page. On a narrow window the description is shown under it. |
| **What it is for** | The description, or "Not said". Hidden on a narrow window. |
| **Created** | How long ago. Hidden on a narrow window. |

**Create service account** asks for **Name** (for example `ci`) and **What it is for** (optional, for example "Deploys from CI"). The page of the new account opens on **Keys** with the notice "<name> is made. Give it a key, then access." Empty: "No service accounts yet", "Create one for each system that calls this tenant, so each can be given only what it needs."

## A service account's page

The page's title is the account's name, with its description ("What it is for is not said." when empty) and when it was made. **Delete** asks "Delete <name>? Its keys stop working at once." and removes the account, its keys and the bindings made by hand. It has four tabs.

### Identity

Shows the account's **Key** (the key code and repositories name it by, which never changes) and **Created**, and two fields: **Name** ("What people see. Its key, which code and repositories name it by, never changes, and access given to it and its keys are not touched.") and **What it is for** ("A sentence, so whoever finds its key later knows what breaks if it is revoked."). **Save** is on while one has changed.

### Keys

"A key acts as the service account, with the access the account has been given."

**Create API key** asks for a **Name** (for example "Deploy pipeline") and **Expires**: **Never**, **In 30 days**, **In 90 days** or **In a year**. The hint says "After this the key stops working, and you make a new one." The key is shown once, in a dialog with a copy control. Volvel keeps only a hash of it: a lost key is made again. A key starts with `vxk_`.

| Column | What it shows |
| --- | --- |
| **Name** | The key's name. |
| **Key** | Its first characters and its last four. A key made before the last four were kept shows only the first characters. |
| **Last used** | How long ago, or "Never". |
| **Expires** | How far off, or "Never". |
| **Status** | **Active**, **Expired** or **Revoked**. |

**Revoke** asks "Revoke the key "<name>"?" and ends the key at once. It is not offered for a key already revoked. Empty: "No keys yet".

There is no rotate action and no scope for a key: a key holds what the account holds. To rotate, make a new key, switch the program to it, then revoke the old one. See [Make a service account and a key](../../how-to/access/make-a-service-account-and-key).

### Access

"Everything this account may do in the tenant, where, and what gives it." It is the same view as a member's **View access** (see [Members and access](members)): the sources, **Find or check a permission** and the permissions by area. **Give access** opens the [Give access](access) sheet with the account already chosen. Both **Give access** and the **Remove** of a binding are disabled without `binding:write`.

### Agent tools

"An agent that speaks the Model Context Protocol can connect to a workspace with one of this account's keys. It is offered the scripts and flows the account may start, and nothing the account may not do."

| Control | What it does |
| --- | --- |
| **In the workspace** | Chooses the workspace, by name and "dev" or "production". The choice is in the address (`?item=`). |
| **Address for the agent**, **Copy the address** | The address of the workspace's MCP endpoint. |
| **Copy the settings** | Copies a JSON object `mcpServers` with one server named `volvel`, of type `http`, with the address and the header `Authorization: Bearer <one of this account's API keys>`. Put a key of the account in place of the placeholder. |
| Notice | "An agent would be refused here: the account has no place in this workspace. Offer it a script or flow from that script's or flow's page, or give it a role here under Access." |
| **Tools offered** | **Tool**, **What it does**, **It takes** (an argument that is not required ends with `?`; "Nothing" for none) and a button **Try** for each tool. Empty: "No tools. The account may start no script or flow here. Bind it to a role that may, in this workspace or on one script or flow." |
| **Try** | Opens "Try <tool>": "The call is made as this account, with only what it may do. It is real: a script runs and a flow starts, with whatever effects they have. You are recorded as the one who asked." **Call it** shows the answer as "The agent would be told this." or "The agent would be told this failed." with **Try again** and **Done**. |

See [Let an agent run a script](../../how-to/access/let-an-agent-run-a-script) and the [MCP reference](../../../develop/reference/access/mcp).

## States

| State | What you see |
| --- | --- |
| Not found | "Go to the service accounts" if the address names an account that is not in the tenant. |
| Read only | A line says what you can see and that `service_account:write` is needed. **Create service account**, **Delete**, **Create API key**, **Revoke** and **Save** are disabled. |
| Not loaded | The error state with a retry. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list, an account and its keys | `service_account:read` |
| Create, rename, delete, make or revoke a key | `service_account:write` |
| **Give access**, remove a binding | `binding:write` |
| See **Access** | `binding:read` |

A service account cannot approve or decline an access change. See [Access changes](access-changes).

## Related

- [Make a service account and a key](../../how-to/access/make-a-service-account-and-key).
- [Let an agent run a script](../../how-to/access/let-an-agent-run-a-script).
- [Your account](../../../console/reference/screens/account/account): a person's own keys.
