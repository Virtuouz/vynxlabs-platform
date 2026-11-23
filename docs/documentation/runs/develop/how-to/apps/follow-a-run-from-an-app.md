# Run log: develop/how-to/apps/follow-a-run-from-an-app.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in the Console at 1440 px, light theme, Playwright headless; the CLI is `packages/cli/dist/bin.js` built from the repository, with `VOLVEL_URL` and a key made for Maya. The scratch repository is outside the checkout, in the session's scratchpad; its dependencies are symlinks to the checkout's packages and Fernhill's `node_modules`, because the instance had no internet to install from.
- The workspace is my own, `apps-docs` (dev), in the Fernhill tenant. Nothing of Fernhill's was changed. No width other than 1440 and no dark theme was run.

## The steps as followed
- Desk page with `startFlow("welcome", { pet })`, `useFlowRun`, `runScript("check-in", …)`, run under `volvel dev` as Maya at 1440 px: typed Biscuit, **Check in**: "Check-in running" then "Check-in succeeded", and "Biscuit" was in the list after the reload. **Check in Direct** (the script): "Direct" appeared.
- My first draft reloaded the rows inside the render with a timer, which looped ("Maximum update depth exceeded"); the page's step 3 uses `useEffect` on `ended`.
- A flow run whose script lacked `tables` failed, and the page showed the step's message: "The step "add" failed: POST /runs/…/data answered 403: This needs a declared use of the table "visits"."
- The stream answered 429 on one load (earlier test pages held streams); the flow run still reached "succeeded" by polling.
- As an end user (Jess Morgan, Front desk) with the bound role: `POST flow-runs` and `POST runs` both 201 with `startedBy` her end-user ID. A caller with no session got 401 from both routes.

## The page got wrong (and was corrected)
- The first draft had a section describing my own run; it belongs here.
- Guest wording: on this instance there is no public app, so a not-signed-in call got 401, not the 403 "Sign in to start a flow". The 403 text is from code (`kernel/errors.ts:43`).

## Not run
- A guest on a public app, `useRun`, `runFlow`, and the 2-second polling observed by timing. The `live` flag was not printed.
- 390 px, dark, keyboard.
