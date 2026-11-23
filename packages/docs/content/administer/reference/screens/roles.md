---
title: Roles
description: "Every control, state and permission of the Roles tab and of the permission picker: built-in roles, roles made here, and roles that come from a repository."
---

The **Roles** tab of **Members & access** lists the roles of the tenant. A role is a named set of permissions. It does nothing until it is given to a person, group or service account under [Access](access). The tab is reached from **Members & access**, then **Roles** (address `/roles`). Its description line reads "A role is a named set of permissions. Give a role to a person, a group or a service account under Access."

## The list

The filter **Show** has three choices, each with a count: **All roles**, **Made here** and **Built in**. It is kept in the address (`?show=`). The role whose inspector is open is kept too (`?role=`).

| Column | What it shows |
| --- | --- |
| **Role** | The role's name, with the tags **Built in**, **From repository** (a role a repository defines) and "In <workspace>" (a role a workspace's repository defines). |
| **What it is for** | The description. Hidden on a narrow window. |
| **Permissions** | "Reads everything" or "Reads N of M", then ", changes N" when it changes anything, or "Everything but what is given by name" for a role with `*:*`. Hover shows the permissions. Hidden on a narrow window. |

The built-in roles are listed with their permissions in [How access works](../../explanation/access/how-access-works).

### The role inspector

Choosing a row opens the inspector. Its heading says **Built-in role** or **Role**.

| Part | What it shows |
| --- | --- |
| Description | The role's description. |
| **Held by** | Who holds the role, by name. "Nobody holds it." when no one does. For a role you may change, it adds "It cannot be deleted while it is held. Remove its bindings in Members and access." The match is by the role's ID, so two roles with one name are told apart. |
| **In short** | One line for each area of permissions in words: "<Area>: changes <what>; reads <what>." or "Everything, everywhere it is given, except what is given by name." for `*:*`. "Nothing yet." for an empty role. |
| **Permissions** | Every permission the role holds, in code style. |
| **Change** or **View** | **View** for a built-in role, a role from a repository, or when you may not change roles. Otherwise **Change**. |
| **Delete** | Asks "The role <name> is deleted. Nobody holds it." It is disabled, with the tooltip "A role that is held cannot be deleted. Remove its bindings first.", while anyone holds the role. It is not offered for a built-in role or one from a repository. |

A role from a repository says in its sheet "This role comes from the tenant's repository and is changed there." (or "...a workspace's repository..."). A built-in role says "A built-in role cannot be changed. Create a role of your own to allow something else."

### Create role and Change

**Create role** (and **Change**, on a role you may change) open a sheet.

| Field | What it takes |
| --- | --- |
| **Name** | Only when making a role. Lowercase letters, digits and underscores, starting with a letter, 63 characters at most: "Lowercase letters, digits and underscores." The name cannot be changed afterwards. |
| **Description** | Optional, 500 characters at most. |
| **Permissions** | The picker, below. |

**Create role** (or **Save**) is disabled until at least one permission is ticked. When it works the notice says "The role <name> is made. Give it to people under Access." or "The role <name> is saved. Everyone who holds it has the new permissions." A name already in use, or a name that breaks the rule, is refused at the field.

### The permission picker

| Control | What it does |
| --- | --- |
| **Find a permission** | Narrows the rows by label, kind or area. "Nothing matches." when none do. |
| **Read everything** | Ticks every read permission, writing `*:read` into the role. |
| **Change everything** | Ticks every change permission, writing `*:write`. Both ticked is `*:*`. |
| Rows | One row for each kind of thing, grouped by area, with its label and kind. Two checkboxes, **Read** and **Change**, named by the permission (for example `table:write`). A dash with "Nothing checks this" means the kind has no such permission. The information control next to the label says what reading and changing allow. |
| "End users can hold it" | Shown beside a kind an end user, or anyone without signing in, may hold: script, run, flow run, table, data, all data, file, app and theme. |
| "Given only when ticked here: 'everything' does not include it" | Shown beside an explicit kind: `sql:read` and `workspace_production:write`. **Read everything** and `*:*` do not give it; it is held only when ticked by name. |

When a role lists a permission that nothing checks any more, the sheet shows "This role also lists permissions that nothing checks:" with each one and a remove control. A role keeps a permission it already holds even when the permission has been retired.

## States

| State | What you see |
| --- | --- |
| Empty | "No roles". |
| Not loaded | The list's error state, with a retry. |
| Read only | A line says what you can see and that `role:write` is needed. **Create role** is disabled and the inspector offers **View**. |
| Waits for approval | When [approval by a second person](access-changes) is on, making, changing or deleting a role is recorded as an access change and waits. The sheet closes and the screen says so in a notice. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a role | `role:read` |
| **Create role**, **Change**, **Delete** | `role:write` at the tenant |

A workspace admin has neither: it can give roles in its workspace, not make them. See [the permissions reference](../permissions).

## Related

- [Make a role](../../how-to/access/make-a-role).
- [How access works](../../explanation/access/how-access-works).
- [Define roles and bindings in code](../../../develop/how-to/access/define-roles-and-bindings-in-code).
