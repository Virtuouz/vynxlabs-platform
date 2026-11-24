---
title: How access to an app works
description: "What decides who may open an app and what it may do for them: sessions, roles and bindings, the app-only ceiling, row rules, scripts, guests and limits."
subjects: [apps, access]
---

An app is code that runs in someone's browser and calls the instance as that person. Nothing in the app decides what the person may do: the instance does, on every call, from who they are and the bindings they hold. This page says how.

## The idea

Three questions are asked, and each has its own answer.

- **May this person open the app?** They need `app:read` at the app. If they are not signed in, they are sent to the tenant's sign-in page and brought back. If they are signed in and lack it, they see a page, "Not for this account", with "This account may not open this app. If you think it should, ask the person who gave you the account."
- **What may the page read and do?** Each call it makes is checked as a call from that person: reading rows needs `data:read` at the table, starting a script needs `run:write` at the script, and so on.
- **Which rows?** Reading is held to the table's row rules.

An app that is open to someone and reads a table they have no binding at opens, and shows nothing.

## Who the person is

| Who | How they are known |
| --- | --- |
| A member of the tenant | At the instance's own address, by their console session. At an address of the app's own, they are carried over with a hand-off: a code, good for one use and 60 seconds, bound to the address, and made only from a member's own sign-in (an API key is refused). The session it starts lasts 12 hours. |
| An end user | By signing in at the tenant's sign-in page. Their session lasts 30 days. |
| Anyone | Not signed in: `anonymous`. They are known only by the bindings made to `anonymous`. |

The session is a cookie named for the tenant, `vx_app_` and the tenant's ID, set for the address the app is served at, `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS. A console session is 7 days; that is a different cookie. A request that changes something and comes from another origin is refused with 403 `cross_site`.

`signOut()` ends the app session. At the instance's own address, a member still has the console session, so they stay signed in as staff.

## Roles and bindings

A **binding** gives a **role** to a person, group or service account, at the tenant, at a workspace or at one resource. The role is a set of permissions. Two built-in roles are for apps:

| Role | Permissions |
| --- | --- |
| `portal_reader` | `app:read`, `data:read` |
| `portal_user` | `app:read`, `data:read`, `data:write` |

Neither holds a permission to start a script or a flow, or to read files. A role that does is one the tenant or the repository defines. The Share sheet offers the two built-in roles, as **Read** and **Read and change**.

**Bindings are per resource.** A binding at an app gives the app and nothing else. Each table (`data:read`), script (`run:write`) and flow (`flow_run:write`) the page uses has its own binding. The Share sheet makes the table bindings for you for the tables the app is declared to read. It does not make bindings for scripts and flows.

A person who started a run may read it, with no binding at the run.

## The app-only ceiling

A person who comes to an app, an end user or a member carried to the app's own address, holds only the kinds of permission an app needs: `script`, `run`, `flow_run`, `table`, `data`, `data_all`, `file`, `app` and `theme`. Whatever role they are bound to, a permission outside those kinds is not theirs while they are at an app. A binding made too wide cannot hand an end user the tenant's settings or secrets. A binding to `anonymous` gives nothing outside those kinds either, and an operator's access grant does not count at an app's address.

## Row rules

A table's policy decides which rows a person sees, once they may read the table: **open** (everyone sees every row), **owner** (each person sees the rows they own) or **rules** (the table's row rules, person by person). Both portal roles follow it. `data_all` ignores it and is not in the portal roles. When you build an app, remember that you, in `volvel dev`, are the developer, and see every row. See [Decide who sees which rows](../../../console/how-to/data/row-rules).

## Scripts run as the workspace

A script an app starts runs on a worker as the workspace, not as the person. Its own code decides what it may touch, as any script's does. The script can read who started it from `ctx.run.startedBy` and act for that person with `ctx.table(visits).as(ctx.run.startedBy.id)`, so that the table's row rules apply to its reads and writes. Starting the script still needs `run:write` at it.

## Guests

A guest, someone who is not signed in at an app that is open to anyone, can open the page and read the tables that are bound to `anonymous`. A guest cannot start a script or a flow from the app: the instance answers 403, "Sign in to start a script. A run started by someone who is not signed in cannot be read back." A form on a page can start a run for a guest. A guest has no run stream: the page looks at a run every two seconds.

A guest is held to limits by address, so a public app cannot be read as fast as someone likes:

| What | Limit |
| --- | --- |
| Pages | 600 a minute |
| Files | 1,200 a minute |
| API calls | 120 a minute for each route |

See [What an app may load](../../reference/apps/content-policy) for how they are counted.

## What this does not do

- It does not isolate two tenants' code served at one address for apps. Their code shares an origin. Give each tenant a hostname of its own with [Domains](../../../administer/how-to/apps/give-an-app-a-hostname).
- A widget's approval cannot be decided where a code app runs. The widget links to the console, and the instance answers 403 `decide_in_console` for a decision made at an app.
- A binding at the workspace to members does not show in the **Open to** column of the Apps screen.

## How it fits

- [Share an app](../../../console/how-to/apps/share-an-app) makes these bindings from the console.
- [Write an app as code](../../how-to/apps/write-an-app) makes them from the repository.
- [The Apps screen](../../../console/reference/screens/build/published-apps) shows who an app is open to.
