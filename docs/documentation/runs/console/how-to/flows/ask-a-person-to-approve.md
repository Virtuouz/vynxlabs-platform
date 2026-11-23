# Run log: console/how-to/flows/ask-a-person-to-approve

- Instance: the walk instance, `http://localhost:8091`, Fernhill seeded. Code at branch `phase-31-write-the-docs`, 2026-11-23. Signed in as Maya Brooks (`maya.brooks@fernhill.example`), tenant admin, workspace Sandbox, headless Chromium through Playwright, 1440 x 900, light. Flows were named `flows-…`. Scripts are in `/home/gplascencia/.local/share/volvel-walk/flows31/`.

## Steps as followed
1. New flow `flows-approve/discount`, chose `start`, **Add step**, `Approval`, Enter: step `approve`. Fields: **What is being approved**, **Detail to show**, **Give up after (optional)** (**Amount**, **Unit**), **Who may decide** (**Groups**, **Roles**), **Where it waits**, **Where it goes next** with **On failure, go to**.
2. Title "Discount for a Fernhill client". **Save draft**, **Deploy**, **This change only**.
3. On the flow's page **Start flow**, then **Start flow** in the dialog: the run opened, "Waiting for approval: Discount for a Fernhill client", "You may decide this.", **Approve**, **Reject**.
4. **Approvals** (Operate): chips **Waiting for you** 1, **Waiting for others**, **Decided**. Chose the row, **Reject**: dialog "Reject “Discount for a Fernhill client”?" with "Why is it rejected?". Reason "Too large", **Reject**. Toast: "Rejected “Discount for a Fernhill client”. Rejecting fails the step: the flow takes its error path, or fails if it has none." The run: **Failed**, "Failed at approve: Rejected: Too large".

## What the page got wrong, corrected
- It did not say to press **Add step**, or that the step is named `approve`.
- **Give up after** has **Amount** and **Unit**.
- The screen's chips and the run page's own **Approve** and **Reject** were not described.
Not reached: **Approve** (only Reject was pressed), the mailed link, a bulk decision, a group or role picked, and an error path.
