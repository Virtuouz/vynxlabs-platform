---
title: Queries
topic: data-queries
description: "A saved question over one or more tables, written in SQL by someone allowed to, and answered within what the asker may read."
moved_from:
  - data/queries
---

A saved question over one or more tables, written in SQL by someone allowed to, and answered within what the asker may read.

## Removing a query

**Remove** makes a draft that removes the query. Nothing changes until it is deployed, and **Keep this query** takes the removal back before then. **New query** starts from a blank query, not from the one you had open.

## Renaming a query

**Name and path** beside Remove changes a query's name and the path it is found by. A rename also looks after the dashboards that name the query (see below).

### What a rename does to dashboards

A dashboard's widget names a query by its path, and the server also records the query's key when the dashboard is deployed. So a widget keeps running after its query is renamed, in two ways: the old path leads to the new one for 90 days, and after that the recorded key still finds the query.

- **Dashboards made in the console** are drafted for you. The rename dialog lists them before you save ("These dashboards are saved as drafts with the new path"), and each is saved as a draft with its widgets naming the new path. Deploy them with the query. If you discard the rename, the dashboard drafts it made are set aside with it; one you changed since is kept, because it is your work.
- **Dashboards from the repository** are not changed here, and the dialog says so. Their widgets go on running through the recorded key, and show "Names `old`, now `new`: change it in the repository" until the path is changed there.
