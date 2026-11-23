---
title: Deploy and Versions
topic: operate-release
description: "Every control, state and permission of the screen that deploys a dev workspace's drafts, promotes a version to the workspace it is linked to, and lists the versions a workspace has run."
subjects: [deploy, promotion, versions]
moved_from:
  - operate/releases
---

This screen is called **Deploy** in a dev workspace and **Versions** in a production workspace. In a dev workspace it has three steps: review the drafts, deploy them as a version of that workspace, and promote what runs there to the workspace it is linked to. In production it has one step, the list of versions that ran there, with the way to roll back.

The screen is reached from **Operate**, then **Deploy** (or **Versions**). F1 (**Help for this page**) opens the help topic `operate-release`. The same screen answers the addresses `release`, `changes` and `deployments`.

::screenshot{name=console/releases-review alt="The Deploy screen of a dev workspace on its first step: the stepper, the drafts grouped by kind with a tag each, and the panel Deploy to this dev workspace beside them."}

## The steps

The step is in the address, as `?step=review`, `?step=deploy` or `?step=promote`, so a reload, a link and the browser's Back button land on the same step. A step the workspace does not have opens its first one: `?step=review` in a production workspace opens **Versions**, and `?step=promote` in a dev workspace that promotes nowhere opens **Review draft**.

| Step | Where | What it shows |
| --- | --- | --- |
| **Review draft** | Dev workspace | The drafts, with how many ("N changes"), and the panel that deploys them. |
| **Deploy to dev** | Dev workspace | The versions of this workspace, newest first. |
| **Promote** | A dev workspace that has a link | What a promotion would do, and how the two workspaces differ. The step's detail is the name of the workspace it promotes to. |
| **What runs here** | Production workspace | The same list as **Deploy to dev**, with the detail "Versions and roll back". Production has no stepper. |

The page title is **Deploy** or **Versions**, with a **Dev** or **Production** tag. The side panel, the tab title and the command palette use the same word.

## Review draft

A draft is a change saved in a dev workspace and not yet deployed. Each editor saves drafts as you work; the Resources screen's **New** menu saves them too. This step lists every draft of the workspace.

### Rows

Drafts are grouped under a heading for their kind: **Apps** (an interface shows as an app), **Docs**, **Flows**, **Scripts**, **Tables**, **Variables** and so on. Each row has:

| Part | What it shows or does |
| --- | --- |
| Check box **Choose** *path* | Chooses the draft. With none chosen, deploying takes every draft. With some chosen, it takes those. |
| The path | A link to the draft's editor. A kind with no editor of its own opens its screen, or the Resources list. A removed resource has no link. |
| A tag | **New**, **Changed**, **Removed**, **Takes over from code** or **Renamed**. A renamed draft also says "from" and the path it had. |
| "saved … ago" | When the draft was last saved. |
| **Earlier** | Opens the sheet of earlier saves of this draft. |
| **Set aside** | Asks "Set aside the draft of *path*?" and, if you confirm, sends the draft back to how it was last deployed. The draft stays in its history. |
| Lines of text | What the change does, in plain words: "A new variable.", "Changes who sees which rows." A renamed resource is described against what runs, not as new. |

A draft with the tag **Takes over from code** is one the repository's code still defines. The row says: "The repository's code defines this *kind* now. Deployed, it becomes a file the console owns, which git sync then carries. A deploy from the repository that still defines it takes it back."

When the review has more than one draft, none is chosen, and some were saved more than 24 hours ago, a notice says "One of these was saved more than a day ago" (or "N of these were") and names up to three. It ends: "Deploying deploys every draft here. Check the ones you mean, or set aside what is no longer wanted."

### The panel Deploy to this dev workspace

| Part | What it shows or does |
| --- | --- |
| Summary | "Deploying creates N, changes N and removes N." followed by what happens to tables, if anything. While it is worked out: "Checking what a deploy would do…". |
| **These changes cannot be deployed yet.** | Shown when the deploy would be refused. It gives the reason and a list of what it names. A path that can be set up, such as a connection, a variable, a secret or a data source, has a **Set up** link. The codes are in [Why a deploy or promotion is refused](../../../../develop/reference/releases/refusals). |
| **Not set up here, and the deploy still works** | A warning listed per item, such as "the connection "x" is not set up in this workspace. A run that reaches it fails until it is set up." A dev workspace deploys with something not set up. |
| **What changed** (optional) | A message kept with the version. When the workspace follows a branch, it is the commit message. At most 500 characters. |
| **Deploy N change(s)** / **Deploy the N chosen** | Deploys. Disabled while the deploy would be refused. |
| **Set aside the N chosen** | With some drafts chosen. Asks "Set aside N drafts?" and sets them aside, 100 at a time. |
| **Choose none** | Clears the choice. |

When it works, the screen moves to **Deploy to dev**, and a message says "Deployed as version N: *paths*." with **Promote to *name*** when the workspace has a link. Deploying drafts to a dev workspace changes only that workspace. A deploy of every draft never stops for something it takes for a rename, because the drafts are what you asked for.

### Earlier saves of a draft

**Earlier** opens the sheet "Earlier versions of *path*": "Each save keeps what it replaced. Bringing one back makes it the draft again." Each row says "Revision N", with a **Set aside** tag for a draft that was set aside, when it was saved, and **Bring back**. A draft with no earlier save says "No earlier versions yet." The newest 30 saves of each resource are kept.

### States of the step

| State | What you see |
| --- | --- |
| Loading | The step's loading state. |
| Empty | "Nothing waiting to be deployed" and "Save a flow, a script or an app in this workspace and it appears here, with what it changes." |
| Not loaded | The error text of the failed request. |

## Deploy to dev, and Versions

**Versions of *workspace*** lists what ran in this workspace, newest first, at most 100.

| Part | What it shows or does |
| --- | --- |
| **v*N*** | The version number. Numbers belong to the workspace: version 4 in production need not be version 4 in dev. |
| Message | The message given when it was deployed, "Promoted" for a version a promotion brought, "Pulled *commit* from *branch*" for a version a Git pull made (*commit* is the first seven characters), or "No message". |
| Author · time | Who deployed it, and when. |
| **Running in *name*** | One tag for each workspace of the tenant that now runs the same bundle, found by its digest. |
| **Deploy this version** or **Roll back to this version** | On every version that is not the one running. A version earlier than the one running says **Roll back to this version**; any other says **Deploy this version**. |

The button asks first. The question is "Deploy version N to *workspace*?" or "Roll back *workspace* to version N?" and says: "*Workspace* stops running what it runs now and starts running version N at once. Runs in progress there finish on the version they started with." In production the answer button is **Deploy in production** or **Roll back in production**, and the question is a danger confirmation. In a dev workspace it is **Deploy** or **Roll back**. When it works, a message says "Version N is what runs here now." A rollback or a deploy of an earlier version adds a new row to the list: the list is a record of what ran, in order.

If putting the version in place would delete something that holds runs, rows or access, and create something of the same kind, it is refused as a suspected rename. The screen asks "Delete *paths* in *workspace*?" with the action **Delete them and look again**, and sends the request again naming each path.

Under the list, **Not yet run here** lists bundles that were uploaded to this workspace and never ran in it: "Uploaded … ago, never run here", with the same button. It is not shown when there are none.

| State | What you see |
| --- | --- |
| Empty | "Nothing deployed here yet". |
| Not loaded | The error state of the list, with a retry. |

## Promote

The step shows two cards and what the promotion would do.

- **From**: the dev workspace and "Runs v*N*".
- **To**: the workspace it promotes to, with its tag, and "Gets the same bundle, by its digest. Nothing is rebuilt."

A promotion sends the version that runs here. It does not send drafts, and it does not send data, secrets, variables' values or bindings. Each workspace keeps its own.

### What changes in *workspace*

"Creates N, changes N, renames N and removes N." (renames only when there are some), then one line per resource: a tag (**created**, **updated**, **renamed**, **deleted**), the old path for a rename, the path and the kind. After the list, the changes to tables, or "No table changes."

If the promotion would be refused, a notice says **It cannot be promoted yet.** with the reason and the list of what it names, as for a deploy. For `bindings_missing` the list is each connection, secret, variable or data source with a **Set up** link that opens the target workspace.

A workspace with nothing deployed has no promotion to work out. The step shows the two cards and a plain notice, "This workspace has nothing deployed, so there is nothing to promote.", with no **Try again** and no "Working out what promoting would do…". **Promote to …** is disabled, with the tooltip "There is nothing to promote until this workspace has something deployed."

| Control | What it does |
| --- | --- |
| **Delete them anyway** | Shown when the refusal is `rename_suspected`. Asks "Delete *paths* in *workspace*?" ("What each one holds there is cut off from whatever is created in its place. If one of them was renamed, give the new one its key in the repository instead, and nothing is lost."). On **Delete them and look again** the preview is worked out again with those paths allowed. |
| A notice **This changes a name that something outside calls.** | Shown for a promotion to a production workspace that would change or remove the name of a tool an agent calls. Each one is listed. The promotion asks for the confirmation of them. |

### Before it goes

| Row | What it shows |
| --- | --- |
| **Tried here** | "N runs, N failed": the runs and flow runs of this workspace. |
| **Triggers there** | "N stay running": the triggers of the target. |

Under them, one of three: a notice "This version has not run here yet. Try it before it reaches production."; a notice "Some of its runs here failed." with **See them** (the failed runs); or "Every run here succeeded".

### Promote buttons

| Control | What it does |
| --- | --- |
| **Promote to production** or **Promote to *name*** | Shown to someone who may promote to the target. The label says "production" for a production workspace and the workspace's name otherwise. It asks "Promote to *name*?" and says "*Name* starts running version N at once. Runs in progress there finish on the version they started with." (with "It also changes what an agent calls: …" when there are such changes). It is disabled while the promotion would be refused, and while the workspace has nothing deployed. |
| **Change where this promotes to** | Opens the workspace's settings, where **Promotes to** is set. It needs `workspace:write` in this workspace; without it the button is disabled and its tooltip says what it needs. |

When it works, the screen says "*Name* now runs version N." (N is the number in the target's own list, which can differ from the one in the dev workspace.) For a promotion to production with a release branch it adds "Committed to *branch*." If that commit failed it adds "The release branch was not updated: *reason*." with **Try again from Git sync**, a link to the production workspace's Git sync. A message offers **Open *name***. If you came from a failed run (`?fromRun=`) it offers **Run the failed run again on v*N*** instead.

### Request a promotion

Someone who may not promote to the target sees a section **Promoting to *name***, with: "You may not promote to *name* yourself. Ask, and those who may are shown your request on the tenant's overview, with what it would change."

| Control | What it does |
| --- | --- |
| **A note for whoever decides (optional)** | Up to 1000 characters. |
| **Request promotion of v*N*** | Asks for the version that runs here now. A new request replaces any pending request for the same two workspaces, whoever made it. |
| **Withdraw the request** | Shown on your own pending request only. It acts at once, with no question, and the form comes back. Someone else's pending request is not shown to a person who may not promote. |

The request's state is shown as a line: **Waiting** ("Asked … ago by *name* for v*N*."; it adds "*Workspace* has moved on to v*N* since." when it has), **Promoted** ("v*N*, by *name* …") or **Declined** ("v*N*, by *name* …" and the reason as a quotation). A request that was withdrawn or replaced shows nothing.

When someone who may promote opens the step while a request is pending, a notice says who asked for which version and that "Promoting here sends v*N*; the request is decided from the tenant's overview."

### Deciding a request

The tenant's overview has a section **Promotion requests** for each person who may decide. Each row says "*name* asks to promote v*N* from *source* to *target*", when, the note, and "*source* is now at v*N*" when it has moved on. **Review** opens a sheet titled "Promote v*N* to *target*?".

| Control | What it does |
| --- | --- |
| The note | The request's note, as a quotation. |
| A notice | "*Source* has deployed v*N* since. This promotes v*N*, what was asked for." |
| What it would change | The same list as above, and **Delete them anyway** or the notice about names an agent calls. |
| **Decline…** | Asks "Decline the request?" with "Why? The one who asked reads it." The reason is required. The toast says "Declined. The one who asked is shown why." |
| **Promote** | Asks "Promote v*N* to *target*?" and promotes the version asked for, not the one running now. The toast says "*Target* now runs v*N*." Disabled while the promotion would be refused. |

A request has one of the states pending, promoted, declined, withdrawn or superseded. A note or reason is at most 1000 characters. The tenant's list holds at most 200 requests.

## How a workspace differs from where it promotes to

At the foot of **Promote** a section **How *here* differs from *there*** compares the two workspaces by path. It says "*Here* runs v*N*, *there* runs v*N*." and either "*Here* and *there* run the same resources." or "N of N resources differ."

| Chip | What it lists |
| --- | --- |
| **All that differ** | Every resource that is not in sync. The default. |
| **Changed in *here*** | The same path on both sides with different content. |
| **Only in *here*** | A resource the target does not have. |
| **Only in *there*** | A resource only the target has. |
| **In sync** | The same on both sides. |

The chip is in the address, as `?show=`. Each row has the path, the kind, a state and one line about what differs, or "Made there: a promotion leaves it." for a resource made in the target that a promotion does not touch. A row opens a sheet with the path, a sentence for each difference, and the two versions line by line. Drift matches by path, so a renamed resource shows as two rows: the old path in one workspace and the new in the other.

## In the editors

An editor's **Deploy** menu has two entries.

| Entry | What it does |
| --- | --- |
| **This change only** | Checks the draft alone, as a full deploy would, and deploys only it. If it cannot be deployed alone, a dialog says "*path* cannot be deployed alone" with the reason and **Review all drafts**. When it works: "Deployed *path* as version N." with **Promote to *name*** when the workspace has a link. |
| **Review all drafts** | Opens this screen. |

An editor's **Discard draft** goes back to how the resource was last deployed ("Discard this draft?"). **Remove** on a deployed resource saves a draft that removes it ("Remove this *kind*?": nothing changes until that draft is deployed), and **Keep this *kind*** takes that draft back. A resource that the repository's code defines has no remove button: it is removed there.

The command palette has a group **This release** with the command **Deploy N changes** (or **Deploy the N chosen drafts**) while the step can deploy. There is no keyboard shortcut for it.

## Production

A production workspace has no drafts. A direct change to a resource there (`PUT` or `DELETE` on its path) is refused with `production_workspace`, unless the caller holds `promotion:write` and the resource is made in the console. A resource that is defined in the repository changes in production by a deploy only, for everyone. Resources reach production by a promotion, by deploying a version from this screen, by `volvel deploy`, or by a pull of the default branch.

There is no workspace lock. The editors show a notice on a production resource, "Edit it in *dev workspace*".

## Permissions

| Action | Needs |
| --- | --- |
| See the screen, the versions and the promotion preview | `deployment:read` |
| Save, set aside and restore drafts | `resource:write`; `interface:write` or `doc:write` alone for drafts of those kinds |
| See what deploying the drafts would do | `deployment:read` (or `interface:write` for the paths it names) |
| Deploy drafts | `deployment:write`; `interface:write` or `doc:write` alone deploys only drafts of those kinds, named by path |
| Deploy drafts that hold code | also `code:write` |
| A script, connector or trigger source draft | also code in the console switched on for the tenant: otherwise `console_code_off` |
| **Deploy this version**, **Roll back to this version** | `deployment:write` |
| **Promote to …** | `promotion:write` in the workspace promoted to |
| **Change where this promotes to** | `workspace:write` in this workspace |
| **Request promotion**, **Withdraw the request** | `deployment:read` in both workspaces; withdrawing needs to be the person who asked |
| **Promote** or **Decline…** in a request | `promotion:write` in the workspace promoted to |
| See drift | `deployment:read` |

The built-in role Deployer holds `promotion:write`. Developer holds `deployment:write` and not `promotion:write`. See the [permissions reference](../../../../administer/reference/permissions).

## Related

- [Deploy drafts to a dev workspace](../../../how-to/releases/deploy-drafts)
- [Promote a version](../../../how-to/releases/promote-a-version)
- [Roll back to an earlier version](../../../how-to/releases/roll-back-a-version)
- [Ask for a promotion, and decide one](../../../how-to/releases/ask-for-a-promotion)
- [How a change gets from a draft to production](../../../explanation/releases/how-changes-move)
- [Why a deploy or promotion is refused](../../../../develop/reference/releases/refusals)
- [Git sync](git-sync)
