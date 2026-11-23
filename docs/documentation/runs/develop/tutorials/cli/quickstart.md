# Run log: develop/tutorials/cli/quickstart.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
A fresh repository (`volvel init`, then the SDK from tarballs in place of `npm install`) against `cli-start-dev` and `cli-start-live`, in this order.
1. Workspaces: made by the API (`POST workspaces`), not in the console, with the fields the console's dialog has. The console's **Create workspace** dialog and the **Account** page's **Create API key** dialog were opened in a browser at 1440 px (Name, Slug; Name, Expires with Never, In 30 days, In 90 days, In a year) but the dialogs were not submitted.
2. The key was made by the API as Maya, not through the dialog.
3. `volvel init fernhill-cli`: the five lines as the page shows; files `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts`.
4. `volvel login`: `Signed in to http://localhost:8091 as maya.brooks@fernhill.example.`
5. `volvel run hello`: `Hello, world`; with `--input '{"name":"Ada"}'`: `Hello, Ada`. `volvel build`: `Bundle 6e4dd43ae5f2, 753 KB of code, SDK 0.5.0`, script and schedule.
6. `deploy --preview`: `2 created, 0 updated, 0 deleted, 0 unchanged`. `deploy`: `Deployed version 1 ...`.
7. `run hello --remote ...`: `Succeeded in 155 ms.`, output `Hello, Ada`, `(preview, version 1)`.
8. The diff: the page's text was applied by a script to `src/index.ts`. Local run without `local.json`: `Hello, Ada`; with `{"variables":{"greeting":"Good morning"}}`: `Good morning, Ada`.
9. `deploy --preview`: `1 created, 1 updated, 0 deleted, 1 unchanged`, `created variable greeting`, `updated script hello`. `deploy --message "Open with a variable"`: `Deployed version 2`. Remote run: `Hello, Ada`.
10. `promote --preview`: `3 created`, digest `1440360d7a23`, `version 2 here`. `promote --message "Greeting to live"`: `Promoted to cli-start-live (production) as version 1: 3 created`.
11. `volvel runs`: two lines, both `succeeded  manual  hello`.

## The page got wrong (and was corrected)
- A first draft said the console's **Deploy** screen lists version 1 and shows the note. The screen in a browser (a dev workspace's Deploy) shows three steps, Review draft, Deploy to dev, Promote, and "Nothing waiting to be deployed"; no list of versions. The claim is gone.
- A first draft changed the greeting text only. The run showed a code-only change counted as `0 updated, 2 unchanged`, so the tutorial adds a variable, which the summary shows.
- A first draft said the production schedule fires at 08:00 in the workspace's time zone. A schedule's own `timezone` defaults to UTC (sdk `index.ts:312`). Corrected.

## Not run
`npm install` from a registry; the console dialogs submitted (workspaces and key); phone width, dark theme, keyboard walk; no second run of the finished text end to end.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- Submitted the Account page's Create API key dialog at 390 px in dark (key shown once; revoked afterwards). The steps 3 to 15 were not repeated end to end; their commands were run in the other logs of this check. Not run: the **Create workspace** dialog submitted.

## Third pass, 2026-11-23 (second agent)
All 15 steps once, as written, on the current build: workspaces made in the console dialogs (submitted), key from the Account dialog, `volvel init` to `promote`, `runs`. Only the registry `npm install` fails (404), as step 4 says. 390 px and dark: the console dialogs and the Keys screens were walked in the other tutorials' passes.
