# Run log: develop/how-to/cli/roll-back-a-version.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) with an API key made for this run (`p31-cli-docs`, revoked at the end). The CLI was `@volvel/cli` 0.5.0 installed globally from a tarball made with `pnpm pack`, into a folder outside the repository; the SDK was installed from the SDK and widgets tarballs. Nothing was installed from npm: no `@volvel` package is published.
- Terminal only, Node v24.15.0, Linux. No browser width, theme or keyboard-only walk applies, except where a step says it was looked at in a browser.
- Workspaces made for this run, in Fernhill: `cli-dev` (dev) promoting to `cli-live` (production); `cli-start-dev` to `cli-start-live`; `cli-bind-dev` to `cli-bind-live`. They are left in place.

## The steps as followed
- `rollback 1` on `cli-dev` (at version 2): `cli-dev (dev) runs version 1 again: ...`. Again: `Version 1 is the one cli-dev runs now. Nothing was changed.` exit 1. `rollback 9`: `cli-dev has no version 9 among its newest 2. It has 2, 1.` exit 1. `rollback 1 --json` while active: the same refusal.
- The deployments list showed the notes `Went back to version 1` and (under `CI=true`) `Warm up the greeting`.
- With console resources in the workspace: `rollback 3 --json` printed `"version":5`, deleted `variable greeting` and updated `script hello`; `rollback 2` printed `runs version 8 again`. The bundle list showed new versions 5 and 8 with three manifests, the earlier ones with two.

## The page got wrong (and was corrected)
- A first draft said a rollback is refused without `--allow-delete` when it would delete something with data; the command has no such flag and no run showed it. Removed.
- The first draft said a rolled-back version keeps its number; the run showed a new number when console resources exist.

## Not run
The 100-version limit; a bindings refusal in production; an incompatible core.

## Second check, 2026-11-23 (second agent)
Instance http://localhost:8091 (same throwaway instance), CLI and SDK from fresh `pnpm pack` tarballs installed with npm into a scratch folder; no request left localhost. Tenant made for this check: `docs-cli-check` (operator grant for the operator admin), workspaces `cli-dev` (dev) promoting to `cli-live` (production), service accounts `ci-deployer` (`deployer` in both) and `ci-ship-only`. API keys made for the check were revoked or are of this tenant. Walked the console screens the page names at 390 px in dark (Account's API keys with the Create API key dialog; the tenant's Service accounts and a service account's Keys tab): no horizontal overflow of the page, reload not needed for the steps.
- Ran: `rollback 2` from version 4 (a table retired: `Table notes retired. Its rows are kept.`, added to the page), the same version again, `rollback 99`, no version, `1.5`.
- Not run: the 100-version limit; a bindings refusal in production; an incompatible core.
