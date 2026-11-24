---
title: Building a dashboard
topic: data-dashboards-editor
description: "What the dashboard editor has and lacks beside the app builder's page editor: its toolbar, the widgets it offers, where a widget reads from, what a click can do, and its limits."
subjects: [dashboards, widgets]
moved_from:
  - data/dashboard-builder
---

A dashboard is edited in the same page editor as a page of an app. What [the app builder's editor](../build/app-builder-editor) says of **Add to page**, selecting, moving and sizing by mouse and by keys, and the inspector's **Data**, **Display**, **Actions** and **Rules** tabs holds here. This page is what is different on a dashboard. F1 (**Help for this page**) opens the topic `data-dashboards-editor` while a dashboard is being edited.

**Edit** opens the editor, from your own dashboard or from a dashboard the workspace keeps in a dev workspace. **Done** closes it. The address gains `?edit=1` while it is open.

## The toolbar

| Control | What it does |
| --- | --- |
| Title and status | The dashboard's name, then "Saved." when every change is kept, "Saving…" while one is on its way, or "Not saved: <why>", for example "Not saved: someone else saved this dashboard". Leaving with a change not yet saved asks first. |
| **Undo**, **Redo** | Take back or redo a change to the widgets and to how often it refreshes, a hundred back. :kbd[Ctrl+Z] (:kbd[⌘Z]), and :kbd[Shift+Ctrl+Z] or :kbd[Ctrl+Y], outside a text field. A change to the name, the description or who sees it is not in this history. |
| **Refreshes** | **Never by itself**, **Every minute**, **Every 5 minutes**, **Every 15 minutes** or **Every hour**. It starts at **Every 5 minutes**. |
| **Share** | For your own dashboard. The same dialog as on the dashboard. A resource has no **Share**. |
| **⋯** | The same menu as on the dashboard: **Name and description…**, **Keep it as a resource of the workspace…** and **Delete…** for your own; **Description…** for a resource. |
| **Done** | Closes the editor. |
| Panel buttons | **Hide pages and widgets** / **Show pages and widgets** and **Hide the settings** / **Show the settings**. |

On a narrow window **Undo**, **Redo**, **Refreshes**, **Share** and **⋯** are behind one button, "More: undo, redo and the screen size", and the outline and the settings open as side sheets.

**Saving.** Every change to your own dashboard is saved as you make it. A change to a dashboard the workspace keeps is saved as a **draft** on the revision you opened, and nothing is deployed until you deploy it from the **Deploy** screen. If someone else saved the draft first, a notice offers your version or theirs, and nothing is saved over theirs until you choose.

## What is not in the dashboard editor

The editor has no **Phone** or **Tablet** preview, no **View as**, no restore of an earlier draft, and no pages: a dashboard is one page. The dashboard's name and description are in the **⋯** menu, not in the editor's settings, and its sharing is in **Share**.

## The widgets it offers

**Add to page** lists the widgets whose definition lists the dashboard as a surface.

| Group | Widgets |
| --- | --- |
| **Work with records** | **Table**, **List** |
| **Understand data** | **Stat**, **Chart**, **Pivot**, **Goal** |
| **Organize and explain** | **Section**, **Tabs**, **Search and filter**, **Text** |

**Button**, **Form**, **Record detail**, **Action group** and **Approvals** are for apps only. A dashboard never changes a row. **Goal** is `core/goal`.

| Limit | Value |
| --- | --- |
| Widgets on a page | 30 |
| Filters on a page | 8 |
| Columns of the grid | 12 |
| Height of one widget | 40 cells (a row is 40 pixels, the gap 12) |
| Rows of the grid | 400 |
| Filters bound to one widget input | 16 |

## Where a widget reads from

In the **Data** tab, **Source** opens **Where it reads from**, with the field **Find a table or query**.

::screenshot{name=console/dashboard-editor alt="The dashboard editor with the Where it reads from list open: tables of the workspace, a data source's table, saved queries, and SQL written here."}

It lists, in this order:

- **Tables** of the workspace that you may read.
- For a table or a list only, **a data source's tables**, each as "<table> in <source>" with the hint "A table of a data source: listed as it is, not totalled." A stat, chart or pivot cannot read one. A total, group or join over one is refused: "Rows of a data source's table can be listed, not totalled." A list over one stops at its own limit. A source's table whose name is not a page path, such as one with a space or a capital, is not offered.
- **Saved queries**, by title, with their description or path as the hint. A query that is only a draft is listed too.
- **SQL written here**, only when you hold `sql:read`, for a widget that can read SQL. A list takes a table or a query, not SQL.

**Also from** follows a reference column one hop to another table. A parameter of a query or of SQL is bound by hand to a page filter: a date range fills two, `from` and `to`. An unset date bound to SQL gives null.

When a widget's source is a table written in menus, the page's filters are bound to its columns, and the editor says which. For a saved query or SQL, bind the filter to the parameter yourself. See [Visual queries](../../queries/visual-queries) and [Query parameters](../../queries/query-parameters).

A page that holds SQL written in a widget needs `sql:read` of whoever saves it, and one that reads a data source's table needs `data_source:read`. A repository deploy is not asked.

## Steps a click can run

In **Actions**, a widget's click or a chart's point can run a step. A dashboard offers three:

| Step | Offered | What it does |
| --- | --- | --- |
| **Show a message** | Any click the widget has | Says something in a notice. |
| **Filter the page** | Where the click gives a group, such as a point or a cell | Sets one of the page's filters to what was clicked. Every widget bound to it reads again. The step names the filter and the breakdown to take it from. |
| **Show the rows behind** | A stat's click, and where the click gives a group | Opens a side sheet with the rows the figure was made from, as a table, with the page's filters already applied. For a point or a cell, only that group's rows. |

**Show the rows behind** is for a widget that reads a table in menus, not a saved query or SQL: a draft keeps the step and a deploy refuses it. A quarter's rows are the quarter's. A widget that has the step is drawn as one that can be pressed and can be reached by keys.

## Filters

A page's filters are those of its **Search and filter** widgets. **Add a filter** makes one of five kinds: **date range**, **choice**, **text**, **number** and **search**. A search looks in the columns you pick, up to 10 of them for one widget, and a row is kept when every word is found in at least one of them. A search is refused over 10 words or 200 letters. A choice offers up to 200 values. A date range has the ranges: today, last 7 days, last 30 days, last 90 days, this month, last month, this quarter, this year and last 12 months, and shows **All time** for none. **Clear** and **Clear filters** put every filter back to how the page starts.

A date range can be what a stat or chart is compared with: **Compare with the period before** is a switch. It uses the same length of time ending where the range begins.

A trend whose period is left to the editor is by day up to 45 days of range, by week up to 200 days, and by month beyond that or with no range.

## Keys

| Key | What it does |
| --- | --- |
| :kbd[A] | **Add to page** |
| Arrow keys | Move the chosen widget; with :kbd[Shift], size it |
| :kbd[Delete] | Remove the chosen widget |
| :kbd[Ctrl+Z], :kbd[Shift+Ctrl+Z] / :kbd[Ctrl+Y] | Undo and redo |

## Related

- [The app builder's editor](../build/app-builder-editor): the rest of the editor.
- [Dashboards](dashboards): the screen that opens it.
- [Make and share a dashboard](../../../how-to/queries/make-and-share-a-dashboard)
- [Where a dashboard the workspace keeps comes from](../../../explanation/queries/dashboard-resources)
