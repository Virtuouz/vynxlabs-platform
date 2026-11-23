# Inventory: cli and local development

Read from the code at `270e509` on 2026-11-22. Refreshed against the code after phase 29 on 2026-11-23 (branch `phase-30-docs-system`, `4992c9da`). A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md), and what phase 29 did about each is in `docs/documentation/fixed/`.

**Refreshed 2026-11-23.**
- **Changed in the code since the first reading (all checked against the code now):** new commands `logout`, `profiles`, `rollback`, `--profile`/`VOLVEL_PROFILE`; new flags `deploy --preview`, `--message` (deploy, promote, rollback), `--json` (whoami, status, runs, deploy, promote, rollback), `--entry`, `--resources`, `dev --no-strict`; `volvel.yaml` now has five keys; `@volvel/sdk/testing`; `volvel dev` serves under the app content policy; local runs build connections by connector and take `groups`; `init` writes a `tsconfig.json`; `pull` handles files kept outside `platform/`, removes only what a pull wrote, and handles `.md` pages; a saved key goes only to the URL it was saved for; `promote --preview` exits 4; `--version`, `<command> --help`; `Unexpected:` one-line faults.
- **Section A** gained pages (testing, roll back, deploy preview, `--json` and profiles, hand-written flag table, `volvel dev` for interface and docs apps) and now types each page. **Section E** is settled item by item: nothing there is an open bug now, except what is named as left.
- **Vocabulary applied:** access change (the commands `tenant release`/`releases` keep their names); Deploy in dev and Versions in production; canceled; Flow.
- **Not verified:** whether any `@volvel` package is on npm (no network; `init` asks for `^0.5.0`); the Contributor and Distribution paragraphs of B were not re-read beyond the Node version and the release workflow; no command was run, so every line says what the code does, not what a run printed. The line numbers of `cp/` citations were found by search, not by a test.

**Scope read:** all of `packages/cli/src` (tests included, some only by title), manifest `files`/`file-schema`/`bundle`/`references`/`tenant`, the SDK, and the server's deploy, preview and promote code.

Short paths: `cli/` = `packages/cli/src/`, `manifest/` = `…/packages/manifest/src/`, `sdk/` = `…/packages/sdk/src/`, `cp/` = `…/apps/control-plane/src/`.

## A. Pages to write: collection Develop (`packages/docs/content/develop/`, or where phase 30's docs system puts the Develop collection)

Add `develop` to `pages:` in `content/index.md`, after `build` (while that file still lists collections; phase 30 M3 changes how collections are declared). `packages/docs/check.mjs` fails any page that no screen or page links to, so `develop/index.md` must link to all of these. All pages are in the **Develop** collection.

| # | File | Diátaxis | Purpose | Sources |
|---|---|---|---|---|
| 1 | `index.md` | explanation | When to use a repository and when the console; map of the section | `docs/sdk-guide.md` (intro), README "Deploy something" |
| 2 | `quickstart.md` | tutorial | Install, init, install dependencies, login, run, build, deploy to dev, promote | `cli/local.ts:265-290` (the five steps `init` prints), `cli/cli.ts:410,618` |
| 3 | `sign-in.md` | how-to | API keys, the saved sign-in, env vars, profiles, logout, CI identities | `cli/cli.ts:47-100,194-221`, `cli/cli.ts:1210+` (logout, profiles), `cp/kernel/principal.ts:11` |
| 4 | `repository-layout.md` | reference | Entry file, `platform/`, `tenant/`, `.platform/`, the five keys of `volvel.yaml` | `cli/build.ts:208-229`, `manifest/files.ts:669-760` |
| 5 | `code-or-files.md` | explanation | Who owns a resource, the file format, editor schemas, takeover | `manifest/files.ts`, `cli/schemas.ts`, `examples/higher-ed-devices` |
| 6 | `sdk.md` | reference | Every `define*`, `trigger`, `step`, `column`, `ctx` | `sdk/index.ts` (table in B), `sdk/context.ts:34`, `sdk/tables.ts:174` |
| 7 | `typed-tables.md` | how-to | Typed rows in scripts and apps | `sdk/tables.ts:59-90`, `examples/acme/apps/portal/main.tsx:1,20,51` |
| 8 | `names-and-moves.md` | explanation | key, path, title, mcp name, references, aliases | `manifest/references.ts`, `manifest/bundle.ts:30-36`, `cp/routes/workspaces.ts:822` |
| 9 | `run-locally.md` | how-to | Local run, `local.json` (all four sections), offline, what is not local | `cli/local.ts:30-205`, `cli/input.ts` |
| 10 | `test-scripts.md` | how-to | Unit-test a script with `@volvel/sdk/testing` (`runScript`, `testContext`, `memoryTable`). New in phase 29 (CLI-MP5) | `sdk/testing.ts:64,115,237`, `sdk/testing.test.ts`; replaces the old "no test harness exists" |
| 11 | `run-remote.md` | how-to | Preview bundles, `logs -f`, `runs`, exit codes | `cli/cli.ts:1097-1180`, `cli/follow.ts` |
| 12 | `apps-dev.md` | how-to | `volvel dev` for a code app: Vite, the content policy, `--no-strict` | `cli/dev.ts`, `cli/apps.ts`, `cli/cli.ts:577` |
| 13 | `apps-dev-interface-and-docs.md` | how-to | **To be written after M1b.** `volvel dev` for interface and docs apps: drawn locally by `@volvel/screens` and `@volvel/docs-site`, API calls passed to the instance (D64). Not in the code yet; `dev.ts` today says "This repository defines no app" for them, because `appSources` lists only apps with `source`. Write it from the code M1b builds, and say what its command line is then | decisions.md D64; `fixed/sweep-server.md:24` (the two ways considered); `phase-30` M1b |
| 14 | `deploy.md` | how-to | Build checks, `deploy`, `--preview`, `--message`, bindings, refusals, deleting console resources | `cli/cli.ts:410-530`, `cp/kernel/execution/deploy.ts:634-675` |
| 15 | `promote.md` | how-to | `promote`, `--preview`, breaking changes, exit 4, the release branch warning | `cli/cli.ts:618-718` |
| 16 | `roll-back.md` | how-to | `volvel rollback <version>`: what it does, what stays as it is, the 100-version limit. New (CLI-MP3). In the console this is "Roll back to this version" on Versions | `cli/cli.ts:720-802` |
| 17 | `pull.md` | how-to | Console to repository round trip, files kept elsewhere, what `--force` does | `cli/pull.ts` |
| 18 | `access-as-code.md` | how-to | `volvel tenant plan|release|pull|releases|approve|decline|withdraw|rollback|approval`; the files of access (YAML only, D53) | `cli/access.ts`, `manifest/tenant.ts`, `cli/schemas.test.ts` "a tenant's access is written in YAML only" |
| 19 | `ci.md` | how-to | GitHub Actions: secrets, `--json`, `--message` (defaults to the commit subject when `CI` is set), `deploy --preview`, `promote --preview` exit codes. To be written; nothing in the repository is an example | `cli/cli.ts:154-175` |
| 20 | `cli-reference.md` | reference | Link to the generated `reference/cli`, plus the hand-written flag table (below) | `cli/commands.ts` |
| 21 | `versions.md` | reference | CLI, SDK, instance; core range; bundle formats 1 to 4 | `manifest/bundle.ts:182`, `cp/kernel/execution/deploy.ts:161,274-290`, `docs/contracts/bundle.md` |
| 22 | `errors.md` | reference | Exit codes and messages | `cli/cli.ts:1340-1400`, `cli/follow.ts:157` |
| 23 | contributor setup | not a page | Stay in `CONTRIBUTING.md`, linked only | `CONTRIBUTING.md` |

Not on a Develop page, and not a gap: `volvel tenant export|import` (Administer: moving a tenant) and `volvel instance triggers` (Administer or Self-host: the operator's stop). Link them from `cli-reference.md`.

**Say it is not there:** a deploy prompt for missing bindings (never interactive); `--dry-run` (it is `deploy --preview`); `--json` on `login`, `logs`, `init`; a bundle rollback is a deploy of an earlier version, so console resources stay as they are; there is no `defineDoc` and no `define*` for a tenant's access (D53); `volvel dev` does not run scripts or flows locally (it runs the deployed ones); `smtp` connections do not run locally.

`reference/cli` is generated from `cli/commands.ts` (`COMMANDS` and `COMMAND_NOTES`). Link to it. Do add the hand-written flag table, because the generated lines name some flags and leave out others:
- `--dir <path>`: `build`, `schemas`, `run`, `dev`, `deploy`, `promote` (for `--message` in CI), `pull`, `tenant plan|release|pull`. Not on `logs`, `runs`, `rollback` (rollback reads the current directory for CI).
- `--entry`, `--resources` (`pull` takes only `--resources`).
- `run`: `--script`/`--flow` pick which kind when both have the path; `--input <json>|@file` on both forms (`cli/cli.ts:1097`, `cli/input.ts`).
- `runs`: `--script <path>`, `--json`; `runs cancel [--queued|--all] [--older-than <seconds>]`.
- `--allow-delete <path>` is repeatable on `deploy` and `promote`; on `tenant release` it is `<kind>/<key>`.
- `--profile <name>` anywhere; `VOLVEL_PROFILE`; `--version`, `-v`, `version`; `<command> --help`.

## B. What each page covers

**Quickstart.** `volvel init [dir]` (`cli/local.ts:265`) writes `package.json` (dependency `@volvel/sdk ^0.5.0`, `STARTER_SDK_RANGE`, `local.ts:212`), `.gitignore` (`node_modules/`, `.platform/`), `tsconfig.json` and `src/index.ts` (script `hello`, schedule `hello-every-morning`). It refuses a non-empty directory (`.git` is ignored). It writes no `volvel.yaml`, `platform/`, git init or CLI dependency. It ends with five numbered steps: install the repository's dependencies; install the CLI (`npm install --global @volvel/cli`); `login` (key from the account menu); `volvel run hello` and `volvel build`; `volvel deploy --tenant --workspace` to a dev workspace. Then `volvel run hello --input '{"name":"Ada"}'`. Node 24 (`.nvmrc`; `engines >=24`; the packed CLI is built for node22, `packages/cli/bundle.mjs:22`).

**Sign-in** (`cli/cli.ts:47-100,194-221`).
- `login --url --token` checks `/me` before saving, to `$XDG_CONFIG_HOME/volvel/config.json` or `~/.config/volvel/config.json`, mode 0600. Plain `http://` to a host other than localhost, 127.0.0.1 or [::1] warns on stderr (CLI-01).
- `VOLVEL_URL` and `VOLVEL_TOKEN` override each field. The saved key is used only for the URL it was saved for (trailing slashes ignored): `VOLVEL_URL` alone to another instance refuses and says to set `VOLVEL_TOKEN` (D49).
- Profiles: `--profile <name>` or `VOLVEL_PROFILE` keeps another sign-in in `profile-<name>.json` beside `config.json` (name: letters, digits, `-`, `_`, up to 40); `volvel profiles` lists them; `volvel logout` removes the saved sign-in of the chosen profile (CLI-MP6).
- Keys are prefixed `vxk_` (`cp/kernel/principal.ts:11`), created with an optional `expiresAt` (`cp/routes/identity.ts:110`). Service account keys: `cp/routes/tenants.ts:1397`.
- `whoami [--json]`; `status [--json]` (exit 1 when not ready; says "Read only: ..." when the database takes no writes, INS-MP5).
- Built-in `deployer` role: `*:read, bundle:*, deployment:*` (`packages/db/migrations/0009_execution_roles.sql:13`).
- Promote needs `promotion:write` in the *target* workspace (`cp/routes/execution.ts:1039`).

**Layout** (`cli/build.ts:208-229`, `manifest/files.ts`).
- The entry is `src/index.ts` unless `--entry <file>` or `entry:` in `volvel.yaml` says otherwise; the console's folder is `platform` unless `--resources <folder>` or `resources:` says otherwise. A flag wins (`placesOf`, `build.ts:220`; CLI-MP4).
- `volvel.yaml` has five keys: `roots`, `ignore`, `docs` (each a list of folders), `entry`, `resources` (one path each, inside the repository, no `..`). Any other key is a build error, and `pull` refuses the same file build refuses (CLI-12) (`manifest/files.ts:694-755`).
- Git sync on the instance reads `volvel.yaml` too: `resources` there decides where git sync writes, and the Repository page shows Folder as read-only (D65, `fixed/yaml-folder.md`). `entry` is for the CLI and CI only: the instance never builds code.
- `platform` is the default console folder and always a root; the longest root wins.
- Never read: `node_modules`, `dist`, `build`, dot-folders, and the `ignore` folders (`manifest/files.ts:665,762`).
- File name `<path>.<kind>.yaml`. Only `script`, `connector` and `trigger_source` pair with a `.ts`.
- YAML keys allowed: `key`, `path`, `title`, `schemaVersion` (required), `body` (required).
- Pages: `<path>.md` under `platform/docs`, or under `docs:` roots, which replace the default (`manifest/files.ts:43`). Docs pictures: `.png .jpg .jpeg .gif .webp .avif .svg` beside pages (`cli/build.ts:95-143`).
- App file names: a part may begin with one `_` or `.` followed by a letter or digit; `.` and `..` are refused; the build names the file and the rule (`manifest/bundle.ts:79`, APP lane `fixed/app.md`).
- Path grammar: `manifest/envelope.ts:4`.
- `.platform/` holds `bundle.json`, `local.json`, `pulled.json`, `schemas/` and scratch files. Gitignore it.
- No `volvel.yaml` ships in any example.

**Code or files.**
- `volvel schemas [--dir]` writes `.platform/schemas/<kind>.schema.json` and `yaml.schemas` in `.vscode/settings.json`. If that file is not plain JSON (comments) it is left alone and the JSON to add is printed (`cli/schemas.ts`, `cli/cli.ts:260`).
- Needs the `redhat.vscode-yaml` extension. Rerun after upgrading the CLI; schemas come from the CLI, not the instance.
- `doc` has no schema; tenant kinds do, including every kind of access (`group`, `end_user_group`, `service_account`, `tenant_role`, `tenant_binding`) (`manifest/file-schema.ts`, D53).
- Published schemas: `/schemas/files/*.schema.json`.
- Script files may import only `@volvel/sdk` and `node:` (`packages/compose/src/index.ts:33,191`).
- Console edits preserve comments and key order (`ontoWritten`, `manifest/files.ts:325`).
- Example: `/examples/higher-ed-devices` (code for logic, files for the rest).

**SDK** (`sdk/index.ts`, current line numbers; `SDK_VERSION` 0.5.0 at 50).

| Export | Line | What it is |
|---|---|---|
| `defineScript` | 247 | Typed function with zod in/out: uses, retries, concurrency, `worker` pool, `onFailure` (replaces the workspace's default alert, D29), `node` (a flow step) |
| `defineSchedule` | 325 | Cron starts a script |
| `defineTriggerSource` | 462 | `webhook` or `poll` code in front of a trigger |
| `defineWebhook` | 485 | HTTP request starts a script |
| `defineForm` | 527 | Served form starts a script |
| `defineConnector` | 580 | Custom adapter |
| `defineConnectionGroup` | 614 | Per-workspace members |
| `defineConnection` | 624 | Declared here, bound per workspace |
| `defineVariable` | 641 | Value per workspace, optional default |
| `defineQuery` | 672 | Saved SELECT |
| `defineEvent` | 691 | Event with a payload schema |
| `defineEventTrigger` | 716 | Event starts a script, CEL filter |
| `defineFlow` | 995 | Graph of `trigger.*` (737) and `step.*` (862); `layout` option; `step.foreach` takes exactly one of `script`, `flow` or `flowFrom` with `allow`; `step.subflow` takes a flow or `{ flowFrom, allow, input }`; `trigger.schedule`, `webhook`, `event` take `tags` (`fixed/t3-flow-ops-sdk.md`) |
| `defineTable` | 1063 | Typed table; `indexes` (may name `id`, `created_at`, `updated_at`) |
| `defineDataSource` | 1091 | External database |
| `defineTheme` | 1148 | One per workspace; `THEME_TOKENS` (27) is exported and `ThemeToken` derives from it |
| `defineApp` | 1216 | Exactly one of `source`, `interface`, `docs` (an error otherwise); `feedback` only with `docs` |
| `defineInterface` | 1271 | No-code pages, v2 |
| `defineDashboard` | 1289 | Dashboard, v3 |
| `defineRole` | 1315 | Workspace role |
| `defineBinding` | 1360 | Grants a role |

- `trigger`: manual, schedule, webhook, form, event. `step`: script, set, branch, foreach, join, delay, approval, subflow, respond, fail.
- `column` (`sdk/tables.ts:174`): text, integer, number, boolean, timestamp, date, json, uuid, enum, enumList, reference, file.
- Also: `z`, `httpConnector`, `HttpError` (its message drops query, fragment and credentials), `oauth2Connector`, `smtpConfigSchema`, `SchemaError` (`sdk/index.ts:240`), `isResourceDefinition`, `SDK_VERSION`, `CORE_RANGE`, `THEME_TOKENS`, everything from `@volvel/widgets`, and page/data types.
- `ScriptContext`: `sdk/context.ts:34`. `console.log` and its siblings in a script go to the run's log, masked (D44, `fixed/mask.md`).
- `@volvel/sdk/testing` subpath (`sdk/package.json` exports `./testing`): see Test scripts.
- No `defineDoc`, and no tenant kinds in the SDK: files only.

**Typed tables.** `ctx.table(orders)` infers `RowOf`/`InsertOf`. Client: `find/get/insert/insertMany/update/delete/aggregate/as(principalId)` (`sdk/tables.ts:59-90`). Without `.as()` a script sees every row. `find` default limit 50, max 1,000; `insertMany` up to 1,000, all or none. Apps use a type-only import: `table` from `@volvel/app` plus `import type { orders } from "../../src/index.ts"` (`examples/acme/apps/portal/main.tsx:1,20`). Runtime constants must come from import-free files (`examples/fernhill/src/constants.ts`).

**Names and moves.** Set `key:` to the old path. The old path answers for 90 days with `Deprecation`, `Sunset`, `Volvel-Resource-Moved` (`cp/routes/workspaces.ts:822`). Text references that use a key are rewritten (`manifest/references.ts`). Tool name is `run_<path>` or `start_<path>`, `/` becomes `__`, `-` becomes `_`, cut at 64 (`manifest/bundle.ts:31-36`). Reserved: `get_run`, `get_flow_run`, `list_approvals`, `decide_approval`. Tables and columns rename with `renamedFrom`. A renamed webhook or form step changes its address; give the trigger a stable key (D33). Only `deploy` prints notes about moved references; `build` does not (`cli/cli.ts:437`).

**Run locally** (`cli/local.ts`). `volvel run <script> [--dir] [--entry] [--resources] [--input <json>|@file]`. `.platform/local.json` has four sections: `connections` (by path: `config`, `credential`), `groups` (group path, then member key: `config`, `credential`, `label`), `secrets`, `variables`. A connection or group member is built with the connector it names: `http` and `oauth2` from the SDK, a connector the repository declares from its own export; `smtp` says "Mail connections live in a workspace ... Deploy to a dev workspace" (`local.ts:15,104-125`; CLI-05/06). `ctx.connections(group)` has `get` and `keys`; a missing group, binding or member says so and names `local.json`. Variables fall back to their default. Events and tags are printed, not delivered. Tables, sources and files throw "... live in a workspace ... Deploy to a dev workspace to try this script". `console.log` is not routed in a local run: use `ctx.log`. Offline works for `init`, `build`, `schemas`, local `run`.

**Test scripts** (`sdk/testing.ts`, new). `runScript(script, input, options)` checks input and output, holds the script to its declarations with the worker's words ("The script did not declare the secret ..."), and returns `{ output, ...recorded }` (logs, events, tags, files). `testContext(options, declared)` is the context alone; `memoryTable(rows)` stands in for a table. The CLI's own run does not use it (it needs real bindings). Also still true: `script.execute(input, ctx)` with a context you build (`sdk/index.ts:229-290`).

**Run remote** (`cli/cli.ts:1097`). `volvel run <path> --remote --tenant --workspace [--input <json>|@file] [--script|--flow] [--entry --resources --dir]`. Dev workspaces only. Uploads with `?preview=true`, then `POST test-runs`. Previews are removed after 7 days with their runs (`cp/kernel/execution/bundles.ts:194`). Needs `bundle:write`, `run:write`, `code:write` (plus `flow_run:write` for flows) and the tenant's code-in-console switch on (see C5). `logs <id> [-f]` polls every 2 s without the event stream and waits 15 s at most with it (`cli/follow.ts:11-12`). `runs [id] [--script <path>] [--json]` lists 20, flow runs included. `runs cancel [--queued|--all] [--older-than <seconds>]` (a whole number; checked before the instance is asked).

**Apps dev** (`cli/dev.ts`, `cli/apps.ts`, `cli/cli.ts:577`). `volvel dev [app] --tenant --workspace [--port n] [--no-strict] [--entry --resources --dir]`; the tenant and workspace are required (the first reading missed it); default port 5174, 1 to 65535, next free port if taken. App name optional with a single app. The repository must install `vite`; `@vitejs/plugin-react` and `@tailwindcss/vite` load automatically unless the app folder has its own `vite.config.*` (`cli/apps.ts:49-90`). `/api` is proxied with *your* key; `/portal` is proxied so sign-in returns to localhost; context is in `#vx-context`, with `tenant.logo` read from the instance (APP-10). The page is served under the same content policy as a deployed app (`manifest/app-policy.ts`, shared with `cp/kernel/apps/front.ts`): per-run nonce on `script-src`, `ws://localhost:*` for reload. A browser console shows what a deployed app would refuse. `--no-strict` turns it off and says so (APP-MP1). Only TypeScript apps with `source`; file apps, interfaces and docs apps are not served today (page 13, D64). Scripts and flows are not hot-reloaded: `dev` runs deployed ones.

**Deploy** (`cli/cli.ts:410`, `cp/kernel/execution/deploy.ts`).
- Flags: `--dir --entry --resources --tenant --workspace --preview --message --json --allow-delete` (repeatable). No `--dry-run`: `--preview` is it.
- Before uploading, deploy stops when it would delete console resources the repository has no file for, naming up to 10, unless `--allow-delete <path>` names each; resources deleted in the console and pulled count as allowed (CLI-13, `cli.ts:388`). Not checked when the bundle has no console file or the key may not read them. A console resource renamed in the repository (same key, new path) is listed too.
- `--preview`: builds, uploads app files, stores the bundle as a preview bundle, asks `GET deployment-preview` (needs `deployment:write`), prints counts and changes, and says nothing was changed. A refusal prints "It cannot be deployed." with reasons (exit 1) (CLI-MP1).
- `--message` is kept with the version; with none, and `CI` set (not `false`/`0`), the subject of `git log -1` in `--dir` is used, cut at 500 (CLI-MP2, `cli.ts:154`).
- `--json`: one JSON document on stdout, nothing else; warnings stay on stderr.
- Not interactive: missing bindings are never prompted for. **Dev warns and deploys** (`deploy.ts:634`); production, and any promotion, refuse with `bindings_missing` (the text now says "deploy again" or "promote again"). Always refused: `bindings_invalid`. D23: production's first promotion is set up from the refused preview in the console.
- Other refusals: `incompatible_bundle`, `rename_suspected`, `path_taken`, `kind_changed`, `assets_missing` (`deploy.ts:280-386`).
- Atomic. Bundle limit 20 MB (`bundles.ts:21`); sources dropped above 4 MiB (`manifest/bundle.ts:123`); 5,000 assets (`:120`).
- Triggers are paused in a new dev workspace (`cp/routes/workspaces.ts:296`).
- Build refusals: unexported definition, duplicate resource in code and file, tool-name clash, missing reference, bad CEL, docs errors, a bad app file name.
- In the console the screen is Deploy in a dev workspace and Versions in production; the buttons are "Deploy this version" and "Roll back to this version". The CLI says "deploy", "promote", "roll back".

**Promote** (`cli/cli.ts:618`). `--preview --allow-delete --confirm-breaking --message --json --dir`. The preview is a real promotion taken back. Same digest, no rebuild. `--preview` to production with breaking changes and no `--confirm-breaking` prints them, says on stderr that promoting would be refused, and exits 4 (CLI-10, D49); with `--confirm-breaking` it exits 0. After a promotion, a failed push to the release branch is a warning on stderr (the promotion stands, exit 0); `done` prints the branch (CLI-11).

**Roll back** (`cli/cli.ts:720`). `volvel rollback <version> --tenant --workspace [--message] [--json]`. A deploy of an earlier bundle. An unknown version says which exist; the running one says nothing was changed; the default message is "Went back to version N". Console resources stay as they are. Only the newest 100 versions are listed by the API.

**Pull** (`cli/pull.ts:225`). `--tenant --workspace [--dir --resources --deployed --force]`. Writes console resources into `platform/`, and resources the repository keeps elsewhere to where they are (`roots`, `docs`), pages included (`.md`). A file changed here since the last pull is kept (exit 1, listed) unless `--force`. Only a file a pull wrote is ever removed, `--force` or not; a foreign file is kept. A draft whose file was kept is left out of what a deploy clears. State: `.platform/pulled.json`; if it is not JSON, the message says to delete it. Reads `volvel.yaml` before asking the instance.

**Access** (`cli/access.ts`; command names keep "release", the words say "access change"). `plan`, `release [--message] [--allow-delete <kind>/<key>]`, `pull`, `releases`, `approve|decline|withdraw <n> [--comment]`, `rollback <n> [--yes]` (says what going back removes, asks first; `--yes` needed with no terminal), `approval [on|off]`, all with `--tenant` and `--dir`. Kinds and folders: `manifest/tenant.ts:18` (`tenant/`). Export and import (Administer) need `VOLVEL_EXPORT_PASSPHRASE`. A waiting access change that another one made stale is "superseded" and cannot be approved or withdrawn (REL-16). With approval on, a role given straight to a member or to every end user applies at once; groups, service accounts and end-user groups wait (D63).

**CI.** `VOLVEL_URL`/`VOLVEL_TOKEN` secrets (the token is used only for that URL), service account with `deployer`; PR: `volvel build`, `volvel deploy --preview`, `volvel tenant plan`; main: `deploy` to dev, `promote --preview` (read exit 4), gated `promote`. `CI` set makes `--message` default to the commit subject. `--json` for each step. Nothing in the repository contains such an example (`.github/workflows` holds only the product's own `ci.yml` and `release.yml`).

**Versions.** The instance checks the bundle's `core` range, taken from the repository's SDK, not the CLI. SDK 0.5.0 is `min 0.5.0, below 0.6.0` (`sdk/index.ts:50-51`). Newer cores accept bundles back to `OLDEST_SUPPORTED_BUNDLE_CORE` 0.2.0 (`deploy.ts:161,274`). Formats 1 to 4, oldest that fits (`manifest/bundle.ts:182`). `build` makes no instance check. `volvel --version` prints the CLI's version only. `scripts/release-version.mjs` sets every package, `SDK_VERSION`, `CORE_RANGE` and `STARTER_SDK_RANGE` at a release (HOST-13/14).

**Errors.** 0 success; 1 `CliError`/`BuildError`/failed run/kept files/not ready, and any unexpected fault (one line, "Unexpected: ... Run again with VOLVEL_DEBUG=1 for the trace."); 2 unknown command or bad flags (`ERR_PARSE_ARGS`); 3 canceled run; 4 `promote --preview` that production would refuse for breaking changes; 130 Ctrl+C while following (the run continues) (`cli/cli.ts:1340-1400`, `cli/follow.ts:157`). `logs` without `-f` on an unfinished run exits 0. `--port` and `--older-than` must be whole numbers.

**Contributor** (distinct; not re-read in this refresh). Node 24, pnpm 9.15, Docker. `pnpm install`, `stack:up` (Postgres on 54329, SeaweedFS on 8333), `cp .env.example .env`, `pnpm dev` (8080), `dev:console` (5173, set `PUBLIC_URL`). `--profile sso` starts Keycloak (8180). `pnpm test`/`typecheck`/`docs:check`/`check:schemas`/`e2e`. Check `CONTRIBUTING.md` and the root `package.json` before copying.

**Distribution.** `.github/workflows/release.yml` publishes widgets, markup, docs-engine, docs, ui, app, sdk, cli to npm; a tag `v1.2.3` publishes that version under `latest`, a push to main publishes `1.2.3-next.<commit>` under `next`. Private: manifest, compose, nodes, db, worker, screens, widgets-core, widgets-labs. Publishing needs the `RELEASE_ENABLED` variable and the npm and Docker secrets; without them a run builds and rehearses only. There are no git tags yet. The first public release date is not set (D62). Whether anything is on npm was not checked.

## C. Gotchas

1. The first resource file (even one Markdown page) makes the bundle speak for **all** console resources (bundle format 3, `docs/contracts/bundle.md`). Previously deployed ones not in the repository are deleted by the server. Since CLI-13 the CLI stops first and names them; pull first, or give `--allow-delete <path>` for each.
2. `pull --force` removes only files a previous pull wrote and the console no longer has; a file you wrote yourself is kept and listed (`pull.ts:141-157`, CLI-02/03/04).
3. A saved key is sent only to the URL it was saved for. `VOLVEL_URL` alone to another instance is refused (D49, `cli.ts:80-97`).
4. Building **executes** your repository code (`cli/build.ts:~396-410`), so top-level side effects run.
5. `run --remote` fails with 403 `console_code_off` if the tenant turned console code off (`cp/routes/authoring.ts:211-227,1364,1385`; it covers a test run of an uploaded bundle too). The switch is an audited setting an operator or a tenant admin changes: Repository page (`apps/console/src/screens/Git.tsx:281`, `Environments.tsx:1617`; D17). The error says who can turn it on.
6. Only exports of `src/index.ts` count (or of `--entry`); colliding `export *` names cancel out.
7. One path namespace across all kinds.
8. Drafts carried by a pull are recorded in the gitignored `pulled.json`, so a CI deploy does not send them; the server still clears drafts whose content matches. A page the pull kept is not recorded as taken (`pull.ts:193-205`).
9. `--input @file` works with both the local and the remote run.
10. `ignore` in `volvel.yaml` does not apply to tenant files (`access.ts:16` skips only `node_modules`, `dist`, `build` and dot-folders).
11. `tenant pull` never deletes files; `promote` acts on the bundle *active* in the source workspace, not your checkout.
12. `rollback` and `deploy --preview` change no console resource; `deploy --preview` still uploads app files and stores a preview bundle (removed after 7 days).
13. With `--json` every line on stdout is the one document; read warnings on stderr.
14. The tenant's workspace must be a dev workspace for `run --remote`; for `dev`, any workspace you may read.

## D. Docs wrong, stale or missing (state on 2026-11-23)

- **README:** the "phase 6" line and the `alias platform=` line are gone. Still stale: "The first deploy tells you which connections and secrets the workspace still needs ... then deploy again" (line 44) is true only of production (dev warns and deploys); `packages/cli` is described as "build, deploy, run" only (line 111). No install path outside the monorepo.
- **sdk-guide:** the comments contradiction and "phase 17" are gone. Still stale: the dashboard example is `version: 2` fields inside `schemaVersion: 1` (line 199); the SDK emits v3 (`sdk/index.ts:1289`). Its "right for" statement on tables should be read against the `table` file schema.
- **`init` closing line:** fixed (CLI-14, five steps).
- **`COMMAND_NOTES`:** fixed (CLI-16): `schemas`, `tenant plan` and `tenant release` are named; `--entry`, `--resources`, `--version`, `--help` added.
- **Content stubs, still 7-line stubs:** `tenant/repository.md`, `build/resources.md`, `build/extension-editor.md`, `start/account.md`, `tenant/service-accounts.md`.
- `docs/contracts/bundle.md` now lists `sources` and the core range: fixed.
- `build/writing-a-widget.md` still says `labs/goal` at four places; it is `core/goal` (D37, `fixed/t3-cli-docs.md`). Not this inventory's page, noted for the widget contract page (D60: published, marked for contributors).
- Docs lines phase 29 asked for (`fixed/t3-cli-docs.md`, `fixed/clirel.md`, `fixed/rel.md`): the CLI page for `deploy --preview`, `--message`, `rollback`, `--json`, `logout`, `profiles`, `--entry`, `--resources`, `dev --no-strict`, promote exit 4 and the release warning, `--version`/`--help`, `init`'s next steps, `local.json`'s four sections. All are in `commands.ts`, so the generated page has them; the hand-written pages above must agree.
- CHANGELOG lines owed by phase 29 for the CLI are listed in `fixed/t3-cli-docs.md` "Docs lines".

## E. Findings: settled

Each item of the first reading is settled; none is an open bug. Source of each outcome is named.

1. **Local run ignored connector types and `ctx.connections`:** fixed. `connectorOf`/`clientFor` read the connector from the bundle; groups come from `local.json`; `smtp` says it needs a worker (CLI-05, CLI-06, CLI-15, `fixed/clirel.md`; `local.test.ts`). `fixed/scr2.md:40`.
2. **Docs drafts could be lost** (`stem()` ignored `.md`): fixed with `resourceOfFile` (CLI-02, `fixed/rel.md`).
3. **`pull` never removed deleted `.md` pages:** fixed, `walk` includes `docs/**/*.md` (CLI-03/04, `fixed/rel.md`).
4. **`promote` ignored a failed release push:** a warning on stderr, exit 0 (CLI-11, D49).
5. **`--port abc`, `--version`, `<command> --help`:** fixed (CLI-08, CLI-09).
6. **`promote --preview` exit with breaking changes, and no deploy preview:** exit 4 (CLI-10, D49); `deploy --preview` built (CLI-MP1).
7. **Raw stack traces from upload `fetch` and `tenant export`:** fixed, one line each (CLI-07); anything unexpected prints `Unexpected: ...`.
8. **`pull` ignored `volvel.yaml` problems:** fixed (CLI-12).
9. **No `--json`, no profiles:** built (CLI-MP6). `login --json`, `logs`, `init` are unchanged.

Left, and named so a writer says it plainly:
- **`volvel dev` for file apps, interfaces and docs apps (CLI-MP7):** decided in D64, built in phase 30 M1b. Until then the Develop page for it is "to be written after M1b" (page 13).
- **Git sync and `entry`/`resources` (`fixed/t3-cli-docs.md` CLI-MP4):** decided in D65 and built: `resources` wins for git sync (`fixed/yaml-folder.md`); `entry` stays for the CLI and CI.
- **Tables, data sources and files are not local** in `volvel run`, and the run does not use the testing harness (`fixed/t3-cli-docs.md` CLI-MP5).
- **`rollback`:** only the newest 100 versions are visible to it.
- **`deploy` stops on a console resource renamed in the repository** and wants `--allow-delete` (known limit, `fixed/rel.md` CLI-13).
- **npm:** whether `@volvel/*` is published is unknown; `init`'s `^0.5.0` fails until it is.
- Failing tests the lane noticed and did not touch (not product bugs for docs): `fixed/t3-cli-docs.md` "Found".

## F. Tutorials and examples

1. **First script, end to end**: init, `local.json`, deploy to dev, promote. Shop connection from `examples/acme/src/index.ts` (`orders/sync`); tested locally in `cli/example.test.ts` (the `orders/sync` tests near 149 and 227; the first reading cited line 650, which has moved).
2. **Flow remote loop**: `greet`/`welcome` fixture, `cli/remote.test.ts:44-70` (definitions) and `:193` (a flow is followed step by step), `run welcome --remote`.
3. **Code and files split**: `examples/higher-ed-devices` (variable, schedule, app YAML with comments).
4. **Repository with `roots: [src]`**: `cli/build.test.ts:435`.
5. **Rename with `key`**: `cli/build.test.ts:284,319`.
6. **Round trip**: console draft, pull, edit, deploy (`cli/remote.test.ts:273-354`).
7. **App against real data**: acme portal with `volvel dev portal --tenant --workspace`.
8. **Access as code with approval**: `tenant/` from higher-ed-devices, `cli/access.test.ts:95-194`.
9. **GitHub Actions**: to be written.
10. **Unit test with `@volvel/sdk/testing`**: to be written, from `sdk/testing.test.ts`.
11. **Preview a deploy, then roll back**: to be written; `cli/release.test.ts` (CLI-MP1, CLI-MP3).
12. **Full walk**: `examples/fernhill` (`setup/setup.mjs`, `README.md:92` "Ship a change as Devi").
13. **Interface and docs apps locally**: to be written after M1b.
