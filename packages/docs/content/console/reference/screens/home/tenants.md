---
title: Your tenants
topic: tenants
description: "Every control, state and permission of the tenant list: its columns, search, inspector, the operator's tools, and how a tenant is made."
subjects: [navigation]
moved_from:
  - start/tenants
---

The tenant list is the console's root address, `/`. A :term[tenant]{id=tenant} is one team's space on the instance. A member sees the tenants they belong to. An operator sees every tenant on the instance, and the list is then reached as **All tenants** under **Instance**; its help topic is `instance-tenants`.

The root address is also where the console opens. When you open `/` and you have been in a tenant before, the console takes you back to the last workspace overview, or to the tenant, that it remembers for you. It does this only when you open the address: not on a reload, and not when the address carries a search or a filter. The list stays one click away under **Tenants** (member) or **Instance** (operator). Where you were is remembered only for tenants you are a member of, not under an operator's access grant.

The screen is reached from the rail: **Tenants** for a member, **Instance** then **All tenants** for an operator. F1 (**Help for this page**) opens the topic `tenants`.

::screenshot{name=console/basics-tenants alt="The Tenants list with a search box, the columns Name, Slug, Workspaces and Created, and the row of the tenant the signed-in member belongs to."}

## Controls

| Control | What it does |
| --- | --- |
| **Create tenant** | Operators only. Opens a dialog (see below). |
| **Search tenants** | Searches by name or slug. The server answers, so a tenant past the first page is found. The text is kept in the address as `q`. |
| **Tables kept in** | Operators only, and only when the instance has database locations. **Anywhere** or one location; the list then shows the tenants whose tables are kept there. Kept in the address as `location`. A location in the address that is not registered shows as "name (not registered)". |
| A tenant's name | Opens the tenant. |
| A row | Opens the inspector beside the list. The tenant's ID is kept in the address as `item`, so Back closes it. |
| **Load more** | Adds the next 50. The line above it says "Showing the first N tenants." while there are more, and "Showing N tenants." when there are not. |

### Columns

A column that does not fit gives way on a narrow window: **Name** stays, and the slug is shown under it on a phone.

| Column | Who sees it | What it shows |
| --- | --- | --- |
| **Name** | Everyone | The tenant's name, as a link to the tenant. |
| **Slug** | Everyone | The tenant's slug, in code style. |
| **Workspaces** | Everyone | How many workspaces it has. |
| **You** | Operators | **Member**, or **Not a member**. A tenant you are not in is entered through an operator access grant. |
| **Tables kept in** | Operators | The database location, or "The instance's database". |
| **Created** | Everyone | How long ago, with the moment on hover; the date from 7 days on. |

### The inspector

Choosing a row opens the inspector, titled with the tenant's name. It shows:

| Field | What it shows |
| --- | --- |
| **Slug** | The slug. |
| **Workspaces** | The count. |
| **Your access** | Operators. "A member", or "Not a member. Inside it you work through an operator access grant, which needs a reason". |
| **Tables kept in** | Operators. A link to the database location, or "The instance's database". |
| **Created** | The date and time. |
| **ID** | The tenant's ID. |

Operators also see two blocks, which they use without opening the tenant and so without an access grant:

| Block | What it does |
| --- | --- |
| **Workers the instance starts** | Says whether the instance starts workers for the tenant when it has work. The button is **Start no workers for it** or **Start workers for it**. When an operator turned it off, the text says "An operator turned this off: the instance starts no workers for it, and only an operator turns it on again." Turning it off says "The instance starts no workers for {name}. Only an operator can turn it on again." |
| **History kept** | Says how many days runs, events, refused requests and the audit log are kept ("Runs {n} days, events {n}, refused requests {n}, audit log {n}"). **Change how long** opens a sheet, "History kept for {name}", where a field left empty uses the instance's default. Runs, events and refused requests older than their period are removed within minutes. |

The inspector's footer holds:

| Button | What it does |
| --- | --- |
| **Open** | Opens the tenant. |
| **Rename** | Asks for a new name. The slug is in the tenant's addresses and stays. Hidden when you may not rename the tenant. |
| **Turn off code in the console** / **Turn on code in the console** | Asks "Turn off code in the console for {name}?" When it is off, people can no longer save or test scripts, connectors and trigger sources in the console, in any workspace of the tenant; drafts are kept and what is deployed keeps running. The button is hidden when you may not change the tenant. |
| **Delete** | Operators only. Asks you to type the tenant's slug. Deletes every workspace, secret, table and file of the tenant from the instance, and cannot be undone. If the tenant's own database does not answer, a second question offers **Delete anyway**, which leaves its tables in that database for whoever runs it to drop. |

### Create tenant

**Create tenant** opens a dialog (a side sheet where there are more than three fields).

| Field | What it takes |
| --- | --- |
| **Name** | The tenant's name. |
| **Slug** | "Lowercase letters, digits and hyphens. It cannot be changed later." |
| **Database location** | Optional. Leave empty for the instance's own database. It is chosen once. |
| **Make me a member, as tenant admin** | On by default. Then you work inside it as its own people do. Without it, you see inside only through an access grant, which ends and is recorded. |

When it works the tenant opens, and a notice says "Tenant {name} is made." with the link **Open {name}**.

## States

| State | What you see |
| --- | --- |
| Loading | The list's loading state. |
| Empty, member | "No tenants yet", with "Nobody has added you to a tenant yet. Ask your administrator." |
| Empty, operator | "No tenants yet", with "A tenant is one client organization. Create the first one to start adding workspaces and members." and **Create tenant**. |
| Empty, with a location | "No tenant keeps its tables there", with "Pick another database location, or Anywhere, to see the rest. A tenant is placed in one when it is created or imported." |
| Nothing found | "Nothing matches", with "Try fewer or other words." |
| Not loaded | The list's error state, with **Try again**. |
| A suspended tenant | A tenant you are suspended in is not listed. |
| Operator without membership | Opening a tenant you are not a member of shows "You have no access to this tenant", the text "Operators see inside a tenant only through an access grant" and **Open operator access**, which asks for a **Reason** (shown to the tenant's admins), an **Access level** (one of the built-in roles; "viewer (read only)" comes first) and a **Duration** of 1 hour, 4 hours, 24 hours or **Other**, which takes 1 to 1440 minutes. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list | You are signed in. A member sees their own tenants. An operator sees every tenant. |
| Create tenant | `tenant:write` on the instance, which an operator holds. |
| Rename, turn code in the console on or off, change how long history is kept, start or stop workers for a tenant | `tenant:write` on the tenant, or on the instance. Only an operator can turn workers back on once an operator turned them off. |
| Delete | `tenant:write` on the instance. |

A person is an operator when they hold `tenant:write` on the instance. See the [permissions reference](../../../../administer/reference/permissions).

## Related

- [Concepts](../../../../start/explanation/concepts): what a tenant is.
- [Finding your way](../../../../start/reference/basics/finding-your-way): the rail, the header and the switchers.
- [Workspace overview](workspace-overview): where a workspace opens.
