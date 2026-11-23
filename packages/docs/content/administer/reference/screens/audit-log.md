---
title: Audit log
topic: tenant-audit
description: "Every control, state and permission of the tenant's Audit log screen: the filters, the search, the columns, an entry's details, the link to an entry, saved views and the CSV file."
subjects: [audit, retention]
moved_from:
  - tenant/audit-log
---

The **Audit log** lists every change in the tenant, and every request an operator made under an access grant, newest first. An entry says when, who, what was done and to what. The screen is under **Tenant**, in the group **Governance**. F1 opens the help topic `tenant-audit`. The instance's own log is on [Instance audit log](../../../self-host/reference/console/audit-log).

How long entries are kept is on [Retention](retention). The strings an entry's action can have are in the generated [audit actions](../audit-actions).

::screenshot{name=administer/sso-audit-filters alt="The Audit log with its search box, area, since and workspace lists, More filters open, and the entry details beside the list."}

## Controls

Every filter is the server's, so it searches the whole log the tenant keeps, not only what has loaded. The filters and the open entry are in the address, so a link reaches the same view.

| Control | What it does |
| --- | --- |
| **Search** | A box, "An action, name, email or host". It finds an entry by its action, the ID or kind of what it was done to, and by the names, emails and hostnames of what it was done to and of who did it. |
| **Area** | **Everything**, or one area such as **Members and sign-ins**, **Resources**, **Hostnames** or **Worker credentials**. An area is the first word of an action. |
| **Since** | **Any time**, **Last 24 hours**, **Last 7 days**, **Last 30 days**, or **Between dates**. |
| **From date**, **To date** | Appear with **Between dates**. A day starts at 00:00 and ends at 23:59 where you are. If the end is before the start: "The end date is before the start date." |
| **Workspace** | **Every workspace**, or one. |
| **More filters** | Opens **Who** (**Anyone**, or a person, with how many entries), **Action** (**Any action**, or one, with a count) and **Done to** (**Anything**, or a kind of thing, with a count). The button shows how many of the three are set, "More filters (2)". The three lists are made from the entries in the range chosen above them. |
| **Columns** | Shows or hides **Who**, **What was done** and **To**. **When** always shows. |
| **Saved views** | Keeps the filters and columns under a name, as on other lists. |
| **CSV** | Downloads the entries that match the filters. See below. |
| **Show older entries** | Appears under the list when there are more. A page holds 50. |
| Clear filters | On an empty result, clears every filter at once. |

When a link set **Done to** to one thing, a line says "Everything about <name>" with **Show everything**.

### Columns

| Column | What it shows |
| --- | --- |
| **When** | The time where you are, to the second. A button that opens the entry. |
| **Who** | The person's email or name, or the kind and last characters of the ID of a service account or other actor. |
| **What was done** | A tag (**Create**, **Update**, **Delete**, **Execute** or **Read**, from how the action ends), the action in words, and the action itself in code style. **Operator** marks something done under an access grant. |
| **To** | The name of what it was done to, a link to it when the console has a page for it (a workspace, a member, a secret, a run, a resource). For an operator's first request into the tenant: "the tenant's API". |

### An entry

Choosing a row opens **Entry details** beside the list, or over it on a narrow window, and the address gains `entry=<id>`.

| Part | What it shows |
| --- | --- |
| **When**, **Who**, **Action**, **Kind**, **Name**, **ID**, **From**, **Request** | The entry's facts. **From** is the address it came from. **Request** is the request's ID. |
| A notice | "Done by an operator under an access grant." |
| **Details** | What else was recorded, as JSON, or "Nothing more was recorded." |
| **Everything about this** | Filters the log to this entry's target. |
| **Copy a link to it** | Copies the address of this view and entry: "Link to the entry copied." |

### The CSV file

**CSV** downloads `audit-log.csv` with the columns `occurredAt`, `action`, `actorType`, `actorLabel`, `actorId`, `targetType`, `targetLabel`, `targetId`, `workspaceId`, `accessGrantId`, `requestId`, `ipAddress`, `details`. It holds the entries that match the filters, newest first, up to 100,000 rows. Its times are in UTC and end in `Z`; the list shows yours. The button's tooltip says so.

## States

| State | What you see |
| --- | --- |
| Empty | "Nothing recorded yet". |
| Not loaded | The error state, with a retry. |
| Filters match nothing | The empty result, with the control that clears the filters. |

## Permissions

| Action | Needs |
| --- | --- |
| See the log, an entry, and download the CSV | `audit:read` |
| Save a view | The member's own; no other permission |

The screen has no control that changes an entry, and an entry cannot be deleted by a person. Entries leave only when [retention](retention) removes them.

## Related

- [Find an entry in the audit log](../../how-to/sso/find-an-audit-entry)
- [How retention and the audit log work](../../explanation/sso/how-retention-and-the-audit-log-work)
- [Audit actions](../audit-actions)
