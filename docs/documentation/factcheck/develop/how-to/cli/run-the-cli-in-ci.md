# Fact-check record: develop/how-to/cli/run-the-cli-in-ci.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `VOLVEL_URL`/`VOLVEL_TOKEN` from the environment; no login needed; key only to that URL. | `cli/cli.ts:73-96`; run with an empty config folder | writer, run on the instance 2026-11-23 | holds as run |
| `CI` makes `--message` the last commit subject for deploy, promote, rollback. | `cli/cli.ts:167-185,761`; run: version note `Warm up the greeting` | writer, run on the instance 2026-11-23 | holds as run |
| `volvel promote` takes `--dir`; `rollback` reads the current folder. | `cli/cli.ts:634-644,736-742` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `promote --preview` exits 4 for breaking changes without confirmation. | `cli/cli.ts:677-690` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `deployer` role does not hold `promotion:write`; promotion needs it in production. | `0009_execution_roles.sql:13`; `routes/execution.ts:1033` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Service account keys: Create service account, then Create API key on Keys; needs `service_account:write`. | `administer/reference/screens/service-accounts.md:21,35,81`; not run (the harness refused making a service account) | writer, read from the code 2026-11-23 (not run) | holds as read |
| `volvel build` runs repository code. | `cli/build.ts:~396-410` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `tenant plan` prints what a change would do. | `cli/commands.ts:150-155` | writer, read from the code 2026-11-23 (not run) | holds as read |
| The two YAML pipeline files are examples and were not run on GitHub. | run log | writer, read from the code 2026-11-23 (not run) | holds as read |
