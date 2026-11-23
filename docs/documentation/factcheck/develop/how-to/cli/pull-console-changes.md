# Fact-check record: develop/how-to/cli/pull-console-changes.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Pull output lines and counts; `new`, `updated`, `removed`; the closing sentence. | `cli/pull.ts:260-296`; run | writer, run on the instance 2026-11-23 | holds as run |
| Files kept because changed here: text and exit 1; `--force` takes the console's; comments and key order kept. | `cli/pull.ts:104-118,274-291`; run (comment `# local note` survived) | writer, run on the instance 2026-11-23 | holds as run |
| `--deployed` writes only what is deployed; line says `version N` without drafts. | `cli/pull.ts:237-246,268-273`; run | writer, run on the instance 2026-11-23 | holds as run |
| The folder is `platform` or `resources` of `volvel.yaml` or `--resources`. | `cli/pull.ts:236-238` | writer, read from the code 2026-11-23 (not run) | holds as read |
| A script, connector, trigger source also gets a `.ts`; pages are `platform/docs/<path>.md`. | `packages/manifest/src/files.ts:43-45,97` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Only a file a pull wrote is removed, with or without `--force`; texts of kept files. | `cli/pull.ts:133-148,200-215` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `resource:read` on the whole workspace is needed. | `routes/authoring.ts:405-408` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `.platform/pulled.json` and its damaged-file message. | `cli/pull.ts:31-45` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `volvel.yaml` is read first and its errors refuse the pull. | `cli/pull.ts:231-234` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Resources made in code are not pulled. | run: `hello` was not written | writer, run on the instance 2026-11-23 | holds as run |
