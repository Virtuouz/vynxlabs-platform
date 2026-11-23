---
title: Triggers
topic: operate-triggers
description: "Every control, state and permission of the Triggers screen: schedules, webhooks, forms and event triggers, how each is paused at three levels, fired by hand and refused."
subjects: [triggers]
moved_from:
  - operate/triggers
---

The **Triggers** screen lists what starts work in one workspace without a person asking: schedules, webhooks, forms and event triggers, both the ones a trigger resource declares and the ones a flow's start nodes declare. A schedule may start a script or a flow. The other kinds start a script, or a flow through that flow's own start node. There is no trigger for incoming mail: a change to a table is an event trigger on `platform/row-changed`.

The screen is reached from **Operate**, then **Triggers**. F1 (**Help for this page**) opens the help topic `operate-triggers`.

::screenshot{name=console/operate-triggers alt="The Triggers screen with the kind chips, a list of triggers with what each starts, its state and when it last fired, and a schedule's details open beside it."}

## Controls

### Header and notes

The description reads "What starts work here without anyone asking. Pause one to stop just it, in any workspace; the pause lasts through deploys until it is resumed." One note may sit under the title:

- "An operator has paused every trigger in this instance, so nothing here starts until they resume them. Only an operator can."
- "Every trigger here is paused. Resume them under **Workspace settings**."
- In a production workspace, "N trigger(s) is/are paused in production."

| Control | What it does |
| --- | --- |
| **New trigger** | A menu: **Schedule** opens the **New schedule** sheet; **Webhook**, **Form** and **Event** open the new-trigger editor with that kind. Disabled in a production workspace, with the tooltip "Triggers change in a dev workspace and reach production by promotion." Needs `resource:write`. |
| **Kind** chips | **All**, **Events**, **Schedules**, **Webhooks**, **Forms**, each with its count. Only kinds that exist here are listed. Kept in the address as `?kind=`. |
| Checkboxes and the batch bar | With rows checked, the bar offers **Pause** and **Resume** for the checked triggers. **Pause** asks "Pause N trigger(s)?" with the first three paths and **Why (shown to everyone here)**; in production the question is a danger. A draft that was never deployed is skipped: "A draft starts nothing until it is deployed, so there is nothing to pause." Offered only with `trigger:write`. The server takes at most 100 at a time and the console sends slices of 100. |

### The list

| Column | Shows |
| --- | --- |
| **Trigger** | The path, and `#node` for a flow's start node; below it the kind, the event's name for an event trigger, and the cron line for a schedule. |
| **Starts** | What it starts, linked, and whether it is a **Script** or a **Flow**. |
| **State** | See below. |
| **Last fired** | The state of the last run it started and when, or when it last fired, or "Not fired yet". The hover text is "This trigger has not started anything yet. Runs started by hand are not counted." |

### State

| Text | Meaning |
| --- | --- |
| **On** | It will start work. A schedule says "Next *time*" instead. |
| **Off** | It is turned off in its definition. |
| **Paused** | Paused by hand, on its own. |
| **Workspace paused** | The workspace's triggers are paused. |
| **Instance paused** | An operator paused every trigger in the instance. |
| "Fires once when resumed" | A paused or held schedule that came due fires once when the hold ends. |
| **Draft, never deployed** | A trigger made in the console and not yet deployed: it starts nothing. |
| **Draft** or **Removing** (a tag) | A change waits to be deployed. What is shown is what is deployed and what fires. |

A trigger held at more than one level shows the widest hold first: the instance, then the workspace, then its own pause. The same states are shown on a script's and a flow's **Triggers** tab.

### The inspector

Choosing a row puts its path in the address (`?trigger=`) and opens its details. The header reads "*kind* trigger", with "· node *name*" for a flow's.

- **A draft** notice: "A draft. It starts nothing until it is deployed." and, for a schedule, when it would first fire; or "A draft removes this trigger. It keeps firing until that is deployed." or "A draft changes this trigger. What is shown here is what is deployed, and what fires." with **Review the change**.
- **A pause** notice: "Paused *time* by *name*: *reason*. Nothing it would start is started until it is resumed."
- **Last refused**: "Last refused *time*: *reason*", with the detail. The reasons are: the signature did not match; the body could not be read; the trigger was paused; what it was given does not fit what it starts; its filter could not be worked out; its source was still looking; its source could not pass on what it gave. Refusals are kept 7 days.
- **Starts**, **Schedule** (cron and zone), **Event**, **Overlap** ("Skips a time while its last run goes." with when it last skipped), **Backlog** ("Skipped *time*: the workspace already had too many runs waiting."), **Next** ("Fires once when resumed", "Not while it is paused", "Not while it is turned off", "On request" or the time) and **Last fired**.
- **Open the last run it started**.
- **Webhook address** or **Form address**, with **Copy address**. A webhook's is shown as `POST` and the address. To someone without the permission it says "The address is shown to those who manage triggers."
- Buttons: **Edit** (not in a production workspace; opens the trigger's own editor, or the flow's), **Fire now** (a schedule only), **Pause this trigger** or **Resume**. A draft that was never deployed offers **Edit** and the deploy menu instead.

The same commands are in the command palette under **This trigger**: **Pause *path*…**, **Resume *path***, **Fire it now**.

#### Pause

**Pause this trigger** asks "Pause *path*?" with **Why (shown to everyone here)**, optional, up to 500 characters; in production it is a danger. It says "*path* is paused. Nothing it would start is started." A pause outlives deploys and applies in production as in any workspace. **Resume** says "*path* runs again." A paused schedule keeps its due time and fires once when resumed. A paused webhook answers 503 and records a refusal. A paused event trigger stores the event and starts nothing.

#### Fire now

**Fire now** starts one run of a schedule as its next time would, with its input, and leaves its next time where it is. It opens the run's page. It is offered for a schedule that is not paused, in a workspace whose triggers are not paused. The server also refuses, with "This schedule is paused, so it cannot be fired now. Resume it first.", "This workspace's triggers are paused, so this schedule cannot be fired now." or "Every trigger in this instance is paused, so this schedule cannot be fired now." A schedule that is only turned off may be fired, to try it. A schedule with a trigger source starts the source, and says "The source is still looking from the last time. Try again when it has finished." if it is busy. A flow's schedule node can be fired too.

### New schedule

The **New schedule** sheet saves a draft that runs once it is deployed from the **Deploy** screen. **Path** (lower-case letters, digits, hyphens and underscores, in folders, such as `reports/daily`). Then:

| Field | What it takes |
| --- | --- |
| **What it starts** | A script, or a flow that has a manual trigger. |
| **What it is for** | Up to 500 characters. |
| **Trigger source (optional)** | A source that each tick runs first; what it finds starts one run each. |
| **Turned on** | Whether it fires. |
| **Often used** | **Every hour**, **Every day at 9:00**, **Weekdays at 9:00**, **Mondays at 9:00**, **The first of each month**, or **Your own**. |
| **When, as a cron line** | Five fields: minute, hour, day of month, month, day of week. |
| **Time zone** | An IANA zone. The workspace's zone is offered; a schedule that names none runs in UTC. |
| **Next times, in *zone*** | The next five times. |
| **Skip a time while the run it started last is still going** | Whether to pass over a time while the last run goes. A schedule made here allows overlap unless this is checked; a flow's schedule node skips by default. |
| **Input** | What it is given each time. |

Where 200 or more runs are already queued in the workspace, a schedule skips that time and says so under **Backlog**. The limit is the operator's setting `SCHEDULE_BACKLOG_LIMIT`; 0 turns it off. A trigger source starts at most 100 runs a tick.

## States

| State | What the screen shows |
| --- | --- |
| Empty | "Nothing starts by itself yet": "A schedule, a webhook, a form or an event in a flow or a script starts work here once it is deployed." |
| Error | The error with a retry. |
| Production | **New trigger** and **Edit** are not available. |
| Held | The notes and states above. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a webhook's address | `trigger:read`; the address is shown to those who manage triggers |
| **Pause**, **Resume**, batch pause | `trigger:write` |
| **Fire now** | `run:write` |
| **New trigger**, **Edit** | `resource:write` (**Edit** is disabled, with "It needs resource:write.", without it) |
| Pause every trigger in the workspace | `workspace:write`, in **Workspace settings** |
| Pause every trigger in the instance | An operator with `instance:write`, under **Triggers** in the instance's own screens |

## Related

- [Pause triggers](../../../how-to/operate/pause-triggers)
- [Verify a signed webhook](../../../../develop/how-to/operate/verify-a-webhook)
- [Events](events), [Runs](runs)
- [Platform events](../../../../develop/reference/operate/platform-events)
