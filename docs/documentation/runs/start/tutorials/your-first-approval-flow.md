# Run log: start/tutorials/your-first-approval-flow

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. Maya Brooks and Rowan Ellis in two Playwright contexts, Fernhill Sandbox, 1440 x 900, light. Flow path `tut-approve` (the page's name; no other writer uses it).
- Run 1 explored the editor. Run 2 followed the page's steps with its clicks. A third run rejected as Rowan.

## Seen

1. Build > Flows > **New flow**: the editor with **New flow**, Draft, Tidy up, Test, Save draft.
2. Path `tut-approve`; **Decide, then answer**: outline `start trigger / size branch / large set / small set`. `size` has the case `large` when `trigger.amount > 100`; the start step takes a required number `amount`.
3-4. `large` chosen, **Add step**: the list "Steps to add" groups STARTS, STEPS, LOGIC (Branch, For each, Join, Wait, Approval "Pauses until a person decides.", Fail), CORE and SCRIPTS. Approval added: outline ends `approve approval`; the saved edges are `start->size`, `size->large` (large), `size->small` (otherwise), `large->approve`.
5-6. Fields What is being approved, Detail to show, Give up after (optional), Who may decide (Groups, Roles), Where it waits (This workspace; This workspace and the tenant). The group list offered Billing and Practice managers.
7. Save draft: URL `/flows/edit/tut-approve?step=approve`, status "Draft saved just now".
8. Test: panel "Test the draft", field Amount (required), **Run a test**: start Succeeded, approve Waiting for approval, large Succeeded, size Succeeded, small Skipped; a link **Open the run**.
9. Rowan, Approvals: Waiting for you 1; row "Approve a large amount", 250, "tut-approve · Sandbox", "the Practice managers group", buttons Approve and Reject.
10. Approve dialog: title `Approve “Approve a large amount”?`, **Note (optional)**; after Approve, Waiting for you 0; the test panel went to Succeeded with `approve` Succeeded.
11. The run page: Succeeded, "By hand", Timeline with `approve` as a long bar (33.8 s in the first run); output `{"approve":{"comment":"Fine for a practice manager.","approved":true}}`.
- Reject: dialog `Reject “Approve a large amount”?` with **Why is it rejected?**; the **Reject** button is disabled while empty. Decided shows **Declined** with the comment.

## What the page got wrong, and was corrected

- First draft chose `start` before adding the approval. A leftover draft of the same path made the editor wire `start -> approve -> size`, a loop. After deleting the draft and choosing `large`, the editor connected `large -> approve`. The page now names `large`.
- The status text is "Draft saved just now", not "Draft saved".
- The panel and the decision update the test run live.

## Not run

Deploying the flow and starting it by hand; 768 and 390 px; dark; keyboard-only; mail to approvers (the instance has `MAIL_CAPTURE_DIR`, not looked at).
