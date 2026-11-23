# Fact-check record: develop/reference/command-line/flags-and-exit-codes.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Flag table per command. | `cli/cli.ts` parseArgs of each command: build 262, schemas 275, dev 593, deploy 425, promote 634, rollback 736, logs 1089, runs 992, cancel 951, remote run 1113; `cli/pull.ts:225`; `cli/local.ts:30`; `cli/access.ts:106` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Port 1-65535 default 5174; `--port is a whole number...` | `cli/cli.ts:236-246,604` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `--message needs some words.` | `cli/cli.ts:172-175` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `--input` errors. | `cli/input.ts:6-19` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Environment variables. | `cli/cli.ts:36-96,167-185,1410`; `cli/cli.ts:801-807`; `cli/dev.ts` (SCREENS_DIR) via `commands.ts:100` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Exit codes 0, 1, 2, 3, 4, 130 and the `Unexpected:` line. | `cli/cli.ts:1360-1415`; `follow.ts:157`; `cli/cli.ts:682` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `--version`, `-v`, `version`; `<command> --help`. | `cli/cli.ts:1377-1384`; run | writer, run on the instance 2026-11-23 | holds as run |
| Unknown option exits 2 with Node's message. | run: `Unknown option '--bogus' ...` exit 2 | writer, run on the instance 2026-11-23 | holds as run |
