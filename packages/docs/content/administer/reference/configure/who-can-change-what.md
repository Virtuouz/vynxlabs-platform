---
title: Who can change what in Configure
description: "The permission each action on the Configure screens needs, what the built-in roles hold, and what a person who may only read sees."
subjects: [connections, secrets, variables, access]
---

Each action on the **Configure** screens needs one permission, checked in the workspace. Permissions are written `kind:verb`, and a role lists them. See the [permissions reference](../permissions) and [How access works](../../explanation/access/how-access-works).

## What each action needs

| Action | Needs |
| --- | --- |
| See connections and whether they are set up, their health, and a connection's settings (headers included) | `connection:read` |
| Set up, change or remove a connection; **Connect** and **Reconnect**; add, change or remove a connection group member | `connection:write` |
| Declare a new connection from the sheet, in a dev workspace | `connection:write` and `resource:write` |
| **Test** a connection | `connection:write`; the button also needs `run:read` to show |
| **Send a test alert** | `connection:write` |
| See secrets: names, who set each and when, and what uses each | `secret:read` |
| Make a secret, replace its value, delete it | `secret:write` |
| See variables and their values | `variable:read` |
| Set a variable, change it, use its default | `variable:write` |
| See the default failure alert and the scripts that set their own | `resource:read` |
| See the alerts that were sent | `run:read` |
| Change the default failure alert | `workspace:write` |
| See the settings of a workspace | `workspace:read` |
| Rename a workspace, set its promotion target, time zone or run limit; pause or resume its triggers | `workspace:write` |
| Clone a workspace | `workspace:write` in the tenant, `workspace:read` in the workspace copied; with rows and files also `data_all:read` and `file:read`; with **Safety** off also `secret:write` and `connection:write` |
| Delete a workspace | `workspace:write` |
| Delete a production workspace | `workspace:write` and `workspace_production:write` |
| Give or remove a role in a workspace | `binding:write` |

No permission lets anyone read a secret's value or a connection's credential. Nothing returns them.

`workspace_production:write` is given only by name. `*` does not include it: a role has it only when the role lists it. No built-in role has it, and a tenant admin does not either.

## What the built-in roles hold

| Role | `connection` | `secret` | `variable` | `resource` | `workspace` |
| --- | --- | --- | --- | --- | --- |
| `viewer` | read | read | read | read | read |
| `developer` | read, write | read, write | read, write | read, write | read |
| `deployer` | read | read | read | read | read |
| `workspace_admin` | read, write | read, write | read, write | read, write | read, write |
| `tenant_admin` | read, write | read, write | read, write | read, write | read, write |

A `developer` also holds `run:write`, and a `workspace_admin` `run:*` and `binding:*`. A `tenant_admin` holds `*:*`, which does not include `workspace_production:write`. Custom roles can hold any of these. A grant on a single resource, such as one connection, counts for that resource.

A developer therefore sets up connections, secrets and variables, and can send a test alert, but cannot change a workspace's settings, its failure alert or its promotion target.

## What a person who may only read sees

The console reads what you hold and turns off what you do not. Nothing is hidden: reading is never taken away.

| Screen | What you see |
| --- | --- |
| **Connections** | The list and the pages, with a line "You can see this workspace's connections, not change it. It needs `connection:write`." and whom to ask. There is no **New connection**, and the buttons of the rows are off. Buttons for connection group members are not turned off: the instance refuses them. |
| **Variables** | The list, with "You can see this workspace's variables, not change it. It needs `variable:write`." **Set variable** and the row buttons are off. A variable's page has no **Change value**. |
| **Secrets** | The list, with "You can see this workspace's secrets, not change it. It needs `secret:write`." **New secret** and **Delete** are off. A secret's **Value** tab says "Replacing the value needs the secret:write permission: ask an administrator of this workspace." |
| **Alerts** | "You can see where this workspace's alerts go, not change it. It needs `workspace:write`." The two lists and **Save** are off. **Send a test alert** needs `connection:write`. |
| **Workspace settings** | "You can see this workspace's settings, not change it. It needs `workspace:write`." The fields and the rows of actions are off. |

A person with no `workspace:read` in the workspace sees "This needs the workspace:read permission." and whom to ask, instead of the screen.

If the console cannot find out what you hold, it shows the buttons, and the instance refuses what it must. The refusal says what is missing, for example "This needs the secret:write permission."

## Related

- [Connections](../../../console/reference/screens/configure/connections), [Variables](../../../console/reference/screens/configure/variables), [Secrets](../../../console/reference/screens/configure/secrets), [Alerts](../../../console/reference/screens/configure/alerts) and [Workspace settings](../../../console/reference/screens/configure/settings).
- [Roles](../screens/roles) and [Access](../screens/access) to give a role.
