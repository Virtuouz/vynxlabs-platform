# Fact-check record: develop/how-to/cli/run-a-script-locally.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `volvel run <script>` builds the repository and runs the script in this process; unknown path lists the repository's scripts, leaving out `core/`. | `cli/local.ts:30-70`; run: `There is no script "nothing". This repository has: hello` | writer, run on the instance 2026-11-23 | holds as run |
| `--input` takes JSON or `@file`; both errors' texts. | `cli/input.ts:6-19` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `local.json` has `connections`, `groups`, `secrets`, `variables`; missing values are named with the file's path; invalid JSON is `... is not valid JSON.` | `cli/local.ts:12-17,72-96,150-181`; run: connection missing, secret missing, then a run that printed `Output: {"open":3}`; bad file | writer, run on the instance 2026-11-23 | holds as run |
| A connector the repository declares is used from its own export; `http` and `oauth2` from the SDK; `smtp` says mail connections live in a workspace. | `cli/local.ts:108-135` | writer, read from the code 2026-11-23 (not run) | holds as read |
| A variable not in `local.json` takes its default. | `cli/local.ts:97-103,178`; run: `Hello, Ada` without file, `Good morning` with it | writer, run on the instance 2026-11-23 | holds as run |
| Missing group member text. | `cli/local.ts:169-173` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Tables, data sources and files are not available locally; message ends `Deploy to a dev workspace to try this script.` | `cli/local.ts:19-24,184-186` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Events and tags are printed, not delivered. | `cli/local.ts:187-197` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `console.log` is not collected; `ctx.log` prints. | `cli/local.ts:156-157,189` (log writes through `io.out`) | writer, read from the code 2026-11-23 (not run) | holds as read |
| Secret names are letters, digits, `_` and not a digit first. | run: `must match pattern "^[A-Za-z_][A-Za-z0-9_]*$"` | writer, run on the instance 2026-11-23 | holds as run |
| `The script did not declare ...` from `need`. | `cli/local.ts:86-90` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `volvel init` writes a `.gitignore` listing `.platform/`. | `cli/local.ts:221` | writer, run on the instance 2026-11-23 | holds as run |
| A local run makes no request. | `cli/local.ts` has no `request`/`fetch`; run worked signed out is NOT tested (signed in) | writer, read from the code 2026-11-23 (not run) | holds as read |
