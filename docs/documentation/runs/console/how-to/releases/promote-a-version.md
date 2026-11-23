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

## Second run (2026-11-23, second agent)
- Instance http://localhost:8091 (an older build than HEAD `87000022`: it still says "Not bound here" and shows the old nothing-to-promote state). Names of this run: tenant Rel git (`relgit`) with workspaces Git dev (`gdev`), Git prod (`gprod`), clones `gclone-*`; in Fernhill only the earlier Rel dev and Rel prod (Amara Okafor asked and withdrew; Maya Brooks deployed `rel-moved` to Rel dev, a request by Amara for v4 is still waiting there).
- The git server: a bare repository (`acme.git`, default branch `main` with a README, and `empty.git`) served over HTTP on http://127.0.0.1:8099 by a 30-line node server in front of `git http-backend`, with the token as the Basic-auth password (`good-token`; `bad` gave 401, `forbidden` 403). The instance accepts `http://127.0.0.1` and `http://localhost` addresses (and EGRESS_ALLOW permits them); every other `http://` address is refused with "must start with https://". No TLS was needed.
- Walked at 390 px (no horizontal overflow on Git sync, Repository, Promote, Deploy, Settings, Workspaces, production Git sync; Git sync's buttons stack and wrap) and in dark (Promote with the breaking-names notice, the rest scrolled without overflow); keyboard and reload as part of the steps.

- Run in Git dev -> Git prod: with a connection that a script uses and nothing set up in Git prod, **Promote** showed "It cannot be promoted yet." "The workspace is missing something this bundle needs. Set up each one, then promote again." and the line `/connections/courier the connection "courier" is not bound in this workspace` with a **Set up** link (to the target's Connections, `?setup=courier`); **Promote to production** was disabled. Without the use: promoted ("Git prod now runs version 2. Committed to release/gprod.").
- Removing the script in dev and promoting: the notice "This changes a name that something outside calls." "The tool run_lab__call is removed with its script. An agent that calls it will fail." and the dialog "Promote to Git prod?" with "It also changes what an agent calls: The tool run_lab__call is removed …" (not confirmed).
- The release branch commit and its retry: see the sync log.
- Product fault, as the instance shows it: a workspace with nothing deployed. HEAD already fixes it; the instance does not.
- Not run: `bindings_invalid`, `?fromRun=`, the CLI.
