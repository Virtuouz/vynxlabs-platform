# Run log: console/how-to/operate/approve-and-reject.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, Playwright headless. No other width, no dark theme, no keyboard-only pass, no reload test.
- Other writers share the Sandbox, so its Runs list holds runs that are not mine.

## The steps as followed
1. Started `inventory/reorder` by hand (**Start flow**, JSON input, quantity 500). Its page read "Waiting for approval: Approve a stock order", the detail (Item, Total $3,690.00, Clinic, On hand), "You may decide this.", **Approve**, **Reject**.
2. **Operate**, **Approvals**: **Waiting for you** 1; the row showed the question, the detail, the flow and workspace, "14s", "the Practice managers group", **Approve**, **Reject**. The inspector: Waiting since, Times out, Who decides, Step, "What it asks about" and **Open the run's graph**.
3. **Reject**: "Reject “Approve a stock order”?", "Why is it rejected?", **Cancel**, **Reject**. **Reject** was disabled until a reason was typed. Typed one and pressed **Reject**.
4. **Decided**: the row read "Declined", the reason in quotation marks, `inventory/reorder`, Sandbox, the decider's email, "just now". The flow run failed at the step on its error path ("Failed at refused").
5. Started a second run and pressed **Approve** on its page: "Approve “Approve a stock order”?" with "Note (optional)"; typed a note and pressed **Approve**; the flow went on to `place`.

## The page got wrong (and was corrected)
- The brief and the code differ on nothing the run reached. The decider is shown by email for a member (not a name): the page says "who decided" only.

## Not run
The mailed link (the instance has no mail configured on this instance), a batch decision, **Waiting for others**, a person who may not decide, a time out.
