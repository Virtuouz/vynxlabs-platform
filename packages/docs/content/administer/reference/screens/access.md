---
title: Access
description: "Every control, state and permission of the Access tab and the Give access sheet: who holds which role, where, and how to give or remove one."
---

The **Access** tab of **Members & access** lists every binding of the tenant: who holds which role, and where. A binding gives one role to one person, group, service account or end user at one place. The tab is reached from **Members & access**, then **Access** (address `/access`). Its description line reads "Who holds which role, and where. Access given at the tenant applies to every workspace in it."

The same bindings can be given from where the thing is: the **Share** dialog of an app, **Offer to an agent…** on a script or flow, a service account's **Access** tab, and a workspace's **Settings**, **Access**.

::screenshot{name=administer/access-list alt="The Access tab: filter buttons for Everyone, Members, Groups, Service accounts and End users, and a table of who holds which role and where."}

## The list

The filter **Show** has five choices, each with a count: **Everyone**, **Members**, **Groups**, **Service accounts** and **End users** (it holds end users, every end user and groups of end users). Anyone without signing in is listed under **Everyone** only.

| Column | What it shows |
| --- | --- |
| **Who** | The name, with the kind under it: **Member**, **Group**, **Service account**, **End user**, **Every end user**, **End-user group** or **Anyone**. |
| **Role** | The role's name. |
| **Where** | **Whole tenant**, a workspace's name, or for one thing a link to it ("Script `path` in <workspace>"). Hidden on a narrow window. |
| (end) | The tag **From repository** for a binding a repository defines, which is changed there. Otherwise **Remove**. |

**Remove** asks "Remove the <role> role from <who>?" and removes the binding. Removing the last binding that lets someone change the tenant's access is refused: "That would leave the tenant with nobody who can change its access. Give someone else the tenant admin role first."

A link such as `?binding=<id>` (from a member's **View access**) shows the filter **Everyone**, scrolls to the binding and marks it.

## Give access

**Give access** opens a sheet. Its description reads "Who, where, and with which role. It counts from their next request." A service account's page opens it with the account already chosen.

| Field | What it takes |
| --- | --- |
| **Who** | Search by name or email. It offers up to 10 members, groups, service accounts and end users at a time, then two fixed choices: **Every end user who signs in** ("All of them, now and later") and **Anyone, without signing in** ("Only roles that give what an app uses"). |
| **Where** | **The whole tenant**, or one workspace. |
| **What** | Only once a workspace is chosen. **Everything in the workspace**, or one script, flow, app or other thing in it. "Give it for one thing only, such as one app, and nothing else in the workspace." |
| **Role** | The roles that can be held there. A role a workspace defines is offered only for that workspace and shows "(this workspace's)". For **Anyone, without signing in**, only a role that holds something an app uses is offered. The role's description is shown under the field. |

**Give access** is disabled until **Who** and **Role** are chosen. When it works: "<name> holds <role> in the whole tenant." or "...in <workspace>." or "...on <kind> <path> in <workspace>." Giving a role that is already given answers with the existing binding and records nothing.

A role given straight to a member or to end users applies at once, even when [approval by a second person](access-changes) is on. A role given to a group, a service account or a group of end users waits. A notice on the sheet says so while approval is on. When the role does wait, the sheet closes and a notice says that the change waits and nothing has changed yet. See [Second-person approval](../../explanation/access/second-person-approval).

## States

| State | What you see |
| --- | --- |
| Empty | "Nobody has access yet", "Give a member, a group, a service account or an end user a role." |
| Empty filter | "Nothing of this kind holds a role". |
| Not loaded | The list's error state, with a retry. In the sheet, a red notice names what could not be read. |
| Read only | A line says what you can see and that `binding:write` is needed. **Give access** and **Remove** are disabled. |
| Refused | A role that gives something an app does not use cannot be given to anyone without signing in or to every end user: the sheet shows the refusal. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `binding:read` |
| **Give access**, **Remove** | `binding:write` at the tenant, or at the workspace for a workspace's own **Access** |

`binding:write` can give any role at its scope: the product does not check that the giver holds what the role holds. Treat it as a strong permission.

There is no way to deny a permission, to give a role under a condition or to give it for a time. A binding stays until it is removed. Only an operator's access grant expires.

## Related

- [Give access](../../how-to/access/give-access).
- [Check what someone can do](../../how-to/access/check-what-someone-can-do).
- [How access works](../../explanation/access/how-access-works).
