# Fact-check record: develop/how-to/cli/convert-definitions-to-files

Lines are current at commit `d619bfbd` plus the working tree (branch p34-a7, with lane a5 merged), 2026-11-24. Paths are from the repository root. Written by the A7 writer. Checked by: second agent (pending).

Run: instance on lane a7's build, database a734, port 8712, Fernhill seeded by `examples/fernhill/setup/setup.mjs` and its tenant `fernhill`; workspaces made for the run (`walk1` to `walk6`, `try-it`, `apps-docs`, `cli-start-dev`, `cli-start-live`). The CLI is `packages/cli/dist/bin.js` of the lane. Repositories made for the run are in `examples/a7*` (untracked, deleted at the end).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Dry-run output, `Would write volvel.yaml ...`, `Dry run: nothing was written.` | `packages/cli/src/convert.ts:1035-1039,1300-1320`; run | writer, 2026-11-24 | holds as run (the wording `Would write` was fixed in this lane, test in `convert.test.ts`) |
| Convert output lines, `Rewrote 3 references`, one comment not moved. | run on `examples/a7conv` | writer, 2026-11-24 | holds as run |
| The table file and the script after conversion. | run: `resources/visits.table.yaml`, `src/index.ts` | writer, 2026-11-24 | holds as run |
| Deploy preview after conversion: `0 created, 3 updated, 0 deleted, 0 unchanged`, then `3 unchanged` after the deploy; a second convert converts 0. | run against `walk3` | writer, 2026-11-24 | holds as run |
| Checks put everything back and say `The repository built differently after converting, or no longer compiles, so nothing was changed:`. | `packages/cli/src/convert.ts:1195-1290`; `convert.test.ts` (rollback on a failing check) | writer, 2026-11-24 | holds as read and by the lane a4 test |
| `resources/<path> exists already. Nothing was changed.` | `packages/cli/src/convert.ts:1056` | writer, 2026-11-24 | holds as read |
| `TypeScript was not found, so the code that is left was not type-checked.` | `packages/cli/src/convert.ts:1259` | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. Ran `volvel convert --dry-run`, `convert`, a second `convert` (`Converted 0 definitions`) and `--only table` on a copy of `examples/higher-ed-devices` (8 converted, 26 left, 12 references rewritten; the rebuild passed) and the page's own example earlier by a7; the dry run says `Would write`. The page's table file validates against `table.v1.schema.json`.
