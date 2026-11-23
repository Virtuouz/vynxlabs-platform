# Fact-check record: develop/reference/command-line/json-output.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `whoami --json`, `status --json` documents. | `cli/cli.ts:1231-1279`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `deploy --json` and `--preview --json`. | `cli/cli.ts:495-498,540-553`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `promote --json`, preview, refused. | `cli/cli.ts:665,684-687,689,729-740`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `rollback --json`. | `cli/cli.ts:776-790`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `runs --json`, `runs <id> --json` (1,000 log lines). | `cli/cli.ts:1033-1038,1044-1048`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Stdout silence in json mode: `spoken(io, json)` drops `out`; warnings/errors on stderr. | `cli/cli.ts:158-163` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Summary object fields and `changes` entries. | `cli/cli.ts:556-567`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Commands without `--json`. | `cli/commands.ts` usages | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `whoami --json` principal also has `nameFrom` (added). `deploy --preview --json` keys are `preview`, `workspace`, `summary`; a warning is `{path, message}` (`/connections/mailer`); an error with `--json` prints on standard error only. `status --json` and `runs --json` as the page says. | run | second agent, 2026-11-23, run | corrected, holds |
