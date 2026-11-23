---
title: Publish an app
description: Look at an app as a group sees it, try it in a Preview where buttons run, read the publish check, publish it, and restore an earlier draft.
subjects: [app-builder, apps]
---

## Publish an app

By the end the people an app is shared with will see your draft: you will have tried it, read the publish check, and published.

## Before you start

- An app with at least one page open in [the workbench](../../reference/screens/build/app-builder-editor), in a dev workspace. [Make an app](make-an-app) gets you one.
- To publish you need `deployment:write` in the workspace, or `interface:write` alone, which deploys only an interface and the app that serves it. To read the check you need `deployment:read`, or `interface:write` for the interface and app that are named. A tenant admin, and the App maintainer role, have them. See the [permissions reference](../../../administer/reference/permissions).
- Who may open the app is not set here. It is set on the **Apps** screen, under **Share**. See [Apps](../../reference/screens/build/published-apps).

## Try the draft first

:::steps
1. To see what a group sees, press **View as** in the header and choose the group, for example **Practice managers**. Widgets limited to other groups are drawn faded with "Hidden for" and the group's name. You still read the rows yourself: a line under the page says "Rows are yours".
2. Press **Preview**. A new tab opens on the draft as a person will use it, with the menu, record pages, side sheets and modals. The bar at the top says "Preview of the draft" and "Actions change" the workspace's "rows." Press a button: it runs, and it really changes the rows of this workspace.
3. In the Preview use **Desktop**, **Tablet** and **Phone** to see the widths. Press **Close** to leave. If the app has been published before, **Open the published app** opens it.
:::

## Check and publish

:::steps
1. Press **Publish**. The builder saves what is unsaved and opens a panel with a heading: "Checking before you publish", then "Ready to publish", or "Not ready to publish: N things to fix". Its line says where it deploys: "Deploys to Sandbox for the first time. Nobody sees it until then." for a new app, else "Deploys to Sandbox. The live app keeps working until then." **N draft changes** beside the name opens the same panel.
2. Read the rows. A green check is a pass, such as "All data sources found", "3 actions are complete" or "New appointment form is valid". An amber row, "Worth knowing", does not stop the publish. A red row, "Needs fixing", does. A row that has a place on the page has **Show it**, which closes the panel and selects the widget. When something needs fixing the foot of the panel says "Publish is off until these are fixed:" and lists them.
3. Under the rows, **N changes** lists what the publish changes against what people see, such as "Added page Appointments". When the app uses groups in its rules, **Try as** a group **first** closes the panel and sets **View as** to that group.
4. When it says "Ready to publish", press **Publish N changes**. The panel closes and a notice says "Published. People who open the app now see this." with **Open the app**. The header's status reads "Published."
:::

::screenshot{name=console/app-builder-publish-check alt="The publish check open under the Publish button: Ready to publish, three passed checks, the list of eight changes and the Publish 8 changes button."}

### What the check looks at

| It says | Why | Stops the publish |
| --- | --- | --- |
| "N data sources not found", with the names | A table or query a widget reads does not exist. | Yes |
| "N of M actions are not complete", with where | An action has no steps, opens a page that is gone, adds to a table that does not exist, has no flow or script chosen, names one that does not exist, or starts a flow or script without an input it needs. | Yes |
| "N buttons with no label" | A row action, or a button of an Action group, has no words and no icon. | Yes |
| "Button on Y: needs label." | A **Button** widget has an empty **Says**. The same words are in the **N to fix** list beside the name. | Yes |
| "X form can't save" | A form has no table, or asks for a column the table lacks. | Yes |
| What saving or deploying refused, in the page's words | The control plane's own check, such as an action with no steps, or another resource this deploy carries. | Yes |
| "X on Y shows nothing yet" | A List with nothing placed, a Pivot with no grid, or a Record detail with no record. | No |
| "Approvals lists X, which asks for no approval" | A flow it lists has no approval step. | No |
| "Approvals are decided in the console, not in this app" | Apps are served at an address of their own, so the app shows the requests and sends people to the console to decide them. | No |
| "Phone layout hides N widgets" | See [Set the phone and tablet layout](set-the-phone-layout). | No |
| "X has Help topic Y, and no document has that topic" | The page's Help button would show nothing. | No |
| "N groups named in the rules no longer exist" | An action that names only such groups can be run by nobody. | No |
| "Could not check the tables and queries" or "the groups", with the reason | The check could not read them. It does not call them missing. Publishing is not held for it. | No |

If the check cannot be made, the panel says "The check could not be made" with the reason, and **Check again**. **Publish** stays off until it can.

## Restore an earlier draft

:::steps
1. Press the arrow beside **Publish** (**More ways to publish**), then **Restore an earlier draft**. The dialog lists the versions that each save put aside, newest first, with who saved each and what it did.
2. Choose one. The preview shows its pages and, under "Restoring it changes the draft", what would change.
3. Press **Restore**. The draft becomes that version, and a notice says "Restored the draft saved" and when, with **Undo**. **Not now** closes the dialog. Nothing is published by this.
:::

## The result

The app is deployed to this workspace. The **App Builder** list says **Published v1** (or the next number) and shows its address. A later edit shows **Edits not published** until you publish again, and the live app keeps working until each publish is deployed. A publish deploys only this app's interface and the app that serves it, not other drafts, tables or scripts. The version appears under **Deploy**. To reach the linked production workspace, promote that version from there.

## If it does not work

- **Publish is grayed out.** Something needs fixing, or a save has failed. **N to fix** beside the name lists it, and the status says "Not saved:" and the reason.
- **"You can change this app but not publish it here. Ask someone who may deploy to this workspace: your draft is kept."** Publishing needs `deployment:write`, or `interface:write` alone. Ask someone who may deploy.
- **"Someone else saved this app after you opened it."** Another builder saved first. See [Building an app](../../reference/screens/build/app-builder-editor).
- **A button does nothing on the page in the workbench.** The canvas never runs actions. Use **Preview**.
- **"You may not read this app's draft, or it is no longer here."** The Preview could not read the draft. Open the workbench again or ask whoever builds it.

## Related

- [Building an app](../../reference/screens/build/app-builder-editor): the header, saving and read only.
- [How an app is made](../../explanation/app-builder/how-an-app-is-made): what a publish deploys and why a draft is shared.
