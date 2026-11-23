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
