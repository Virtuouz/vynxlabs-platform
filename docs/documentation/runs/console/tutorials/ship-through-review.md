# Run log: console/tutorials/ship-through-review

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. Operator admin `admin@example.com` (also tenant admin of the new tenant) and the colleague `tut.dev@example.com`. Own tenant `tut-ship` with workspaces `live` (production) and `dev`. Playwright headless, 1440 x 900, light.
- **Rework from the inventory's brief.** The brief had the tutorial run on Fernhill (`sandbox` linked to `clinics`, Devi's key, Maya). Not done: promoting and rolling back change Fernhill's production workspace, which is shared example data; an action on `clinics` was refused by the session's permission check earlier in the wave. The tutorial uses a tenant of its own.
- Done in scripts in the page's order. The tenant, the two workspaces and the member were made through the console's dialogs; the first attempt made the tenant by the API and was deleted and redone.

## Seen

1. **Create workspace** dialog: Name, Slug, Type (Choose…, Production, Dev), Promotes to (Nothing, "Live (production)"). List: `Dev`/`dev`/DEV/`Live`, `Live`/`live`/PRODUCTION.
2. **Add member** dialog (Email, Name, Initial password "At least 12 characters", Roles > Role: No access yet, agent_runner, app_maintainer, deployer, developer, doc_writer, portal_reader, portal_user, tenant_admin, viewer, workspace_admin). Added `tut.dev@example.com` with `developer`: "1 given directly".
3. New script > **Greet someone**, Path `tut-greet`, **Save draft**: `.../scripts/edit/tut-greet`.
4. Operate menu: Runs, Events, Triggers, Approvals, Deploy (with a draft count), Git sync. Deploy: 01 Review draft "1 change", 02 Deploy to dev, 03 Promote Live; "What changed" `First greeting`; after: "0 changes", VERSIONS OF DEV `v2` "First greeting".
5. `?step=promote`: FROM Dev DEV "Runs v2", TO Live PRODUCTION, "Gets the same bundle, by its digest. Nothing is rebuilt.", WHAT CHANGES IN LIVE "Creates 1, changes 0 and removes 0", CREATED tut-greet; BEFORE IT GOES "Tried here 0 runs, 0 failed", "Triggers there 0 stay running", "This version has not run here yet. Try it before it reaches production."; HOW DEV DIFFERS FROM LIVE "Dev runs v2, Live runs v–. 1 of 1 resources differ." with tut-greet Only in Dev / "A new script."; buttons **Promote to production**, **Change where this promotes to**.
6. Dialog "Promote to Live? / Live starts running version 2 at once. Runs in progress there finish on the version they started with."; after: "Live now runs version 1", "Dev runs v2, Live runs v1. Dev and Live run the same resources."
7. Live, Operate menu: Runs, Events, Triggers, Approvals, **Versions**, Git sync. Screen "Versions / What runs here, and what ran before. Rolling back deploys an earlier version; promotion from the dev workspace is how changes arrive." VERSIONS OF LIVE `v1` Promoted.
8. Script Settings > "What it does": `Greets a person by name.`, Save draft; Deploy shows CHANGED and the lines "Changes the input it takes. / Changes what it says it does." (the first is not what was edited; saving re-read the input). "Deploys... changes 1". Version `v3`.
9. Promote step: UPDATED tut-greet; "Dev runs v3, Live runs v1. 1 of 1 resources differ."; Changed in Dev "Changes what it says it does."
10. As the colleague: "PROMOTING TO LIVE / You may not promote to Live yourself. Ask, and those who may are shown your request on the tenant's overview, with what it would change." / "A note for whoever decides (optional)" / **Request promotion of v3**; after: "Waiting / Asked just now by Tut Dev for v3. / Withdraw the request". (The colleague's own save-and-deploy of a second description edit gave "1 draft" left and an audit entry "Bundle composed" by them; the page does not use it.)
11. Admin overview: NEEDS ATTENTION > PROMOTION REQUESTS "Tut Dev asks to promote v3 from Dev to Live / just now · “Reviewed in dev.”", **Review**. Dialog "Promote v3 to Live? / Asked by Tut Dev … from Dev. / Reviewed in dev. / Creates 0, changes 1 and removes 0. / updated / tut-greet / script", buttons **Decline…**, **Promote**; the first Promote click opens a second dialog "Promote v3 to Live? / Live starts running it at once. ..." with **Cancel**, **Promote**; after it: "Nothing needs you", Live "Running v2".
12. Versions of Live: rows with **Roll back to this version**; dialog "Roll back Live to version 1? / Live stops running what it runs now and starts running version 1 at once. Runs in progress there finish on the version they started with." with **Cancel**, **Roll back in production**; after: a new top row `v1` "No message" RUNNING IN LIVE; the previous `v2` row gains **Deploy this version**.

## What the page got wrong, and was corrected
- Deploy lives under **Operate** (not Overview); the production screen is **Versions** under **Operate**.

## Not run
Decline of a request; **Withdraw the request**; **Change where this promotes to**; a script run in dev before promoting; **Deploy this version** on a past version; 768 and 390 px; dark; keyboard-only.

## Product notes
- After a rollback the **Versions of Live** list repeats rows (`v1` twice, `v2` twice), with the labels "RUNNING IN DEV" and "RUNNING IN LIVE" on different rows, and the older `v1` also marked **Roll back to this version**; the list was read as it stood and not understood fully.
- The change list for a one-line edit also reports "Changes the input it takes."

## Second check (2026-11-24)
Walked again in one pass in a tenant of my own (`Chk Ship`, workspaces `Live` and `Dev`, member `chk.dev@example.com`), 1440 light, steps 1-12 including the colleague's request, the admin's two-dialog promotion, and the rollback. 390 px dark: the Promote step stacks, no sideways scroll. Not run: **Decline…**, **Withdraw the request**, **Change where this promotes to**. Note: on the Versions list of Live, the promoted `v2` carries RUNNING IN DEV beside RUNNING IN LIVE (a label of the other workspace on a production list); not changed on the page.
