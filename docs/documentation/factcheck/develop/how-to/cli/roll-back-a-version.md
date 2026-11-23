# Fact-check record: develop/how-to/cli/roll-back-a-version.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `rollback <version> --tenant --workspace [--message] [--json]`; text `runs version N again`. | `cli/cli.ts:736-799`; run | writer, run on the instance 2026-11-23 | holds as run |
| Default note `Went back to version N`; with `CI` the git subject of the current folder. | `cli/cli.ts:768-770`; run (deployments list showed both) | writer, run on the instance 2026-11-23 | holds as run |
| The running version: `Version N is the one ... runs now. Nothing was changed.` exit 1; unknown version text lists up to 10. | `cli/cli.ts:756-766`; run | writer, run on the instance 2026-11-23 | holds as run |
| Missing/non-numeric version text. | `cli/cli.ts:744-748` | writer, read from the code 2026-11-23 (not run) | holds as read |
| The API lists the newest 100 bundles. | `routes/execution.ts:530-552` | writer, read from the code 2026-11-23 (not run) | holds as read |
| With console resources, the rollback is a new version that keeps them: `rollback 3` printed `version 5`, `rollback 2` printed `version 8` in the run. | `routes/execution.ts:760-785` (`keepConsoleManaged`); run; bundles list showed versions 5 and 8 with 3 manifests | writer, run on the instance 2026-11-23 | holds as run |
| Rollback needs `deployment:write` (route) and `bundle:read` (list). | `routes/execution.ts:530,756-760` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `--json` shape. | `cli/cli.ts:776-790`; run | writer, run on the instance 2026-11-23 | holds as run |
| Going back from a version that added a variable shows `deleted variable greeting`. | run (rollback 3) | writer, run on the instance 2026-11-23 | holds as run |
| PRODUCT OBSERVATION, not stated as fault on the page: the text says `runs version N again` with a new N when console resources made a new version. | run | writer, run on the instance 2026-11-23 | holds as run |
