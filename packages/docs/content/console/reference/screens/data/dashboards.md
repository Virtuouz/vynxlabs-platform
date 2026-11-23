---
title: Dashboards
topic: data-dashboards
description: "Every control, state and permission of the Dashboards list and of one dashboard: a member's own, one shared with you, and one the workspace keeps."
subjects: [dashboards, queries]
moved_from:
  - data/dashboards
---

A **dashboard** is one page of numbers, charts and tables over a workspace's tables, queries and data sources, placed on a grid and read again on a timer. There are two kinds, and the list shows both:

- A **member's dashboard** belongs to the member who made it. It is theirs alone until they share it. It is saved as it is changed and is not versioned.
- A **dashboard the workspace keeps** is a [resource](../../../explanation/queries/dashboard-resources): it has a path, is changed in a dev workspace as a draft, and is deployed and promoted with the rest of the workspace. The list tags it **Resource**. A dashboard written in the repository with `defineDashboard` is one of these.

Everyone who looks at a dashboard sees the rows they may read: each table's rules for who sees which rows apply to the person looking, so two people can see different numbers on one dashboard.

The screen is reached from **Data**, then **Dashboards**. F1 (**Help for this page**) opens the help topic `data-dashboards`, on the list and on a dashboard that is being looked at. While one is being edited the topic is `data-dashboards-editor`: see [Building a dashboard](dashboard-builder). A dashboard has its own address: `dashboards/<id>` for a member's, and `dashboards/at/<path>` for one the workspace keeps (its ID also works).

::screenshot{name=console/dashboards-list alt="The Dashboards list: a dashboard the workspace keeps with a Resource tag, and one of the member's own, each with who it belongs to, who sees it and when it changed."}

## The list

The list has a description line, **New dashboard** and a table with these columns.

| Column | What it shows |
| --- | --- |
| **Dashboard** | The title, as a link. Beside it: the tag **Resource** for one the workspace keeps, and a pill: **Draft, never deployed** for a resource that is only a draft, **Draft** for one a draft changes, **Removing** for one a draft removes. Under it: "Renamed from <path>, once deployed." for a draft that renames it, and its description. |
| **Whose** | "The workspace's" for a resource, "Yours" for your own, or the owner's name. |
| **Seen by** | "Everyone here" for a resource and for one shared with everyone, the names of the groups it is shared with, or "Only you". |
| **Changed** | How long ago it changed. Empty for a draft that was never deployed. |

A person who may not read drafts sees dashboards as they are deployed.

### New dashboard

**New dashboard** opens "New dashboard": "It is yours alone until you choose to share it." It asks for a **Name** of up to 100 characters and its button is **Make the dashboard**. A name that is too long says "Use at most 100 characters. This is N." on the field, and the button is off. It opens the new dashboard in the editor. A member may keep 20 dashboards in a workspace: at the limit it says "A member can keep 20 dashboards in a workspace. Delete one first."

### States of the list

| State | What you see |
| --- | --- |
| Empty | "No dashboards yet" and "Make one to keep an eye on the tables you care about." |
| No permission to make one | The button is hidden, and the empty state says "Making one takes the dashboard:write permission, which your role does not have here. Ask whoever manages roles in this tenant." In the list, a line says what is needed. |
| Not loaded | The error state with a retry. |

## One dashboard, looked at

The title is the dashboard's name. Under it is its description, or when it has none, a line about whose it is. That line says "Yours. Seen by: <who>." for your own (<who> is "only you", "everyone in this workspace", or the names of the groups written in lower case), "<owner>'s, shared with you. You see the rows you may read." for another's, and "Kept by the workspace, at <path>. You see the rows you may read." for a resource. When a dashboard has a description, that line goes under it.

A line under it gives its freshness: "Last refreshed <time>" (or "Refreshing" while the first read is out, or "Nothing could be read"), then " · N widgets could not be read" when some failed, then "Refreshes every 5 minutes" or "Does not refresh by itself". The button **Refresh now** reads every widget again.

### Controls

| Control | What it does |
| --- | --- |
| **Share** | For your own dashboard. Opens "Share <title>". See below. |
| **Edit** | Opens the editor on your own dashboard, or on a resource in a dev workspace. See [Building a dashboard](dashboard-builder). |
| **Name and path** | For a resource in a dev workspace. Opens "Name and path of <path>": the **Key**, the **Path** and the **Title**, saved as a draft with **Save as a draft**. Not shown for a resource the repository defines, or one being removed. |
| **Discard draft** / **Remove** / **Keep this dashboard** | For a resource in a dev workspace. **Discard draft** asks "Discard this draft?", **Remove** asks "Remove this dashboard?": "This saves a draft that removes it. Nothing changes until that draft is deployed.", and **Keep this dashboard** asks "Keep this dashboard?" and takes a removal back. A resource the repository defines shows "Managed in the repository: the dashboard is removed there." |
| State pill | **Draft, never deployed**, **Draft** or **Removing** for a resource. |
| **⋯** menu | For your own: **Name and description…**, **Keep it as a resource of the workspace…** and **Delete…**. For a resource: **Description…** only. |
| Download | On a widget. See below. |

**Name and description…** takes a **Name** (up to 100 characters; "Give the dashboard a name." when empty) and **What it is for** (up to 500 characters) and is titled "Name and description"; for a resource it is "What this dashboard is for" with the description only. **Keep it as a resource of the workspace…** is "Keep it as a resource": **Its path, such as boards/lending**, with **Save the draft**. It saves a copy as a draft and says "<path> is saved as a draft. Deploy it to keep it." Yours stays as it is. **Delete…** asks "Delete <title>?": "The dashboard is removed for you and for anyone it is shared with. No table and no row is touched."

### Share

"Share <title>" has **Show it to everyone in this workspace**, "They can look and not change it. Each person sees only the rows they may read." Without it ticked, **Or show it to these groups** takes up to 50 groups of members, with "Nobody else" when none is chosen. **Done** closes the dialog. A choice is saved as it is made. Without `group:read` the dialog says "You can't list the groups here: that takes the group:read permission. It can be shown to everyone in the workspace, or kept to you." and keeps who it is shown to. A tenant with no groups says so.

### Widgets, filters and downloads

- **Filters** set on the dashboard are in the address as `f`, a JSON object, so a link shows the same thing.
- A widget's **Download <widget>** menu is in its heading, or in a corner when it has none. **Download as CSV** and **Download as a spreadsheet** save the rows the widget read, up to 10,000; with more it says "(the first 10,000 rows)". A table's file holds what the table shows: its columns in order, their headings, money in units, and no hidden column. A list and a chart are saved as read. A stat has none.
- Numbers are written in the reader's locale, and days, and "today", are the reader's.
- A widget that was given a click step can show a message, set one of the page's filters, or open the rows behind what was clicked. See [Building a dashboard](dashboard-builder).

### Refresh

A dashboard reads its widgets again at the interval set in the editor: **Never by itself**, every minute, every 5 minutes (the default), every 15 minutes, or every hour. It does not read while the tab is hidden, nor while someone is editing; when the tab is shown again, it reads once if a read was due.

### States of a dashboard

| State | What you see |
| --- | --- |
| Loading, or not found | The loading state, or "There is no dashboard here." with a retry. |
| Empty | "Nothing on it yet": "A widget asks a question of the workspace's tables and draws the answer: a number, a chart, a table or a pivot." With **Add to page** for your own. |
| It reads what the workspace lacks | A notice "It reads what this workspace does not have. It is kept as it is, and what reads it waits:" and one line for each table or query that is not there. |
| A resource the repository defines | "This dashboard is defined by the code in the tenant's repository. Changing it here saves a draft that takes it over: once deployed it is a file the console and the repository both edit. Then remove its definition from the code, or the next deploy from the repository takes it back." |
| Removing | "This dashboard is removed in your drafts. Nothing changes until that draft is deployed. What is shown is what is deployed now. Keep this dashboard to take the removal back." |
| Someone saved first | The draft-clash notice, with a choice between your version and theirs. |

In a dev workspace a resource is read with its draft over what is deployed. In a production workspace it is read as deployed and cannot be changed.

## Permissions

| Action | Needs |
| --- | --- |
| See the list, look at a dashboard | `dashboard:read` and, for the rows, `data:read`. A member's dashboard is open to its owner, to everyone if it is shared with everyone, and to the groups it is shared with. A resource is open to everyone who holds `dashboard:read`. |
| **New dashboard**, **Edit**, **Share**, **Name and description…**, **Delete…** on your own | `dashboard:write`. A dashboard belongs to a member: a service account or an end user has none. |
| **Keep it as a resource**, and every change to a resource | `resource:write`, in a dev workspace. A page that holds SQL written in a widget needs `sql:read` of whoever saves it, and one that reads a source's table needs `data_source:read`. |
| List the groups in **Share** | `group:read` |

See [SQL and data source permissions](../../../../administer/reference/queries/sql-and-source-permissions).

## What is not here

A dashboard cannot be sent by email on a schedule, has no public link and no publish step. A dashboard's editor has no **Phone** or **Tablet** preview, no **View as** and no restore of an earlier draft.

## Related

- [Make and share a dashboard](../../../how-to/queries/make-and-share-a-dashboard)
- [Keep a dashboard as a resource of the workspace](../../../how-to/queries/keep-a-dashboard-as-a-resource)
- [Building a dashboard](dashboard-builder)
- [Queries](queries)
