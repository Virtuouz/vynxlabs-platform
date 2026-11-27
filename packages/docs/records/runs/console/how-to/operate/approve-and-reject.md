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

## Not run by the writer
The mailed link (the instance has no mail configured on this instance), a batch decision, **Waiting for others**, a person who may not decide, a time out.

## Second check (2026-11-23)

- Instance: http://localhost:8091, the throwaway instance (MAIL_CAPTURE_DIR set, so mail is read from its folder). Everything below ran in a workspace of my own: Operate check (a dev workspace) and Operate check live (a production workspace linked to it), in Fernhill's tenant, with scripts, flows, triggers, a secret and an HTTP connection of mine (deployed by the CLI from a repository of my own; the connection pointed to a listener of mine on localhost). Signed in as Maya Brooks, and as Devi Shah (not in the Practice managers group) where a second person was needed. Playwright, headless.

- Mailed link: started `opchk/approve`; two mails were captured (Maya Brooks, Rowan Ellis; "Approval needed: Approve an opchk thing"). Opened Maya's link with no sign-in at 390 px in dark: the page shows the tenant, the workspace (DEV), the title, the detail, **Comment (needed to reject)**, **Approve**, **Reject**, "Asked of Maya Brooks. …". **Reject** with no comment: "Say why it is rejected: whoever asked reads it." Typed a comment, **Approve**: "Approved. Thank you, Maya Brooks." and "The flow carries on. Your decision and your comment are recorded under your name." Reloaded the link: "Nothing to decide here" and "This link has been used, the approval was decided, or it ran out." No horizontal scroll. Under **Decided** the row read “op-docs mailed approve” · decided from the mail.
- Batch: three flows waiting; checked two rows: "2 selected", **Approve**; the question "Approve 2 decisions?" with "Note (optional), kept with each decision"; both decided with one note ("batch note").
- **Waiting for others** and a person who may not decide: Devi Shah saw **Waiting for you** 0, **Waiting for others** 1, the row with "the Practice managers group" and **Open the run**, no buttons.
- Time out: a flow with a 5 second limit failed at the step with "Nobody decided before the approval timed out."; it is not under **Decided**.
- Rejected with a reason on the flow run's page: the flow failed ("Failed at ask: Rejected: op-docs reject"); the step had no error path.
- Walked **Approvals** at 390 and 768 px, light and dark: no horizontal scroll; the rows stack. By keyboard: focused **Approve** on a row and pressed Enter, the question opened and Escape returned focus to the button. A reload of `?show=decided` kept the view.

Still not run: a service account deciding.
