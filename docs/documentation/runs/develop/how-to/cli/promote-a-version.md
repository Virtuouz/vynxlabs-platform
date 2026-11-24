# Run log: develop/how-to/cli/promote-a-version.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- `promote --preview` and `promote` from `cli-start-dev` to `cli-start-live`, with and without `--message`; `--json --preview`. Output as the page shows. After a rename of a script with `key`, the preview and the promotion listed `renamed script hello -> hello-there`.
- `promote --preview` from `cli-start-live` (not linked): `Could not promote cli-start-live. This workspace is not linked to another one. Link it to the workspace it promotes to first.` exit 1.
- The rename did not produce a `Breaking:` line (a tool name is only breaking when the resource has an `mcp` name): exit 4 and `--confirm-breaking` were not run; the text is from `cli.ts`.
- **Product fault found.** `promote` (preview or real) from `cli-bind-dev` to `cli-bind-live`, which lacks a binding, printed `Unexpected: Cannot read properties of null (reading 'breaking'). Run again with VOLVEL_DEBUG=1 for the trace.` and exited 1, where `deploy` to the same workspace printed the reasons. `cli.ts` reads `summary.breaking` (line 664) before it tests `possible` (665): when a promotion is refused, `summary` is null. The page does not quote the message.

## The page got wrong (and was corrected)
- A first draft said a dev workspace that is promoted to takes the promotion and warns; `deploy.ts` `warnOnly` is false for any promotion. Corrected to "every promotion refuses".

## Not run
Exit 4; `--confirm-breaking`; the release branch lines; a missing `promotion:write`.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- `promote --preview` exit 4 and its stderr line, `--confirm-breaking` on preview (exit 0) and on a real promotion, the refusal without the flag (exit 1), and a role without `promotion:write` (403 from the API) were all run. Page corrected: `deployer` holds `promotion:write`.
- Not run: the release branch lines; the `Unexpected:` message on a refused promotion (known fault, not quoted).
