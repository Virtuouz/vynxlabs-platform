---
title: Flows
topic: build-flows
description: "Every control, state and permission of the Flows list and of one flow's page: what starts each flow, how its runs went, and who may start, arrange or edit it."
moved_from:
  - build/flows
---

The **Flows** screen lists the flows of one workspace. A flow is a graph of steps that runs in order and remembers where it is, so it survives a restart and can wait for a person. Opening one shows its page: the graph, how it starts, its recent runs, and what uses it. The flow is drawn in [the flow editor](flow-editor). How a flow runs is in [How a flow runs](../../../explanation/flows/how-a-flow-runs).

The screen is reached from **Build**, then **Flows**. The shortcut is :kbd[g] then :kbd[f]. F1 (**Help for this page**) opens the help topic `build-flows`.

::screenshot{name=console/flows-list alt="The Flows screen: a search box, four filter chips, and a table of flows with what starts each, its steps, its last run and its version."}

## The Flows list

The list has a search box, the filter chips and a table. **New flow** is in the header of a dev workspace only; a production workspace has none, because flows reach it by promotion from its dev workspace.

| Control | What it does |
| --- | --- |
| **New flow** | Opens the editor on a new flow. Dev workspaces only. |
| **Find a flow** (its box says "Find by path or purpose") | Keeps the flows whose path or description contains what you type, ignoring capitals. The text is in the address (`q`). |
| **All**, **Failed in 24 hours**, **Waiting**, **Drafted** | Chips, each with a count. **Failed in 24 hours** keeps flows with a failed run in the last 24 hours. **Waiting** keeps flows with a run waiting for a person. **Drafted** keeps flows with a saved draft. The choice is in the address (`filter`). |

A note above the list says "N runs are waiting for a person." ("1 run is waiting for a person." for one) with a link, **Decide**, to the Approvals screen. It counts runs waiting at an approval step. A run waiting at a **Wait** step or on a sub-flow is not counted.

| Column | What it shows |
| --- | --- |
| **Flow** | The flow's path, as a link, and its description ("No description" when it has none). |
| **Started by** | One line for each start the flow has: **By hand**, **Schedule**, **Webhook**, **Event** or **Form**, and after a dot the start's detail. "Nothing yet" when it has none. A narrow window drops this column. |
| **Steps** | A small chain, with the number of steps as its tooltip. A narrow window drops this column. |
| **Last run** | The state of the last run and how long ago it was, then "N in 24 hours", and "· N failed" and "· N waiting" when there are any. "Never" when the flow has not run. |
| **State** | **vN** for the deployed version, **Draft** when a saved draft differs from it, **Removing** when the draft removes the flow. |

"In 24 hours" means the last 24 hours, not today.

Choosing a row opens its inspector. A flow that has only a draft opens in the editor, from the list, from the inspector and from any link to it.

### The inspector

| Control or row | What it shows or does |
| --- | --- |
| **Open** | Opens the flow's page. |
| **Edit** | Opens the editor. Dev workspaces only, and not for a flow the draft removes. |
| **Remove**, **Discard draft**, **Keep this flow** | What the flow's draft allows: remove a deployed flow in the draft, throw away a draft, or take back a removal. A flow managed in the repository says "Managed in the repository: the flow is removed there." |
| **Deployed** | The deployed version, or "Not yet". |
| **Draft** | "Changes saved, not deployed", "Removed in the draft" or "None". |
| **Steps** | How many. |
| **Runs in 24 hours** | How many, and how many failed. |
| **What starts it** | Each start, with its detail, or "No trigger yet." |
| **Open the last run** | A link to the last run, when there is one. |

### States of the list

| State | What you see |
| --- | --- |
| Empty, dev workspace | "No flows yet", "Draw one here, or define one in the tenant's repository with defineFlow." and **New flow**. |
| Empty, production workspace | "No flows yet", "Flows reach a production workspace by promotion from its dev workspace." |
| Nothing matches | "No flow matches", "Try another word, or show every flow." |
| Read only | A line says you can see the workspace's flows and what is needed to change them (`resource:write`). |
| Not loaded | The list's error state, with a retry. |

## A flow's page

The title is the flow's path, with its description under it. Documentation pages attached to the flow are shown under the title.

| Control | What it does | Shown when |
| --- | --- | --- |
| **Edit** | Opens the editor. | Dev workspace, and you have `resource:write`. |
| **Offer to an agent…** | Opens "Offer to an agent": lets a service account start this flow, and nothing else, and gives the address an agent connects to. | The flow has a start **By hand**, and you have `flow_run:write`. |
| **Start flow** | Opens a form drawn from the manual start's input, titled "Start" and the path, with the button **Start flow**. When it is sent, the new run's page opens. | The flow has a start **By hand**, and you have `flow_run:write`. |

The command menu (:kbd[⌘K]) has "Start <path>…", "Edit the flow" and "See its runs" for the flow you are on.

**The graph.** With `flow:write` the steps can be moved: drag one, or focus it and use the arrow keys. A line under the graph says so, then "Saving the arrangement…" and "Arrangement saved. The flow itself is unchanged." Moving steps changes how the graph looks, not how the flow runs. Without `flow:write` the graph is fixed. A person who may arrange the graph in the browser but whose save is refused sees "You can arrange the graph, but only someone who manages flows can save it."

**How it starts.** One line for each start: a schedule says "runs next at" a time, or "a schedule with no next time: it is paused, or not deployed yet"; a webhook shows `POST` and its address, or "a webhook. Its address is shown to those who manage triggers."; a form says "a form. Its address is in the triggers below."; an event says "starts when its event is published".

**Recent runs.** A table of **Started**, **Status** and **Started by**, newest first. It shows 20. A flow that has not run says "This flow has not run yet". A run's page is [Runs](../operate/runs).

**Schedules and triggers that start it.** The schedules and triggers of the flow, with **Add a schedule**. See [Triggers](../operate/triggers).

**Used by.** What refers to the flow.

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a flow's page | `flow:read` |
| **New flow**, **Edit**, save a draft | `resource:write` |
| **Start flow**, **Offer to an agent** | `flow_run:write`, at the workspace or on that one flow |
| Arrange the graph and save it | `flow:write` |
| See a run | `flow_run:read` |

A person can be given `flow_run:write` on one flow only. They see **Start flow** on it and nothing else of the flows' controls. A guest or end user cannot start a flow from an app. The permissions are in the [permissions reference](../../../../administer/reference/permissions).

## Related

- [The flow editor](flow-editor)
- [Draw and deploy a flow](../../../how-to/flows/draw-and-deploy-a-flow)
- [Runs](../operate/runs), [Approvals](../operate/approvals), [Triggers](../operate/triggers)
