---
title: Scripts
topic: build-scripts
description: "Every control, state and permission of the Scripts list and of a script's page: its runs, triggers, users, settings and source."
subjects: [scripts, runs]
moved_from:
  - build/scripts
---

A script is a function the workspace runs: on a schedule, from a trigger, as a step of a flow, from an app, or by hand. The **Scripts** screen lists the scripts of one workspace and what each one reaches. Opening a script shows its page, with five tabs.

A script is **Managed in** the repository or the console. A script written with `defineScript` in the tenant's repository changes when a version is deployed. A script written in the console is a draft until it is deployed. See [Write a script in the editor](script-editor) for the editor, and [Script settings](script-settings) for what a script runs with.

A script has no schedule or trigger option of its own. A schedule is a separate resource that names the script; add one on the script's **Triggers** tab.

The screen is reached from **Build**, then **Scripts**, or with :kbd[g] then :kbd[s]. F1 (**Help for this page**) opens the help topic `build-scripts`.

## The Scripts list

The list has a description line ("Code this workspace runs. Each script declares what it reaches, so a run can reach only that."), the **Show** filter, and a table.

::screenshot{name=console/scripts-list alt="The Scripts list with the Show chips All, Failing, Never run and Drafted above a table of scripts, and the inspector of the chosen script showing its timeout, retries and what it uses, with Open editor, Run and Offer to an agent buttons."}

### Controls

| Control | What it does |
| --- | --- |
| **New script** | Opens the editor on a new script. Shown in a dev workspace only. |
| **Show** | Chips that filter the list: **All**, **Failing** (the last run failed), **Never run** and **Drafted** (the script has a draft). Each carries a count. The choice is in the address (`?filter=`). |
| A row | Chooses the script and opens its inspector (`?item=`). The script's path is a link to its page. |

### Columns

| Column | What it shows |
| --- | --- |
| **Script** | The path, a **Draft** pill (**Draft, never deployed** when nothing is deployed yet), and the description or "No description". |
| **Uses** | The connections the script uses and its tables (as "table name"), or "Nothing outside". |
| **Last run** | The state of the last run and when it was. From two failures in a row it adds "N in a row"; the streak counts each script's latest 20 finished runs. "Never run" when there is none. The cell links to the run. |
| **Source** | **Platform** for a script whose path starts with `core/`, **Console**, or **Repository**. |

A narrow window drops **Uses** first, then **Last run**.

### The inspector

Choosing a row opens the inspector, titled with the path and headed **Script**. Its footer has three buttons:

| Button | What it does | Needs |
| --- | --- | --- |
| **Open editor** | Opens the [script editor](script-editor). | `resource:write` |
| **Run** | Opens the run dialog. See below. | `run:write` |
| **Offer to an agent…** | Opens the offer dialog. Not drawn for a script that is only a draft. | `binding:write` |

A button the person may not use is grayed out, and a notice in the body names the first permission that is missing. `run:write` and `binding:write` count when granted on this script alone. The body shows, from the top: a failure notice when the last run failed ("Failed N times in a row." or "Its last run failed.", then the error); the description or "No description."; **Timeout**, **Retries** and **Managed in** (**The console** or **The repository**); the connections, tables, secrets and variables it uses, each a link; and the links **Its page: runs, triggers, used by** and **Open the last run**.

The inspector has no **Remove**. A script is removed in its editor.

### The run dialog

**Run** opens "Run {path}", or "Run {path}, as deployed" when the script has a draft, because a run starts the deployed version, never the draft. A script that is only a draft shows "Not deployed yet. Deploy it to run it, or try the draft from its editor." in place of the button.

| Field | What it takes |
| --- | --- |
| The input | A form drawn from the script's input schema, with **Fields** and **JSON** beside it for the same input. A script with no schema takes JSON. |
| **Start** | **Now**, or **Later**. |
| **Starts at** | With **Later**: a date and time. It must not have passed ("Choose a time that has not passed.") and must be set ("Choose when it starts, or start it now."). |
| **Priority** | A whole number from -100 to 100. Empty is 0. Anything else is refused: "Priority is a whole number from -100 to 100." |

A run set for later is listed as waiting until its time. A higher priority goes first when runs wait for a worker. **Run** starts it and opens the run. See [Run a script now or later](../../../how-to/scripts/run-a-script).

A guest of an app, someone who is not signed in, cannot start a script. A guest the app's access lets start it is refused with "Sign in to start a script." and a request with no sign-in at all with "Sign in or send an API key."

### States of the list

| State | What you see |
| --- | --- |
| Empty, dev workspace | "No scripts yet", with "Write one here, or deploy them from the tenant's repository with `volvel deploy`." and **New script**. |
| Empty, production workspace | "No scripts yet", with "Scripts reach production when a dev workspace is promoted here, or with `volvel deploy` from the tenant's repository." |
| A filter finds none | "No script matches", with "Show every script instead." |
| Not allowed | A notice names `resource:write` and says what it is for ("this workspace's scripts"). |
| Not loaded | The error state, with a retry. |

## A script's page

The page is at `scripts/{path}`. Its header shows the path, then "Last run" with the state and when (a link to the run) or "Not run yet", then the description and the documentation pages attached to the script. Its buttons:

| Button | What it does | Needs |
| --- | --- | --- |
| **Run** | The run dialog above. Grayed out, with the reason, without `run:write`. | `run:write` |
| **Open the code** | Opens the editor. | |

The command palette adds **Open the code** and **See its runs** for the script.

### Runs

The latest 20 runs of the script, tests and real ones together: **State**, **Started** (a test run says "· test") and **Took**. A row opens the run. With none: "No runs yet".

### Triggers

What starts the script on its own.

| Control | What it does |
| --- | --- |
| **Add a schedule** | Opens a sheet that makes a schedule for this script. Dev workspaces only. Needs `resource:write`. |
| A row | **Trigger**, **Kind** and **State**, with a schedule's cron line and time zone. Opens the trigger. |
| **Run it now** | On a schedule that is neither paused nor held: runs it once now. |
| **Pause…**, **Resume** | Pause or resume the trigger. A pause by the workspace or the instance is said on the row. |

In a production workspace the tab says "Triggers change in a dev workspace and reach production by promotion." and has no **Add a schedule**. With none, the tab says "Nothing starts it on its own" and "It runs when started by hand." See [Triggers](../operate/triggers).

### Used by

The flows, schedules and other resources that name the script, one line each: the kind, the path, how it uses the script, and "in a draft" when only a draft does. With none: "Nothing uses it, deployed or in a draft."

### Settings

::screenshot{name=console/script-settings-tab alt="A script's page on its Settings tab: a notice that the script has a draft, the list Stops after 90 seconds and Tries again 2 times, and a Change the settings button."}

The settings the script runs with, as a list. A row is shown only when the script sets it: **Stops after**, **Tries again**, **Memory**, **Runs at once**, **Worker pool**, **Connections**, **Secrets**, **Variables**, **Tables**, **Data sources**, **Events it may publish**, **Connection groups**, **Starts, when it fails for the last time** and **Sends a summary through, when it fails for the last time**. With none: "Nothing is set: it runs with the workspace's defaults and uses nothing it has not been given."

When the script has a draft, the tab shows the draft's settings and says so, with **Open the draft**. A script that is only a draft says "This script is only a draft and is not deployed yet."

**Change the settings** opens the same fields as the editor's Settings, except **What it does**, **Use as a flow step** and the input schema, which are only in the editor. **Save as a draft** keeps the change as a draft; nothing that runs changes until the draft is deployed, and the tab then says "Saved as a draft. It runs this way once it is deployed." **Cancel** leaves the form. Every field is in [Script settings](script-settings).

**Change the settings** is not offered in a production workspace ("Settings change in a dev workspace and reach production by promotion."), nor for a script the repository holds ("The repository holds this script: change its settings there."). Without `resource:write` it is grayed out with the reason. A script the repository holds has its settings in `defineScript`: see [Scripts in code](../../../../develop/reference/scripts/define-script).

### Source

The code, read only. With no run chosen it is the code as deployed now. `?run=` shows the code as that run ran it, at that version, with the failing line selected; the run page's version link opens it this way. **Open the code to change it** leads to the editor. A version that carries no source says "This version does not carry its source. A repository build that includes it shows it here." Reading the source needs `bundle:read`.

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `script:read` |
| Open the editor, save a draft, change settings | `resource:write`, and for code `code:write` |
| Run a script | `run:write`, in the workspace or on the script |
| Offer a script to an agent | `binding:write`, in the workspace or on the script |
| Add a schedule | `resource:write` |
| Read the source | `bundle:read` |

See the [permissions reference](../../../../administer/reference/permissions). A workspace admin holds all of these.

## Related

- [The script editor](script-editor)
- [Script settings](script-settings)
- [Test a script before you deploy it](../../../how-to/scripts/test-a-script)
- [Run a script now or later](../../../how-to/scripts/run-a-script)
- [Offer a script to an agent](../../../how-to/scripts/offer-a-script)
- [How scripts run](../../../../develop/explanation/scripts/how-scripts-run)
- [The script kind](../../../../develop/reference/kinds/script)
