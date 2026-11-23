---
title: Workspace overview
topic: workspace-overview
description: "Every part of a workspace's overview: First steps, Needs attention, the last 24 hours of runs, the Deploy path, and what starts work, with what each needs to be seen."
subjects: [workspaces, permissions]
moved_from:
  - start/workspace-overview
---

The overview is where a :term[workspace]{id=workspace} opens. It answers two questions: is this workspace healthy, and what should I do next. It is a single screen with no section list beside it.

The screen is reached from **Overview** on the rail, from **Open {workspace}** in the tenant overview's workspace list, from the workspace switcher in the header, and by :kbd[g] then :kbd[o]. F1 (**Help for this page**) opens the topic `workspace-overview`.

::screenshot{name=console/basics-workspace-overview alt="A workspace overview with the First steps checklist, Needs attention, the Runs card, the Deploy path and What starts work here."}

## The header

| Part | What it shows |
| --- | --- |
| Eyebrow and title | **Overview**, then the workspace's name. |
| Environment tag | **Dev** or **Production**. A production workspace is also marked by an amber rule under the console's header. |
| **Triggers paused** | A pill when the workspace's triggers are paused. **Triggers paused by the instance** when an operator paused every trigger on the instance. |
| **Running v{N}** | The version this workspace runs, when one is deployed. Not shown to a person who reaches only a resource inside the workspace. |
| **Review changes** | A primary button in a dev workspace that has drafts. It opens the review step of the **Deploy** screen. |
| **Open runs** | The button shown otherwise. It opens **Runs**. |

## First steps

A checklist, shown while nothing has run or been deployed in the workspace. It is not shown to a person who may not read the counts it needs (see Permissions). It heads **First steps** with "{n} of 4 done". Each step is a pill: done (struck through), the next one, or waiting. Only the next step shows its button and its sentence.

| Step | Done when | Button |
| --- | --- | --- |
| **A worker to run code** | A worker of the tenant is online, or the instance starts workers for the tenant. | **Workers** |
| **A first script** | The workspace has a script, deployed or in a draft. | **New script** in a dev workspace, **Scripts** in production. |
| **A first run** | Anything has ever run here. | **Scripts**. The sentence says "Run it from its editor with ⌘↵, or start it from the scripts list." |
| **A first deploy** | A version is deployed. | **Deploy** |

## Needs attention

A list of what wants a person. Each row has a button. Rows that do not apply are not shown.

| Row | Shown when | Button |
| --- | --- | --- |
| "{n} run failed in the last 24 hours" or "{n} runs failed in the last 24 hours" | Failed runs, counting a flow run once and not its steps. | **Open failed runs** (Runs filtered to failed) |
| "The branch and this workspace both changed the same files" | Git sync has a conflict. | **Resolve** |
| "{n} run is waiting for you" or "{n} runs are waiting for you" | Approvals you may decide. The detail adds "{n} more wait for someone else" when there are others. | **Decide** |
| "{n} run is waiting for someone else to decide" (or "runs are") | Approvals wait, and none is yours. | **See who** (Approvals with the others shown) |
| "{n} connection has nothing bound here" or "{n} connections have nothing bound here" | A connection resource of the workspace is bound to nothing. | **Configure** |
| "{n} draft not deployed" or "{n} drafts not deployed" | Drafts exist. | **Review** |
| "Triggers are paused" or "Triggers are paused by the instance" | The workspace, or the instance, holds triggers. A dev workspace says it starts this way. | **View settings** |

When no row applies the section says "Nothing needs you here", with "No failed runs in the last 24 hours, nothing waiting, everything bound." When it applies only because you may not read some counts, it says "Nothing you can see needs you here". When rows are shown and some counts are hidden, one more row says "Some of this you cannot see", with "You cannot see {failed runs, approvals, connections, drafts}. Ask an administrator for read access if you need them." A workspace that shows First steps and has no row to show leaves this section out.

## Runs, last 24 hours

A card with four figures and a chart. **Succeeded**, **Failed** (a link to the failed runs when above zero), **In progress**, and **Median time**. The chart has one bar for each hour, succeeded under failed; hovering a bar names its hour and counts. A hidden table of the same numbers is there for screen readers. **All runs** opens **Runs**.

## Deploy

Shows the path a change takes: **Draft** with the number of drafts, then the workspace with "v{N}" or "nothing deployed", then the workspace it promotes to with its version, when it has one. A sentence says "{name} runs the same bundle as this workspace.", "{name} runs a different bundle. Promote to bring it up to date.", or "This workspace promotes nowhere." The link **Deployments** opens the **Deploy** screen in a dev workspace and **Versions** in production.

## What starts work here

The first 8 triggers of the workspace, each with its path, its kind (schedule, webhook, event, form or manual), the script it starts and its state (for example **Draft, never deployed**, **Workspace paused**, **Instance paused**, or when it fires next). A row opens that trigger in **Triggers**. **All triggers** opens the full list. With none, it says "Nothing starts by itself yet", with "A schedule, a webhook or an event in a flow or script starts work here once it is deployed."

## States

| State | What you see |
| --- | --- |
| Loading | "Checking…" under **Needs attention**; the cards fill in as they arrive. |
| Counts not loaded | An error state with **Try again**. |
| Triggers not loaded | An error state with **Try again**. |
| A person who reaches only a resource inside the workspace | The workspace's name, with no version and no promotion target. |

## Permissions

Opening the overview needs `workspace:read`. What it counts is read separately, and a count you may not read is said, not shown as zero.

| What | Needs |
| --- | --- |
| Failed runs | `run:read` or `flow_run:read`. Each adds its own failures. |
| Approvals waiting | `approval:read`. "Waiting for you" counts the ones you may decide. |
| Connections with nothing bound | `connection:read` |
| Drafts | `resource:read` |
| Git conflict | `git:read` |
| First steps: scripts and flows | `resource:read` |
| First steps: first run | `run:read` or `flow_run:read` |
| First steps: worker online | `worker:read` on the tenant |
| What starts work here | `trigger:read` |
| Runs, last 24 hours | `workspace:read` |

**New script** and **Review changes** lead to screens that ask for their own permissions; see the [permissions reference](../../../../administer/reference/permissions).

## Related

- [Releases](../operate/releases): the **Deploy** and **Versions** screen.
- [Runs](../operate/runs) and [Triggers](../operate/triggers).
- [Dev and production workspaces](../../../../start/explanation/basics/dev-and-production).
