---
title: Approve or reject a decision
description: Decide the approvals a flow is waiting for, in the console, from a flow run's page, in a batch, or from the link in the mail.
subjects: [approvals]
---

## Approve or reject a decision

By the end you will have decided an approval, and the flow that waited for it will have gone on or taken its error path.

## Before you start

- You hold `approval:write` in the workspace. If the flow's approval step names approvers, you are a member of one of its groups or hold one of its roles. A step that names none is open to anyone with the permission. See the [permissions reference](../../../administer/reference/permissions).
- A flow is waiting for a decision. A flow with an approval step reaches it, and stops there until someone decides or its time limit passes.

## In the console

:::steps
1. Open **Operate**, then **Approvals**. **Waiting for you** lists the approvals you may decide, the longest waiting first. Each row shows the question, the first fields of its detail, how long it has waited and who decides.
2. To read more, choose the row. The inspector shows **Waiting since**, **Times out**, **Who decides**, **Step** and **What it asks about**. **Open the run's graph** goes to the flow run.
3. To approve, press **Approve**. The console asks "Approve “*question*”?" with **Note (optional)**. Press **Approve**.
4. To reject, press **Reject**. The console asks "Reject “*question*”?" and **Why is it rejected?**. A reason is required: **Reject** stays disabled until you type one. Press **Reject**.
:::

Approving says "Approved “*question*”. The flow goes on." Rejecting says "Rejected “*question*”. Rejecting fails the step: the flow takes its error path, or fails if it has none." A flow that has an error path from the step carries on down it. A flow that has none fails, and the failure is alerted like any other.

### Several at once

Check the rows. The bar says "N selected". Press **Approve** or **Reject**. One note, or one reason, is kept with every decision.

### From the flow run

The page of a flow run that waits shows "Waiting for approval: *question*" with its detail and either "You may decide this." with **Approve** and **Reject**, or "You may not decide this: it waits for *who*." The same questions are asked.

### From the mail

If the instance can send mail, each member who may decide is mailed a link to the approval, with the subject "Approval needed: *question*". The link opens a page without a sign-in. Opening it decides nothing: read what it asks, type a comment (needed to reject), and press **Approve** or **Reject**. The link works once, for 48 hours or until the step's time limit if that comes sooner, and stops working as soon as anyone decides. Your decision is recorded under your name, and the list under **Decided** says "decided from the mail".

## The result

The approval leaves **Waiting for you** and appears under **Decided** with **Approved** or **Declined**, your note or reason, who decided and when. The flow run's page shows the step as decided and the flow goes on. **Decided** lists the last 100.

## If it does not work

- **The approval is in Waiting for others.** You may not decide it: the step names who may, or your role does not include approving. You can see it and open its run.
- **Approve and Reject are not on the flow run's page.** It says "You may not decide this", and who it waits for.
- **The mailed link says "Nothing to decide here".** It was used, someone decided, or it ran out: "This link has been used, the approval was decided, or it ran out." Open **Approvals** in the console.
- **"Say why it is rejected: whoever asked reads it."** A rejection needs a comment.
- **Nothing was mailed.** The instance has no mail configured, or you are not among those who may decide. The approval waits in the console.
- **The flow failed after a reject or a time out.** The step had no error path. Add one in the flow editor.

## Related

- [Approvals](../../reference/screens/operate/approvals): every control, who may decide and the mailed page.
- [The run page](../../reference/screens/operate/run-page)
