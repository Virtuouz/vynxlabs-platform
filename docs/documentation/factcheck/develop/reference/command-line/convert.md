# Fact-check record: develop/reference/command-line/convert

Lines are current at commit `d619bfbd` plus the working tree (branch p34-a7, with lane a5 merged), 2026-11-24. Paths are from the repository root. Written by the A7 writer. Checked by: second agent (pending).

Run: instance on lane a7's build, database a734, port 8712, Fernhill seeded by `examples/fernhill/setup/setup.mjs` and its tenant `fernhill`; workspaces made for the run (`walk1` to `walk6`, `try-it`, `apps-docs`, `cli-start-dev`, `cli-start-live`). The CLI is `packages/cli/dist/bin.js` of the lane. Repositories made for the run are in `examples/a7*` (untracked, deleted at the end).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Flags `--dry-run`, `--only`, `--keep-references`, `--entry`, `--resources`. | `packages/cli/src/cli.ts:303-325`; `packages/cli/src/commands.ts` (generated list) | writer, 2026-11-24 | holds as read |
| Where the files go: `resources` of volvel.yaml or flag; else `platform/`; else `resources/` and a written volvel.yaml. | `packages/cli/src/convert.ts:1025-1040` | writer, 2026-11-24 | holds as run |
| What stays, with each printed reason. | `packages/cli/src/convert.ts:567-573`; run on `examples/a7walk` and `a7conv` (`a script is code, and stays in the repository`, `uses `KINDS`, a value computed in code`, `has a spread (`...`) of shared values`, `... is not written as a top-level `export const ...``, `... refers to it, and --keep-references leaves references as they are`) | writer, 2026-11-24 | holds as run; the call/template/imported rows are read from `packages/cli/src/convert.test.ts:155-163` |
| References are rewritten, listed, the unused import removed; `typeof x`, `x.path`, `x.__row`, `{ x }`, `import { x as y }` stay. | `docs/documentation/fixed/p34-a4.md` second round; run (3 references rewritten) | writer, 2026-11-24 | holds as run / read |
| A comment above a converted export is dropped and counted. | run; `convert.ts:1314` | writer, 2026-11-24 | holds as run |
| The checks and the put-back text. | `packages/cli/src/convert.ts:1195-1290` | writer, 2026-11-24 | holds as read |
| A kind that is not one is ignored by `--only`. | run: `--only nonsense --dry-run` converted 0 | writer, 2026-11-24 | holds as run |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. Same runs; the 'Where the files go' rule (`platform/` kept because it exists: 'Resources go to platform/, which this repository already has.') and the stay reasons (`uses `AGENT`, a value computed in code`, `typeof x.__row` with file and line, a script) as printed.
