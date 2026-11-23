---
title: All tenants
topic: instance-tenants
description: "Every control, state and permission of the All tenants screen: the list, the inspector, Create tenant, Rename, the console-code switch, the workers and history an operator sets without opening a tenant, and Delete."
subjects: [instance, tenants]
moved_from:
  - instance/tenants
---

The **Tenants** screen lists every tenant of the instance. A tenant is one team's space: it holds workspaces, members and groups. In the **Instance** area it is reached from **All tenants**, the first entry. F1 (**Help for this page**) opens the help topic `instance-tenants`.

An operator sees every tenant. A member who is not an operator sees the same screen at the same address, titled **Tenants**, with only the tenants they belong to ("The organizations you belong to."), no **Create tenant** button and none of the operator columns. This page is about the operator's screen.

Opening the console at its root (`/`) takes you back to the workspace or tenant you were last in. The tenant list stays one click away: choose **All tenants**. A list with a filter or a search in its address (`/?location=...`) stays where it is.

An operator is not inside a tenant by default. **Open** on a tenant the operator is not a member of leads to the "You have no access to this tenant" screen, where an operator access grant is asked for. See [Operators](operators) and the tenant's [Operator access](../../../administer/reference/screens/operator-access) screen.

::screenshot{name=self-host/instance-tenants alt="The All tenants screen with a tenant chosen: the list of tenants on the left and, on the right, the inspector with the tenant's slug, workspaces, your access, where its tables are kept, the workers panel and the history panel, and the buttons Open and Delete."}

## Controls

### The list

The title is **Tenants**. The description reads "Every client organization on this instance. Opening one needs an access grant unless you are a member of it." The description shows the first time you open the screen. On later visits it is folded behind the **About Tenants** button (the circled i) beside the title. Under it are a search box and, when at least one database location exists, the **Tables kept in** filter.

| Control | What it does |
| --- | --- |
| **Create tenant** | Opens the dialog described below. |
| **Search tenants** | Searches the name and the slug as you type, on the server, so a tenant past the first page is found. The text is kept in the address as `q`. |
| **Tables kept in** | Appears only when at least one [database location](databases) is registered. **Anywhere**, or one location by name. The choice is kept in the address as `location`, so a link from a location shows the same list. A name in the address that is not registered is offered as "NAME (not registered)". |
| **Load more** | The list shows 50 tenants at a time. Below it a line says "Showing the first N tenants." and, when there are more, offers **Load more**. |

The columns, left to right. A column that does not fit gives way on a narrow window; **Name** stays. On a phone the slug sits under the name.

| Column | What it shows |
| --- | --- |
| **Name** | The tenant's name, as a link that opens the tenant. |
| **Slug** | The slug, the tenant's permanent short name. |
| **Workspaces** | How many workspaces the tenant has, dev and production together. |
| **You** | **Member** if you belong to the tenant, otherwise **Not a member**. The list does not know of grants: a tenant you work in through an operator access grant also reads **Not a member**. |
| **Tables kept in** | The name of the database location that holds the tenant's custom tables, or "The instance's database". Plain text here. |
| **Created** | How long ago. |

Choosing a row opens the inspector. The row is in the address as `item`, so Back closes the inspector before it leaves the screen.

### The inspector

Its eyebrow is **Tenant** and its title is the tenant's name.

| Field | What it shows |
| --- | --- |
| **Slug** | The slug. |
| **Workspaces** | The count. |
| **Your access** | "A member", or "Not a member. Inside it you work through an operator access grant, which needs a reason". |
| **Tables kept in** | A link to the location's row on the [Database locations](databases) screen, or "The instance's database". |
| **Created** | The date and time. |
| **ID** | The tenant's ID. |

Below the fields are two panels an operator may use without opening the tenant and without an access grant. Neither shows anything inside the tenant.

**Workers the instance starts** says which of three things holds:

- "The instance starts workers for this tenant when it has work." The button is **Start no workers for it**.
- "An operator turned this off: the instance starts no workers for it, and only an operator turns it on again." The button is **Start workers for it**.
- "The instance starts no workers for this tenant: it runs its scripts on workers of its own." The button is **Start workers for it**.

An operator who turns it off locks it. A tenant admin who turns it on again is refused with "An operator of this instance turned this off. Only an operator can turn it on again." An operator's **Start workers for it** unlocks it. The result is said as "The instance starts no workers for NAME. Only an operator can turn it on again." or "The instance starts workers for NAME when there is work." Whether workers actually start also depends on the instance's `MANAGED_WORKERS` setting (see the **This replica's settings** section of [Instance health](health)).

**History kept** says "Runs N days, events N, refused requests N, audit log N." with the period in force, and **Change how long**. It opens the side sheet "History kept for NAME" with four fields, **Runs (days)**, **Events (days)**, **Refused requests (days)** and **Audit log (days)**. A field left empty takes the instance's default. A period is 1 to 3,650 days; the audit log is never under 90. The sheet is the same as the tenant's own [Retention](../../../administer/reference/screens/retention) screen, including its confirmation before older history is removed.

The inspector's buttons, from the left:

| Button | What it does | Shown |
| --- | --- | --- |
| **Open** | Opens the tenant. | Always. |
| **Rename** | Asks for a new name in a dialog titled "Rename NAME" ("What people read in lists and the switcher. Its slug, SLUG, is in its addresses and stays."), with the field **Name** and the button **Rename**. The result is "OLD is now called NEW." A name of 1 to 200 characters. | When the server says the signed-in person may rename it. |
| **Turn off code in the console** / **Turn on code in the console** | Asks first, with "Turn off code in the console for NAME?" or "Turn on code in the console for NAME?". Off: people can no longer save or test scripts, connectors and trigger sources in the console, in any workspace of the tenant. Drafts are kept and what is deployed keeps running. A tenant admin or an operator can turn it on again, and the dialog for that says "People with the code permission can write and test code in the console again." The result is "Code in the console is off for NAME." or "Code in the console is on for NAME." Code from a repository is not affected. | When the server says the signed-in person may change the tenant. |
| **Delete** | Deletes the tenant. See [Delete a tenant](#delete-a-tenant). | Operators only. |

**Rename** and the console-code switch are offered when the server says the person holds `tenant:write` in that tenant, or at the instance. An operator sees both for every tenant, a member of it or not (`PATCH /tenants/{id}`).

### Create tenant

**Create tenant** opens a dialog. It needs `tenant:write` at the instance.

| Field | What it takes |
| --- | --- |
| **Name** | 1 to 200 characters. |
| **Slug** | Lowercase letters, digits and hyphens, no hyphen at the start or end and none doubled, at most 63 characters. It is in the tenant's addresses and cannot be changed later. A slug that does not fit is refused at the field: "Use only lowercase letters, digits and hyphens." A slug already used is refused. |
| **Database location** | Optional. Pick a registered [database location](databases), or leave it empty for the instance's own database. It is chosen once and cannot be changed afterwards. |
| **Make me a member, as tenant admin** | On by default. Then you work inside the tenant as its own people do. Off, you see inside only through an access grant, which ends and is recorded. It is ignored when the caller is not a member (for example a service key). |

When it works, the console says "Tenant NAME is made." with the link **Open NAME**, and opens the tenant. The dialog's button is disabled while the instance is read only (see States).

### Delete a tenant

**Delete** asks you to type the tenant's slug. The dialog is titled "Delete NAME?" and says "This deletes the tenant from this instance: every workspace, secret, table and file. Export it first if anything should be kept. It cannot be undone." The button **Delete tenant** stays disabled until the slug is typed exactly.

What is removed: every workspace, resource, secret, custom table and file of the tenant, for good. What stays: the tenant's audit entries, which move to the instance's [audit log](audit-log) (entry `tenant.deleted`), and its members' accounts, which belong to the instance.

Deletion is refused while the tenant has runs queued or running, or flow runs running. The refusal reads "N runs and M flow runs are still in progress. Pause the triggers, let them finish or cancel them, then try again."

If the database location holding the tenant's tables does not answer, and the tenant has workspaces, the console asks a second question: "Delete NAME without dropping its tables?" It repeats the location's error, and says that if you go on the tenant is deleted here and its tables stay in that database, where someone who runs it must drop them. Its button is **Delete anyway**. The log entry then names the location (`tablesLeftIn`) and the schemas left. The steps are in [Delete a tenant](../../how-to/instance/deleting-a-tenant).

## States

| State | What you see |
| --- | --- |
| Loading | The list's loading state. |
| Empty | "No tenants yet", with "A tenant is one client organization. Create the first one to start adding workspaces and members." A member who is not an operator sees "Nobody has added you to a tenant yet. Ask your administrator." |
| Filter finds none | "No tenant keeps its tables there", with "Pick another database location, or Anywhere, to see the rest. A tenant is placed in one when it is created or imported." |
| Search finds none | "Nothing matches", with "Try fewer or other words." and a way to clear the search. |
| Not loaded | The error state with a retry. |
| Read only instance | A strip on every screen says "The instance is read only." and why. The **Create tenant** dialog's button is disabled and says "The database is taking no changes for now: its disk may be full, or it is in maintenance. Reading still works. An operator of this instance can look at its Health screen or run `volvel status`." The other buttons stay clickable, and the server refuses with a 503 and the same explanation. |
| A panel does not load | **Workers the instance starts** and **History kept** each show their own error state with a retry; the rest of the inspector stays. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list | Being signed in. An operator sees every tenant, anyone else the tenants they belong to. |
| **Create tenant**, **Delete** | `tenant:write` at the instance. |
| **Workers the instance starts**, **History kept** (change) | `tenant:write` at the instance, or in the tenant. Turning workers on again after an operator turned them off needs an operator. |
| **Rename**, console-code switch | `tenant:write` in the tenant (a tenant admin has it; an operator has it for every tenant, through the instance). |

The role `operator_admin` holds `tenant:*` at the instance. It gives no access inside a tenant. See the [permissions reference](../../../administer/reference/permissions).

## Related

- [Database locations](databases): where a tenant's custom tables can be kept.
- [Import a tenant](import) and [Move a tenant](../../how-to/instance/moving-a-tenant).
- [Instance audit log](audit-log): where `tenant.deleted` is recorded. `tenant.created` and `tenant.updated` are in the tenant's own log.
- [What the instance does not do](../../explanation/instance/what-is-not-there).
