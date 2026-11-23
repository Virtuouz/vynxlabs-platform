# Run log: develop/tutorials/deploy-a-repository

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. The CLI from this checkout (`node packages/cli/dist/bin.js`, built; I also ran `packages/cli/bundle.mjs`, which wrote `dist/volvel.mjs`, a build output git ignores). Config kept in a folder of mine (`XDG_CONFIG_HOME`). Playwright for the console and the browser steps, 1000 to 1440 px, light.
- Tenant `higher-ed` was made through the API in this run (the console dialogs for it were walked in the first-script and ship tutorials); the first pass was deleted and the tenant made again so the previews and outputs of a first deploy could be captured whole. Everything after the tenant was one pass.

## Seen

1. Create tenant and the two workspaces: see the other tutorials' logs for the dialogs; here `devices` (production) and `devices-dev` (dev, linked).
2. Account: `/account/api-keys` "Account / Your name, your password, your sessions and the keys that act as you. / API keys / A key acts as you, with your permissions. Use one for the command line or a script." with **Create API key**; dialog Name, Expires (Never, In 30 days, In 90 days, In a year); the key `vxk_…` is shown once.
3. `login`: "Signed in to http://localhost:8091 as admin@example.com."; `whoami`: "admin@example.com on http://localhost:8091" and "Tenants: …, Lakeshore State University (higher-ed), …"; `status`: "http://localhost:8091 / Version 0.5.0, migration level 99 / Ready".
4. `tenant plan`: "Releasing would leave higher-ed with: 2 created, 0 updated, 0 deleted, 0 unchanged." then `created group tech-desk (Tech Desk)`, `created service_account helpdesk-assistant (Helpdesk assistant)`, "Nothing was changed. Run "volvel tenant release" to do it."
5. `tenant release`: "Changed higher-ed's access as access change 1: 2 created, 0 updated, 0 deleted, 0 unchanged."
6. `deploy --preview`: "Bundle 8a0025118d82, 796 KB of code, SDK 0.5.0", a list of 43 resources by kind, "Deploying would leave devices-dev (dev) with: 43 created, 0 updated, 0 deleted, 0 unchanged.", "and 43 created or updated, listed above", "Table devices created." for the four tables, "Nothing was changed. Run it again without --preview to deploy."
7. `deploy --message "First deploy"`: "Deployed version 1 to devices-dev (dev): 43 created, 0 updated, 0 deleted, 0 unchanged."
8. `promote --preview`: "Bundle 8a0025118d82, version 1 here, to devices (production). / Promoting would leave devices (production) with: 43 created, 0 updated, 0 deleted, 0 unchanged." with `created …` lines; `promote`: "Promoted to devices (production) as version 1: 43 created, …" (exit 0 for both).
9. `setup.mjs` (admin's password read from the walk's env file into a variable, not printed): "Filling higher-ed/devices on http://localhost:8091 / 40 students, 58 devices, 24 loans out, 18 returned / Students who can sign in …3 students … / A key for the help-desk agent / Written to .platform/devices.json".
10. Console: **Add member** (Email, Name, Initial password, Roles); Groups tab, **Tech Desk** row with Members, Rename, Describe, Sign-in values, Delete; **Members** dialog "Who is in Tech Desk / Whatever the group is given, each member in it has from their next request." with "Add a member" and **Add**, then the person and **Take out**, **Done**.
11. Portal `/portal/higher-ed/sign-in`; `/apps/higher-ed/devices/borrow/`: "Ask the Tech Desk for a device and they will set one aside for you. Calculators and chargers are approved at once. Bring your student card when you collect it." **Ask for a device** form: "What would you like to borrow" (a menu: laptop, chromebook, hotspot, ipad, calculator, charger), "What it is for" (text), "Collect it from" (radio: tech-desk, library; "This is required." until chosen), **Send request**. Sending without a choice for "Collect it from" did nothing visible (the first two attempts). POST to page-actions answered "Request sent. The Tech Desk will let you know when it is ready." and My requests showed `REQ-7EJ35H laptop pending`.
12. Mail capture: "Approval needed: Lend a device" to `tut.desk@example.com` with the JSON and `http://localhost:8091/approve/<token>`; "The link is yours. It works once, until …, or until someone decides. Opening it decides nothing: you choose on the page." The page: "Approval / Lakeshore State University · Devices / PRODUCTION / Lend a device …", **Comment (needed to reject)**, **Approve**, **Reject**, "Asked of Tut Desk."; after **Approve**: "Approved. Thank you, Tut Desk. / The flow carries on. Your decision and your comment are recorded under your name. / Open the run".
13. `volvel runs`: lines `succeeded flow requests/decide`, `succeeded event requests/review (flow)`, `succeeded manual requests/submit`. The request row: `ready LT-0010 … Approved. LT-0010 is waiting at the Tech Desk.`
- A Tech Desk member (`tut.desk`) could not open Approvals in the console ("This needs the workspace:read permission.") or the desk app ("Not for this account") because the example gives the group only the approval-deciding role. The mailed link is how they decide.
- Admin's Approvals showed "Waiting for others 1" while the request waited.

## What the page got wrong, and was corrected
- The README orders the steps differently (setup in dev, "approve as Tech Desk" in the console); the run shows production is where the flow runs, and the approval is by mailed link.

## Not run
`volvel dev`, `volvel pull`, `volvel run --remote`; a dev workspace's triggers resumed; the agent part (`setup/agent.mjs`); 768/390 px; dark; keyboard.
