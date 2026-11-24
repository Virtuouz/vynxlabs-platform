---
title: Pause triggers
description: Stop one trigger, every trigger of a workspace, or every trigger of the instance, and start them again.
subjects: [triggers]
---

## Pause triggers

By the end you will have stopped a trigger from starting work, and known how to put it back. A pause can be put on one trigger, on a whole workspace, or, by an operator, on the whole instance. Runs started by hand still work at every level.

## Before you start

- To pause or resume one trigger you hold `trigger:write`. To pause a workspace you hold `workspace:write`. An operator with `instance:write` pauses the instance. See the [permissions reference](../../../administer/reference/permissions).
- A pause does not stop runs already going or queued.

## Pause one trigger

:::steps
1. Open **Operate**, then **Triggers**, and choose the trigger.
2. Press **Pause this trigger**. The question is "Pause *path*?"
3. Under **Why (shown to everyone here)** give a reason, if you want to. It is optional and takes 500 characters. Press **Pause**.
4. To pause several, check their rows and press **Pause** in the bar. One reason is kept with each.
:::

In a production workspace the question is a danger. The console says "*path* is paused. Nothing it would start is started." The trigger's state reads **Paused**, and its details say "Paused *time* by *name*: *reason*."

To start it again, choose the trigger and press **Resume**. The console says "*path* runs again."

## Pause a workspace

:::steps
1. Open **Configure**, then **Workspace settings**.
2. Under **Triggers are on**, press **Pause triggers**. The console says "Triggers in *name* are paused. Runs started by hand still work."
3. To start again, press **Resume triggers**.
:::

Every trigger of the workspace then reads **Workspace paused**. A new dev workspace starts paused, so a schedule you try there does not run beside production's.

## The instance

An operator can pause every trigger in every tenant at once, under the instance's own **Triggers** screen, **Pause every trigger**. The optional **Why** is shown on that screen and kept in the audit log. Where it is paused, a workspace says "Triggers are paused by the instance", and every trigger reads **Instance paused**. Only an operator can resume. If the operator's setting `TRIGGERS_PAUSED` is set, unsetting it and restarting resumes them.

## What a pause does

- A **schedule** keeps its due time and fires once when the pause ends. The list says "Fires once when resumed".
- A **webhook** refuses requests with a 503 (`workspace_paused`, or `trigger_paused` when the trigger or the instance holds it), and records that it did.
- An **event** that is published while its trigger is paused is stored and starts nothing. A workspace pause does the same.
- A **form** says "This form is not taking answers at the moment. Try again later."
- A pause on one trigger lasts through deploys and applies in production as anywhere else, until it is resumed.

## The result

The state column shows the widest hold first: **Instance paused**, then **Workspace paused**, then **Paused**. **Fire now** is not offered while any pause holds a schedule, and the server refuses it with the reason. The same states show on a script's or a flow's **Triggers** tab.

## If it does not work

- **There is no Pause this trigger.** You need `trigger:write`.
- **"A draft starts nothing until it is deployed, so there is nothing to pause."** A trigger that was never deployed fires nothing.
- **Resuming a trigger changes nothing.** The workspace or the instance still holds it. The state says which.

## Related

- [Triggers](../../reference/screens/operate/triggers)
- [Verify a signed webhook](../../../develop/how-to/operate/verify-a-webhook)
