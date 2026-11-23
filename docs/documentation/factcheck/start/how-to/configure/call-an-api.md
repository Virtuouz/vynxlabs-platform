# Fact-check: start/how-to/configure/call-an-api.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The code runs and its result. | `docs/documentation/runs/start/how-to/configure/call-an-api.md` | writer, 2026-11-23 | holds; run |
| `volvel deploy` output and the two dev notes. | `packages/cli/src/cli.ts:504-518; apps/control-plane/src/kernel/execution/deploy.ts:115-122` | writer, 2026-11-23 | holds; seen |
| `volvel init`, `volvel login` forms. | `packages/cli/src/local.ts:265-291` | writer, 2026-11-23 | holds |
| `volvel run … --remote` output. | `packages/cli/src/commands.ts:86-90` | writer, 2026-11-23 | holds; seen |
| Console steps and labels. | `see the screens' records` | writer, 2026-11-23 | holds; seen |
| Failure texts of a missing secret and a missing connection. | `apps/control-plane/src/routes/worker.ts:160,628` | writer, 2026-11-23 | holds; seen |
| Stand-in token, port, orders page. | `examples/fernhill/stand-ins/server.mjs:12-15,60-75` | writer, 2026-11-23 | holds; seen |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Source commit `87000022`.

| Claim | Source | Checked by | Result |
| --- | --- | --- | --- |
| `volvel login --url <url> --token <api key>` and `volvel init [directory]`. | `packages/cli/src/commands.ts:44-71` | second agent, 2026-11-23 | holds |
| The deploy notes "is not bound in this workspace" and "is not set in this workspace". | `kernel/execution/deploy.ts:115`, `triggers.ts`/`diagnose.ts` | second agent, 2026-11-23 | holds; quoted from the output, which carries the word "bound": fault: configure, the "bound" words remain |
| Step 7 prints "from this build (preview…). Nothing was deployed." | `packages/cli/src/cli.ts:1170` | second agent, 2026-11-23 | holds; fault: configure, `volvel run --remote` runs the local build (the page says what the line says) |
