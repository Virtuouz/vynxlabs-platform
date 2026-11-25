# Fact-check record: develop/explanation/cli/code-or-files.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Bundle manifests have `ownership` `code` or `ui`; the console shows Managed in Repository/Console. | `packages/manifest/src/bundle.ts:20`; `apps/console/src/screens/ObjectPages.tsx:440` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Code written in the console may import only `@volvel/sdk` and `node:`. | `packages/compose/src/index.ts:32-33,205` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Same path in code and file is a build error with the text. | `cli/build.ts:260-276` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| A draft takes a resource over: `Saving a draft of this ... takes it over from the repository.`; a code script cannot be converted. | `apps/console/src/screens/Authoring.tsx:995-1004` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `examples/higher-ed-devices` splits code and files this way. | `examples/higher-ed-devices/README.md:20-24` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| First console file makes the bundle speak for all console resources. | `docs/contracts/bundle.md:21`; run: refusal of `cli-extra` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| No `define*` for tenant access, no `defineDoc`. | `packages/sdk/src/index.ts` (exports); decisions D53 | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Key vs path; deploy matches by key; renamed line `renamed script hello -> hello-there`; old path 90 days. | `packages/manifest/src/bundle.ts:27-29`; `deploy.ts:338-344`; run: `renamed  script     hello -> hello-there` | second agent, 2026-11-23 (writer: writer, run on the instance 2026-11-23) | holds as run |
| `rename_suspected` text. | `deploy.ts:366-376` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Tool names `run_<path>`/`start_<path>`, `/` to `__`, `-` to `_`, cut at 64; reserved names. | `packages/manifest/src/bundle.ts:31-54` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| A promotion lists a renamed tool as breaking. | `deploy.ts:445-455` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| References written as text with a key are rewritten. | `cli/build.ts:254-258` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| `volvel schemas` gives editors schemas; building runs the repository's code. | `cli/cli.ts:275`; `cli/build.ts:~396` | second agent, 2026-11-23 (writer: writer, read from the code 2026-11-23 (not run)) | holds as read |
| Tool names: `run_<path>`/`start_<path>`, `/` as `__`, `-` as `_`, cut at 64; reserved `get_run`, `get_flow_run`, `list_approvals`, `decide_approval`; a rename with `key` prints `renamed  script     hello -> hello-there`; without it a script with no history is deleted and created. The `Managed in` label and `Saving a draft of this ... takes it over from the repository.` exist. | `packages/manifest/src/bundle.ts:32-38`; `apps/console/src/screens/ObjectPages.tsx:440`; run | second agent, 2026-11-23, run and read | holds |

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Labels **Code** and **Files**; a draft takes a Code resource over; `console_changed`. | `apps/console/src/kit/ownership.ts:11`; `Authoring.tsx:1031` | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build, `pnpm docs:check` passes. Second agent, 2026-11-24. The editor string is in `apps/console/src/kit/ownership.ts`; the take-over button run in a browser (see how-tables-work); `console_changed` as in keep-in-step. CORRECTED the page's 'until `volvel pull`, or `--force`' is true for files and drafts, not for a taken-over table (the table note is in definitions-in-code).
