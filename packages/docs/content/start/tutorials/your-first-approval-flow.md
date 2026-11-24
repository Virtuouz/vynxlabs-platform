---
title: Your first approval flow
description: Start from a flow that decides by amount, add an approval step for the large amounts, test it, and decide it as a practice manager.
subjects: [flows, approvals]
---

You will have a flow that waits for a person when an amount is over 100, a test run that is waiting, and the decision that lets it finish. It takes about 20 minutes.

## Before you start

- You can sign in to the console as Maya Brooks, `maya.brooks@fernhill.example`, a tenant admin of Fernhill. Writing a flow needs `flow:write`, and testing it needs `flow_run:write`. A tenant admin has both. The seeded password is `fernhill-demo-2026`.
- You can sign in as Rowan Ellis, `rowan.ellis@fernhill.example`, a member of the group Practice managers. Deciding an approval needs `approval:write`. You use a second browser window, or sign out and in again.
- Fernhill is set up, and its Sandbox is a :term[dev workspace]{id=dev-workspace}. A test run does not need triggers resumed. See [Set up the Fernhill example](../../start/how-to/example/set-up-the-fernhill-example).
- A browser at least as wide as a laptop screen.

:::steps
1. **Open the flow editor.** Sign in as Maya and check that the bar at the top shows **Sandbox**. Press **Build**, then choose **Flows** in the menu beside it. Press **New flow**. The editor opens with **New flow**, **Draft**, and the buttons **Tidy up**, **Test** and **Save draft**.

2. **Start from a starter.** In **Path** type `tut-approve`. Under **Start from** press **Decide, then answer**. The list headed **Steps (4)**, at the top of the panel on the right, reads `start` (trigger), `size` (branch), `large` (set) and `small` (set). The branch `size` sends a run to `large` when `trigger.amount > 100` and to `small` otherwise.

3. **Choose the step the approval follows.** In the **Steps** list press `large`.

4. **Add the approval.** Press **Add step**. In the menu that opens, under **LOGIC**, press **Approval**, which says "Pauses until a person decides." The list now ends `approve` (approval), and the new step is chosen. The editor has connected `large` to it.

5. **Say what is being approved.** In the panel **The chosen step**, set:
   - **What is being approved**: `Approve a large amount`
   - **Detail to show**: `trigger.amount`. This is an expression, so the approver sees the amount.

6. **Say who may decide.** Under **Who may decide**, open **Groups** and choose **Practice managers**: the option reads `practice-managers`, its key, with the name under it, and the choice shows as `practice-managers`. Press :kbd[Esc] to close the list. Leave **Give up after (optional)** empty, and **Where it waits** at **This workspace**.

   ::screenshot{name=start/tut-approve-step alt="The flow editor with the approve step chosen: What is being approved, Detail to show, and Who may decide with the group Practice managers"}

7. **Save the draft.** Press **Save draft**. The address becomes `…/flows/edit/tut-approve` and the status reads "Draft saved just now".

8. **Test it.** Press **Test**. The panel **Test the draft** opens, with the field **Amount**. Type `250` and press **Run a test**. The steps are listed with `start` **Succeeded**, `size` **Succeeded**, `large` **Succeeded**, `small` **Skipped** and `approve` **Waiting for approval**, in no fixed order, and the panel offers **Open the run**. The run waits. Leave the panel open.

9. **Decide it as Rowan.** In another window sign in as Rowan, make sure **Sandbox** is the workspace, and press **Operate**, then **Approvals**. Under **Waiting for you** there is a row that reads "Approve a large amount", **250**, "tut-approve · Sandbox", and **the Practice managers group** under **Who decides**.

10. **Approve.** Press **Approve** on the row. The dialog "Approve “Approve a large amount”?" has an optional **Note**. Type `Fine for a practice manager.` and press **Approve**. The row leaves **Waiting for you**. In the test panel, as Maya, `approve` now reads **Succeeded** and the whole run reads **Succeeded**.

11. **Open the run.** As Maya, press **Open the run** in the test panel, or choose **Operate**, then **Runs**, and open the latest run of `tut-approve`. It says **Succeeded**. The timeline shows `approve` as the long bar. The output of `approve` reads `"approved": true` and your note as `"comment"`.
:::

## What you built

- A flow `tut-approve`, a draft in Fernhill's Sandbox. Find it under **Build**, **Flows**. It is not deployed: a draft runs only as a test.
- An approval step that Practice managers decide. It is the only step a person has to act on.
- One test run that waited and then succeeded, under **Operate**, **Runs**, and one decided approval, under **Approvals**, **Decided**.

The Approvals screen says that rejecting fails the step, and that the flow takes its error path or fails if it has none. `approve` has no error path. To see a rejection, run the test again and press **Reject** as Rowan: the dialog asks **Why is it rejected?**, and **Reject** stays off until you write something. The row then shows under **Decided** as **Declined** with your words.

Next, make a table the flow could use in [your first table](your-first-table), or [fix a failed run](../../console/tutorials/fix-a-failed-run).
