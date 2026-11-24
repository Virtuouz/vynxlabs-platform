---
title: Script settings
description: "Every field of a script's Settings, in the editor and on the script's page: its limits, what it uses, where it runs and what it does when it fails."
subjects: [scripts, settings]
---

A script's settings are what it runs with: how long it may take, how often a failure is tried again, how much memory it may use, what it may reach and where it runs. A script reaches only what its settings name, so a run cannot read a secret or a table the script has not been given.

The settings are in two places. The editor's **Settings** disclosure has all of them. The **Settings** tab of a [script's page](scripts) has all of them except **What it does**, **Use as a flow step** and the input schema. Both save as a draft, and nothing that runs changes until the draft is deployed. A script the repository holds has its settings in `defineScript`; see [Scripts in code](../../../../develop/reference/scripts/define-script).

## Fields

The labels are the editor's. The values are for a script made in the console.

### What it does and its limits

| Field | What it takes | Default for a new script |
| --- | --- | --- |
| **What it does** | Plain words, at most 500 characters. Shown in the list. Editor only. | Empty |
| **Give up after (seconds)** | 1 to 3600. A run still going after this is stopped and fails with "The run took longer than its limit of N seconds." | 60 |
| **Try again (times)** | 0 to 10. How many more times a failed run is tried. 0 tries it once. | 0 |
| **Wait between tries (seconds)** | 0 to 3600. | 30 |
| **Wait longer after each failed try** | A checkbox. The wait doubles with each try. | On |
| **Memory (MB)** | 64 to 4096. The most a run may use. Past it the run fails with "The script ran out of memory (N MB)." Empty is 512. | Empty |
| **Runs at once** | 1 to 64. How many runs of this script may be going at the same time. Empty has no limit of its own. | Empty |
| **One lane for each value of** | Where a value is in the input, such as `input.customer`, up to five fields deep. Runs with the same value take turns, and runs with other values go ahead. A run with no value there shares one lane with the others that have none. Disabled until **Runs at once** is set. | Empty |

A script written in a repository has the same limits with other defaults: 300 seconds, and memory and tries as `defineScript` says. See [Scripts in code](../../../../develop/reference/scripts/define-script).

### What it uses

Each field is a list to choose from. A choice is a name the workspace has. A script that names something the workspace does not have yet cannot be deployed to production. A deploy to a dev workspace goes ahead with a warning.

| Field | What it lists |
| --- | --- |
| **Connections it uses** | The workspace's connections. "A script reaches only what it names here." |
| **Secrets it reads** | The workspace's secrets. |
| **Variables it reads** | The workspace's variables. |
| **Tables it reads and writes** | The workspace's tables. |
| **Data sources it uses** | The workspace's data sources. |
| **Events it may publish** | The workspace's events. |
| **Connection groups it picks from** | The workspace's connection groups. Nothing has to be bound before a deploy. |

### Where it runs

| Field | What it takes |
| --- | --- |
| **Worker pool** | **The default pool**, or a named pool. "Where a run of this script happens. Pick a pool only when it has to run in a particular place, such as inside a client's network. Test and failure alerts use it too." A pool name is lowercase letters, digits and hyphens, at most 40 characters. |

### When a run fails for the last time

| Field | What it takes |
| --- | --- |
| **If it fails for the last time, start** | **Nothing of its own**, or a script of the workspace. It is started with the failed run as its input. |
| **and send a summary through** | **No connection**, or a connection. "An HTTP connection that is posted a summary." |

A script's own choice here replaces the workspace's default alert as a whole: a script that names only a connection does not also start the default's script. A script that fails for the last time sends at most one alert in 10 minutes, and a handler that fails starts nothing.

### Use as a flow step (editor only)

| Field | What it takes |
| --- | --- |
| **Step name** | At most 60 characters. "Give the script a name and it joins the flow editor's steps under it. Leave it empty to keep the script out of them." Clearing it removes the step's icon and group from the draft; they come back when a name is typed again before the editor is closed. |
| **Icon** | **None**, or an icon from the builder's set. |
| **Group** | At most 40 characters. "The heading it is listed under." Empty lists it under the workspace's own heading. |
| **A step may hand it** | **A connection**, **A table**, **An event**. "What a flow may give the script that it does not name itself." |

The icon, group and the options are shown once the script has a step name.

### Input schema (editor only)

| Field | What it takes |
| --- | --- |
| **Input schema, as JSON Schema** | JSON. "What the script takes. A run with input that does not match is refused." Used when the code does not export `input`. An invalid text is refused with "The schema is not valid JSON." |
| **Input schema, read from your code** | Read only, when the code exports `input`. |

## What the settings do not hold

A script's tool name (`mcp.name`), its key and an entry other than the default export come from a repository file or the API. The console's **Name and path** changes the path and the title only.

## States

| State | What you see |
| --- | --- |
| The script has a draft | The page's tab shows the draft's settings, and says "This script has a draft. These are the draft's settings: the deployed script keeps its own until the draft is deployed." |
| A change was saved from the page | "Saved as a draft. It runs this way once it is deployed." |
| Saving from the page when a draft exists | "This script has a draft. Your changes are added to it." |
| A field is refused | The message is under the field, and the refusal above the buttons. |
| Production, or a script the repository holds | Read only. |

## Permissions

Changing settings needs `resource:write` and, because a script is code, `code:write`. Without `resource:write` **Change the settings** is grayed out and says what is missing.

## Related

- [Scripts](scripts)
- [The script editor](script-editor)
- [Change a script's settings](../../../how-to/scripts/change-script-settings)
- [The script kind](../../../../develop/reference/kinds/script)
