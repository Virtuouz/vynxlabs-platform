# Fact-check record: develop/tutorials/cli/quickstart.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Console fields: Create workspace takes Name, Slug, Type (Production, Dev), Promotes to (Nothing or a workspace). | `apps/console/src/screens/Tenant.tsx:405-440`; walked: dialog shows `Create workspace`, Name, Slug | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Account page, API keys, Create API key with Name and Expires (Never, In 30 days, In 90 days, In a year). | `apps/console/src/screens/Account.tsx:502-540`; walked at 1440 px | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `volvel init` output, files written, refusal of a non-empty folder. | `cli/local.ts:262-289`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `login` output. | `cli/cli.ts:207-233`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `volvel run hello --input` output; defaults to `world`. | run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `volvel build` output. | run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `deploy --preview` and `deploy` outputs. | run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| A new dev workspace starts with triggers paused. | `routes/workspaces.ts:260-300`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `run --remote` output. | run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| The diff of `src/index.ts` runs: local `Hello, Ada` without `local.json`; `Good morning, Ada` with it; remote `Hello, Ada`. | run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Deploy of the change: `1 created, 1 updated, 0 deleted, 1 unchanged`. | run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Promote preview and promote outputs; schedule created in production and not paused. | run; `routes/workspaces.ts:260` (production default false) | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| A schedule's default time zone is UTC. | `packages/sdk/src/index.ts:312` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `volvel runs` list line format. | `cli/cli.ts:1055-1058`; run | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| Maya Brooks, tenant admin, can do all of it. | run: her key did every step | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| The console dialogs of steps 1 and 2: the Account page's **Create API key** dialog (Name, Expires with Never, In 30 days, In 90 days, In a year) was submitted at 390 px in dark: the key is shown once under "Copy this key now. It is shown only once, and cannot be read again."; the key was revoked. The Create workspace dialog was opened by the writer. | `apps/console/src/screens/Account.tsx`; run in a browser | second agent, 2026-11-23, run in a browser | holds as run |
| The schedule's time zone default is UTC. | `packages/sdk/src/index.ts:312` | second agent, 2026-11-23, read | holds as read |

Checked by: second agent (again), 2026-11-23, whole page in one pass on the current build: tarballs from `pnpm pack`, tenant `he-check`, workspaces `cli-start-dev/live`. Corrected: step 14's output block also lists the three `created` lines. Fault: `volvel run --remote` runs the local build (configure item): the page already says "from this build". Schedule time zone and all other output held.

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `volvel init` writes volvel.yaml, resources/greetings.table.yaml, resources/hello-every-morning.schedule.yaml, scripts/hello.ts, tsconfig include, .gitignore, .vscode/settings.json, .platform/schemas. | `packages/cli/src/local.ts` (STARTER); run of `volvel init fernhill-cli` | writer, 2026-11-24 | holds as run |
| Build lists table, script, schedule; deploy preview and deploy: 3 created; `Table greetings created.` | run | writer, 2026-11-24 | holds as run |
| Remote run keeps a row `Ada`; a local run keeps none. | `examples/fernhill-cli/scripts/hello.ts` (init output); run | writer, 2026-11-24 | holds as run (run output; the row itself not read back) |
| Variable as a file; local run `Hello`, with `.platform/local.json` `Good morning, Ada`; deploy `1 created, 1 updated, 0 deleted, 2 unchanged`. | run | writer, 2026-11-24 | holds as run |
| Promote preview and promote: 4 created. | run | writer, 2026-11-24 | holds as run |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. All 15 steps as written on the instance, with Maya's key and the lane CLI, `node_modules` linked to the example's (nothing is published): outputs match except digests, run IDs and times. The folder lists `.platform/schemas/` as the page says. Two small differences left as they are: the promote command prints a `Bundle ..., version 2 here, to cli-start-live (production).` line first, which step 14 does not show (step 13 does). The console dialogs were not repeated (done in the 2026-11-23 passes).
