# Run log: administer/how-to/apps/give-an-app-a-hostname.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in the Console at 1440 px, light theme, Playwright headless; the CLI is `packages/cli/dist/bin.js` built from the repository, with `VOLVEL_URL` and a key made for Maya. The scratch repository is outside the checkout, in the session's scratchpad; its dependencies are symlinks to the checkout's packages and Fernhill's `node_modules`, because the instance had no internet to install from.
- The workspace is my own, `apps-docs` (dev), in the Fernhill tenant. Nothing of Fernhill's was changed. No width other than 1440 and no dark theme was run.

## The steps as followed
- **Domains** (as Maya): the seeded `fernhill.localhost` row: "The portal and every app in Clinics", On, Not verified, "Not checked yet".
- **Add a hostname**: the sheet with the text "It serves what you choose once the hostname is verified and enabled."; **Workspace** listed API docs (first), Apps docs run, and the others; with API docs the **App** hint read "This workspace has no apps. Deploy one first, or choose another workspace."; with Apps docs run the apps were Board (board), Desk (desk), Guide (guide). Added `appsdocs-board.example.com` for Board: the details sheet opened with "Serves board", Off, Not verified, the three steps, Record name `_vx-challenge.appsdocs-board.example.com`, Record value `vx-domain=…`.
- **Check now**: "Not verified. Last checked 14:28:29." and the notice "No TXT record _vx-challenge.appsdocs-board.example.com with the value vx-domain=… was found."
- **Enable**: "This hostname is not verified yet, so it cannot be enabled. Create the TXT record shown here, wait for DNS to carry it, and press Check now. For a name that exists only inside a network and cannot be checked from here, ask an operator of this instance to enable it."
- **Change what it serves** to Desk: the sheet said "Serves desk". **Remove**: "Remove appsdocs-board.example.com? The app is no longer served there, and sign-ins made at that hostname end."; confirmed, the row went.
- **Disable** on the seeded hostname asked "Turn off fernhill.localhost? The hostname stops answering, so …"; cancelled.

## The page got wrong (and was corrected)
- A first draft said "Record created and found" turns green; it only says Verified and the time.

## Not run
- A real DNS record: no name here resolves, so verification, **Enable** on a verified name, "Verified, record gone" and an operator's enable were not run. They are from code.
- 390 px, dark, keyboard, reload of the details sheet (`?hostname=` is in the address).
