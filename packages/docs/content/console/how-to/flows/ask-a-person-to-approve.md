---
title: Ask a person to approve a step
description: Add an Approval to a flow, say who may decide and for how long, and decide it from the console or from the mail.
subjects: [flows]
---

## Ask a person to approve a step

By the end a flow will wait for a person at an Approval step, and you will have decided it.

## Before you start

- A flow in the editor, in a dev workspace, and `resource:write`. See [Draw and deploy a flow](draw-and-deploy-a-flow).
- To decide, you need `approval:write`, and you must be one of the people the step names, if it names any. See the [permissions reference](../../../administer/reference/permissions).

## Add the approval

:::steps
1. Click the step the approval should follow. Press **Add step** and choose **Approval** from the **Logic** group. It goes after the chosen step and is named `approve`.
2. In **What is being approved**, write the title people see, up to 200 characters.
3. In **Detail to show**, write an expression that gives more for the decider to read, if you want to.
4. In **Give up after (optional)**, set an **Amount** and a **Unit** (seconds, minutes, hours or days), up to 30 days, if the step should fail when nobody decides. Left empty, it waits as long as it takes.
5. Under **Who may decide**, pick **Groups** and **Roles**. Left empty, anyone with `approval:write` may decide.
6. In **Where it waits**, choose **This workspace**, or **This workspace and the tenant**.
7. Connect the step's red dot to what should happen when it is rejected or times out. With no error path the flow fails.
8. Save, then press **Test** to try it. A test mails the approvers with the subject "[Test] Approval needed: <title>".
:::

## Decide it

:::steps
1. Open **Operate**, then **Approvals**. The chips are **Waiting for you**, **Waiting for others** and **Decided**. Choose the approval in **Waiting for you**.
2. Press **Approve** or **Reject**. A dialog asks "Note (optional)" for an approval, or "Why is it rejected?" for a rejection, which must be answered.
3. Press **Approve** or **Reject** in the dialog. The console says "Approved “<title>”. The flow goes on." or "Rejected “<title>”. Rejecting fails the step: the flow takes its error path, or fails if it has none."
:::

You can also decide from the run's page, which says "Waiting for approval: <title>" and "You may decide this." with **Approve** and **Reject**, or from several at once on the Approvals screen.

## Decide it from the mail

Each person who may decide gets a mail with the subject "Approval needed: <title>" and a link. It goes to at most 50 people: the tenant's members who hold `approval:write` in the workspace and, if the step names any, are among **Who may decide**.

:::steps
1. Open the link. It needs no sign-in: the link is the person's own. The page shows the title, the flow, and "Asked of <name>". Opening it decides nothing.
2. Write a comment in **Comment (needed to reject)**. It is needed only to reject.
3. Press **Approve** or **Reject**. The page says "Approved. Thank you, <name>." and "The flow carries on." and has **Open the run**.
:::

The link works once, until 48 hours after it was sent or until **Give up after** if that comes first, or until someone else decides. A second visit says "Nothing to decide here".

## The result

On approval the flow goes on, and the step's `approved` is true with the `comment` you gave. On a rejection or a timeout, the step failed and `steps.<name>.error.message` holds the reason. A decision made by a service account is listed with its name.

## If it does not work

- **The flow shows in Flows as waiting but you cannot decide.** You are not in **Who may decide**, or lack `approval:write`.
- **Nobody is waiting on the screen.** The count on **Flows** counts approvals only. A **Wait** step is not one.
- **The run says "You may not decide this: it waits for the Billing group."** You are not in a group or role named under **Who may decide**. The mail goes to its members.
- **The mail never came.** A test mails the same people. Check that the group has members who are active and hold `approval:write` in the workspace.
