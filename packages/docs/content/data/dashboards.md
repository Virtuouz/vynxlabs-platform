---
title: Dashboards
topic: data-dashboards
description: "One page of numbers, charts and tables over queries, placed on a grid and refreshed on a timer."
---

A dashboard is one page of widgets that only read: tables, lists, stats, charts, pivots and text. It is the same page, the same widgets and the same editor as a page of an app. What differs is who it is for and what it may use:

- a dashboard offers **only widgets that read**, so nothing on it can change a row;
- a dashboard may read a **saved query** or write **SQL** for a widget, which a page of an app may not;
- it **asks again** on a timer while it is on show (off, or every 1, 5, 15 or 60 minutes), and says how old its numbers are;
- it can be **shared**, and a member can have a dashboard of their own.

Its filters sit along the top. A date range, a choice, a word or a number narrows every widget that is bound to it. The filters are kept in the address, so a link shows what you were looking at.

A number, a point or a cell can open **the rows behind it**, and a point can **narrow the page** to what was clicked. See [building a dashboard](dashboard-builder).

Whoever looks sees what they are allowed to read. A dashboard never shows rows a person's groups don't allow, however it was shared.

See [building a dashboard](dashboard-builder).

## When a query is renamed

A widget that names a saved query keeps running when the query is renamed. A dashboard made in the console is drafted with the new path when the query's rename is drafted, so deploying them together keeps the path readable. A dashboard from the repository keeps working through the key the server recorded for each widget at its last deploy, and each widget that ran that way says "Names `old`, now `new`: change it in the repository". See [renaming a query](queries).
