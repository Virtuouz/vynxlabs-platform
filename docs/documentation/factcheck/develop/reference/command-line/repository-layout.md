# Fact-check record: develop/reference/command-line/repository-layout.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The five keys of volvel.yaml and the error for another key. | `packages/manifest/src/files.ts:694-726`; run: `volvel.yaml: has keys other than ...: flavor.` | writer, run on the instance 2026-11-23 | holds as run |
| `roots`, `ignore`, `docs` are folder lists; `entry`, `resources` one path inside the repository, no `..`. | `files.ts:727-756`; run (`../up`) | writer, run on the instance 2026-11-23 | holds as run |
| Defaults: `src/index.ts`, `platform`, `platform/docs`; a flag wins. | `cli/build.ts:219-229`; `files.ts:43-45` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `roots: [src]` makes `src/lending/items.table.yaml` the table `lending/items`; `docs: [handbook]` makes `support/refunds`; `ignore: [scratch]` is not read. | run: `table lending/items`, `doc support/refunds` | writer, run on the instance 2026-11-23 | holds as run |
| With `resources: console`, a `platform/` file is outside every folder. | run: `platform/cli-ideas.table.yaml: is outside every folder ...` | writer, run on the instance 2026-11-23 | holds as run |
| Never read: `node_modules`, `dist`, `build`, dot-folders, `ignore`; `ignore` does not apply to tenant files. | `files.ts:662-664,766-771`; `cli/access.ts:18` | writer, read from the code 2026-11-23 (not run) | holds as read |
| File names `<path>.<kind>.yaml`; `.ts` pairs for script, connector, trigger_source. | `files.ts:97,441` | writer, read from the code 2026-11-23 (not run) | holds as read |
| YAML keys: `schemaVersion` whole number from 1, `body` mapping, optional `key`, `path`, `title`. | `files.ts:536-558` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `.platform/` contents: `bundle.json`, `local.json`, `pulled.json`, `schemas/`, run scratch. | `cli/cli.ts:262-273`; `cli/local.ts:99-104`; `cli/pull.ts:27`; `cli/schemas.ts` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `volvel schemas` writes `.platform/schemas/<kind>.schema.json`, edits `.vscode/settings.json`, prints the JSON when it cannot. | `cli/cli.ts:275-297`; run: 24 kinds written | writer, run on the instance 2026-11-23 | holds as run |
| Git sync reads `volvel.yaml`; `resources` decides where it writes; `entry` is CLI only. | `apps/control-plane/src/kernel/git.ts:260-340`; decisions D65 | writer, read from the code 2026-11-23 (not run) | holds as read |
| `tenant/` folder read by `volvel tenant`. | `packages/manifest/src/tenant.ts:18`; `cli/access.ts:25-45` | writer, read from the code 2026-11-23 (not run) | holds as read |
| App file names: one leading `_` or `.` then a letter or digit. | `docs/contracts/bundle.md:23` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Pages: `<path>.md` under a docs root. | `files.ts:43-60` | writer, read from the code 2026-11-23 (not run) | holds as read |
