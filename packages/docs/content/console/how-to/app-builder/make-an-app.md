---
title: Make an app
description: Make an app over a Fernhill table in the App Builder, start its first page from a list of the table, and leave it as a draft.
subjects: [app-builder, apps]
---

## Make an app

By the end you will have an app in the **App Builder** list with a page that lists a table's rows, a side sheet that shows one row and a button that adds a row. Nobody else can open it yet: it is a draft until you [publish it](publish-an-app).

## Before you start

- You are signed in to the console, in a dev workspace such as Fernhill's Sandbox. A production workspace is read only for apps. You need `resource:write` or `interface:write` there. A tenant admin and the App maintainer role have it. See the [permissions reference](../../../administer/reference/permissions).
- The workspace has a table to read. This page uses Fernhill's `appointments`.

## Steps

:::steps
1. Open **Build**, then **App Builder**. The list shows the apps made in the console.
2. Press **Make an app**. If the button is grayed out, its tooltip says what you are missing.
3. In **Name**, type the app's name, for example "Front desk". **Address** fills itself from the name, here `front-desk`. Change it if you want another. The address is lower-case letters, digits and dashes, 40 characters at most, and it does not change when you rename the app later.
4. Press **Make the app**. The workbench opens on the new app with one empty page that has the app's name. The header says "Saved. Not published yet." and the left pane lists **Pages** with that one page.
5. Press **Add a page** (the **+** beside **Pages**). Under **Start from** choose the **A list of** choice. A **Table** list appears under it: choose **Appointments**, and the choice now reads **A list of Appointments**.
6. Leave **Name of the page** as it is, or change it, and press **Add the page**. A notice says what was made: "Appointments is added, with a search, a table, Appointment detail and a “New appointment” button." The page shows the first 25 rows, and **On this page** lists **Search and filter** and the table.
7. The first page is still there and still empty. Choose it under **Pages**, press **⋯** at the top of its settings, then **Remove page**, and confirm with **Remove the page**.
:::

## The result

The app is in the **App Builder** list. Its row says **Not published**, with the address "Once it is published", and the page count. It is saved as you work: the status in the header reads "Saved. Not published yet.", and a reload opens the same page. The other builders of the workspace see the draft, and people who use the app see nothing until you publish it.

The list page has a search above a table of appointments. Choosing a row opens **Appointment detail**, a side sheet, and **New appointment** opens a form in a modal. Neither runs on the page in the workbench: use **Preview** for that. See [Publish an app](publish-an-app).

## If it does not work

- **"Something already exists at this path. Choose another, or open that one."** The address is used by another app, resource or draft. Type another in **Address**.
- **Make an app is grayed out.** You lack `resource:write` and `interface:write` in this workspace. Ask a tenant admin for a role that has one.
- **Only "A blank page" is offered.** The workspace has no tables. Make one under **Data**. If the dialog says "The tables could not be read, so a page cannot start from one yet", you may not read the workspace's tables: ask a tenant admin.
- **"This makes N pages, and the app has room for M."** An app has at most 20 pages. Remove one first.
- **The app is not in the list.** The list is of one workspace. Check the workspace in the top bar.

## Related

- [App Builder](../../reference/screens/build/app-builder): the list, its states and the Rename and Remove buttons.
- [Pages and their settings](../../reference/app-builder/pages).
- [How an app is made](../../explanation/app-builder/how-an-app-is-made).
