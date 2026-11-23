---
title: Draw and deploy a flow
description: Make a flow in a dev workspace, add and connect its steps, fix what the editor lists, save it as a draft and deploy it.
subjects: [flows, deploy]
---

## Draw and deploy a flow

By the end you will have a flow that runs on a deployed version.

## Before you start

- You are in a dev workspace. A production workspace has no flow editor: flows reach it by promotion. See [Flows](../../reference/screens/build/flows).
- You have `resource:write` to draw and save a draft, and `deployment:write` to deploy. A workspace admin has both. See the [permissions reference](../../../administer/reference/permissions).

## Draw it

:::steps
1. Open **Build**, then **Flows**, then **New flow**. The editor opens on a new flow.
2. In **Path**, type a path such as `orders/handle`. A path already in use is refused.
3. Under **Start from**, press **Started by hand**, or **Decide, then answer** to begin with a Branch. The canvas shows the starter. After your first change the starters are disabled.
4. Click the start step on the canvas to choose it. Press **Add step**, and in **Find a step** type part of the name, such as `Set values`, and press :kbd[Enter], or choose it in the list. The new step goes after the one you chose and is connected to it. With no step chosen, the new step is not connected, and the editor lists "Nothing leads to set." under **to fix**.
5. Fill in the step's fields in the inspector. A **Set values** step takes a name and an expression for each value; press **Add a value** for another.
6. Connect by dragging from a step's dot to another step. A red dot is the error path, taken when the step fails. Press **Tidy up** to lay the steps out again.
7. Read "N to fix" in the header, such as "1 to fix". Each item in the list under the header is a link to the step and field. Fix each until the header no longer shows it.
8. Press **Save draft**. The header says "Draft saved" and how long ago. After the first save the editor saves by itself 1.5 seconds after a change.
:::

## Deploy it

:::steps
1. Press **Deploy** in the header. It appears once the draft is saved and has no unsaved change.
2. Choose **This change only**. The console says "Deployed <path> as version N."
3. If the console says the flow "cannot be deployed alone", read what it names and press **Review all drafts**. That opens the screen that deploys every draft together.
:::

## The result

The header's state pill says **Live**. The flow is on the **Flows** list with **vN** in **State**, and no **Draft** tag. Runs from now on use that version; a run that was already going keeps the version it started on. To start it, open the flow and press **Start flow** (a start **By hand**), or see [Start a flow](start-a-flow).

## If it does not work

- **"N to fix" will not clear.** The item says what the step lacks. A new **Run a script**, **Run a flow** or **On an event** step is listed until you choose what it runs or hears. A draft with an unfinished step saves, but a deploy refuses it.
- **The deploy refuses a field.** A fault that only the server's schema knows arrives in words when you deploy. Open the step it names and fix the field.
- **"Not saved: someone else saved this flow".** Another person saved first. Take their version, or press **Copy what I wrote** and merge by hand.
- **A removed step.** Removing a step does not ask. Press **Undo** in the message, or :kbd[Mod+Z].
- **A flow managed in the repository.** Saving a draft takes it over. Change it in the repository instead if you want it to stay there.

Next: [Test a flow](test-a-flow). Reference: [The flow editor](../../reference/screens/build/flow-editor), [Flow steps](../../reference/flows/steps).
