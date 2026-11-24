# Run log: develop/how-to/cli/install-the-cli.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- `pnpm pack --pack-destination <folder>` in `packages/cli`, `packages/sdk`, `packages/widget-sdk`: three tarballs `volvel-cli-0.5.0.tgz`, `volvel-sdk-0.5.0.tgz`, `volvel-widgets-0.5.0.tgz`. The checkout was already built.
- `npm i -g --prefix <scratch>/global --offline <cli tarball>` (the prefix keeps it away from the machine's own global folder, and `--offline` because no request to the internet was allowed; npm's cache held `esbuild`): `added 3 packages`. `volvel --version` printed `volvel 0.5.0`. `volvel --help` listed the commands.
- In a new repository, `npm install --offline <sdk tarball> <widgets tarball>`: `package.json` dependencies became `file:` paths.
- A first try to install only the SDK tarball was not made; the SDK's packed `package.json` lists `@volvel/widgets` at `0.5.0`, so the page says to install both.

## The page got wrong (and was corrected)
- The brief and the first draft named `packages/widgets`; the package that is `@volvel/widgets` is `packages/widget-sdk`.
- A first draft said a Node 22 machine may also run the packed CLI (built for node22). Not tested, so it was removed.

## Not run
Install from the npm registry (nothing is published). The `volvel dev` Vite refusal text was read from code only. A global install without `--prefix`.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- Packed the CLI, SDK and widgets tarballs again, installed them offline with npm into a folder, `volvel --version` printed `volvel 0.5.0`, and used the SDK tarballs in three repositories. Not run: a global install without `--prefix` (would write outside the scratch folder).
