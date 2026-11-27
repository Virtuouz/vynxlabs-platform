# Run log: develop/how-to/cli/install-from-source.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- `node packages/cli/dist/bin.js --version`: `volvel 0.5.0`; `... whoami` with a saved sign-in: `maya.brooks@fernhill.example on http://localhost:8091`.
- `node packages/cli/dist/bin.js build` in `examples/acme`: `Bundle ce540aecf615, 1540 KB of code, SDK 0.5.0` and the resources listed. The `.platform/bundle.json` it wrote there was deleted afterwards.
- `pnpm install` and `pnpm build` were not rerun: the checkout was already built. The `alias` line was not typed into a shell; the form `node <checkout>/packages/cli/dist/bin.js` is what was run.

## The page got wrong (and was corrected)
- A first draft said the examples run only inside the checkout; that was written from `workspace:*` and not tested outside it. Reworded.

## Not run
`pnpm install` and `pnpm build` from a clean checkout; the alias.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- Ran `node packages/cli/dist/bin.js --version` and `build` in `examples/acme` from the built checkout. Not run: `pnpm install`/`pnpm build` from clean, the alias line in a shell.
