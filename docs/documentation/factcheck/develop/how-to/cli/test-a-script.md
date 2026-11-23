# Fact-check record: develop/how-to/cli/test-a-script.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `@volvel/sdk/testing` is a subpath export of the SDK. | `packages/sdk/package.json:9-18` | writer, run on the instance 2026-11-23 | holds as run |
| `runScript(script, input, options)` checks input and output against schemas, holds the script to its declarations, returns `{ output, logs, events, tags, files }`. | `packages/sdk/src/testing.ts:237-251`; `testing.test.ts:36-60`; run: three tests passed | writer, run on the instance 2026-11-23 | holds as run |
| Error texts: `The script did not declare the secret ...`, `... has no stand-in in this test. Give one under ...`. | `packages/sdk/src/testing.ts:117-132` | writer, read from the code 2026-11-23 (not run) | holds as read |
| The options table (connections, groups, secrets, variables, tables, sources, startedBy, trigger, attempt, signal) and their defaults. | `packages/sdk/src/testing.ts:20-40,226-229` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `memoryTable(rows)` returns a table with `rows`. | `packages/sdk/src/testing.ts:64-110` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `testContext(options, declared)` makes the context alone. | `packages/sdk/src/testing.ts:115` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Node 24 runs `node --test "test/**/*.test.ts"` on TypeScript and prints 3 passed. | run: Node v24.15.0 | writer, run on the instance 2026-11-23 | holds as run |
| Three test titles and output as shown. | run | writer, run on the instance 2026-11-23 | holds as run |
