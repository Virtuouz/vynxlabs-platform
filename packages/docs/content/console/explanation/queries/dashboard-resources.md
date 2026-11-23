---
title: How dashboards the workspace keeps are changed
description: A member's dashboard and one the workspace keeps are two things. This page explains where each lives, how a kept one is drafted, deployed, renamed and removed, and how a widget finds a query whose path moved.
subjects: [dashboards, resources]
---

A dashboard is one page of widgets. Volvel keeps dashboards in two places, and which place decides who may change it, whether it is versioned, and how it reaches production. This page explains the two, and what happens when a dashboard or the query it reads is renamed, removed, or taken over from the repository. To do the steps, see [Keep a dashboard as a resource of the workspace](../../how-to/queries/keep-a-dashboard-as-a-resource).

## The idea

**A member's dashboard** belongs to the member who made it. It is theirs until they share it, with everyone in the workspace or with groups of members. It is saved as it is changed, in the workspace's database, and it is not part of a deploy: it does not go to production and it is not in the repository. It is for a person's own view of the data, and it can be changed by that person alone.

**A dashboard the workspace keeps** is a :term[resource]{id=resource}, like a table, a query or an app. It has a path and a key, belongs to the workspace and not to a person, and is open to everyone who may see dashboards. It is deployed, promoted, versioned and, if you want, written in the repository. Because it goes to production, it is held to the rules of anything that is deployed: it must be finished, and it may name only tables, queries and sources that exist.

A member's dashboard becomes one the workspace keeps by being copied. **Keep it as a resource of the workspace…** saves a copy of the dashboard as a **draft** at a path you choose. Yours stays as it is. The two are separate from then on.

## How a kept dashboard is changed

In a dev workspace a resource is changed as a draft. Every change in the editor is saved to the draft, on the revision the editor opened, and the dashboard is read with its draft over what is deployed. Nothing a person looking at the deployed workspace sees changes until the draft is deployed from the **Deploy** screen. If two people change the same draft, the second to save is told, and is asked to choose between the two versions, so no one's work is lost without a choice.

Removing is a draft too. **Remove** saves a draft that says the dashboard is gone. It shows as **Removing** and can be taken back with **Keep this dashboard** until the draft is deployed. A dashboard that was never deployed has nothing to remove: its draft is discarded, and it is gone.

In a production workspace a kept dashboard is looked at and not changed. It arrives by promotion, as the rest of the workspace does.

## What a rename keeps

A resource has a **key** that never changes and a **path** that does. **Name and path** changes the path and title as a draft. Deployed, it is the same dashboard, with its history, and the old path goes on answering for 90 days.

A widget that reads a saved query names it by path, and a path can move. Two things keep the widget running:

- When a dashboard is deployed, Volvel records the key of each query its widgets name. If the path stops answering, because the query was renamed and the old path's 90 days ended, the widget runs the query with that key.
- When a query is renamed from the console, the dashboards the console keeps that name it are saved as drafts with the new path, so they are deployed together with the rename. The dialog lists them first. If the rename is discarded, the dashboard drafts it made are set aside with it, and one you changed since is kept, because it is your work.

A dashboard written in the repository is not changed by a rename in the console. Its widgets go on running through the recorded key, and show "Names `<old>`, now `<new>`: change it in the repository" until the path is changed in the code.

## Taking a dashboard over from the repository

A dashboard written with `defineDashboard` is managed in the repository: the next deploy from the repository is what it says. The console can still open it, and **Edit** saves a draft. Once that draft is deployed, the dashboard is a file that the console and the repository both edit. Until its definition is removed from the code, the next deploy from the repository takes it back. A draft that removes one of the repository's dashboards is refused, so the console offers no **Remove**: the repository removes it.

## What a reader sees

A reader sees the rows they may read, whichever kind of dashboard it is. A widget runs as the person looking, so each table's rules for who sees which rows apply to them: two people looking at one dashboard can see different numbers, and that is intended. A reader needs `dashboard:read` and `data:read`. They do not need `sql:read`, even when a widget's SQL was written by someone who did. What the **saver** needs is the other way: SQL written in a widget needs `sql:read` of whoever saves it, and a data source's table needs `data_source:read` of whoever saves it. A repository deploy is not asked for either, because code review gates it.

## How it fits

- Make and share a member's dashboard: [Make and share a dashboard](../../how-to/queries/make-and-share-a-dashboard).
- Why two people see different numbers: [How a query is answered](how-a-query-is-answered).
- The screens: [Dashboards](../../reference/screens/data/dashboards) and [Building a dashboard](../../reference/screens/data/dashboard-builder).
- The files: [Queries, data sources and dashboards as code](../../../develop/reference/queries/data-as-code).
