# Run log: develop/how-to/cli/pull-console-changes.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- A draft table made through the API (`PUT drafts/cli-ideas`), then `volvel pull --tenant fernhill --workspace cli-dev`: `new platform/cli-ideas.table.yaml`, `Pulled 1 file from cli-dev (version 3 and 1 draft): 1 new, ...`, the closing line. The file's contents are on the page.
- Deploy of that repository: `1 console draft it carried is cleared: cli-ideas.`
- Edited the file's description by hand and added a console draft: `pull` printed `1 file was not overwritten:` with the path and `changed here since it was pulled`, `Keep your change, or run pull again with --force to take the console's.`, exit 1. `pull --force` printed `updated`, exit 0 and the file held the console's text with the `# local note` comment kept. `pull --deployed` printed `(version 8)` with no draft count.
- Resource made in code (`hello`) was not written.

## The page got wrong (and was corrected)
- Nothing after the run.

## Not run
Files removed by a pull; a resource kept outside `platform/`; a damaged `pulled.json`; `--resources`; a missing `resource:read`.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- Ran: a console draft table pulled (new file), then deleted in the console and pulled (`removed`, `Pulled 0 files`), a hand-written file kept with and without `--force` (exit 1), `--resources nowhere`. Page unchanged.
- Not run: a resource kept outside `platform/`; a damaged `pulled.json`; a missing `resource:read`.
