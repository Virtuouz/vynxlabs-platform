---
title: Start a flow
description: Choose what starts a flow, a webhook, a form, an event or a schedule, set it in the editor, and see the address or next time it gives.
subjects: [flows, triggers]
---

## Start a flow

By the end you will have chosen what starts a flow and set it.

## Before you start

- A flow open in the editor, in a dev workspace, with `resource:write`. See [Draw and deploy a flow](draw-and-deploy-a-flow).
- To see a webhook's address on the flow's page you need to manage triggers. Others see "a webhook. Its address is shown to those who manage triggers."

## Set a start

:::steps
1. In the editor, choose the start step. A new flow has one, named `start`. To add another, choose **On a webhook**, **On a form**, **On an event** or **On a schedule** from the add step list.
2. In the inspector, under **It starts**, choose the kind. Settings you made for another kind are kept while the step stays open.
3. Set it:
   - **On a webhook**: choose what **The flow is given**, how **The request is answered**, and how **Each request is checked**. For a signature, set **Signature**, **Header it is sent in** and **Secret it was signed with**, and say **What the sender signed**.
   - **On a form**: give a **Title of the form**, then each **Question** with its **Answered with** type, its name in the flow, and whether it **Must be answered**. Choose **Who may send it**.
   - **On an event**: choose the **Event**. Write **Only when (optional)** to start only for some payloads, for example `event.payload.amount > 100`.
   - **On a schedule**: pick a preset or write a cron line, check **Time zone**, and read the next five times shown.
4. Press **Save draft**, then **Deploy**, **This change only**. See [Draw and deploy a flow](draw-and-deploy-a-flow).
:::

## The result

On the flow's page, **How it starts** says when a schedule runs next, shows a webhook's `POST` address, or points to the form's address under **Schedules and triggers that start it**. A run started this way says **Webhook**, **Form**, **Event** or **Schedule** under **Started by**.

Every setting of a start is in [Ways a flow starts](../../reference/flows/starts).

## If it does not work

- **A webhook answers 401.** The signature did not match. Check the header, the secret, whether it is **Hex** or **Base64**, and **What the sender signed**.
- **A webhook answers 503.** A dev workspace starts with its triggers paused: the Overview says "Triggers are paused" and the answer is `workspace_paused`, "This workspace's triggers are paused, so the webhook started nothing." A webhook paused on its own, or the whole instance, answers `trigger_paused`. Runs started by hand still work. See [Triggers](../../reference/screens/operate/triggers) to resume.
- **A webhook that waits for the flow answers 202 with an `x-flow-run` header.** The flow had said nothing after 25 seconds. The run goes on.
- **A form's question is flagged.** `website`, `key` and `return` are reserved names. Rename it.
- **The editor will not take a webhook's answer setting.** "By the flow, with an Answer step" needs an **Answer the request** step the start reaches.
- **You renamed a webhook start.** In a flow that was already saved, it keeps its address: see [A webhook's address and its key](../../../develop/explanation/flows/webhook-address-and-key).
- **A schedule did not fire.** While the last run is going, **Skip a time while the run it started last is still going** passes the time over. A schedule that is paused does not fire.
