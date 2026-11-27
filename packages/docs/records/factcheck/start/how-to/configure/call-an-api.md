# Fact-check: start/how-to/configure/call-an-api.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The code runs and its result. | `packages/docs/records/runs/start/how-to/configure/call-an-api.md` | writer, 2026-11-23 | holds; run |
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
| The deploy notes "is not bound in this workspace" and "is not set in this workspace". | `kernel/execution/deploy.ts:115`, `triggers.ts`/`diagnose.ts` | second agent, 2026-11-23 | holds; quoted from the output, which carries the word "bound": fault fixed (fb item 10): `deploy.ts` says "is not set up in this workspace", confirmed in the code; the page quotes the new words |
| Step 7 prints "from this build (preview…). Nothing was deployed." | `packages/cli/src/cli.ts:1170` | second agent, 2026-11-23 | holds; not a fault: `run --remote` is meant to run this build, nothing deployed (fa); the page says what the line says |

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Connection and variable as YAML files; script by path; deploy output with the two notes. | run on `try-it` | writer, 2026-11-24 | holds as run |
| The run printed `VSD-900002` and the stand-in listed it with `FERNHILL-CFG`, `VAC-DHPP`, 12. | run; `http://127.0.0.1:4020/` | writer, 2026-11-24 | holds as run |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. The two YAML files validate; with the page's script the repository builds and `volvel deploy` to a dev workspace prints the page's `Deployed` line and the two notes. Not run again: the console steps 3 to 6 and the run against the stand-ins.
