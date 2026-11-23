# Run log: console/how-to/releases/promote-a-version.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.
- Signed in as Maya Brooks (tenant admin, holds `promotion:write`).

## Steps as followed
1. Rel dev with nothing deployed, `?step=promote`: the step showed From and To cards, the error "This workspace has nothing deployed, so there is nothing to promote." with **Try again**, and under it "Working out what promoting would do…" and the **Promote to production** button, all at once.
2. After v1: **Promote** step. From "Rel dev DEV Runs v1"; To "Rel prod PRODUCTION"; **What changes in Rel prod**: "Creates 1, changes 0 and removes 0.", CREATED `rel-greeting` variable, "No table changes."; **Before it goes**: "Tried here 0 runs, 0 failed", "Triggers there 0 stay running", and the notice "This version has not run here yet. Try it before it reaches production." The foot said "Rel dev runs v1, Rel prod runs v–. 1 of 1 resources differ.", with the chips and the row `rel-greeting` "Only in Rel dev".
3. Pressed **Promote to production**. The dialog was titled "Promote to Rel prod?" with "Rel prod starts running version 1 at once. Runs in progress there finish on the version they started with." and the buttons **Cancel** and **Promote to production**. After it: "Rel prod now runs version 1." and the preview read "Creates 0, changes 0 and removes 0." and "In sync 1".
4. Rel prod **Versions**: v1 "Promoted", "Running in Rel dev", "Running in Rel prod". Rel prod **Resources**: `rel-greeting`, variable, Defined in Console, version 1.
5. Rel prod **Git sync**: "No repository is connected", with the link **Connect the tenant's repository**.
6. Promoted v2 the same way later (as part of the roll back run).

## What the run found that differs from the brief or the code
- Product fault, described as the screen is today: with nothing deployed, the Promote step shows the error "This workspace has nothing deployed, so there is nothing to promote." with **Try again**, and in the same view "Working out what promoting would do…" and a **Promote to production** button.
- The page was written from the code and the run agreed; no wording had to change.

## Not run
- The release branch commit and its failure and retry (no repository), `bindings_missing`, `bindings_invalid`, `rename_suspected`, `breaking_changes` and the `?fromRun=` button. The page describes them from `Release.tsx`, `PromotionConfirm.tsx` and `deploy.ts`.
- The CLI command.
