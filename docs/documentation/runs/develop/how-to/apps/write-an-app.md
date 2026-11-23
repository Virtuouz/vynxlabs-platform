# Run log: develop/how-to/apps/write-an-app.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in the Console at 1440 px, light theme, Playwright headless; the CLI is `packages/cli/dist/bin.js` built from the repository, with `VOLVEL_URL` and a key made for Maya. The scratch repository is outside the checkout, in the session's scratchpad; its dependencies are symlinks to the checkout's packages and Fernhill's `node_modules`, because the instance had no internet to install from.
- The workspace is my own, `apps-docs` (dev), in the Fernhill tenant. Nothing of Fernhill's was changed. No width other than 1440 and no dark theme was run.

## The steps as followed
- `volvel init repo`, then the files of the page in order (source files as in the page, with `visits`, `check-in`, a flow `welcome` and an interface and a docs app added for the other pages).
- `volvel build`: "Bundle 863011aa323c, 770 KB of code, SDK 0.5.0", then each resource and `app  desk  (6 files, 658 KB)`.
- First build of an interface failed with a schema message (`widgets/0/data/rows must have required property 'source'`); corrected the sample in my repository, not the page.
- `volvel deploy --tenant fernhill --workspace apps-docs`: "App files: 6, 4 new." and "Deployed version 1 to apps-docs (dev): 9 created, 0 updated, 0 deleted, 0 unchanged." A second deploy: "App files: 6, 0 new." and "0 created, 0 updated, 0 deleted, 9 unchanged."
- First flow run of the app's check-in failed: "The step "add" failed: POST /runs/…/data answered 403: This needs a declared use of the table "visits"." The script lacked `tables: [visits]`. The page's step 1 has it, and says so.
- Added the bindings of step 6 and deployed: version 3, "5 created" (the role and four bindings).
- As Jess Morgan (end user in Front desk), through the API with her session: a flow run and a script run both started (201).

## The page got wrong (and was corrected)
- A first draft said a deploy deletes nothing; the CLI stops before upload when it would delete console resources the repository has no file for.

## Not run
- Opening the deployed Desk app in a browser: the instance has no `APPS_URL`, so a repository app answers 503 here. The page's "The result" says so.
- The page at 390 px, in dark, by keyboard.
