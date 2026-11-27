# Run log: develop/how-to/cli/run-a-script-locally.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
In a repository with a connection `shop`, a secret `SHOP_NOTE` and a script `orders/count` that reads `/orders?status=open` through the connection, and a small local HTTP server on port 8765 that answered a list of three orders.
- No `local.json`: `The script failed: The connection "shop" has no local value. Add it to .../.platform/local.json.`
- `local.json` with the connection only: `The secret "SHOP_NOTE" has no local value. ...`
- With both: `info  Counted {"open":3,"note":"demo"}` and `Output: {"open":3}`.
- `local.json` as `{bad`: `... is not valid JSON.` exit 1.
- `volvel run nothing`: `There is no script "nothing". This repository has: hello`.
- Variable: `{"variables":{"greeting":"Good morning"}}` gave `Good morning, Ada`; without the file `Hello, Ada` (the variable's default). `--input @input.json` worked.
- A first secret name `shop-note` failed the build: `must match pattern "^[A-Za-z_][A-Za-z0-9_]*$"`. The page says so.

## The page got wrong (and was corrected)
- A first draft showed the log line as `info  Counted {"open":3}`; the script logs the note too. Corrected.

## Not run
`groups` in `local.json`; a connector the repository declares; the `smtp` message, the tables/sources/files messages, events and tags (read from `cli/local.ts`); `credential`.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- `groups` run with two local HTTP servers (members `north` with a label, `hq` without; a missing member; no group section), a connector the repository declares, `smtp`, tables, events and tags, `console.log`. Page corrected: `console.log` prints to the terminal (it said it was not collected); the `groups` bullet and the tags text were completed.
- Link to testing now points at `develop/how-to/scripts/test-scripts-in-code`.
- Not run: `files` and `sources` messages (same `notLocal` function as tables).
