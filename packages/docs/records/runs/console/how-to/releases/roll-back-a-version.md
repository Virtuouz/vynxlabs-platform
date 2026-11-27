# Run log: console/how-to/releases/roll-back-a-version.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.
- Signed in as Maya Brooks.

## Steps as followed
1. Rel prod ran v2 (promoted). **Versions** listed v2 (Running in Rel dev and Rel prod) and v1 with **Roll back to this version**.
2. Pressed it. The dialog: "Roll back Rel prod to version 1?" and "Rel prod stops running what it runs now and starts running version 1 at once. Runs in progress there finish on the version they started with." with **Cancel** and **Roll back in production**.
3. Confirmed. The list then read, from the top: v1 "No message" "just now" Running in Rel prod; v2 "Promoted" Running in Rel dev with **Deploy this version**; v1 "Promoted" ... (the earlier v1 row, with the tag Running in Rel prod). The toast was not caught ("Reconnecting…" only). The code's text is "Version 1 is what runs here now."
4. Later a promotion of v2 put v2 on top again; the list grew by a row each time.

## What the run found that differs from the brief or the code
- The page was written from the code and the run agreed. The first version of the **The result** section said less about the new row at the top; it now says the list gains a row and keeps the old ones, as the run showed.

## Not run
- Rolling back in a dev workspace, **Not yet run here**, the suspected-rename question, an incompatible bundle, and the CLI command.

## Second run (2026-11-23, second agent)
- Instance http://localhost:8091 (an older build than HEAD `87000022`: it still says "Not bound here" and shows the old nothing-to-promote state). Names of this run: tenant Rel git (`relgit`) with workspaces Git dev (`gdev`), Git prod (`gprod`), clones `gclone-*`; in Fernhill only the earlier Rel dev and Rel prod (Amara Okafor asked and withdrew; Maya Brooks deployed `rel-moved` to Rel dev, a request by Amara for v4 is still waiting there).
- The git server: a bare repository (`acme.git`, default branch `main` with a README, and `empty.git`) served over HTTP on http://127.0.0.1:8099 by a 30-line node server in front of `git http-backend`, with the token as the Basic-auth password (`good-token`; `bad` gave 401, `forbidden` 403). The instance accepts `http://127.0.0.1` and `http://localhost` addresses (and EGRESS_ALLOW permits them); every other `http://` address is refused with "must start with https://". No TLS was needed.
- Walked at 390 px (no horizontal overflow on Git sync, Repository, Promote, Deploy, Settings, Workspaces, production Git sync; Git sync's buttons stack and wrap) and in dark (Promote with the breaking-names notice, the rest scrolled without overflow); keyboard and reload as part of the steps.

- Run in Git dev (a dev workspace): **Roll back to this version** on v13 -> "Roll back Git dev to version 13?" with the button **Roll back** -> "Version 13 is what runs here now."; a new top row v13 "No message" tagged **Running in Git dev**; v14 to v16 said **Deploy this version**.
- A suspected rename: with a table holding a row, a rollback to a version that has the old name asked "Delete lab/animals in Git dev?" "What each one holds there is cut off from whatever is created in its place. If one of them was renamed, give the new one its key in the repository instead, and nothing is lost." with **Cancel** and **Delete them and look again**.
- Not run: **Not yet run here** (a bundle uploaded and never run), an incompatible bundle, the CLI command.
