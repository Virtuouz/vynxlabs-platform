---
title: Workspace settings
topic: configure-settings
description: "Every field, action and permission of a workspace's settings: its name, where it promotes to, its time zone, its run limit, pausing triggers, cloning and deleting."
subjects: [workspaces, promotion]
moved_from:
  - configure/settings
---

**Workspace settings** holds what is true of one workspace as a whole. Some of it is saved together, from a bar at the foot of the page. The rest acts at once.

The screen is under **Configure**, **Workspace settings**. F1 (**Help for this page**) opens the help topic `configure-settings`.

::screenshot{name=console/workspace-settings alt="Workspace settings of a dev workspace: the name, the actions to pause triggers, clone and delete, the promotion target, the time zone and the run limit."}

The description line says: "Pause what starts by itself, make a copy, or delete the workspace: these act at once. Its name, where it promotes to and its time zone are saved together, from the bar that appears below." The run limit is saved from the same bar.

## What is saved from the bar

When you change one of these, a bar appears at the foot of the page: "Unsaved changes to the settings of *workspace*." with **Discard** and **Save**. Leaving the page asks first.

| Field | What it takes |
| --- | --- |
| **Workspace name** | What people read in lists and the switcher. At most 200 characters; it cannot be empty ("A workspace needs a name."). Its address, the slug, does not change. |
| **Promotes to** | A dev workspace only. **Nothing: not linked**, or any other workspace of the tenant as "*name* (*type*)", a dev workspace included. Not shown for a production workspace. A link that leads back to the workspace is refused. |
| **Zone** (the time zone) | The time zone new schedules start in, `UTC` by default. Every schedule form shows it. Schedules that exist keep the zone they were made with. |
| **Runs at once** (the run limit) | How many runs of this workspace may be in progress at once; the rest wait their turn. A whole number from 1 to 1000. Another value shows "A whole number from 1 to 1000." and **Save** says "The run limit must be a whole number from 1 to 1000. Correct it, then save." An empty field cannot be saved. |

After **Promotes to**, a sentence says what is not yet saved: "Save the new target to review a promotion to it." or, if you chose **Nothing**, "Saved, this workspace promotes nowhere. Save to stop, or choose a target again." When the saved target exists, the button **Review and promote** opens the step **Promote** of [Deploy](../operate/releases). Saving says "The settings of *workspace* are saved."

## What acts at once

| Control | What it does |
| --- | --- |
| **Pause triggers** / **Resume triggers** | Stops, or starts again, every schedule, webhook and event in the workspace. Runs started by hand still work. The row says whether triggers are on, paused, or **paused by the instance**: an operator has paused every trigger of the instance, and the workspace's own pause stays after the operator resumes theirs. A dev workspace starts paused. One trigger can be paused alone under Triggers. A webhook is answered with 503 while paused, and a schedule that came due fires once on resuming. |
| **Clone workspace** | Opens the sheet below. |
| **Delete workspace** | Asks you to type the slug. The action is **Delete workspace**, or **Delete production workspace** for a production workspace. |

### Clone workspace

The sheet is titled "Clone *workspace*": "The copy is a dev workspace linked to this one. Its triggers start paused." The copy promotes to the workspace it was made from.

| Field | What it takes |
| --- | --- |
| **Name** | Starts as "*name* copy". |
| **Slug** | Starts as "*slug*-copy". Lowercase letters, digits and hyphens. |
| **Rows and files** | **Leave them behind: empty tables** or **Copy them**. |
| **Safety** | **On: the copy cannot reach real systems** (the default) or **Off: the copy can act on the same systems**. On, the copy gets no connection, data source, connection group member or secret value. Off, it gets this workspace's, and this is recorded in the audit log. |

A clone gets what is deployed in the source, with each resource's key, title and meta, and the values the source set for its variables. While it copies, the sheet says "Copying…". One clone copies rows at a time, so another waits: "Waiting for another clone to finish copying. One copies its rows at a time, so the rest of the instance stays quick." A queued copy gives up after an hour: "It waited over an hour for other clones to finish. Try it again." When it ends the sheet says "Copied N resources, N rows in N tables and N files." and either "It has no connections, data sources or secret values, so it cannot reach a real system until you bind it." or "Its connections, data sources, group members and secrets were copied: it can reach the same systems as the original. A connection that signs in with OAuth is not signed in: connect it again." **Open the copy** opens it. If it fails: "The clone failed, and nothing was copied. *reason* The empty workspace it left can be deleted." If the progress cannot be read three times, the sheet stops asking and offers **Try again**.

### Delete workspace

The dialog is "Delete *workspace*?" and says "This deletes the workspace with its resources, secrets, run history, tables and files. It cannot be undone." For a production workspace it says: "This is a production workspace. Deleting it deletes what the tenant runs: its resources, secrets, run history, tables with every row, and files. Nothing brings it back. Export the tenant first if any of it may be wanted." The button stays disabled until you type the slug.

A workspace is not deleted while a clone of it is being made ("A clone of this workspace is still being made. Try again when it has finished."), or while runs are in progress ("*N* runs and *N* flow runs are still in progress. Pause the triggers, let them finish or cancel them, then try again."). After it is deleted the screen goes to the list of workspaces.

## Access

The section **Access** lists who holds a role in this workspace, with the role and, for a role held on one resource, where. A binding that comes from the repository is tagged **From repository** and has no remove button. **Give access** opens the sheet that gives a role here. Access given to the whole tenant applies here and is changed under Members & access. See [Give access](../../../../administer/reference/screens/members).

## States

| State | What you see |
| --- | --- |
| Without `workspace:write` | A line "You can see this workspace's settings, not change them. It needs `workspace:write`." and who to ask. The fields are disabled. |
| Nobody holds a role | "Nobody holds a role here yet." |

## Permissions

| Action | Needs |
| --- | --- |
| Save the name, link, time zone and run limit; pause or resume triggers | `workspace:write` |
| **Clone workspace** | `workspace:write` in the tenant and `workspace:read` in the workspace; **Copy them** also `data_all:read` and `file:read`; Safety **Off** also `secret:write` and `connection:write` |
| **Delete workspace** | `workspace:write`; a production workspace also `workspace_production:write`, which no wildcard grants |
| **Give access**, remove a role here | `binding:write` |

## Related

- [Make a workspace, clone it, or delete it](../../../../administer/how-to/releases/make-a-workspace)
- [Workspaces](../../../../administer/reference/screens/workspaces)
- [Deploy and Versions](../operate/releases)
