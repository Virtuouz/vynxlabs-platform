# Run log: console/how-to/releases/deploy-drafts.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.
- Signed in as Maya Brooks (tenant admin).

## Steps as followed
1. In Rel dev, **Resources**, **New**, **Variable**: path `rel-greeting`, a description, default `hello`, **Save draft**. A second variable the same way (`rel-farewell`, `goodbye`). A third, `rel-region`, with no default, and a connection `rel-courier` of kind HTTP.
2. **Operate**, **Deploy**: step **Review draft** said "1 change"; the row `rel-greeting` under VARIABLES, tag **New**, "saved … ago", **Earlier**, **Set aside**, and "A new variable." The panel said "Deploying creates 1, changes 0 and removes 0." and "Deploy 1 change" was enabled.
3. Typed "Add a greeting variable" in **What changed** and pressed **Deploy 1 change**. The address became `?step=deploy`; the list said "VERSIONS OF REL DEV", **v1**, the message, "maya.brooks@fernhill.example · just now", and a tag "Running in Rel dev". The stepper then read "0 changes".
4. Repeated for `rel-farewell` (v2). The list put v2 on top; v1 had **Roll back to this version**.
5. A draft with no default, and a connection with nothing using it, deployed with no warning.
6. In the Sandbox workspace (other writers' drafts), the panel said "These changes cannot be deployed yet." with "The bundle's manifests are not valid." and a list item for a page that had a table with no source. That is the refusal panel, seen, not made on purpose.

## What the run found that differs from the brief or the code
- The toast "Deployed as version N: …" could not be caught by the script (the status region held only "Reconnecting…"). The words are from `Release.tsx:249` and were not seen.
- A variable with no default, and a connection that no script uses, deployed with no "Not bound here" warning. Bindings are checked for what scripts, trigger sources, signed webhooks and flow steps name, so the warning needs a script that uses a connection, a secret or a variable. The page describes the warning from the code; it was not seen.

## Not run
- Choosing some drafts, **Set aside**, **Earlier** and **Bring back**, the old-draft notice, and **This change only** in an editor were read from the code and not run.
- The refusals other than the invalid manifest.
