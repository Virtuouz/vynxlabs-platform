# Run log: administer/how-to/releases/make-a-workspace.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.
- Signed in as Maya Brooks.

## Steps as followed
1. **Tenant**, **Workspaces**, **Create workspace**: the dialog "The type cannot be changed afterwards.", Name, Slug (hint "Lowercase letters, digits and hyphens."), Type ("Choose…", Production, Dev), Promotes to (Nothing and every workspace as "name (type)").
2. Made "Rel prod" (`rel-prod`, Production): "Workspace Rel prod is made." with **Open Rel prod**. Made "Rel dev" (`rel-dev`, Dev, promotes to Rel prod (production)). The list showed Rel dev → Rel prod. Rel dev's **Overview** said "Triggers paused" and "Dev workspaces start this way".
3. A duplicate slug: "That already exists." A slug `Rel_Bad`: "Use only lowercase letters, digits and hyphens."
4. **Workspace settings** of Rel dev: **Runs at once** 0 showed "A whole number from 1 to 1000."; 20 and the name "Rel dev two" saved from the bar; after a reload both were kept. Emptying the run limit did not save (the field was left blank, the save was refused). Renamed back.
5. **Clone workspace**: the sheet with Name ("Rel dev two copy"), Slug, Rows and files, Safety "On: the copy cannot reach real systems". Named it Rel clone / `rel-clone`. The sheet said "Copied 8 resources, 0 rows in 0 tables and 0 files. It has no connections, data sources or secret values, so it cannot reach a real system until you bind it." with **Open the copy**. The list showed Rel clone promoting to Rel dev two.
6. **Delete workspace** on Rel clone: "Delete Rel clone?" "This deletes the workspace with its resources, secrets, run history, tables and files. It cannot be undone." "Type rel-clone to confirm"; the button was disabled until the slug was typed. After it the screen went to the list and the workspace was gone.

## What the run found that differs from the brief or the code
- The first draft of the page quoted a refusal for a slug in use that the code does not have. The run shows "That already exists."; corrected.
- Emptying **Runs at once** does not save: the field is a number and an empty value counts as bad. The reference says so.

## Not run
- Clone with data, Safety off, the queued state, deleting a production workspace.

## Second run (2026-11-23, second agent)
- Instance http://localhost:8091 (an older build than HEAD `87000022`: it still says "Not bound here" and shows the old nothing-to-promote state). Names of this run: tenant Rel git (`relgit`) with workspaces Git dev (`gdev`), Git prod (`gprod`), clones `gclone-*`; in Fernhill only the earlier Rel dev and Rel prod (Amara Okafor asked and withdrew; Maya Brooks deployed `rel-moved` to Rel dev, a request by Amara for v4 is still waiting there).
- The git server: a bare repository (`acme.git`, default branch `main` with a README, and `empty.git`) served over HTTP on http://127.0.0.1:8099 by a 30-line node server in front of `git http-backend`, with the token as the Basic-auth password (`good-token`; `bad` gave 401, `forbidden` 403). The instance accepts `http://127.0.0.1` and `http://localhost` addresses (and EGRESS_ALLOW permits them); every other `http://` address is refused with "must start with https://". No TLS was needed.
- Walked at 390 px (no horizontal overflow on Git sync, Repository, Promote, Deploy, Settings, Workspaces, production Git sync; Git sync's buttons stack and wrap) and in dark (Promote with the breaking-names notice, the rest scrolled without overflow); keyboard and reload as part of the steps.

- Run in Rel git: clone Git dev with **Copy them** and Safety on, then off: "Copied 22 resources, 1 row in 1 table and 0 files. It has no connections, data sources or secret values, so it cannot reach a real system until you bind it." (HEAD: "…until you set it up."), and with a secret in the source and Safety off: "Copied 22 resources, 0 rows in 0 tables and 0 files. Its connections, data sources, group members and secrets were copied: it can reach the same systems as the original. …"
- A production workspace, **Delete workspace**: "Delete Git prod two?" "This is a production workspace. Deleting it deletes what the tenant runs: …", the button **Delete production workspace** disabled until the slug was typed; confirming as the operator admin was refused with "This needs the workspace_production:write permission. Ask a member who can give access in this tenant (an owner or administrator) to give you a role with it." and the workspace stayed.
- Not run: the queued clone state (copying finished too fast), a clone failure.
