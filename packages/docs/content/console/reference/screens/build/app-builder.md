---
title: App Builder
topic: build-screens
description: "Every control, state and permission of the App Builder list: the apps made in the console, how to make, rename, discard the edits of and remove one, and what each state means."
subjects: [app-builder, apps]
moved_from:
  - build/app-builder
---

The **App Builder** screen lists the apps that are made in the console in one workspace. An app made here is two resources that go together: an **interface**, which holds its pages, and an **app**, which serves that interface at an address. The list shows them as one row. Opening a row opens [the workbench](app-builder-editor), where the pages are built.

A change made in the workbench is saved as a draft that the workspace's builders share. People who use the app see it only when it is published. [How an app is made](../../../explanation/app-builder/how-an-app-is-made) explains the draft, the publish and the two resources. The **Apps** screen, under **Build**, is the other list: it shows every app a workspace serves, whoever made it, and who may open it. See [Apps](published-apps).

The screen is reached from **Build**, then **App Builder**. F1 (**Help for this page**) opens the help topic `build-screens`. The workbench and the preview have a help topic of their own, `build-screens-editor`.

::screenshot{name=console/app-builder-list alt="The App Builder list: a Make an app button and a table of apps with their pages, state, address, and the Rename and Remove buttons."}

## The list

The screen has a description line, a **Make an app** button and a table named **Apps**. In a production workspace the screen has a notice instead of the button: "Apps are built in a dev workspace and promoted. Here they can be opened." There the list has no **Rename**, **Remove** or **Discard draft**, and the name of an app is plain text, not a link to the workbench.

| Column | What it shows |
| --- | --- |
| **App** | The app's name, as a link to the workbench, and under it its path, such as `screens/operations`. The link is not drawn in a production workspace. |
| **Pages** | How many pages the app has, and under it "reads" and the tables its widgets read. |
| **State** | See the table below. |
| **Address** | The address the app is served at, as a link that opens in a new tab. Before it is published it reads "Once it is published". An interface with no app that serves it reads "No app serves it". |
| (no heading) | **Rename**, and **Remove** or **Discard draft**. See below. |

### States of an app

A row can show more than one of these.

| State | What it means |
| --- | --- |
| **Published v1** | The app is deployed in this workspace, at this version. Its tooltip reads "Published means deployed here". |
| **Not published** | The app is not deployed here yet. Its tooltip reads "Not published means not deployed here yet". |
| **Edits not published** | The app is deployed and has a draft that differs. |
| **Being removed** | A draft that removes the app is waiting to be deployed. |
| "edited 1h ago" | When the draft was last saved. |

## Make an app

**Make an app** opens a dialog of the same name. It says: "It starts with one empty page. Other builders of this workspace see the draft; people who use the app see nothing until you publish it." The button needs `resource:write` or `interface:write` in the workspace. Without it the button is disabled, its tooltip says what is needed, and a line under the description says you can see the apps and not change them. It is not drawn in a production workspace.

| Field | What it takes |
| --- | --- |
| **Name** | The app's title, required, 100 characters at most. A counter shows "n of 100". |
| **Address** | Required. It is filled in from the name: lower-case letters, digits and dashes, 40 characters at most. Typing in it changes it, and the name no longer fills it in. The hint reads "The app's address ends with this. Lower-case letters, digits and dashes." |

**Make the app** is off while the address is empty. It saves two drafts, an interface at `screens/<address>` with one empty page named after the app, and an app at `<address>` that serves it, then opens the workbench on the new interface. The address does not change when the app is renamed later.

If the address is already used by another resource or draft, the **Address** field says "Something already exists at this path. Choose another, or open that one." and nothing is made. If the app cannot be made after the interface was, the interface's draft is removed again. Any other refusal is shown in the dialog.

## Rename

**Rename** opens "Rename" and the app's name. It says: "Only its name changes. Its address does not, so links to it keep working. Nothing changes for people until you publish." The field takes the same 100 characters as **Name** above, and under it the dialog says "The address stays" and the app's path.

**Save as a draft** is off until the name differs and is not empty. It changes the title of the interface and of the app that serves it, in one step, and shows "A draft renames X to Y." with the action **Review and deploy**, which opens the **Deploy** screen. **Rename** is disabled for an app managed in the repository, with the tooltip "It is defined in the repository's code. Change its path or title there, and give it key: "…"." (the path or key of the app follows). Renaming does not change the address, and it does not change a page's title.

## Remove, Discard draft and Keep this app

The button at the end of a row depends on where the app stands. Each one asks first and says what it will do.

| The row | The button | What it does |
| --- | --- | --- |
| Deployed, with edits not published | **Discard draft**, next to **Remove** | Asks "Discard this draft?": "The app goes back to how it was last deployed. One that was never deployed is gone." Press **Discard**. The edits are thrown away and the deployed app is untouched. |
| Deployed | **Remove** | Asks "Remove this app?": "This saves a draft that removes it. Nothing changes until that draft is deployed. The app's address stops serving it once that is deployed." If the app also has edits not published the text goes on: "The edits not published are replaced by the removal; to drop only them, use Discard draft." Press **Remove**. The interface and its app are drafted for removal together, and the row shows **Being removed**. |
| Never published | **Discard draft** | Asks the same question as above. Because nothing was ever deployed, the app is gone from the list. |
| **Being removed** | **Keep this app** | Asks "Keep this app?": "This throws away the draft that removes it. The app stays as it was last deployed." Press **Keep**. |
| Managed in the repository | The text "Managed in the repository: the app is removed there." | No button: the console cannot remove an app the repository manages. |

A removal is a draft like any other. The app is served until the draft is deployed from the **Deploy** screen, and it can be taken back with **Keep this app** until then.

## States of the screen

| State | What you see |
| --- | --- |
| Empty | "No apps made here yet", with the text "Make one over a table of this workspace. Tables are under Data." and **Make an app**. |
| Not loaded | The list's error state, with a retry. |
| Read only | A line says you can see the workspace's apps, not change them, and that it needs `resource:write`, or `interface:write` alone. **Make an app** is disabled. |
| Production | The notice "Apps are built in a dev workspace and promoted. Here they can be opened." No buttons that change an app. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `resource:read` in the workspace, or `interface:read` alone. |
| **Make an app**, **Rename**, **Remove**, **Discard draft**, **Keep this app** | `resource:write` in the workspace, or `interface:write` alone. The screen disables only **Make an app**; the other buttons are refused when the draft is saved. |
| Open the workbench | The list's permission to read. To change anything there you need the write permission above, in a dev workspace. See [the workbench](app-builder-editor). |

The built-in role App maintainer holds `interface:*`, `data:read`, `data:write` and `app:read`, and builds and deploys these apps and nothing else. See the [permissions reference](../../../../administer/reference/permissions).

## Related

- [The workbench](app-builder-editor): the screen an app opens in.
- [Make an app](../../../how-to/app-builder/make-an-app): the steps, from a table to a first page.
- [Apps](published-apps): where each app is served and who may open it.
- [How an app is made](../../../explanation/app-builder/how-an-app-is-made).
