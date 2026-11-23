# Fact-check record: develop/how-to/cli/promote-a-version.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Preview text and counts, first 12 digest characters, `version N here`. | `cli/cli.ts:660-663,676-700`; run | writer, run on the instance 2026-11-23 | holds as run |
| `--preview` to production with breaking changes and no `--confirm-breaking` prints the sentence on stderr and exits 4; with `--confirm-breaking` exits 0. | `cli/cli.ts:677-690` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `Breaking:` lines come from `describeChanges`; the kinds of breaking change (tool renamed or removed, webhook/form address, alias). | `cli/cli.ts:586-588`; `deploy.ts:393-400,445-470,500-506` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `promotions` needs `promotion:write` in the target, `deployment:read` in the source; `deployer` lacks `promotion:write`. | `routes/execution.ts:978-1040`; `0009_execution_roles.sql:13` | writer, read from the code 2026-11-23 (not run) | holds as read |
| No link: `This workspace is not linked to another one. Link it to the workspace it promotes to first.` | run: `Could not promote cli-start-live. This workspace is not linked ...` | writer, run on the instance 2026-11-23 | holds as run |
| `Promoted to <where> as version N` and release-branch lines; failed release push is a warning on stderr and exit 0. | `cli/cli.ts:705-726`; run (release `off`) | writer, run on the instance 2026-11-23 | holds as run |
| `--json` shapes (`target`, `version`, `summary`, `release`, `message`; preview; `refused`). | `cli/cli.ts:665,684-687,689,729-740`; run | writer, run on the instance 2026-11-23 | holds as run |
| Promotion refusals for missing bindings: every promotion refuses; `bindings_missing` and `bindings_invalid`. | `deploy.ts:628-668` (`warnOnly` is false for a promotion) | writer, read from the code 2026-11-23 (not run) | holds as read |
| `breaking_changes` refusal needs `--confirm-breaking`. | `deploy.ts:608-626` | writer, read from the code 2026-11-23 (not run) | holds as read |
| PRODUCT FAULT, not on the page: when the instance refuses a promotion, the CLI prints `Unexpected: Cannot read properties of null (reading 'breaking')` instead of `It cannot be promoted.` | `cli/cli.ts:664` reads `summary.breaking` before `if (!possible)` at 665; run on cli-bind-dev | writer, run on the instance 2026-11-23 | holds as run |
| The console's **Promote** step on the dev workspace's Deploy screen. | `apps/console/src/screens/Release.tsx:156`; walked: Deploy screen lists steps 01 Review draft, 02 Deploy to dev, 03 Promote | writer, run on the instance 2026-11-23 | holds as run |
