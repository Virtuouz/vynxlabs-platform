# Findings: the CLI, the SDK and local development

Settled at `270e509`. Reproduced in a scratch vitest file against `pullInto` (removed) and by running the built CLI in a scratch folder with a temporary `XDG_CONFIG_HOME` and a listener on localhost.

### CLI-01 `VOLVEL_URL` alone sends the saved token to that URL
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `packages/cli/src/cli.ts:38-39`
- **Evidence:** saved config for one instance, then `VOLVEL_URL=http://localhost:9555 volvel whoami`: the listener received `Authorization: Bearer <saved token>`. The two variables override each field independently.
- **Fix:** In `loadSettings`, use the saved token only when the URL is the saved URL; otherwise require `VOLVEL_TOKEN` and say so. Siblings: every command reads settings here, so one change covers them. `login` accepts plain `http://` for any host: warn when not localhost. Test: URL from env, token from file, expect `CliError`.
- **Size:** S. **Milestone:** M1.

### CLI-02 A page kept by `pull` is still recorded as taken, so the next deploy clears the console's draft
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `packages/cli/src/pull.ts:68,191`
- **Evidence:** pulled `docs/guide/intro.md`, edited it here, console changed it, pulled again: report said kept, and `pulled.json` still had `drafts: {"guide/intro": 4}`. `stem()` strips only `.<kind>.yaml/.ts`, and a page's draft path has no `docs/` or `.md`.
- **Fix:** Make `stem` the inverse of `renderResourceFiles` (`manifest/files.ts:218`), so a page file maps to its resource path; put it in the manifest package beside the renderer. Test first: kept `.md` leaves its draft out of `drafts`.
- **Size:** S. **Milestone:** M2.

### CLI-03 `pull` never removes a page the console deleted, so a deploy brings it back
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `packages/cli/src/pull.ts:57`
- **Evidence:** after the console dropped `docs/guide/intro.md`, a pull reported nothing removed and the file stayed. `walk` matches only `.yaml` and `.ts`. A bundle with `platform/` then re-creates the page.
- **Fix:** Let `walk` include `.md` (as `files.ts` reads them), with the same "changed here" check. Share the extension list with the manifest. Test with CLI-02.
- **Size:** S. **Milestone:** M2.

### CLI-04 `pull --force` deletes files it did not write
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `packages/cli/src/pull.ts:127-132`
- **Evidence:** a hand-written `platform/helpers/format.ts` and an undeployed `platform/orders/new.script.yaml`: without `--force` both are kept (exit 1); with it both are removed. Neither was ever in `pulled.json`.
- **Fix:** `--force` should take the console's version of files the console has, and remove only files a pull wrote (in `last`). A file not in `last` is kept, with the message that already exists. The `elsewhere` branch already does this (`:172`): make the folder branch match. Test first: foreign file survives `--force`.
- **Size:** S. **Milestone:** M2.

### CLI-05 Local run gives every connection the HTTP client
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `packages/cli/src/local.ts:105-116`
- **Evidence:** `ctx.connection` always returns `sdk.httpConnector.create`, whatever the connector's type, so smtp, oauth2 and custom connectors give the wrong client or fail.
- **Fix:** Resolve the connection's connector from the bundle manifests and call its adapter. The context is built here by hand and can drift from `ScriptContext`: build it from one shared factory in the SDK (`sdk/context.ts`), and test that the local object has every key of the interface.
- **Size:** M. **Milestone:** M11.

### CLI-06 Local run has no `ctx.connections`
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `packages/cli/src/local.ts:104-138`, against `sdk/src/context.ts:42`
- **Evidence:** the interface has `connections(group)` with `get` and `keys`; the local context does not, so a script using a group fails with "ctx.connections is not a function", wrapped as "The script failed". `.platform/local.json` has no place for members.
- **Fix:** Add `connections` to the local context and a `groups` section to `local.json`; otherwise throw `notLocal`. Same factory as CLI-05.
- **Size:** M. **Milestone:** M11.

### CLI-07 Raw stack traces on unexpected failures
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `packages/cli/src/cli.ts:233` (`uploadFiles` `fetch`), `:493` (`tenant export`), `:97-110` (`whoami`), `:924-950` (`run` rethrows), `pull.ts:41,97` (`JSON.parse` of `pulled.json`)
- **Evidence:** a server answering `/me` with `{}` and 200 crashed `volvel whoami` with a Node `TypeError` stack and exit 1. A network failure in an upload or a corrupt `pulled.json` takes the same path.
- **Fix:** Catch in `run()` any non-`CliError`: print one line ("Unexpected: ...; run with VOLVEL_DEBUG=1 for the trace") and exit 1; route the two bare `fetch` calls through `request`-style handling; wrap the state-file parse like `local.json`'s. One catch in `run()` covers all siblings.
- **Size:** S. **Milestone:** M11.

### CLI-08 `--version` and `<command> --help` do not work
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `packages/cli/src/cli.ts:928-933`
- **Evidence:** `volvel --version` prints "Unknown command" and the whole usage, exit 2; `volvel build --help` prints "Unknown option '--help'", exit 2.
- **Fix:** Handle `--version`/`-v` (print the CLI and `SDK_VERSION`) and `--help` per command in `run()`, using the usage lines in `commands.ts`.
- **Size:** S. **Milestone:** M11.

### CLI-09 `dev --port abc` becomes NaN
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `packages/cli/src/cli.ts:369`
- **Evidence:** `Number(values.port)` with no check. `--older-than` (`:609`) checks; `--port` does not.
- **Fix:** One `wholeNumber(flag, value, min, max)` helper, used by both. Also reject 0 and above 65535.
- **Size:** S. **Milestone:** M11.

### CLI-10 `promote --preview` answers "possible" with exit 0 even when it would be refused for breaking changes
- **Outcome:** owner decides (see Q1)
- **Severity:** wrong
- **Where:** `packages/cli/src/cli.ts:402-437`
- **Evidence:** a preview that cannot be promoted throws (exit 1). A preview with `summary.breaking` on a production target prints "Breaking:" lines and "Run it again without --preview to promote", exit 0, yet the real promote then refuses without `--confirm-breaking`. The message promises something untrue for production.
- **Fix:** In preview, when breaking changes exist on a production target, say that `--confirm-breaking` is needed. Exit code per Q1.
- **Size:** S. **Milestone:** M11.

### CLI-11 `promote` hides a failed release-branch push
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `packages/cli/src/cli.ts:430-436`; server `routes/execution.ts:939-956`
- **Evidence:** the server answers 201 with `release: {status: "failed", problem}`. The CLI prints only "Promoted to ...", so a CI job shows green while Git sync has not got the release.
- **Fix:** Print `release.problem` as a warning (stderr), and show `release.branch` when done. The status is intended never to undo the promotion, so exit stays 0 unless Q2 says otherwise.
- **Size:** S. **Milestone:** M11.

### CLI-12 `pull` ignores `volvel.yaml` problems that `build` refuses
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `packages/cli/src/pull.ts:224`
- **Evidence:** the `parseRepositoryConfig` result's problems are dropped (only `config` is used). A bad `roots` entry sends a wrong query and writes files to the wrong place.
- **Fix:** Throw `BuildError` on problems, as `build` does; share one `readRepositoryConfig`.
- **Size:** S. **Milestone:** M11.

### CLI-13 A first resource file or `pull` skipped makes a deploy delete console resources
- **Outcome:** confirmed by code (C1 in the inventory)
- **Severity:** data
- **Where:** `cp/kernel/authoring.ts:588`, `deploy.ts:340`; CLI `deploy` at `cli.ts:256-307`
- **Evidence:** the bundle with any `platform/` file speaks for all console resources. The CLI deploy prints deletions only after the fact, with no `--dry-run`. `promote --preview` exists; deploy has no equivalent.
- **Fix:** The CLI should say before uploading when `platform/` is present and the workspace has console resources not in the folder (the `resource-files` set), and refuse without `--allow-delete`. See missing part 1. Existing safeguard: `--allow-delete` is already required for deletions per the inventory; verify it covers console resources, not only code ones.
- **Size:** M. **Milestone:** M2.

### CLI-14 `volvel init` points to `@volvel/sdk ^0.5.0` and does not finish the job
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `packages/cli/src/local.ts:148-201`
- **Evidence:** closing line omits installing the CLI and signing in; no `tsconfig`. Whether the packages are on npm was not checked (no internet): `release-check.mjs` says widgets is not.
- **Fix:** Closing text names install, `login`, and where the CLI comes from. Documentation, with the init line.
- **Size:** S. **Milestone:** M11.

### CLI-15 `--input @file` works only with `--remote`
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `packages/cli/src/local.ts:38-44`
- **Evidence:** local parse is `JSON.parse(values.input)` only; `@file` gives "--input must be JSON".
- **Fix:** Share the input reader with `runRemote`.
- **Size:** S. **Milestone:** M11.

### CLI-16 Documentation claims in section D
- **Outcome:** confirmed by code (stale README, sdk-guide contradicting itself on comments, "phase 17", dashboard example version, `COMMAND_NOTES` omitting `schemas` and `tenant` for `--dir`, `docs/contracts/bundle.md` missing `sources`/`consoleSources`/core range)
- **Severity:** wrong
- **Where:** the documents named in the inventory, section D
- **Evidence:** read; the code preserves comments (`ontoWritten`), and `build` drops notes while `deploy` prints them.
- **Fix:** Correct in the documentation work, not the CLI. Fix `COMMAND_NOTES` in `commands.ts` (generated reference follows).
- **Size:** S. **Milestone:** M11.

### CLI-17 Refuted or already as intended
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** `cli.ts:91-96,127-134`
- **Evidence:** `login` checks the key before saving, and writes mode 0600 with `chmod` on an existing file: correct. `ignore` not applying to tenant files, `tenant pull` not deleting, and `promote` acting on the active bundle are deliberate (stated in the code comments and CLI text). Node's `fetch` strips `Authorization` on a cross-origin redirect, so a redirect does not leak the token (the CLI-01 leak is by URL choice only). `logs` without `-f` exiting 0 on an unfinished run is documented in usage. `status` and the unknown-command code 2 behave as written.
- **Fix:** none.
- **Size:** S. **Milestone:** M11.

## Missing parts

1. **Deploy preview (`deploy --dry-run`).** The server already computes deletion and binding results for promote (`promotion-preview`) and a deploy returns a summary. No way to see a deploy's effect first. Control: a `--preview` flag that builds and asks the server, as `promote --preview` does; console parity in the deployments screen. Needs `deployment:write`. Size M.
2. **`deploy --message`.** The deployments API takes `message` (`routes/execution.ts:649`, shown at `:611`); the CLI sends none, so history from CI has no note. Add the flag and default to the Git commit subject in CI. Same for `promote`. Size S.
3. **Bundle rollback from the CLI.** The inventory says use the console or API; if the API activates an earlier bundle, `volvel rollback <version>` belongs beside `promote` (access has `tenant rollback`). Not verified that the API takes it. Needs `deployment:write`; production adds the promotion permission. Size M.
4. **Entry and resource options.** `buildBundle` accepts `entry` and `resources` (`build.ts:52-59`); no flag or `volvel.yaml` key. Size S.
5. **Local run parity.** Connector types, `connections` groups, and tables/sources via a dev workspace proxy (see CLI-05/06; local `table` and `source` throw by design). A harness with a fake context for `.execute()` tests is a missing package (`@volvel/sdk/testing`). Size M to L.
6. **Machine-readable output and sign-out.** No `--json` on `whoami`, `status`, `runs`, `deploy`, `promote`; one saved instance, no `logout` or profiles. Needed for CI. Size M.
7. **`volvel dev` for file apps, interfaces and docs.** Only TypeScript apps with `source` are served. Size L; may be a decision.

## Owner decides

- **Q1.** Should `promote --preview` exit non-zero when the promotion would be refused for breaking changes without `--confirm-breaking`, so CI can gate on it? Options: keep 0 and print; exit 4 for "would need confirmation"; exit 1. Recommend a distinct code, 4, documented in `errors.md`.
- **Q2.** Should a failed release-branch push make `promote` exit non-zero? The promotion stands either way. Options: warn only; exit 1 after promoting. Recommend warn on stderr and exit 0, with a `--strict` for CI later.
- **Q3.** Is a saved token tied to its URL (CLI-01 fix) acceptable for CI that sets only `VOLVEL_URL`? Recommend yes: set both there.
