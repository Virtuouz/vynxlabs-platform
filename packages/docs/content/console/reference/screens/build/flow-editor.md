---
title: The flow editor
topic: build-flows-editor
description: "Every control, state and permission of the flow editor: the canvas, the step inspector, the header, saving, undo, and the test panel."
moved_from:
  - build/flow-editor
---

The flow editor is where a flow is drawn: steps on a canvas, what each takes in an inspector beside it, and a test run under it. It opens from **New flow** on [the Flows screen](flows), and from **Edit** on a flow. It exists in a dev workspace only. A production workspace shows a notice in its place: flows reach it by promotion from its dev workspace.

What each step and start takes is in [Flow steps](../../../reference/flows/steps) and [Ways a flow starts](../../../reference/flows/starts). The goal-first guides are [Draw and deploy a flow](../../../how-to/flows/draw-and-deploy-a-flow) and [Test a flow](../../../how-to/flows/test-a-flow). The help topic is `build-flows-editor`.

::screenshot{name=console/flow-editor alt="The flow editor: the header with its save state and Deploy menu, the canvas with connected steps, and the inspector open on one step."}

## The header

| Control | What it does |
| --- | --- |
| Title | The flow's path, or "New flow" until it is saved. |
| State pill | The flow's state: **Draft**, **Deployed** (the draft is saved and matches the deployed version), **From the repository**, or **Removing**. |
| "N to fix" | How many problems the flow has. See **To fix** below. |
| Save state | One of the states in the table below. |
| **Retry** | Appears after a save was given up. Tries to save again. |
| **Tidy up** | Lays the steps out again. One **Undo** takes it back. |
| **Undo**, **Redo** | Step back and forward. The tooltip names the change. Undo holds 100 steps, and typing in one field within a second is one step. |
| **Test** | Opens and closes the test panel under the canvas. |
| **Name and path** | Renames the flow or changes its path. Not on a new flow. |
| **Discard draft** or **Remove** | Throws away the draft, or removes the deployed flow in the draft. Not on a new flow. |
| **Save draft** | Saves the flow as a draft. It is the main button while there is something unsaved. |
| **Deploy** | A menu with **This change only** and **Review all drafts**. It appears once the draft is saved and has no unsaved change. |

On a new flow the header also has **Path** (for example `orders/handle`; a path already in use is refused) and **Start from**: **Started by hand** (a manual start, ready for its first step) or **Decide, then answer** (a start that takes an `amount`, and a Branch that goes one way above 100 and another below). The starters are disabled after the first change.

### Save states

| What it says | What it means |
| --- | --- |
| "Not saved" | A new flow, or a repository flow, with changes. Press **Save draft**. |
| "Saving…" | A save is on its way. A flow that has been saved before saves by itself 1.5 seconds after a change. |
| "Could not save. Trying again…" | A save failed. It is tried again after 1.5, 3, 6 and 12 seconds. |
| "Could not save." | Five saves failed. It stops until the next change or **Retry**. |
| "Draft saved" and how long ago | The draft is up to date. |
| "Not saved: someone else saved this flow" | Another person saved a draft first. A notice offers their version, and **Copy what I wrote** keeps yours. |

### Notices above the canvas

- A flow managed in the repository: "This flow is managed in the tenant's repository. Saving a draft of it takes it over." It is not saved by itself.
- A flow the draft removes: "This flow is removed in your drafts. Nothing changes until that draft is deployed. The steps shown are what is deployed now. Keep this flow to take the removal back."
- **To fix**: a list of what a deploy would refuse, each item a link to the step and field. It is advice: a draft with an unfinished step still saves, and a deploy refuses it. It lists loops, a step no start reaches, an **Answer the request** step with no webhook start it can answer, a case name used twice or unknown, an edge leaving a **Fail**, a form question named `website`, `key` or `return`, an approval title over 200 characters, more than 20 cases, an expression over 2,000 characters, a **For each** with neither a script nor a flow, and an approver group the tenant no longer has. One problem of a step is shown at a time. A new **Run a script**, **Run a flow** or **On an event** step is listed until you choose what it runs or hears.

## The canvas

| Control | What it does |
| --- | --- |
| **Find a step** | A search box over the steps you can add. :kbd[Enter] adds the first match. |
| Add step list | **Starts**: **By hand**, **On a schedule**, **On an event**, **On a webhook**, **On a form**. **Steps**: **Run a script**, **Run a flow**, **Set values**, **Answer the request**. **Logic**: **Branch**, **For each**, **Join**, **Wait**, **Approval**, **Fail**. Then the workspace's own core nodes, by category or under "This workspace's", and **Scripts**. |
| A dot on a step | Drag from it to another step to connect them. A red dot is the error path, "on error". |
| Zoom | From 0.2 to 1.5. **Fit the flow** never zooms in past 0.7. |
| Minimap | Hidden under 640 pixels wide and while the test panel is open. |
| Selecting | :kbd[Ctrl] or :kbd[⌘] click, or drag a box, to choose several steps. |

A new step goes after the chosen one and takes over its next connection. After a **Branch** it is attached to the first case, and after a **Fail** it is not attached. A step has an error path unless it is a start, **Join**, **Wait** or **Fail**. The viewport is kept for the browser session.

**Removing a step does not ask.** The **Remove this step** button, the menu's **Remove**, :kbd[Backspace] and cut all remove it with its connections and say "Removed X. Its connections went with it." with **Undo**.

### The step menu and canvas menu

Right-click a step, or press :kbd[Shift+F10]: **Duplicate**, **Copy**, **Rename…** and **Remove**. With several chosen the labels say how many. Right-click the canvas: **Paste**, **Select every step** and **Fit the flow in view**.

Copy and paste work between flows. A pasted step whose name is taken gets `_2`. References between the pasted steps follow the new names. Connections to steps that were not copied are dropped, and steps whose name or type is not valid are skipped, and the message says what was skipped.

| Keys | What they do |
| --- | --- |
| :kbd[Mod+D] | Duplicate. |
| :kbd[Mod+C], :kbd[Mod+X], :kbd[Mod+V] | Copy, cut, paste. |
| :kbd[Mod+Z] | Undo. |
| :kbd[Shift+Mod+Z] or :kbd[Ctrl+Y] | Redo. |
| :kbd[Mod+S] | Save draft. |
| :kbd[F1] or :kbd[Mod+/] | Help for this page. |

## The inspector

With nothing chosen it shows **About this flow** and **What it does**, up to 500 characters, counted. With one step chosen:

| Part | What it does |
| --- | --- |
| **Steps (N)** | An outline of every step. |
| **Name** | The step's name. :kbd[Enter] renames it and rewrites the `steps.name` references to it. Lowercase letters, digits and underscores, starting with a letter, and not in use. Renaming a webhook or form start in a saved flow keeps its address: the message says so. |
| The step's own fields | See [Flow steps](../../../reference/flows/steps) and [Ways a flow starts](../../../reference/flows/starts). |
| **Where it goes next** | **Then go to**, **Also go to**, **When <case>, go to**, **Otherwise, go to** and **On failure, go to**. |
| **Remove this step** | Removes it. |
| **Last test** | After a test: what the step did. See below. |

With several chosen it says "N steps chosen" with **Duplicate** and **Remove**.

An expression field is plain text, with no autocomplete. About 400 ms after you stop typing, a line "Gives …" shows what it would give, cut at 160 characters, worked out against the last test, or else the flow's newest run. Without one it says "Run a test to see its value." In a **For each** it uses the first item ("For the first item."). Values the run was given in secret are masked as on the run page. See [Expressions in a flow](../../../reference/flows/expressions).

In a **Branch**, a case is renamed with :kbd[Enter] or by leaving the field. A name already used, or `otherwise`, is refused with the reason. Renaming or removing a case moves or drops its connection in one **Undo**.

## The test panel

**Test** opens the panel under the canvas. It is titled "Test the draft" and says "Runs <path> as it is saved now, as a test run in this workspace. Nothing is deployed."

| Control | What it does |
| --- | --- |
| **Start from** | Which start to test from. Shown when the flow has several. "The input is what that trigger would receive." |
| **Build with all drafts** | Off: the draft you test and the drafts it names. On: every draft of the workspace, so another draft that does not build stops the test. |
| Input | A form drawn from a manual start's input. |
| **Run a test** or **Run again** | Starts the test. |
| The steps | Each step and its state, as the test goes. Choose one to see it in the inspector. |
| **Open the run** | The test's page under [Runs](../operate/runs). |
| "The flow changed since this test." | The flow was edited after the test started. |
| **Close the test panel** | The × button. |

Choosing a step shows **Last test** in the inspector: its state, **Started**, **Took**, the error if there is one ("The flow carried on down its error path." when it was handled), how many items of a **For each** are done, the step's output with a **Copy** button, its log, and **Test from <step>**. **Test from <step>** keeps what the steps before it did in this test and runs that step and what follows on the draft as it is now. It is not offered on the start.

## Not in the editor

The editor has no comments, no frames, no pinned data, no way to switch a step off, and no autocomplete in expressions. A start's `key` cannot be seen or edited; it is set by renaming. A step has no retry setting: retries belong to the script (see [How a flow runs](../../../explanation/flows/how-a-flow-runs)).

## Permissions

| Action | Needs |
| --- | --- |
| Open the editor, save a draft, **Remove**, **Discard draft** | `resource:write` |
| **Test** | `run:write` and `flow_run:write`, and `code:write` while code is among the drafts the test builds with |
| **Deploy** | `deployment:write` |

The permissions are in the [permissions reference](../../../../administer/reference/permissions).

## Related

- [Flows](flows)
- [Draw and deploy a flow](../../../how-to/flows/draw-and-deploy-a-flow), [Test a flow](../../../how-to/flows/test-a-flow)
- [Flow steps](../../../reference/flows/steps), [Ways a flow starts](../../../reference/flows/starts)
