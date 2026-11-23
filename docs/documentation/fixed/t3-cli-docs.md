# Fixed: lane t3-cli-docs (CLI, local development, docs engine, written policy)

No migration. One contract added: `GET .../deployment-preview` and a `message` on `POST .../promotions` (additive; old CLIs and bundles work). No kind schema, bundle format or worker route changed, so `schemas/` is unchanged. Paths: `CLI/` = `packages/cli/src/`, `CP/` = `apps/control-plane/src/`. The new behavior of each row did not exist before, so its test fails on the earlier code at the first line (an unknown option, command or route); the ones that replace something are said so.

## CLI-MP1 `deploy --preview`
`CLI/cli.ts` `deploy`: builds, uploads files, stores the bundle as a preview bundle (`?preview=true`, never offered for deploying, removed after a week), asks the new `GET {workspace}/deployment-preview?bundleId=&allowDelete=` (`CP/routes/execution.ts`, access `deployment:write`), prints counts and changes, says nothing was changed. A refusal prints "It cannot be deployed." with the server's reasons (exit 1). The route runs `previewDeployment` (`CP/kernel/execution/promote.ts`, beside `previewPromotion`): the console resources are kept as a deploy does, the deploy is carried out in a transaction and taken back.
Tests: `CLI/release.test.ts` "deploy --preview says what would change ... (CLI-MP1)"; `CP/release.test.ts` "looking before deploying" (a dev deploy's warnings, production's `bindings_missing` as `possible: false`, no deployment made, 403 without `deployment:write`).
Siblings: `promote --preview` unchanged. `run --remote` also stores preview bundles. Left out: the files of an app are still sent first (they are content-addressed and change nothing running).

## CLI-MP2 `--message` on deploy, promote, rollback
`CLI/cli.ts` `messageFor`: `--message`, else, when `CI` is set and not `false`/`0`, the subject of `git log -1` in `--dir` (cut at 500). `POST .../promotions` takes `message` (`CP/routes/execution.ts`; `promote()` passes it to `deployBundle`, which already kept it). `promote` takes `--dir`. Tests: `CLI/release.test.ts` "--message is kept ... in CI the last commit's subject" and "promote --message ..."; `CP/release.test.ts` "promoting" (the production ledger holds "Ship it").

## CLI-MP3 `volvel rollback <version>`
The API takes it: `GET bundles` lists versions with `active`, `POST deployments` with an earlier `bundleId` (the route's own description says so). `CLI/cli.ts` `rollback`: unknown version says which exist; the running one says nothing was changed; default message "Went back to version N". Console resources stay as they are (`keepConsoleManaged`). Test `CLI/release.test.ts` "rollback puts an earlier version back ...". Left out: only the newest 100 versions are listed by the API; an older one says "no version N among its newest 100".

## CLI-MP4 `entry` and `resources`
`--entry <file>` / `--resources <folder>` on build, deploy, run (local and `--remote`), dev; `entry:` and `resources:` in `volvel.yaml` (`packages/manifest/src/files.ts` `RepositoryConfig`, `parseRepositoryConfig`); a flag wins. `CLI/build.ts` `placesOf` is the one place the three are resolved (`buildRepository`, `appSources`). `pull` takes `--resources` and `volvel.yaml`'s (`CLI/pull.ts`). Test `CLI/release.test.ts` "the entry file and the console's folder ..."; `files.test.ts` updated for the key list. Left out: Git sync on the server (`kernel/git.ts`) reads `volvel.yaml` for `roots`/`ignore`/`docs` only; it does not use `entry` or `resources` (it has its own folder setting).

## CLI-MP5 `@volvel/sdk/testing`
`packages/sdk/src/testing.ts`, exported as `./testing`: `runScript(script, input, options)`, `testContext(options, declared)`, `memoryTable(rows)`. Holds a script to its declarations with the worker's words ("The script did not declare the secret ..."), checks input and output, records logs, events, tags and files. Test `packages/sdk/src/testing.test.ts` (4). "Local run parity": the key parity with the worker's context was done by clirel (`local.test.ts`); the local run is unchanged here. Left out: a run in the CLI does not use this harness (it needs real bindings from `local.json`); tables, sources and files are still "not local" there.

## CLI-MP6 `--json`, logout, profiles
`--json` on whoami, status, runs (list and one), deploy (and `--preview`), promote (and `--preview`), rollback: one JSON document on stdout, no other line; warnings stay on stderr. `volvel logout` removes the saved sign-in. `--profile <name>` (any command) or `VOLVEL_PROFILE` keeps another sign-in in `profile-<name>.json` beside `config.json`; `volvel profiles` lists them (`settingsPath` in `CLI/cli.ts`). Test `CLI/release.test.ts` "--json gives one JSON document ..." and "profiles keep several sign-ins; logout removes one". Not changed: `login --json`, `logs` (a stream), `init`.

## APP-MP1 `volvel dev` enforces the app CSP
`APP_POLICY` moved to `packages/manifest/src/app-policy.ts` (`appPolicy()`, `APP_POLICY`); `CP/kernel/apps/front.ts` imports it, so the two cannot differ. `CLI/dev.ts`: strict by default: the same policy with a per-run nonce on `script-src` (Vite's `html.cspNonce` puts it on its inline scripts) and `ws://localhost:*` (and 127.0.0.1, ::1) on `connect-src` for reload. `--no-strict` turns it off and says so. Test `CLI/example.test.ts` "dev serves an app ..." (policy header, nonce on the page, none with `strict: false`); its context regex now allows the nonce attribute. Walk: `volvel dev` on Fernhill's front desk app in a browser, console clean at 1440 (not run: no browser here).

## DOC-MP2 `since`
Served docs pages (`CP/kernel/apps/docs.ts` `docPage`): "New in version X" under the description. Help panel (`apps/console/src/help/HelpPanel.tsx`): the same line above the page. Tests: `CP/docs-apps.test.ts` "a page is drawn from its tree" (the returns page has `since: "0.4"`), `help/Help.test.tsx` "a page says which version brought what it describes" (failed before). No product page sets `since` yet: see Docs lines.

## DOC-MP3 section hits in the panel's search
`help/content.ts` `searchHelp` now uses `PageIndex.grouped`; `HelpPanel.tsx` `Results` shows each page with up to three places (a heading, or a passage with the asked words in bold) that open the page at that heading. Test `Help.test.tsx` "a search shows the headings and passages that matched ...". Siblings: the console has no other reader of `searchHelp`. The docs apps' own search already used `grouped`.

## DOC-MP4 package exports
`packages/docs/package.json`: `./fields.json`, `./assets/*` (dist/assets), `./openapi.json` (generated/openapi.json, written by the API generator, which needs a database, so it is absent from a plain checkout). Test `packages/docs/src/exports.test.ts`.

## D53 tenant access in YAML only
Verified, not built: every kind of access (group, end_user_group, service_account, tenant_role, tenant_binding) has a file schema and `volvel schemas` maps it; the SDK has no `define` for them. Test `CLI/schemas.test.ts` "a tenant's access is written in YAML only ...". The documented API script is page content (Docs lines).

## D51, D62
`SECURITY.md`: "Supported versions" (the newest minor and the one before; first public release date not set); the 7 days of a member's console session, 30 days of an end user's and 12 hours of a member at an app's address. `CONSOLE_SESSION_DAYS` in `CP/config.ts` is passed to the authentication library as `expiresIn` (was its default, 7 days). Test `CP/console-session.test.ts` (the session expires 7 days out; SECURITY.md says so).

## D37 `labs/goal` becomes `core/goal`
The definition and view are in `packages/widgets-core` (`src/index.ts`, `views/goal.tsx`, last of `CORE_WIDGETS` so "Add to page" keeps its order); its test moved to `widgets-core/src/goal.test.tsx` (the package gained the test dev dependencies; `pnpm-lock.yaml` edited by hand to match, `pnpm install --frozen-lockfile --offline` accepts it). `widgets-labs` now holds `labs/probe`, for tests of the contract only, and ships nowhere: removed from the manifest's registry (`page.ts`), the served runtime (`packages/screens/runtime/main.tsx`), the console's `PACKS`, and from those packages' dependencies. Renamed `labs/goal` to `core/goal` in the console (`selectorData`, `InspectorHost`, `registerCharts`, `goalDrawer`), Fernhill (`operations.ts`, `apps.ts`, README), e2e (`phase-25`, `phase-28`), and the registry test. Pages saved with `labs/goal` are not read: no back-compat owed (D37). Tests: `widgets-core/src/goal.test.tsx`, `widgets-labs/src/probe.test.tsx`, `screens/src/types.test.ts`, `charts.test.tsx`.
Likely to conflict with lane t3-widgets: `widgets-core/src/index.ts`, `registerCharts.ts`, `goalDrawer.tsx`, `selectorData.ts`, `charts.test.tsx`.

## Not mine, or not done
- D60 (publish the widget contract page, marked for contributors) and the written parts of D51/D53: page content under `packages/docs/content`.
- CLI-MP7 `volvel dev` for file apps, interfaces and docs: the row says "decision if wanted"; there is no answer in decisions.md. Asked, not built.
- 30-M items: none in this lane.

## Docs lines (for the integrator; I did not edit `packages/docs/content` or `CHANGELOG.md`)
- CLI page: `deploy --preview`, `--message` (and the CI default), `rollback <version>`, `--json` on whoami, status, runs, deploy, promote, rollback, `logout`, `profiles` and `--profile`/`VOLVEL_PROFILE`, `--entry`, `--resources` and the `entry`/`resources` keys of `volvel.yaml`, `dev --no-strict`. The command list is drawn from `commands.ts`, which says all of it.
- API: `GET deployment-preview`; `message` on `POST promotions`.
- Writing scripts: `@volvel/sdk/testing` (`runScript`, `testContext`, `memoryTable`).
- Writing an app: `volvel dev` serves under the content policy; what it refuses in a browser's console is what a deployed app would refuse.
- `build/writing-a-widget.md`: `labs/goal` is now `core/goal`, in the core pack; labs holds a test-only widget. Its lines 6, 27, 97, 155 name `labs/goal`.
- Product pages may now set `since:`; none do.
- Tenant access page: a script for the API (the `tenant release` flow in plain `curl` or Node), D53. Widget contract page: mark it for contributors, D60.
- CHANGELOG: sessions say 7 days; `labs/goal` renamed `core/goal`; the new commands and flags.

## Found
- `apps/console/src/help/Help.test.tsx` "/t/acme/workspaces/dev/dashboards/sales has the help data-dashboards-editor" fails on the phase branch (gets `data-dashboards`). Not touched.
- `packages/manifest/src/theme-tokens.test.ts` fails (`ThemeToken` in `packages/sdk/src/index.ts` is now `(typeof THEME_TOKENS)[number]`, so the test's regex finds no names). Not touched.
- `packages/docs` `pnpm check` says `reference/index.md` lists "api", which only exists after the API generator ran with a database. Not touched.
- Git sync (`kernel/git.ts`) does not read `entry` or `resources` of `volvel.yaml` (see CLI-MP4).

## Screens to walk
Help panel (any screen's Help): a search with results shows places under pages, Tab reaches each, Enter opens the page at the heading; a page with `since` shows "New in version X"; at 390 and 1440, light and dark. Served docs page with `since`. `volvel dev` in a browser (APP-MP1). Drawer of a Goal widget and Add to page: Goal is still offered under "Understand data" with no "Labs" tag.
