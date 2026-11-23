---
title: Instance audit log
topic: instance-audit
description: "Every control, state and permission of the Instance audit log screen: what it holds, its filters, columns, the entry inspector and the CSV file, and how it differs from a tenant's log."
subjects: [instance, audit]
moved_from:
  - instance/audit-log
---

The **Instance audit log** lists what was done on the instance that belongs to no tenant: members, operators, sign-ins, instance settings, database locations, single sign-on and tenants being imported or deleted. Each entry says when, who, what and to what. The screen is in the **Instance** area, as **Audit log**. F1 (**Help for this page**) opens the help topic `instance-audit`.

Every tenant has a log of its own, on its [Audit log](../../../administer/reference/screens/audit-log) screen, which holds what happened inside it. What an operator does inside a tenant, under an access grant, is in that tenant's log, with the entry `operator.access` and the **Operator** tag. The instance log holds the instance's changes and one more thing: the entries of tenants that have been deleted. A deleted tenant has no log of its own, so its whole history, `tenant.created` to `tenant.deleted`, is here, each entry tagged **Deleted tenant**.

::screenshot{name=self-host/instance-audit alt="The Instance audit log: search, Area and Since filters, the More filters button, CSV and Columns, and a table of entries with When, Who, What was done and To, with the entry inspector open beside it."}

## Controls

The title is **Instance audit log**. The description reads "Changes that belong to no tenant: members, operators and sign-ins. Each tenant has its own log." Entries come newest first, 50 at a time, with **Show older entries** below the list.

### The toolbar

| Control | What it does |
| --- | --- |
| **Columns** | Shows or hides the columns after **When**. |
| **CSV** | Downloads the entries the filters keep, newest first, at most 100,000, with the columns `occurredAt`, `action`, `actorType`, `actorLabel`, `actorId`, `targetType`, `targetLabel`, `targetId`, `workspaceId`, `accessGrantId`, `requestId`, `ipAddress` and `details`. Times in the file are in UTC, ending in Z; the list shows yours. |
| **Search** | A box ("An action, name, email or host"). It searches the whole log on the server, not only what is loaded. Kept in the address as `q`. |
| **Area** | **Everything**, or one area: **Members and sign-ins**, **API keys**, **Instance access**, **Operator access grants**, **Tenants**, **Operator access**, **Tenant imports**, **Instance settings**, **Identity providers**, **Identity domains**, **Identity links**, **Single sign-on**, **Directory sync**, **Directory sync tokens**, **Database locations**. An area is the word an action starts with. The entries of deleted tenants, which start with their own areas, are reached by **Everything** or by search. |
| **Since** | **Any time**, **Last 24 hours**, **Last 7 days**, **Last 30 days**, or **Between dates**, which adds **From date** and **To date**. "The end date is before the start date." is said when they are the wrong way round. |
| **More filters** | Opens **Who** (**Anyone**, or an actor from the log, with a count), **Action** (**Any action**, or one, with a count) and **Done to** (**Anything**, or one kind of thing, with a count). The button says how many of them are set. These lists come from the log itself. |
| **Everything about NAME** / **Show everything** | Shown when the log is narrowed to one thing, from **Everything about this** in the inspector. |

Everything that narrows the list is in the address (`area`, `since`, `from`, `to`, `actor`, `action`, `kind`, `about`, `q`, `cols`) and the entry that is open is `entry`, so a link opens the same view. The instance log has no **Workspace** filter and no saved views: those are on a tenant's log.

### The list

| Column | What it shows |
| --- | --- |
| **When** | The time, as a button that opens the entry. In your own clock. |
| **Who** | The member, service account or API key that acted. |
| **What was done** | A tag for the kind (**Create**, **Update**, **Delete**, **Execute**, **Read**), the action in words, and the action's own name in code style (`member.created`). The kind is read from how the action ends. A **Operator** tag marks an entry made under an operator access grant. A **Deleted tenant** tag marks an entry of a deleted tenant; hovering it gives the tenant's ID. |
| **To** | What it was done to: its name, or its ID in code style when it has no name. |

### The entry inspector

Choosing an entry opens **Entry details** (the time as the eyebrow). It shows **When**, **Who**, **Action**, **Kind**, **Name** (when it has one), **ID**, **From** (the address the request came from) and **Request** (the request's ID, which is also in the instance's own log). "Done by an operator under an access grant." is added when it was. **Details** shows the entry's recorded details as JSON, with **Copy**, or "Nothing more was recorded." The button **Everything about this** narrows the list to everything done to the same thing. The inspector opens on the first entry on a wide window.

An entry that is not among those loaded is fetched by its address; one the log no longer keeps is not found ("404 once the log no longer keeps it").

### What is recorded

Among the actions on the instance's screens: `member.created`, `member.disabled`, `member.enabled`, `member.password_link_created`, `binding.created`, `binding.deleted` (an operator added or removed), `tenant.deleted`, `tenant_import.staged`, `tenant_import.discarded`, `database_location.set`, `database_location.described`, `database_location.removed`, `instance.triggers_paused`, `instance.triggers_resumed`, `instance.branding_updated`, `instance.logo_set`, `instance.logo_removed`, `instance.rekeyed`, `instance.data_role_rekeyed` and `operator.recovered`. The area list above is checked against the list of actions in the source.

## States

| State | What you see |
| --- | --- |
| Loading | The list's loading state. |
| Empty | "Nothing recorded yet". |
| A filter finds none | The empty state with a way to clear the filters. |
| Not loaded | The error state with a retry. |
| Older entries do not load | The list stays; **Show older entries** can be pressed again. |

Entries are kept for the audit retention, 400 days unless `RETENTION_AUDIT_DAYS` says otherwise, and never fewer than 90. A tenant that deleted its history sooner changes nothing here.

## Permissions

| Action | Needs |
| --- | --- |
| See the list, the facets, an entry and the **CSV** file | `audit:read` at the instance. |

## Related

- [All tenants](tenants): **Delete** is what puts a tenant's history here.
- [Operators](operators): the entries `binding.created` and `binding.deleted`.
- [Operator access](../../../administer/reference/screens/operator-access): what a tenant sees of an operator's visit.
