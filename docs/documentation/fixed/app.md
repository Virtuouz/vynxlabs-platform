# Fixed: lane app

Tests named below were each seen failing on the code before the change. Typecheck (`tsc -b`, and `-p apps/console`) passes. `docs-apps.test.ts` "is refused when a page takes one of the product's own terms" fails in this worktree before and after (it needs the console's built `dist/help`); not touched.

## APP-01 A member follows their own runs in a workspace where they may not read runs
- **Commit:** "a member follows the runs they started in a workspace where they may not read runs (APP-01)".
- **Changed:** `routes/stream.ts` sets `own` for every principal with an ID, not only when `may` is empty, and `ownOnly` for the old case (two streams); `kernel/stream.ts` `Subscriber.ownOnly`, `#deliver` sends what `may` allows, else the principal's own runs.
- **Test:** `stream.test.ts` "a member who may read runs in another workspace still follows their own (APP-01)".
- **Siblings:** `useRun`, `useFlowRun` and `runStream` all read this one stream; the MCP run reads do not use it. `GET runs/:id` already allowed the starter.
- **A person sees:** an app's `useRun` finishes for a member who reads runs in some other workspace.

## APP-02, D39 A guest cannot start a script or a flow
- **Commit:** "a guest is refused when starting a script or a flow (APP-02)".
- **Changed:** `kernel/errors.ts` `guestStart`; `routes/execution.ts` (`POST runs`) and `routes/flows.ts` (`POST flow-runs`) answer 403 "Sign in to start a script/flow..." after the permission check. Forms of pages still start runs (`kernel/pages/act.ts` untouched).
- **Test:** `apps.test.ts` "a guest may not start a script or a flow, since they could never read the run (APP-02)" (was 201).
- **Siblings:** rerun and retry routes need an existing run a guest cannot read; not changed.
- **Left for the writing phase:** say in the app-client page that `runScript` and `runFlow` need a signed-in person.

## APP-09 The portal home lists no code app the instance cannot serve
- **Commit:** "the portal home lists no code app the instance cannot serve (APP-09)".
- **Changed:** `kernel/apps/front.ts` `openableApps` skips apps that are neither interface nor docs when `kernel.hosts.runsCodeApps(place)` is false (the test `serveApp` uses).
- **Test:** `apps.test.ts` "lists the apps that can be opened, and not the code apps that answer 503 (APP-09)".

## APP-03, APP-08, APP-12, APP-14 Open to, unpublished docs apps, Stop sharing
- **Commit:** "Open to names every kind of principal and broader bindings, an unpublished docs app has no link, and Stop sharing keeps tables another app needs (APP-03, APP-08, APP-12, APP-14)".
- **Changed:** new `kernel/binding-labels.ts` `principalLabel`, used by `routes/apps.ts` (list) and `routes/permissions.ts` (bindings): end-user groups and service accounts are named. The apps list gains `published` and `broaderAccess` (`[{scope: "workspace"|"tenant", label}]`: bindings at the workspace or tenant to anyone, end users or an end-user group whose role holds `app:read`). Console `screens/Apps.tsx`: "Open to" and the inspector name them, "(whole workspace)", "(whole tenant)", and warn when anyone; "Not published" tag with no link and no "Open the live app"; Share sheet shows them as read-only rows; Stop sharing keeps a table binding when another app that reads that table is shared with the same principal and role, and the confirmation says "N table stays, for K other app that uses it: names".
- **Tests:** `apps.test.ts` "names groups of end users and service accounts, and the broader bindings that reach the app (APP-03, APP-14)"; `docs-apps.test.ts` "a docs site that is switched off" (`published`); `Interfaces.test.tsx` "stopping to share an app keeps the tables another shared app reads, and says so (APP-12, APP-14)" (timed out before).
- **Siblings:** Access screen uses the bindings route (now shares the label code). Other screens that remove bindings with an app: none found. `Interfaces.test.tsx` "widgets are added and removed..." times out in this worktree under load and alone; it does not touch these files.
- **A person sees:** Open to says "customers" rather than "end_user_group", and "anyone (whole workspace)" where a broader binding exposes every app. Screens to walk: Apps list and inspector (unpublished docs app, public by a workspace binding), Share sheet, Stop sharing confirmation, at 1440/768/390, light and dark, keyboard, reload. States: list empty; Share sheet with only broader rows; Stop sharing kept/not kept. Copy: "may open every app of the whole workspace", "under Access" (where to change it).
- **Left out:** the Share sheet does not yet list single people, accounts or custom roles (Missing parts 2 to 4 of the findings).

## APP-04, APP-15, APP-16 Cache of unhashed names, a screen with a dot, groups in code apps
- **Commit:** "only hash-shaped names are kept for a year, a screen with a dot answers the page, and a member's groups reach code apps (APP-04, APP-15, APP-16)".
- **Changed:** `kernel/apps/front.ts`: `isHashedName(path, sha256)` (name holds the first 8 hex of the digest, or `-`/`.` plus exactly eight `[A-Za-z0-9_-]` with a digit or capital) replaces `HASHED_NAME`; `isPage` is also true when `Accept` has `text/html` and no file matches; `memberGroups` is no longer limited to generated apps.
- **Tests:** `apps.test.ts` "files come with their type, hashed ones may be kept, and a screen of the app gets the page" (`logo-horizontal.svg` answered immutable; `users/j.smith` 404); "a member's groups reach an app written as code (APP-16)" (was `[]`). The fixture app gained three files, so counts there changed.
- **Siblings:** docs-app assets and tenant icons never used the regex (only `serveApp` did).

## APP-05 File names that start with a dot or an underscore
- **Commit:** "an app's files may start with a dot or an underscore, and a refused name says how to rename it (APP-05)".
- **Changed:** `packages/manifest/src/bundle.ts` `ASSET_PATH_PATTERN` (a part may start with one `_` or `.` followed by a letter or digit; `.` and `..` still refused; `_/` still reserved) and `assetPathProblem`; used by `bundle-check.ts` and by the CLI build (`packages/cli/src/apps.ts`), which names the file, the rule and `build.rollupOptions.output`. `schemas/bundle.schema.json` and `docs/contracts/bundle.md` updated. Old bundles stay valid; an old server refuses the new names.
- **Tests:** `apps.test.ts` fixture files `.well-known/assetlinks.json` and `assets/_commonjsHelpers-9f8e7d6c.js` deploy and are served (the old pattern refuses both, checked in node); `bundle.test.ts` "the names of an app's files (APP-05)".
- **Left out:** spaces and non-ASCII names are still refused (with the new message); serving them needs an encoding decision.

## APP-06 The SDK's ThemeToken
- **Commit:** "the SDK's ThemeToken has every token the schema accepts (APP-06)". `packages/sdk/src/index.ts` lists the eight missing tokens (the SDK does not depend on the manifest package, so the list stays written out). **Test:** `packages/manifest/src/theme-tokens.test.ts` compares the SDK's union with `THEME_TOKENS`.

## APP-10 `volvel dev`
- **Commit:** "in volvel dev the sign-in returns to the dev server and the context says whether there is a logo (APP-10)".
- **Changed:** `packages/cli/src/dev.ts`: the context's `tenant.logo` is read from the instance (`HEAD portal/logo`); `portal` is `/portal/<slug>`, which the dev server proxies to the instance (with the instance as `Origin`), so sign-in returns to localhost.
- **Test:** `example.test.ts` "dev serves an app from its source..." (context has `logo: false`, `portal: "/portal/acme"`, and the proxied sign-in page answers). Failed before.
- **Left out:** end-user sign-in in dev does not change the API calls, which carry the developer's key.

## APP-13, D48 A tenant may enable again a hostname an operator enabled
- **Commit:** "a tenant may enable again a hostname an operator enabled (APP-13)".
- **Changed:** migration `0090_app_operator_enabled.sql` (`app_domain.enabled_by_operator`, set for names already enabled and unverified); `routes/apps.ts` PATCH: an operator enabling an unverified name marks it, an operator disabling clears the mark, the tenant may enable a marked name. `packages/db/src/schema.ts`.
- **Test:** `apps.test.ts` "a hostname of the tenant's own" (tenant disables, enables; after an operator disables, the tenant gets 409). Failed before.
- **Left out:** the Domains screen still says "ask an operator" only after a refusal, and the API does not show the mark; no console change was needed for the fix.

## APP-17, D40 Files no app names are swept
- **Commit:** "files no bundle that can be deployed names are swept after a deploy (APP-17)".
- **Changed:** `kernel/apps/assets.ts` `sweepAppFiles`, `sweepDueAppFiles`, `appFilesDue`, `touchAssets`: a deploy marks its tenant; the one-minute background sweep removes files older than 7 days that neither a workspace's active bundle nor any bundle of the last 7 days names (row first, then the object). Uploading a bundle makes the files it names young again. `kernel/execution/deploy.ts`, `bundles.ts`, `background.ts`.
- **Test:** `apps.test.ts` "files no app names any more (APP-17)".
- **Left out:** the count in Published apps from the finding's recommendation; redeploying a bundle older than a week needs its files uploaded again (the CLI does this). The sweep and the storing of a bundle take one per-tenant advisory lock, and the sweep removes objects only after its transaction commits; test "a bundle stored while the files are swept (APP-17)" (failed without the lock).
- **Lines for the docs:** "Files an app no longer names are removed a week after the deploy that stopped naming them."
