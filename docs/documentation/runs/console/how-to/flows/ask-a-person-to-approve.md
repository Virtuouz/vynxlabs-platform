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

## Second check, 2026-11-23 (second agent)

On the walk instance, Maya Brooks, in a workspace of my own: Fernhill tenant, dev workspace `flows-check` (created with triggers running, so the shared Sandbox's paused triggers were not touched). Flows `flows-approve/mail`, `flows-hook/signed`, `flows-form/intake`, `flows-sched/tick`. Scripts in `/home/gplascencia/.local/share/volvel-walk/flows31/` (`h2.mjs` to `h15.mjs`, `w1.mjs`, `w2.mjs`).

Done now, as written:
- **Who may decide**: **Groups** lists `billing` and `practice-managers`; chose Billing. Started the flow: the run said "Waiting for approval: Mail link check" and "You may not decide this: it waits for the Billing group." (Maya is not in it).
- The mail was captured (`mail-31`): subject "Approval needed: Mail link check", to a Billing member, with the link and "The link is yours. It works once, until <48 hours on>, or until someone decides. Opening it decides nothing: you choose on the page."
- The link, opened signed out at 390 px: the page shows the title, the flow, "Comment (needed to reject)", **Approve**, **Reject**, "Asked of <name>". **Approve** (one press, no comment): "Approved. Thank you, <name>." "The flow carries on." and **Open the run**. The run **Succeeded**, `approved` true, `comment` null. The same link again: "Nothing to decide here".
- **Approve** from the Approvals screen as Maya (on `flows-approve/discount`): dialog "Approve “Discount for a Fernhill client”?" with "Note (optional)", **Approve**.
Corrected: the test mail subject is "[Test] Approval needed: <title>"; the toasts use curly quotes; added a section for deciding by mail; added the "You may not decide this" case.
Not run: a bulk decision, a role chosen, **Give up after** elapsing, an error path.
