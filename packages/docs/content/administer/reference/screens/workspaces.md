---
title: Workspaces
topic: tenant-workspaces
description: "Every column, field, state and permission of the list of a tenant's workspaces and of the dialog that makes one."
subjects: [workspaces, promotion]
moved_from:
  - tenant/workspaces
---

A tenant's work is kept in workspaces. A workspace is either a **production** workspace, which runs what the tenant relies on and changes only by deploy or promotion, or a **dev** workspace, where changes are made and tried. This screen lists them and makes new ones.

The screen is under **Tenant**, **Workspaces**. F1 (**Help for this page**) opens the help topic `tenant-workspaces`. A workspace's name, its link, its limits and its time zone are changed on its own [Workspace settings](../../../console/reference/screens/configure/settings).

::screenshot{name=administer/workspaces alt="The Workspaces list with a column each for name, slug, type and the workspace it promotes to, and the button Create workspace."}

## The list

The description line says: "A workspace is a project or an environment. Each one is production or dev, decided when it is created."

| Column | What it shows |
| --- | --- |
| **Name** | The workspace's name, as a link to its overview. |
| **Slug** | The workspace's address, in code style. It never changes, even when the name does. |
| **Type** | A **Production** or **Dev** tag. |
| **Promotes to** | The name of the workspace a dev workspace promotes to, or nothing. A production workspace promotes nowhere. |

| State | What you see |
| --- | --- |
| Empty | "No workspaces yet": "Start with a production workspace. Add a dev workspace linked to it when you want somewhere safe to make changes." |
| Without `workspace:write` | A line "You can see this tenant's workspaces, not change them. It needs `workspace:write`." and who to ask. **Create workspace** is disabled. |
| Not loaded | The error state of the list, with a retry. |

## Create workspace

**Create workspace** opens a dialog that says "The type cannot be changed afterwards."

| Field | What it takes |
| --- | --- |
| **Name** | At most 200 characters. |
| **Slug** | Lowercase letters, digits and hyphens, with no hyphen at either end and none doubled, at most 63 characters. It is the workspace's address and does not change. A slug in use is refused with "That already exists."; a slug with other characters with "Use only lowercase letters, digits and hyphens." |
| **Type** | **Production** or **Dev**, chosen on purpose: it starts as "Choose…". It cannot be changed afterwards. |
| **Promotes to** | For a dev workspace: the workspace its changes go to, "production or another dev workspace". The choices are **Nothing** and every workspace of the tenant as "*name* (*type*)". A production workspace promotes nowhere, and a link that would lead back to the workspace itself is refused ("That link would lead back to this workspace."). |

When it works the dialog says "Workspace *name* is made." with **Open *name***. A new dev workspace starts with its triggers paused, so that a schedule tried in it does not run beside production's; a production workspace starts with them on. A dev workspace may promote to another dev workspace, for example one for review, which promotes to production. Each version moves one step at a time.

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `workspace:read` in the tenant. A person who holds a grant only on something inside a workspace sees its name, slug and type. |
| **Create workspace** | `workspace:write` |
| Clone, rename, pause triggers, change the link or the limits | `workspace:write`; see [Workspace settings](../../../console/reference/screens/configure/settings) |
| Delete a dev workspace | `workspace:write` |
| Delete a production workspace | `workspace_production:write`, which no wildcard grants: a role has it only when it lists it by name |

## Related

- [Make a workspace, clone it, or delete it](../../how-to/releases/make-a-workspace)
- [Workspace settings](../../../console/reference/screens/configure/settings)
- [How a change gets from a draft to production](../../../console/explanation/releases/how-changes-move)
