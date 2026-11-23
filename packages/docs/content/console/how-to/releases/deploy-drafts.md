---
title: Deploy drafts to a dev workspace
description: "Review the drafts waiting in a dev workspace, deploy all of them or some, set aside what you do not want, and read a refusal."
subjects: [deploy]
---

## Deploy drafts to a dev workspace

By the end the drafts you chose are running in the dev workspace as its next version. Production is not touched.

## Before you start

- You work in a dev workspace. A production workspace has no drafts.
- You hold `deployment:write`, and `code:write` for a draft that holds code. See the [permissions reference](../../../administer/reference/permissions).
- A draft of a script, a connector or a trigger source needs writing code in the console to be on for the tenant. See [Repository](../../../administer/reference/screens/repository).

## Deploy every draft

:::steps
1. Open **Operate**, then **Deploy**. The step **Review draft** lists the drafts by kind, with how many there are.
2. Read each row: its tag (**New**, **Changed**, **Removed**, **Takes over from code**, **Renamed**) and the lines under it.
3. In **What changed**, say what this version is, for example "Add a greeting variable". It is optional.
4. Press **Deploy N changes**.
:::

The screen moves to **Deploy to dev**, and a message says "Deployed as version N: *paths*." The new version is the first row, tagged **Running in *workspace***.

## Deploy only some

:::steps
1. On **Review draft**, tick the box **Choose *path*** of each draft you want.
2. Press **Deploy the N chosen**. The others stay as drafts.
:::

With none ticked, **Deploy** takes every draft. If some were saved more than a day ago, a notice says so and names them. Tick the ones you mean, or set the old ones aside.

## Set a draft aside

:::steps
1. Press **Set aside** on its row, or tick several and press **Set aside the N chosen**.
2. Confirm. The resource goes back to how it was last deployed.
:::

The draft stays in its history. **Earlier** on its row lists the saves, and **Bring back** makes one the draft again.

## Deploy one change from its editor

In an editor, the **Deploy** menu has **This change only**. It checks that change alone and deploys it. If it cannot go alone, a dialog says "*path* cannot be deployed alone" and offers **Review all drafts**.

## The result

The **Deploy to dev** step lists the new version with your message. If the workspace promotes somewhere, the message offers **Promote to *name***. Follow [Promote a version](promote-a-version).

## If it does not work

- **"These changes cannot be deployed yet."** The panel says why and names what it found. The codes and their fixes are in [Why a deploy or promotion is refused](../../../develop/reference/releases/refusals). A name with **Set up** beside it can be set up from there.
- **"Not set up here, and the deploy still works."** This is a warning. The deploy goes ahead, and a run that reaches the missing connection, secret or variable fails until it is set up. A promotion would refuse it.
- **Deploy is disabled.** The deploy would be refused. The panel says why. With no drafts at all the step says "Nothing waiting to be deployed".
- **"Someone else saved this draft after you opened it."** Reload the editor and make the change again.
- **Saving a script, connector or trigger source is refused: "Writing code in the console is turned off for this tenant."** Someone who may change the tenant turns it on under **Repository**.
