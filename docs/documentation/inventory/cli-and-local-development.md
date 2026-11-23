# Inventory: cli and local development

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

**Scope read:** all of `packages/cli/src` (tests included, some only by title), manifest `files`/`file-schema`/`bundle`/`references`/`tenant`, the SDK, and the server's deploy, preview and promote code. Nothing was run.

Short paths: `cli/` = `packages/cli/src/`, `manifest/` = `…/packages/manifest/src/`, `sdk/` = `…/packages/sdk/src/`, `cp/` = `…/apps/control-plane/src/`.

## A. Proposed pages: `packages/docs/content/develop/`

Add `develop` to `pages:` in `content/index.md`, after `build`. `packages/docs/check.mjs` fails any page that no screen or page links to, so `develop/index.md` must link to all of these.

| # | File | Purpose |
|---|---|---|
| 1 | `index.md` | When to use a repository or the console; map of the section |
| 2 | `quickstart.md` | Install, init, login, build, run, deploy, promote |
| 3 | `sign-in.md` | API keys, config file, env vars, CI identities |
| 4 | `repository-layout.md` | Entry file, `platform/`, `tenant/`, `.platform/`, `volvel.yaml` |
| 5 | `code-or-files.md` | Ownership, file format, editor schemas, takeover |
| 6 | `sdk.md` | Every `define*`, `trigger`, `step`, `column`, `ctx` |
| 7 | `typed-tables.md` | Typed rows in scripts and apps |
| 8 | `names-and-moves.md` | key, path, title, mcp name, references, aliases |
| 9 | `run-locally.md` | Local run, `local.json`, unit tests, debugging, offline |
| 10 | `run-remote.md` | Preview bundles, `logs -f`, exit codes |
| 11 | `apps-dev.md` | `volvel dev`, Vite |
| 12 | `deploy.md` | Build checks, deploy, bindings, refusals |
| 13 | `promote.md` | Preview, breaking changes, rollback |
| 14 | `pull.md` | Console to repository round trip |
| 15 | `access-as-code.md` | `volvel tenant …` |
| 16 | `ci.md` | GitHub Actions |
| 17 | `versions.md` | CLI, SDK, instance; bundle formats |
| 18 | `errors.md` | CLI exit codes and messages |
| 19 | `contribute.md` | Platform contributor setup. Better left in CONTRIBUTING.md, linked only |

`reference/cli` is already generated from `cli/commands.ts`. Link to it and don't repeat it. Do add a hand-written flag table: the generated page omits `--dir`, `run --script/--flow`, and `runs --script`.

## B. What each page covers

**Quickstart.** `volvel init [dir]` (`cli/local.ts:148-201`) writes only `package.json` (dependency `@volvel/sdk ^0.5.0`), `.gitignore` (`node_modules/`, `.platform/`) and `src/index.ts` (script `hello`, schedule `hello-every-morning`). It refuses a non-empty directory (`.git` is ignored). It writes no tsconfig, `volvel.yaml`, `platform/`, git init or CLI dependency. Then install, `volvel run hello --input '{"name":"Ada"}'`, `build`, `login`, `deploy`. Node 24 (`.nvmrc`; the packed CLI targets node22).

**Sign-in.**
- `login --url --token` checks `/me` before saving to `$XDG_CONFIG_HOME/volvel/config.json` or `~/.config/volvel/config.json`, mode 0600 (`cli/cli.ts:31-49,116-136`).
- `VOLVEL_URL` and `VOLVEL_TOKEN` override each field independently.
- One saved instance: no profiles, no logout.
- Keys are prefixed `vxk_` (`cp/kernel/principal.ts:11`), created with an optional `expiresAt` (`cp/routes/identity.ts:90,834`). Service account keys: `cp/routes/tenants.ts:1164`.
- `whoami`; `status` (exit 1 when not ready).
- Built-in `deployer` role: `*:read, bundle:*, deployment:*` (migration 0009).
- Promote needs `promotion:write` in the *target* workspace (`cp/routes/execution.ts:~918`).

**Layout** (`cli/build.ts`, `manifest/files.ts`).
- Entry is always `src/index.ts`. `entry` and `resources` options exist on `buildBundle` but have no CLI flag (`build.ts:52-59`).
- `volvel.yaml` has exactly three keys: `roots`, `ignore`, `docs`, each a list of folders. Any other key is a build error (`files.ts:653-715`).
- `platform` is always a root; the longest root wins.
- Never read: `node_modules`, `dist`, `build`, dot-folders (`files.ts:650,718`).
- File name `<path>.<kind>.yaml`. Only `script`, `connector` and `trigger_source` pair with a `.ts` (`:97`).
- YAML keys allowed: `key`, `path`, `title`, `schemaVersion` (required), `body` (required).
- Pages: `<path>.md` under `platform/docs`, or under `docs:` roots, which *replace* the default (`:43`). Docs pictures: `.png .jpg .jpeg .gif .webp .avif .svg` beside pages (`build.ts:94-144`).
- Path grammar: `manifest/envelope.ts:4`.
- `.platform/` holds `bundle.json`, `local.json`, `pulled.json`, `schemas/` and scratch files. Gitignore it.
- No `volvel.yaml` ships in any example.

**Code or files.**
- `volvel schemas [--dir]` writes `.platform/schemas/<kind>.schema.json` and `yaml.schemas` in `.vscode/settings.json`. If that file has comments it is left alone and the JSON to add is printed (`cli/schemas.ts`).
- Needs the `redhat.vscode-yaml` extension. Rerun after upgrading the CLI; schemas come from the CLI, not the instance.
- `doc` has no schema; tenant kinds do (`manifest/file-schema.ts`).
- Published schemas: `/schemas/files/*.schema.json`.
- Script files may import only `@volvel/sdk` and `node:` (`packages/compose/src/index.ts:165-179`).
- Console edits preserve comments and key order (`ontoWritten`, `files.ts:309`).
- Example: `/examples/higher-ed-devices` (code for logic, files for the rest).

**SDK** (`sdk/index.ts`, line numbers).

| Export | Line | What it is |
|---|---|---|
| `defineScript` | 243 | Typed function with zod in/out: uses, retries, concurrency, `worker` pool, `node` (a flow step) |
| `defineSchedule` | 321 | Cron starts a script |
| `defineTriggerSource` | 455 | `webhook` or `poll` code in front of a trigger |
| `defineWebhook` | 478 | HTTP request starts a script |
| `defineForm` | 520 | Served form starts a script |
| `defineConnector` | 573 | Custom adapter |
| `defineConnectionGroup` | 607 | Per-workspace members |
| `defineConnection` | 617 | Declared here, bound per workspace |
| `defineVariable` | 634 | Value per workspace, optional default |
| `defineQuery` | 665 | Saved SELECT |
| `defineEvent` | 684 | Event with a payload schema |
| `defineEventTrigger` | 709 | Event starts a script, CEL filter |
| `defineFlow` | 935 | Graph of `trigger.*` (728) and `step.*` (823) |
| `defineTable` | 1002 | Typed table |
| `defineDataSource` | 1030 | External database |
| `defineTheme` | 1072 | One per workspace |
| `defineApp` | 1140 | Exactly one of `source`, `interface`, `docs` |
| `defineInterface` | 1195 | No-code pages, v2 |
| `defineDashboard` | 1213 | Dashboard, v3 |
| `defineRole` | 1239 | Workspace role |
| `defineBinding` | 1284 | Grants a role |

- `trigger`: manual, schedule, webhook, form, event. `step`: script, set, branch, foreach, join, delay, approval, subflow, respond, fail.
- `column` (`sdk/tables.ts:161`): text, integer, number, boolean, timestamp, date, json, uuid, enum, enumList, reference, file.
- Also: `z`, `httpConnector`, `HttpError`, `oauth2Connector`, `smtpConfigSchema`, `SchemaError`, `isResourceDefinition`, `SDK_VERSION`, `CORE_RANGE`, everything from `@volvel/widgets`, and page/data types.
- `ScriptContext`: `sdk/context.ts:34`.
- No `defineDoc`, and no tenant kinds in the SDK: files only.

**Typed tables.** `ctx.table(orders)` infers `RowOf`/`InsertOf`. Client: `find/get/insert/insertMany/update/delete/aggregate/as(principalId)` (`sdk/tables.ts:59`). Without `.as()` a script sees every row. `find` default limit 50, max 1,000. Apps use a type-only import: `table` from `@volvel/app` plus `import type { orders } from "../../src/index.ts"` (`examples/acme/apps/portal/main.tsx`). Runtime constants must come from import-free files (`examples/fernhill/src/constants.ts`).

**Names and moves.** Set `key:` to the old path. The old path answers for 90 days with `Deprecation`, `Sunset`, `Volvel-Resource-Moved`. Text references that use a key are rewritten (`manifest/references.ts`). Tool name is `run_<path>` or `start_<path>`, `/` becomes `__`, `-` becomes `_`, cut at 64 (`manifest/bundle.ts:36`). Reserved: `get_run`, `get_flow_run`, `list_approvals`, `decide_approval`. Tables rename with `renamedFrom`; columns with `renamedFrom`.

**Run locally** (`cli/local.ts`). `volvel run <script> [--dir] [--input <json>]`. `.platform/local.json`:
`{"connections":{"shop":{"config":{"baseUrl":"…"},"credential":"…"}},"secrets":{},"variables":{}}`.
Variables fall back to their default. Events and tags are printed, not delivered. Tables, sources and files throw. Offline works for `init`, `build`, `schemas`, local `run`. Unit testing: the definition's `.execute(input, fakeCtx)` validates input and output (`sdk/index.ts:229-285`). No test harness package exists.

**Run remote** (`cli/cli.ts:771`). `volvel run <path> --remote --tenant --workspace [--input <json>|@file] [--script|--flow]`. Dev workspaces only. Uploads with `?preview=true`, then `POST test-runs`. Previews are removed after 7 days with their runs (`cp/kernel/execution/bundles.ts:192`). Needs `bundle:write`, `run:write`, `code:write` (plus `flow_run:write` for flows). `logs <id> [-f]` polls every 2s without the event stream and 15s at most with it (`cli/follow.ts:11`). `runs [id] [--script <path>]` lists 20. `runs cancel [--queued|--all] [--older-than <seconds>]`.

**Apps dev** (`cli/dev.ts`, `cli/apps.ts`). `volvel dev [app] [--port n]`, default 5174, next free port if taken. App name is optional with a single app. The repository must install `vite`; `@vitejs/plugin-react` and `@tailwindcss/vite` load automatically unless the app folder has its own `vite.config.*`. `/api` is proxied with *your* key; context is in `#vx-context`. Only TypeScript apps with `source`; file apps, interfaces and docs aren't served. Scripts and flows are not hot-reloaded: `dev` runs deployed ones.

**Deploy** (`cli/cli.ts:256`, `cp/kernel/execution/deploy.ts`).
- Flags: `--dir --tenant --workspace --allow-delete` (repeatable). No `--message`, though the API accepts one. No `--dry-run`.
- Not interactive: missing bindings are never prompted for. **Dev warns and deploys** (`deploy.ts:577`); production, and any promotion, refuses with `bindings_missing`. Always refused: `bindings_invalid`.
- Other refusals: `incompatible_bundle`, `rename_suspected`, `path_taken`, `kind_changed`, `assets_missing`.
- Atomic. Bundle limit 20 MB; sources dropped above 4 MiB; 5,000 assets.
- Triggers are paused in a new dev workspace (`cp/routes/workspaces.ts:252`).
- Build refusals: unexported definition, duplicate resource in code and file, tool-name clash, missing reference, bad CEL, docs errors.

**Promote** (`cli.ts:386`). `--preview --allow-delete --confirm-breaking`. The preview is a real run rolled back. Same digest, no rebuild. No CLI rollback for bundles: use the console or API.

**Pull** (`cli/pull.ts`). `--deployed` skips drafts; `--force`; exit 1 if any file was kept. State: `.platform/pulled.json`.

**Access** (`cli/access.ts`). `plan`, `release [--message] [--allow-delete <kind>/<key>]`, `pull`, `releases`, `approve|decline|withdraw <n> [--comment]`, `rollback <n>`, all with `--tenant` and `--dir`. Kinds and folders: `manifest/tenant.ts:79`. Export and import need `VOLVEL_EXPORT_PASSPHRASE`.

**CI.** `VOLVEL_URL`/`VOLVEL_TOKEN` secrets, service account with `deployer`; PR: `volvel build` and `volvel tenant plan`; main: `deploy` to dev, `promote --preview`, gated `promote`. Nothing in the repo contains such an example.

**Versions.** The instance checks the bundle's `core` range, taken from the repository's SDK, not the CLI. SDK 0.5.0 is `min 0.5.0, below 0.6.0`. Newer cores accept bundles back to `OLDEST_SUPPORTED_BUNDLE_CORE` 0.2.0 (`deploy.ts:151`; `manifest/bundle.ts:269`). Formats 1 to 4, oldest that fits. `build` makes no instance check.

**Errors.** 0 success; 1 `CliError`/`BuildError`/failed run/kept files/not ready; 2 unknown command or bad flags; 3 canceled run; 130 Ctrl+C while following (the run continues) (`cli.ts:920`, `follow.ts:157`). `logs` without `-f` on an unfinished run exits 0.

**Contributor** (distinct). Node 24, pnpm 9.15, Docker. `pnpm install`, `stack:up` (Postgres on 54329, SeaweedFS on 8333), `cp .env.example .env`, `pnpm dev` (8080), `dev:console` (5173, set `PUBLIC_URL`). `--profile sso` starts Keycloak (8180). `pnpm test`/`typecheck`/`docs:check`/`check:schemas`/`e2e`.

**Distribution.** Public (`release.yml`): widgets, markup, docs-engine, docs, ui, app, sdk, cli. Private: manifest, compose, nodes, db, worker, screens, widgets-core/labs. Publishing needs the `RELEASE_ENABLED` variable; there are no git tags. `release-check.mjs` says widgets "is not on npm yet at this version". I did not query npm.

## C. Gotchas

1. The first resource file (even one Markdown page) makes the bundle speak for **all** console resources; previously deployed ones not in the repository are deleted (`cp/kernel/authoring.ts:588`, `deploy.ts:340`). Pull first.
2. `pull --force` deletes every `.yaml`/`.ts` under `platform/` that the console lacks, including undeployed files you wrote and non-resource `.ts` (`pull.ts:57,127-132`).
3. `VOLVEL_URL` alone sends your saved token to that URL.
4. Building **executes** your repository code (`build.ts:374-385`), so top-level side effects run.
5. `run --remote` fails with 403 `console_code_off` if the tenant turned console code off (`cp/routes/authoring.ts:202`).
6. Only exports of `src/index.ts` count; colliding `export *` names cancel out.
7. One path namespace across all kinds.
8. Drafts carried by a pull are recorded in the gitignored `pulled.json`, so a CI deploy does not send them; the server still clears drafts whose content matches (`deploy.ts:752`).
9. `--input @file` works only with `--remote`.
10. `ignore` in `volvel.yaml` does not apply to tenant files (`access.ts:18`).
11. `tenant pull` never deletes files; `promote` acts on the bundle *active* in the source workspace, not your checkout.

## D. Docs wrong, stale or missing

- **README:** "at phase 6… Editing by end users is the next track"; the CHANGELOG is at phase 28. `alias platform=…` but then uses `volvel` (line 35). "The first deploy tells you… then deploy again" is true only of production. `packages/cli` is described as "build, deploy, run" only. No install path outside the monorepo.
- **sdk-guide:** contradicts itself on comments ("your comments… stay" against "comments in it are lost"); the code preserves them. "The build… prints a note": only `deploy` prints notes (`cli.ts:266`; `build` drops them). Dashboard example is `version: 2` fields inside `schemaVersion: 1`; the SDK emits v3 and schemas are v1 and v3. Says "phase 17" at the top. Tables "right for" code only, though a `table` kind file schema exists.
- **`init` closing line** omits installing the CLI and signing in.
- **`COMMAND_NOTES`** omit `schemas` and `tenant` for `--dir`.
- **Content stubs:** `tenant/repository.md`, `build/resources.md`, `build/extension-editor.md`, `start/account.md`, `tenant/service-accounts.md`.
- `docs/contracts/bundle.md` omits `sources` and `consoleSources`, and the core range.

## E. Likely bugs and open questions

1. **Local run ignores connector types:** always `sdk.httpConnector`, so smtp, oauth2 and custom connections get the wrong client (`local.ts:115`). `ctx.connections` (groups) is missing entirely, so a TypeError.
2. **Docs drafts can be lost:** `stem()` ignores `.md` (`pull.ts:68,191`), so a page *kept* here is still recorded as taken, and the next deploy clears the console's draft at that revision.
3. `pull` never removes deleted `.md` pages (`walk`, `pull.ts:57`), so a deploy resurrects them.
4. `promote` ignores `release.status: "failed"` (release branch push).
5. `--port abc` becomes NaN; `--version` is an unknown command (exit 2), and `<command> --help` is a flag error (exit 2).
6. `promote --preview` exits 0 with breaking changes; and there is no deploy preview at all. Intended?
7. Upload `fetch` failures in `uploadFiles` and `tenant export` surface as raw stack traces (`cli.ts:233,493`).
8. `pull` ignores `volvel.yaml` problems (`pull.ts:224`), while build refuses them.
9. Unverified: whether anything is on npm. `init`'s `^0.5.0` fails if not. No `--json` output or profiles: planned?

## F. Tutorials and examples

1. **First script, end to end**: init, `local.json`, deploy to dev, promote. Shop connection from `examples/acme/src/index.ts` (`orders/sync`); tested locally in `cli/example.test.ts:650`.
2. **Flow remote loop**: `greet`/`welcome` fixture, `cli/remote.test.ts:43-77`, `run welcome --remote`.
3. **Code and files split**: `examples/higher-ed-devices` (variable, schedule, app YAML with comments).
4. **Repository with `roots: [src]`**: `cli/build.test.ts:418`.
5. **Rename with `key`**: `cli/build.test.ts:269,304`.
6. **Round trip**: console draft, pull, edit, deploy (`cli/remote.test.ts:269-352`).
7. **App against real data**: acme portal with `volvel dev portal`.
8. **Access as code with approval**: `tenant/` from higher-ed-devices, `cli/access.test.ts:92-185`.
9. **GitHub Actions**: to be written.
10. **Unit test with `.execute()`**: to be written.
11. **Full walk**: `examples/fernhill` (`setup/setup.mjs`, section "Ship a change as Devi").
