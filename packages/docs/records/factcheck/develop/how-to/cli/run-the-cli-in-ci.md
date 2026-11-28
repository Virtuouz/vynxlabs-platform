# Fact-check record: develop/how-to/cli/run-the-cli-in-ci.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `VOLVEL_URL`/`VOLVEL_TOKEN` from the environment; no login needed; key only to that URL. | `cli/cli.ts:73-96`; run with an empty config folder | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `CI` makes `--message` the last commit subject for deploy, promote, rollback. | `cli/cli.ts:167-185,761`; run: version note `Warm up the greeting` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `volvel promote` takes `--dir`; `rollback` reads the current folder. | `cli/cli.ts:634-644,736-742` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `promote --preview` exits 4 for breaking changes without confirmation. | `cli/cli.ts:677-690` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `deployer` role does not hold `promotion:write`; promotion needs it in production. | `0009_execution_roles.sql:13`; `routes/execution.ts:1033` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Service account keys: Create service account, then Create API key on Keys; needs `service_account:write`. | `administer/reference/screens/service-accounts.md:21,35,81`; not run (the harness refused making a service account) | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `volvel build` runs repository code. | `cli/build.ts:~396-410` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `tenant plan` prints what a change would do. | `cli/commands.ts:150-155` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| The two YAML pipeline files are examples and were not run on GitHub. | run log | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| A service account's key cannot run any command that takes `--tenant`: the CLI lists tenants at `GET /tenants`, which answers 403 `This is only for a person signed in, not for a service account's key.` The page now says so in an alert. | `cli/cli.ts:300-310`; `apps/control-plane/src/kernel/http.ts:285-289`; `routes/tenants.ts:145`; run: `deploy`, `deploy --preview` with the key of a service account holding `deployer` in both workspaces; `whoami` with the same key works | second agent, 2026-11-23, run on the instance | fault fixed (fa): `GET /tenants` answers a service account's key with its own tenant (`routes/tenants.ts` `signedInOrKey`), confirmed in the code; the warning alert is removed, and two API pages that said the key is refused on tenants now say it is accepted |
| `deployer` holds `*:read`, `bundle:*`, `deployment:*` and `promotion:write` (corrected: the page said it lacked `promotion:write`). | `0035_promotion.sql:4-7`; `GET roles` | second agent, 2026-11-23, run on the instance | corrected, holds |
| The commands of the pipeline run with `CI=true`, `VOLVEL_URL`, `VOLVEL_TOKEN` and an empty config folder: `build`, `deploy --preview`, `deploy --json`, `promote --preview`, `promote --json`, `promote --preview` exit 4, `--confirm-breaking`; version note `First commit of the CI check` taken from the last commit. Run with a member's key because of the fault above. | run | second agent, 2026-11-23, run on the instance | holds as run |
| `npm ci` in the workflow needs a `package-lock.json`, which `volvel init` does not write (added to Before you start). | `npm ci` refuses a folder without one; `volvel init` output lists no lock file | second agent, 2026-11-23, run | corrected |
| The two workflow files: read against the commands above; `actions/checkout@v4` takes one commit, which is what `git log -1` needs for the note; the production job runs no `npm ci` because `promote` builds nothing. GitHub itself was not available (no internet). | the page | second agent, 2026-11-23, read | holds as read; not run on GitHub |
| Console: Service accounts page has **Create service account**; a service account's **Keys** tab has **Create API key**; walked at 390 px in dark, no horizontal overflow of the page. | `apps/console/src/screens/Tenant.tsx`; walk | second agent, 2026-11-23, run in a browser | holds as run |

## Changed on 2026-11-28: the first release (0.6.0)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The `@volvel` packages are on npm from 0.6.0, under the tag `latest`; `npm install --global @volvel/cli` installs the CLI. | `.github/workflows/release.yml` (stages the packages, tag `latest`); `packages/cli/package.json` name | writer, 2026-11-28 | holds |
