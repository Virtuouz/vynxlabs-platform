---
title: Apps
topic: build-apps
description: "Every control, state and permission of the Apps screen: the list of a workspace's apps, the inspector of one app, and the sheet that shares it."
subjects: [apps, access, domains]
moved_from:
  - build/published-apps
---

The **Apps** screen lists the apps a workspace serves, where each is served, and who may open it. An app is one of three kinds: written as code in the tenant's repository with `defineApp` (**Repository**), made in the [App Builder](app-builder) (**App Builder**), or a site drawn from a folder of pages of documentation (**Documentation**). The screen has a list, an inspector for the app you choose, and a sheet for sharing it. It has no tabs.

The screen is reached from **Build**, then **Apps**. F1 (**Help for this page**) opens the help topic `build-apps`. The app you open is in the address (`?app=`, by its ID or by its path), so a link opens the same app, and opening one adds it to Recent.

::screenshot{name=console/apps-list alt="The Apps screen: a search box, four Built filter chips with counts, and a table of three apps with their address, who they are open to and how each was built."}

## The list

The list has a description line, a search box and the **Built** filter above a table. Search and filter are not kept in the address: a reload clears them.

| Control | What it does |
| --- | --- |
| **Find an app** (the box says "Find by name or path") | Keeps the apps whose title or path contains what you type, ignoring capitals. |
| **Built** chips: **All**, **App Builder**, **Repository**, **Documentation** | Keep one kind. Each shows how many apps of the workspace are of that kind, whatever the search says. |
| **App** heading, **Built** heading | Sort up, then down. The other two headings do not sort. |

| Column | What it shows |
| --- | --- |
| **App** | The app's title and, under it, its path. |
| **Address** | The app's address on this instance, as a link that opens in a new tab, then one link for each hostname of the tenant's that is enabled for it. An app with an enabled and proved hostname of its own is redirected there from the app's address on this instance. A documentation app that is switched off shows the tag **Not published** instead. |
| **Open to** | Who is bound at the app, then who reaches every app through a binding at the workspace or the tenant. **Staff only** when no one is. The text is amber when the app is open to anyone. |
| **Built** | The tag **App Builder**, **Documentation** or **Repository**. |

**Open to** names people as the Share sheet does: "anyone", "every end user", an end-user group, a group of members or an email. A binding at the whole workspace or tenant to anyone, to every end user, to one end user or to an end-user group whose role holds `app:read` is added as, for example, "anyone (whole tenant)". A binding at the workspace to members is not shown there. See [How access to an app works](../../../../develop/explanation/apps/app-access).

The list shows the apps of the deployed version. An app removed in the console stays listed until its removal draft is deployed.

### States of the list

| State | What you see |
| --- | --- |
| Empty | "No apps yet", with the text "An app is defined in the tenant's repository with defineApp, or made in the App Builder. It is served once it is deployed here." |
| Nothing matches | "No app matches", with "Clear the search or choose All." |
| Not loaded | The list's error state, with a retry. |

## The inspector

Choosing a row opens the inspector beside the list. Its title is the app's title and the line above it is the app's path. Under the description:

| Row | What it shows |
| --- | --- |
| **Address** | The app's address, as a link. For a documentation app that is switched off: "Not published: switched off in the repository, so nothing is served". |
| **Hostname**, **Hostname (off)** | One row for each hostname registered for the app. A hostname that is off is still linked here, and is left out of the list. |
| **Built** | "In the App Builder (the interface's path)", "From the pages under (the folder)", or "In the repository". |
| **Files** | Repository apps only: how many files the app has and their size. |
| **Reads** | The tables the app reads, or "Nothing declared". For a repository app of files it is the list the code declares (`reads` in `defineApp`); for an app made from an interface it is the tables of the interface's widgets. A documentation app shows "Nothing declared". |
| **Open to** | As in the list, or "Staff whose role lets them read this workspace" when no one else is bound. |

When anyone may open the app without signing in, by a binding at the app, the workspace or the tenant, a notice says "Anyone with the address can open it, without signing in."

The inspector's footer:

| Control | What it does |
| --- | --- |
| **Share** | Opens the [Share sheet](#the-share-sheet). Disabled, with a tooltip, without `binding:write`. |
| **Remove** | Only for an app the repository does not define (made in the console). Asks "Remove this app?" and says "This saves a draft that removes it. Nothing changes until that draft is deployed. Its address stops serving once that draft is deployed." Disabled without `resource:write`; for an App Builder app `interface:write` is enough, and for a documentation app `doc:write`. |
| "Managed in the repository: the app is removed there." | Shown in place of **Remove** for an app the repository defines. That includes an App Builder app whose interface a repository file defines, which keeps its **App Builder** tag in the list. |
| **Open the live app** | Opens the address in a new tab. Not shown for a documentation app that is switched off. |

The screen has nothing to unpublish an app made in the console, to preview one, or to count files an app no longer names. Taking an app out of service is removing it. A documentation app has a draft preview at its address followed by `_draft/`. To try an app before you deploy it, use [`volvel dev`](../../../../develop/how-to/apps/run-an-app-while-you-write-it).

## The Share sheet

The sheet is titled "Share" followed by the app's title, with the app's address under it. It has two tabs and one button, **Done**.

### Who has access

| Part | What it shows or does |
| --- | --- |
| "Staff whose role lets them read this workspace" | A fixed row, marked "always". |
| Rows tagged "under Access" | A binding at the workspace or the tenant that reaches every app: "(who) may open every app of the whole workspace" or "of the whole tenant". Read only. Change it under **Access**. |
| One row for each binding at the app | The person or group, then "may read" (role `portal_reader`), "may read and change" (role `portal_user`), or "as (the role's name)". |
| **Stop sharing** | Asks "Stop sharing (app) with (who)?" and names what goes with it: "They lose the app, and their access to its N tables goes with it." A table another app of the workspace reads, shared with the same people and the same role, stays. The text then names it, as in "They lose the app. 1 table stays, for 1 other app that uses it: Board." When every table stays, the first sentence is only "They lose the app." |
| The tag **From repository** | A binding made by the repository. It has no **Stop sharing**: change it there. |
| "Nobody else yet." | No binding at the app. |

**Add an audience** gives one audience one role:

| Field | What it takes |
| --- | --- |
| **Share with** | **Every end user who signs in**, **End users in** an end-user group, **Members in** a group, or **Anyone, without signing in**. The last adds a warning: "Anyone who has the address can then open the app and read what its tables let everyone read." Groups are listed up to 200 of each. |
| **They may** | **Read** (`portal_reader`: `app:read` and `data:read`) or **Read and change** (`portal_user`: those and `data:write`). |
| **Share** | Makes the binding at the app and one at each table the app reads, and skips any that already exist. A line says which tables are given with it, or "Only the app is given. If it reads tables, give access to those under Access." |

The bindings are made one after the other and are not undone if one fails: a failure part-way leaves the ones already made. The sheet does not offer single people, service accounts or custom roles. Use **Access** for those. Sharing does not bind scripts or flows an app starts; bind those under **Access** too.

### What they can read

One card for each table the app reads. It shows the table's name, a tag for its policy (**Row rules**, **open** or **owner**) and a sentence: "Of its rows, everyone it is shared with sees every row.", "Of its rows, each person sees the rows they own." or "Of its rows, the table's row rules decide, person by person." When the table's policy cannot be read, the card says "Its policy is not known here." For a table with row rules or an owner rule, and for each group the app is shared with, a line reads "Someone in (group) sees N rows". It needs `data_all:read`; without it the count shows a dash. When the app was shared with anyone, a notice says "Anyone with the address can open it. Whatever its tables let everyone read is public."

When there are no tables, the tab says why: for a repository app, "Its code declares no tables. Ask its developer to list them with `reads` in defineApp."; for a documentation app, "It serves pages of documentation, and reads no table."; for an App Builder app, "It shows no table."

## Permissions

| Action | Needs |
| --- | --- |
| Open the screen and the list | `app:read` in the workspace |
| See the Share sheet's bindings | `binding:read` |
| **Share**, **Stop sharing** | `binding:write` |
| Fill the **Share with** lists and the role | `role:read`, `group:read`, `end_user_group:read`, `resource:read` |
| See the row counts for a group | `data_all:read` |
| **Remove** | `resource:write`, or `interface:write` or `doc:write` for an app of that kind |

A workspace admin holds these. See the [permissions reference](../../../../administer/reference/permissions).

## Related

- [Share an app](../../../how-to/apps/share-an-app)
- [Give an app a hostname of its own](../../../../administer/how-to/apps/give-an-app-a-hostname)
- [How access to an app works](../../../../develop/explanation/apps/app-access)
