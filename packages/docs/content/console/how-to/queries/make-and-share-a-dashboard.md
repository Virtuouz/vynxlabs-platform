---
title: Make and share a dashboard
description: Make a dashboard of your own, put widgets on it that read tables, a saved query or a data source, set how often it refreshes, share it, download what a widget shows, and delete it.
subjects: [dashboards, queries]
---

## Make and share a dashboard

By the end you will have a dashboard of your own with a number and a table on it, set to refresh every 5 minutes, shared with everyone in the workspace, with one widget's rows downloaded. Everyone who looks at it sees only the rows they may read.

## Before you start

- You are signed in as a member, and a workspace is open. A dashboard belongs to a member: a service account or an end user has none.
- You hold `dashboard:write` to make one, change it and share it, and `dashboard:read` to look at one. `workspace_admin` and `app_maintainer` hold both. A member may keep 20 dashboards in a workspace.
- A table to read. To read a saved query you need it deployed or drafted in the workspace. To write SQL in a widget you need `sql:read`. To put a data source's table on it you need `data_source:read`.

## Make it and add widgets

:::steps
1. Open **Data**, then **Dashboards**, and press **New dashboard**. The dialog says "It is yours alone until you choose to share it."
2. Type a **Name**, up to 100 characters, and press **Make the dashboard**. The dashboard opens in the editor, saved, with "Nothing on this page yet".
3. Press **Add to page**, or :kbd[A]. Choose **Stat**, then place it at the end of the page with :kbd[↵].
4. In the inspector on the right, open the **Data** tab, press **Source** and choose a table in **Where it reads from**, for example `appointments`. The **Value** is **Count of rows** until you change it. The figure on the page follows at once.
5. Add a **Table** the same way and choose its source. The list of sources in **Where it reads from** has the workspace's tables, then a data source's tables as "<table> in <source>" for a table or a list, then saved queries, then **SQL written here** when you hold `sql:read`.
6. Set **Refreshes** in the toolbar: **Never by itself**, **Every minute**, **Every 5 minutes**, **Every 15 minutes** or **Every hour**. It starts at **Every 5 minutes**.
7. Press **Done**. The page shows the figure and the table, and a line "Last refreshed <time> · Refreshes every 5 minutes" with **Refresh now**.
:::

Every change in the editor is saved as you make it: the toolbar says "Saved." Undo and Redo, or :kbd[Ctrl+Z] and :kbd[Shift+Ctrl+Z], take back and redo changes to the widgets and to how often it refreshes. [Building a dashboard](../../reference/screens/data/dashboard-builder) lists what the editor offers on a dashboard.

::screenshot{name=console/dashboard-edit alt="A dashboard in the editor: the outline on the left, a stat and a table on the page, and the inspector showing the stat's Data tab with its source."}

## Describe it

:::steps
1. On the dashboard, press the **⋯** button, then **Name and description…**.
2. Change the **Name**, and type **What it is for** in up to 500 characters. Press **Save**.
3. The description is shown under the name and in the list of dashboards.
:::

## Share it

:::steps
1. Press **Share**. The dialog is "Share <name>".
2. Tick **Show it to everyone in this workspace**, or leave it empty and choose groups of members under **Or show it to these groups**. At most 50 groups.
3. Press **Done**. The choice is saved as you make it.
:::

The line under the name now says "Yours. Seen by: everyone in this workspace." People you shared it with can look at it and cannot change it, and each sees only the rows they may read. They need `dashboard:read` and `data:read`.

## Download what a widget shows

On the dashboard, press the download button at the top right of a table, list or chart. Its name is "Download <widget>". Choose **Download as CSV** or **Download as a spreadsheet**. The file holds up to 10,000 rows. A table's file has what the table shows: its columns in order, with their headings. The menu says "(the first 10,000 rows)" when there are more. A stat has no download.

## Delete it

Press **⋯**, then **Delete…**, and confirm "Delete <name>?": "The dashboard is removed for you and for anyone it is shared with. No table and no row is touched."

## The result

The dashboard is in the list under **Dashboards** as **Yours**, with **Seen by** saying who can look. Widgets are read again at the refresh you chose, while the tab is open and visible.

## If it does not work

- **New dashboard is missing.** You lack `dashboard:write`. The empty state says "Making one takes the dashboard:write permission, which your role does not have here."
- **"A member can keep 20 dashboards in a workspace. Delete one first."** You are at the limit.
- **The name is refused as too long.** "Use at most 100 characters."
- **The groups cannot be listed.** Without `group:read` the dialog says so and keeps who it is shown to. It can still be shown to everyone or kept to you.
- **A widget says it reads what the workspace does not have.** A notice above the dashboard lists the table or query it names that is not there. The dashboard is kept as it is.
- **The figure does not change when the table does.** It refreshes on the schedule, or when you press **Refresh now**. It does not refresh while the tab is hidden, nor while you edit; it reads once when the tab is shown again.
- **"N widgets could not be read".** The line under the title counts widgets whose read failed. Open the widget for the reason.
