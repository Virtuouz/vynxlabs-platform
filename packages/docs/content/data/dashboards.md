---
title: Dashboards
topic: data-dashboards
description: "Pages of charts, numbers and tables over queries, placed by drag and refreshed on a timer."
---

Pages of charts, numbers and tables over queries, placed by drag and refreshed on a timer.

## When a query is renamed

A widget that names a saved query keeps running when the query is renamed. A dashboard made in the console is drafted with the new path when the query's rename is drafted, so deploying them together keeps the path readable. A dashboard from the repository keeps working through the key the server recorded for each widget at its last deploy, and each widget that ran that way says "Names `old`, now `new`: change it in the repository". See [renaming a query](queries).
