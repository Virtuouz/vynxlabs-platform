# Run log: develop/how-to/cli/test-a-script.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- The file on the page was written as `test/hello.test.ts` in a repository whose `hello` reads a variable `greeting`. `node --test "test/**/*.test.ts"` printed three passing tests (`✔ hello opens ...`, `✔ hello refuses input that is not a name`, `✔ a variable the test gives no value for is said to be missing`), `tests 3, pass 3, fail 0`.
- `node --test test/` (a folder) failed with `MODULE_NOT_FOUND`: Node takes it as a module. The page uses a quoted pattern.

## The page got wrong (and was corrected)
- A first draft said `Cannot find module '@volvel/sdk/testing'` for an old SDK; not shown by any run, so it was removed. The note that the message lists the fields of a refused input was removed for the same reason.

## Not run
`memoryTable`, `connections`, `groups`, `tables` and `sources` fakes (read from `testing.ts` and its tests); `testContext`.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- Ran `connections`, `groups`, `tables` with `memoryTable`, events and tags, `testContext`, and an undeclared group in a `node --test` file against the packed SDK: all passed. Not run: `sources`.
