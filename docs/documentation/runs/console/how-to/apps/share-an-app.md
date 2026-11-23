# Run log: console/how-to/apps/share-an-app.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in the Console at 1440 px, light theme, Playwright headless; the CLI is `packages/cli/dist/bin.js` built from the repository, with `VOLVEL_URL` and a key made for Maya. The scratch repository is outside the checkout, in the session's scratchpad; its dependencies are symlinks to the checkout's packages and Fernhill's `node_modules`, because the instance had no internet to install from.
- The workspace is my own, `apps-docs` (dev), in the Fernhill tenant. Nothing of Fernhill's was changed. No width other than 1440 and no dark theme was run.

## Setup
Deployed a repository with the table `visits`, the script `check-in`, the flow `welcome`, the repository app Desk (`source: apps/visits`, `reads: ["visits"]`), the App Builder app Board (an interface over `visits`) and the docs app Guide.

## The steps as followed
- **Apps** listed three apps: Board (APP BUILDER), Desk (REPOSITORY), Guide (DOCUMENTATION), all "Staff only", with a notice that repository apps are not served on this instance (no `APPS_URL`).
- Desk's inspector: Address, Built "In the repository", Files "6, 659.3 KB", Reads "visits", Open to "Staff whose role lets them read this workspace"; buttons **Share**, "Managed in the repository: the app is removed there.", **Open the live app**.
- **Share**: sheet "Share Desk" with the address, tabs **Who has access** and **What they can read**, the fixed staff row marked "always", "Nobody else yet.", **Add an audience** with **Share with** (Every end user who signs in, End users in Front desk/hilltop/northside/riverside, Members in Billing/Practice managers, Anyone, without signing in) and **They may** (Read, Read and change), and the line "Given along with the app: its table visits. ...".
- Shared Desk with End users in Front desk, Read and change: the row "Front desk may read and change" with **Stop sharing**. **What they can read**: a card `visits`, tag OPEN, "Of its rows, everyone it is shared with sees every row."
- Chose **Anyone, without signing in**: the warning "Anyone who has the address can then open the app and read what its tables let everyone read."
- **Stop sharing** on Front desk: "Stop sharing Desk with Front desk? They lose the app, and their access to its 1 table goes with it." Confirmed; the row went and "Nobody else yet." came back.
- With Board (App Builder app, served on this instance): signed in as Jess Morgan (end user in Front desk) at `/apps/fernhill/apps-docs/board/`: before sharing the page "Not for this account / This account may not open this app. If you think it should, ask the person who gave you the account."; after sharing Board with End users in Front desk, Read: the board opened with the rows; the list's Open to read "Front desk"; after Stop sharing the "Not for this account" page again.

## The page got wrong (and was corrected)
- A first draft said the audience row reads "(group) may read and change"; it reads "Front desk may read and change" (the group's name, without "End users in").

## Not run
- Opening a repository app (Desk) as a person: this instance has no address for apps, so it answers 503. The opening was run with the App Builder app Board.
- The kept-table sentence of **Stop sharing** (two apps reading one table), the group row counts under **What they can read** (needs a table with row rules), and **Share** at 390 px, in dark, by keyboard or after a reload.
