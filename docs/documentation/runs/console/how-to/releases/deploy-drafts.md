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

## Second run (2026-11-23, second agent)
- Instance http://localhost:8091 (an older build than HEAD `87000022`: it still says "Not bound here" and shows the old nothing-to-promote state). Names of this run: tenant Rel git (`relgit`) with workspaces Git dev (`gdev`), Git prod (`gprod`), clones `gclone-*`; in Fernhill only the earlier Rel dev and Rel prod (Amara Okafor asked and withdrew; Maya Brooks deployed `rel-moved` to Rel dev, a request by Amara for v4 is still waiting there).
- The git server: a bare repository (`acme.git`, default branch `main` with a README, and `empty.git`) served over HTTP on http://127.0.0.1:8099 by a 30-line node server in front of `git http-backend`, with the token as the Basic-auth password (`good-token`; `bad` gave 401, `forbidden` 403). The instance accepts `http://127.0.0.1` and `http://localhost` addresses (and EGRESS_ALLOW permits them); every other `http://` address is refused with "must start with https://". No TLS was needed.
- Walked at 390 px (no horizontal overflow on Git sync, Repository, Promote, Deploy, Settings, Workspaces, production Git sync; Git sync's buttons stack and wrap) and in dark (Promote with the breaking-names notice, the rest scrolled without overflow); keyboard and reload as part of the steps.

- Run in Git dev: three drafts. Ticked one (**Choose lab/a1**): the panel offered **Deploy the 1 chosen**, **Set aside the 1 chosen** and **Choose none**. **Earlier** on a draft saved once: "No earlier versions yet."; on one saved twice: "Revision 1", "saved … ago", **Bring back** (it closed the sheet and made revision 1 the draft). **Set aside the 1 chosen**: "Set aside 1 draft?" "lab/a1. Each goes back to how it was last deployed; its draft stays in its history." A row's **Set aside**: "Set aside the draft of lab/a2?" "It goes back to how it was last deployed. The draft stays in its history, and can be brought back."
- A draft table with one removed table and one new table of the same shape: the panel said "Deploying creates 1, changes 0 and removes 1. Table lab/animals created. Table lab/pets retired. Its rows are kept." and the deploy of every draft went through with no question.
- A connection and a script that uses it, in a dev workspace: the panel showed "Not bound here, and the deploy still works" with "the connection "courier" is not bound in this workspace. A run that reaches it fails until it is set up." (HEAD words: "Not set up here …", "is not set up in this workspace"); the deploy said "Deployed as version 12: courier, lab/call."
- In a script's editor, **Deploy**, **This change only**: "Deployed lab/solo2 as version 17." with **Promote to Git prod**; the other drafts stayed.
- With code in the console off, a script draft was refused (`console_code_off`).
- Not run: the old-draft notice (a draft saved over a day ago), the editor's "cannot be deployed alone" dialog.
