---
title: Share an app
description: Choose who may open an app and what they may do with its tables, check what that gives them, and stop sharing.
subjects: [apps, access]
---

## Share an app

By the end you will have given a group of end users the Desk app, with the right to read and change the rows of the table it shows, seen what they can read, and taken the sharing back.

## Before you start

- You need `binding:write` in the workspace to share, and `binding:read`, `role:read`, `group:read`, `end_user_group:read` and `resource:read` to fill the sheet's lists. A workspace admin has them. See the [permissions reference](../../../administer/reference/permissions). Without `binding:write` the **Share** button is grayed out and its tooltip says what is missing.
- The app is deployed to the workspace. It is listed on **Build**, then **Apps**.
- The people you share with exist: an end-user group (see [End users](../../../administer/reference/screens/end-users)) or a group of members.

## Share the app

:::steps
1. Open **Build**, then **Apps**, and choose the app's row. The inspector opens and shows **Open to**. For an app nobody has been given yet it reads "Staff whose role lets them read this workspace".
2. Press **Share**. A sheet titled "Share Desk" opens on the tab **Who has access**. It lists "Staff whose role lets them read this workspace", marked "always", and "Nobody else yet." if no one else has the app.
3. Under **Add an audience**, choose **Share with**. Choose **Every end user who signs in**, **End users in** a group, **Members in** a group, or **Anyone, without signing in**.
4. Choose **They may**: **Read** or **Read and change**. **Read** lets them open the app and read rows. **Read and change** also lets them add, change and delete rows.
5. Read the line under the choices. It says which tables are given with the app ("Given along with the app: its table visits. Which rows each person sees is decided by each table's row rules."). If you chose **Anyone, without signing in**, a warning says that anyone with the address can open the app and read what its tables let everyone read. Be sure before you go on.
6. Press **Share**. The audience appears in the list as "(group) may read and change" with a **Stop sharing** button.
7. Open the tab **What they can read**. Each table the app reads is a card with its policy and a sentence for who sees which rows. For a table with row rules, a line says how many rows someone in each group you shared with sees.
8. Press **Done**.
:::

::screenshot{name=console/apps-share alt="The Share sheet of the Desk app: a fixed row for staff, a row saying Front desk may read and change with a Stop sharing button, and the Add an audience form."}

The people you shared with can open the app at its address, which is on the sheet and in the list. Someone who is not signed in is sent to the tenant's sign-in page first.

## Stop sharing

:::steps
1. Open **Apps**, choose the app and press **Share**.
2. Press **Stop sharing** on the audience's row. A dialog asks "Stop sharing Desk with (group)?" and says what goes with it: "They lose the app, and their access to its 1 table goes with it."
3. If another app of the workspace reads one of the same tables and is shared with the same people and role, the table's access stays, and the text says so: it names the other apps. This keeps those apps working for them.
4. Press **Stop sharing**. The row goes from the list.
:::

## The result

The app's **Open to** shows who may open it, in the list and in the inspector. A person you shared with and a person you did not see different things at the app's address: the first opens it, the second is asked to sign in, or sees the page "Not for this account" if they are signed in without access.

Sharing gives a role at the app and at each table it reads. It does not give a script or a flow the app starts. If the app starts a run, bind the script (`run:write`) or the flow (`flow_run:write`) under **Access** too. See [How access to an app works](../../../develop/explanation/apps/app-access).

## If it does not work

| What you see | Why and what to do |
| --- | --- |
| **Share** is grayed out. | You lack `binding:write` in this workspace. Ask a workspace admin. |
| "Its code declares no tables. Ask its developer to list them with `reads` in defineApp." | A repository app lists the tables it reads in `reads`. Until it does, **Share** gives the app and no table: the app opens and shows nothing. Give the tables access under **Access**, or add `reads` to `defineApp` and deploy. |
| The sheet says "Only the app is given. If it reads tables, give access to those under Access." | The app declares no tables. Same fix. |
| An audience is not in **Share with**. | Only **Every end user who signs in**, an end-user group, a group of members or anyone are offered, up to 200 groups of each. For one person, a service account or a custom role, use **Access**. |
| The sheet fails part-way and some rows appear. | The bindings are made one after the other and are not undone. Press **Share** again: it skips the ones that exist. |
| A binding is tagged **From repository** and has no **Stop sharing**. | The repository made it. Change it there and deploy. |
| People you shared with see no rows. | The table's rules decide which rows each person sees. Check **What they can read**, and see [Decide who sees which rows](../data/row-rules). |

## Related

- [Apps screen](../../reference/screens/build/published-apps)
- [How access to an app works](../../../develop/explanation/apps/app-access)
