---
title: Secrets
topic: configure-secrets
description: "Every control, state and permission of the Secrets screen and of a secret's page: making a secret, replacing its value, deleting it, and what is never shown."
subjects: [secrets]
moved_from:
  - configure/secrets
---

A secret is a value a script or a trigger source reads, such as an API key or the key that signs a webhook, kept encrypted in one workspace. You write it once and can replace it. No screen, API call or command shows it again.

A secret is not a resource. Code cannot declare one: there is no `defineSecret` and no secret file. A script lists the names it reads in `secrets`, and a webhook's `verify.secret` names the one it checks a signature against. The value is set here, or through the API (see [Set up a workspace from a script](../../../../develop/how-to/configure/set-up-from-a-script)). A secret belongs to one workspace: a dev workspace and a production workspace hold their own.

The screen is reached from **Configure**, then **Secrets**. F1 (**Help for this page**) opens the help topic `configure-secrets`.

::screenshot{name=console/configure-secrets alt="The Secrets screen: a table with each secret's name, what uses it, and when and by whom it was last set, with a Delete button in each row."}

## The list

The list's description is "Values are encrypted with this tenant's own key. A value can be replaced but never read back here." It has a **New secret** button and a table.

| Column | What it shows |
| --- | --- |
| **Name** | The secret's name, as a link to its page. |
| **Used by** | Up to three scripts and trigger sources that declare it, then "and N more" linking to the page. "Nothing deployed uses it", "Could not be read" or "Reading…" when there is nothing to say. |
| **Last set** | When the value was last set, and by whom. |

### Controls

| Control | What it does |
| --- | --- |
| **New secret** | Opens a dialog, "A name already in use is refused. To change a secret's value, open it and replace it.", with **Name** (hint "Letters, digits and underscores."; for example `STRIPE_API_KEY`) and **Value** (hidden as it is typed), **Cancel** and **New secret**. A message follows: "The secret X is made. Name it in a script's uses to read it." with **Open X**. |
| **Delete** (row) | Asks "Delete the secret X? Anything that uses it will fail." and lists what uses it ("Used by 1: stock/reorder."). It deletes the secret and its value. Nothing deployed is changed: a run that reads it fails until a secret of that name is made again. |

A name starts with a letter or an underscore, has letters, digits and underscores, and is at most 127 characters. A value is 1 to 65,536 characters. A name in use is refused: "A secret named X is already here. Replace its value from its page." The address `?setup=<name>` opens **New secret** with the name filled in; a refused deploy links here that way.

### States of the list

| State | What you see |
| --- | --- |
| Empty | "No secrets yet", with "Store API keys and passwords here. Resources refer to a secret by its name." and **New secret**. |
| Loading | A loading line. |
| Not loaded | The reason in a notice, with **Try again**. |
| Read only | "You can see this workspace's secrets, not change it. It needs `secret:write`." and whom to ask. **New secret** is off with the tooltip "It needs secret:write." and so is **Delete**. |

## A secret's page

The page opens from the name in the list. Its title is the name. The meta shows **Value**, "Encrypted. It can be replaced, never read back here.", and **Last set**, with who set it.

| Tab | What it holds |
| --- | --- |
| **Value** | A field **Value** with "Stored · set … by …" and **Replace**, and "Stored encrypted. It is never shown." **Replace** opens a field **New value** and **Keep the stored one**. Once something is typed, **Replace the value** appears. The message afterward is "Replaced the value of X. What uses it reads the new value from its next run." Without `secret:write` the tab says "Replacing the value needs the secret:write permission: ask an administrator of this workspace." |
| **Used by** | Everything that declares the secret, drafts included, each with how it uses it. |

A name that is not a secret here shows a page that says so, with "Go to the secrets".

## What is not there

- A secret has no versions, no history, no rollback and no expiry. **Replace** overwrites.
- A secret cannot be renamed. Make a new one, change what reads it, and delete the old one.
- There is no way to read a value back, for anyone. A run reads the secrets its script declares, and a webhook's signature is checked against its secret. A clone of the workspace with **Safety** off copies the values (see [Workspace settings](settings)).
- A secret is not carried by a promotion. A production workspace holds its own.

## Audit

Making, replacing and deleting a secret are written to the audit log as `secret.created`, `secret.updated` and `secret.deleted`, with the name and who did it. The value is not recorded.

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a secret's page: its name, who set it and when | `secret:read` |
| **New secret**, **Replace the value**, **Delete** | `secret:write` |

A Developer and a Workspace admin have `secret:write`. A Viewer has `secret:read`. See [Who can change what in Configure](../../../../administer/reference/configure/who-can-change-what). How values are kept is in [How secrets and credentials are kept](../../../../administer/explanation/configure/how-secrets-are-kept).

## Related

- [Connections](connections): a connection's credential is its own, set in the connection's sheet, not a secret.
- [Variables](variables): a setting that is not secret.
- [Connections in scripts](../../../../develop/reference/configure/connections-in-scripts) for `secrets` and `ctx.secret`.
