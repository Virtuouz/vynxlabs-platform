# Fact-check record: develop/how-to/apps/write-an-app.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| defineApp needs exactly one of source, interface, docs; throws otherwise with the quoted text. | `packages/sdk/src/index.ts:1216-1232` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds (code); error text read, not triggered |
| title at most 100 characters; reads at most 100 paths; entry default index.html; fallback default true. | `packages/manifest/src/kinds.ts:452-479,1336-1405`; `sdk/src/index.ts:1200-1214` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| A script writing a table lists it in tables or gets 403 "This needs a declared use of the table". | `sdk/src/index.ts:191`; run: flow run failed with that message | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| volvel build output and file counts. | `packages/cli/src/cli.ts` build; run in scratch repo | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (6 files, 658 KB) |
| The build needs Vite, loads react and tailwind plugins unless a vite.config.* is in the app folder; base ./ production. | `packages/cli/src/apps.ts:49,60-90,125-135` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| File name rules and 500 characters. | `packages/manifest/src/bundle.ts:79-95` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Entry, `_/` and duplicates checks. | `packages/manifest/src/bundle-check.ts:491-541` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Limits 25 MB file, 5,000 files, 20 MB bundle. | `kernel/apps/assets.ts:10`; `manifest/src/bundle.ts:120`; `kernel/execution/bundles.ts:21` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Deploy uploads new files, six at a time, prints App files: N, M new. | `cli/src/cli.ts:331-371` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (6, 4 new; 6, 3 new; 6, 0 new) |
| Deployed version output and created counts. | run | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (version 1, 9 created) |
| A deploy that would delete console resources stops unless --allow-delete. | `packages/docs/generated/develop/reference/cli.md` (deploy) | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Bindings: principals, key for groups, role by name or definition. | `sdk/src/index.ts:1315-1380` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (deploy created roles/starts-runs and four bindings) |
| portal_reader and portal_user permissions; neither holds run:write or flow_run:write. | `packages/db/migrations/0027_portal_reader.sql`; `0018_apps.sql:136` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| An end user in the group with these bindings started a flow and a script through the API. | run: POST flow-runs and runs as Jess Morgan, 201 both | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| App address /apps/<tenant>/<workspace>/<app>/. | `kernel/apps/address.ts:25` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Files no deployable bundle names are removed a week after. | `inventory/apps-as-code.md` APP-17; fixed/app.md | writer, read in code, not run; second agent, 2026-11-23 | not re-read in code; second agent to check |

## Second check, 2026-11-23 (Checked by: second agent, 2026-11-23)

- SDK checks: `defineApp` message `packages/sdk/src/index.ts:1248`; title 100, reads 100, one of entry/interface/docs: `packages/manifest/src/kinds.ts:1715-1790`; vite message `packages/cli/src/apps.ts:71`; config files `apps.ts:49`; path rule `packages/manifest/src/bundle.ts:83-92`; 5,000 files `bundle.ts:120`; 25 MB `kernel/apps/assets.ts:10`; 20 MB `kernel/execution/bundles.ts:21`; six uploads at once `packages/cli/src/cli.ts:344-370`; sweep after 7 days `assets.ts:126`.
- Deploy deletes: the console-made check is `cli.ts:405-425`; a repository-owned resource missing from the new repository is deleted without a prompt (run: board, guide and a flow deleted); sentence added to Before you start.
- Run: build, deploy, `volvel dev`, TextField sample (invisible raw input corrected).

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Table and bindings and role as YAML; `TableOf<"visits">` in the page; deploy `7 created`. | run: the page's files extracted and built, deployed to `apps-docs`; `volvel build` output copied | writer, 2026-11-24 | holds as run (the app was not opened in a browser) |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. Rebuilt the repository from the page's snippets (table file, script, app, `apps/desk`, three bindings and the role) with the lane CLI: `volvel build` and `deploy` print what the page shows (`App files: 6, 4 new.`, `7 created`). The **Apps** screen lists the app with the tag REPOSITORY, the address `/apps/fernhill/<workspace>/desk/` and **Front desk** under Open to, and says repository apps are not served until `APPS_URL` is set, as the page says. Not run: the app's page in a browser (the instance has no `APPS_URL`).

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A repository app is served at the console's address or `APPS_URL`; no 503 for a missing address. | `routes/instance.ts:67`; `kernel/apps/hosts.ts:60` | writer, read in code, not run, 2026-11-28 | holds |
| Its pages are sandboxed: no cookie, no storage. | `packages/manifest/src/app-policy.ts`; `kernel/apps/front.ts:1109` | writer, read in code, not run, 2026-11-28 | holds |
