# Fact-check record: develop/how-to/cli/pull-console-changes.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Pull output lines and counts; `new`, `updated`, `removed`; the closing sentence. | `cli/pull.ts:260-296`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Files kept because changed here: text and exit 1; `--force` takes the console's; comments and key order kept. | `cli/pull.ts:104-118,274-291`; run (comment `# local note` survived) | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `--deployed` writes only what is deployed; line says `version N` without drafts. | `cli/pull.ts:237-246,268-273`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| The folder is `platform` or `resources` of `volvel.yaml` or `--resources`. | `cli/pull.ts:236-238` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| A script, connector, trigger source also gets a `.ts`; pages are `platform/docs/<path>.md`. | `packages/manifest/src/files.ts:43-45,97` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Only a file a pull wrote is removed, with or without `--force`; texts of kept files. | `cli/pull.ts:133-148,200-215` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `resource:read` on the whole workspace is needed. | `routes/authoring.ts:405-408` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `.platform/pulled.json` and its damaged-file message. | `cli/pull.ts:31-45` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `volvel.yaml` is read first and its errors refuse the pull. | `cli/pull.ts:231-234` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Resources made in code are not pulled. | run: `hello` was not written | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| A draft deleted in the console removes the file a pull wrote (`  removed  platform/cli-ideas.table.yaml`, `Pulled 0 files ... 1 removed`); a file written by hand stays with `not in the console: a deploy of this folder would add it`, with and without `--force`, and the pull exits 1. `--resources nowhere` writes under that folder. | `cli/pull.ts`; run | second agent, 2026-11-23, run on the instance | holds as run |
