# Findings: published apps, apps as code, @volvel/app, sessions and addresses

Settled from the code at `270e509` (pinned tree `tree29`). Nothing was changed on any instance. Every item below was proved from the code path, and the regex items were also run in node. No row is a working exploit.

## Rows

### APP-01 `useRun` hangs for a member who may read runs in another workspace
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** apps/control-plane/src/routes/stream.ts:50-75; apps/control-plane/src/kernel/stream.ts:201-215; packages/app/src/hooks.ts:130-150
- **Evidence:** `own` is set only when `may.size === 0`. A member with `run:read` in any other workspace of the tenant gets `may` non-empty and `own` unset. Events of their own runs in the app's workspace then match neither branch of `#deliver`, so none is sent. The stream is "connected", so `useFollowed` stops polling and never learns the run ended. `useFlowRun` fails the same way with `run:read` but no `flow_run:read`. `runScript` survives only because of its own look every few seconds.
- **Fix:** subscribe a person to their own runs in every workspace where they lack the read (set `own` as well as `may`, and have `#deliver` fall through to the `own` test when `may` does not allow). Siblings: `useFlowRun`, `runStream`, the MCP run reads. Test first: a stream test with a member holding `run:read` in workspace B who starts a run in A and must receive its events.
- **Size:** S. **Milestone:** M11

### APP-02 `runScript` / `runFlow` for a guest starts a run and then fails with 401
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** apps/control-plane/src/routes/execution.ts:1432-1440; routes/flows.ts:1158-1166; routes/stream.ts:68-78
- **Evidence:** The "may always read a run you started" test needs `principal.id !== null`. A guest has a null id, so the read falls to `authorize("run:read")`, which answers 401. A run started by `anonymous` therefore cannot be read back by the one who started it. The stream also refuses guests. The client throws instead of returning, though the run went on.
- **Fix:** either refuse the start for a guest (clear error, 403 on `POST runs` for `anonymous`), or give the run a short-lived token the guest reads with. Also state it in app-client docs. Siblings: flow runs, `useRun`, `useFlowRun`. Test first: an `anonymous` binding with `run:write`, start a run, read it.
- **Size:** M. **Milestone:** M11. See Owner decides 1.

### APP-03 "Open to" shows raw principal types for end-user groups and service accounts
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** apps/control-plane/src/routes/apps.ts:293-330, 386-398
- **Evidence:** The query joins member, end_user and principal_group only. An `end_user_group` or `service_account` binding falls to the last branch and prints its type name, in the list and the inspector.
- **Fix:** join `end_user_group` (name) and the service account table, in the route that builds `access`. Better to return `{kind, label}` so the screen can also tell a group from a person. Siblings: Share sheet's `principalLabel`, Access screen. Test first: route test with one binding of each principal type.
- **Size:** S. **Milestone:** M5

### APP-04 Unhashed names get one-year immutable caching
- **Outcome:** reproduced (the regex, run in node)
- **Severity:** broken
- **Where:** apps/control-plane/src/kernel/apps/front.ts:113, 1045
- **Evidence:** `apple-touch-icon.png` and `logo-horizontal.svg` match; `favicon.ico`, `app.min.js` and `inter-regular.woff2` do not. Any name with a hyphen or dot followed by 8 or more letters, digits, `-` or `_` is treated as hashed. After a redeploy that changes such a file, a browser keeps the old one for a year and never asks again.
- **Fix:** the platform knows the file's SHA-256. Serve immutable only when the name carries a prefix of that digest, or when the build tool's hash shape matches exactly (`-` plus 8 base64url characters before the extension, with at least one digit or capital), and else `no-cache`. Siblings: docs-app assets, tenant icons. Test first: a file named `logo-horizontal.svg` answers `no-cache`.
- **Size:** S. **Milestone:** M11

### APP-05 Asset path pattern refuses `_`- and `.`-prefixed names, and spaces
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** packages/manifest/src/bundle.ts:74; packages/manifest/src/bundle-check.ts:~440
- **Evidence:** Each segment must start with a letter or digit. `.well-known/…`, `_commonjsHelpers-*.js` style chunks that Rollup can emit, and files from `public/` with a space or non-ASCII name make the whole deploy fail. `_` at the top is reserved by the platform, so a refusal of that prefix is intended; refusing `_` inside a name segment is not.
- **Fix:** the pattern, shared with the CLI's check and the server. Allow a leading `_`/`.` in non-first segments (or at least `.well-known`), keep the top `_/` reserved, and make the CLI error name the file and the rule and say how to rename it (Vite `build.rollupOptions.output`). Test first: bundle with `assets/_chunk.js` and `.well-known/x` is accepted.
- **Size:** S. **Milestone:** M11

### APP-06 SDK `ThemeToken` lacks eight tokens the schema accepts
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** packages/sdk/src/index.ts:1037-1056 against packages/manifest/src/kinds.ts:1233-1262
- **Evidence:** structure, raised, selected, line-strong, line-control, ink-subtle, code-bg and focus are in `THEME_TOKENS` but not the SDK type, so `defineTheme` cannot set them without a cast.
- **Fix:** derive `ThemeToken` from `THEME_TOKENS`. Test first: a type test that the two lists are equal.
- **Size:** S. **Milestone:** M11

### APP-07 Inspector links a disabled hostname; the list does not
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** apps/console/src/screens/Apps.tsx:439-443, 517
- **Evidence:** The inspector row is labelled "Hostname (off)", so it is honest. The link goes nowhere, which is mild. A tidy-up: show it as text, not a link, when off.
- **Fix:** none required; optional S change in the same `external()` call.
- **Size:** S. **Milestone:** M5

### APP-08 A docs app with `published: false` is still listed with a live link
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** apps/control-plane/src/routes/apps.ts:269-398 (no `published` filter or flag); front.ts:873 (answers "Nothing here")
- **Evidence:** The portal home skips it (front.ts:782), the console list does not, and the link answers missing.
- **Fix:** return `published` in the list and show a "Not published" tag with no link. Test first: list route returns the flag.
- **Size:** S. **Milestone:** M5

### APP-09 Portal home lists code apps that answer 503
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** apps/control-plane/src/kernel/apps/front.ts:755-790, 886
- **Evidence:** The portal query selects every app resource in a production workspace and checks only `app:read` and `published`. A repository app on an instance with no apps address answers 503 on its link.
- **Fix:** skip code apps (or tag them) when the instance cannot serve them, with the same test `serveApp` uses. Test first: a portal listing on an instance without an apps address.
- **Size:** S. **Milestone:** M5

### APP-10 In `volvel dev`, `signInUrl` returns to the instance and `logoUrl()` is not null without a logo
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** packages/cli/src/dev.ts:41-49; packages/app/src/client.ts:536, 555
- **Evidence:** The dev context's `portal` is the instance's absolute address and `tenant.logo` is unset, and `logoUrl()` returns null only for an explicit `false`. After sign-in the person lands on the instance, not on localhost.
- **Fix:** put the real `logo` flag in the dev context (the instance knows it), and have the dev server accept the return to its own origin. Test first: dev context has `logo`.
- **Size:** S. **Milestone:** M11

### APP-11 Sharing is sequential with no rollback
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** apps/console/src/screens/Apps.tsx:230-260
- **Evidence:** One POST per binding, and ones already held are skipped, so pressing Share again completes a half-done grant. Stop sharing deletes in a loop with the same property. The error text shows the failure. A partial state is visible in the list.
- **Fix:** none beyond APP-12. Optional: say "some of the access was given" in the error.
- **Size:** S. **Milestone:** M5

### APP-12 Stop sharing removes table bindings that another app needs
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** apps/console/src/screens/Apps.tsx:192-216
- **Evidence:** `theirs` collects every resource binding of the same principal and role on this app's tables and deletes them. A second app that reads the same table for the same audience loses it, with no word in the confirmation (which counts only this app's tables). Phase 12 decided the confirmation and the count, not the loss.
- **Fix:** before deleting a table binding, keep it when another app of the workspace that reads that table (code `reads`, or builder widgets) is shared with the same principal and role; say "kept for N other apps" in the confirmation. Sibling: any other screen that removes bindings with an app. Test first: two apps, one table, Stop sharing on one keeps the table binding.
- **Size:** M. **Milestone:** M5

### APP-13 A tenant that disables an operator-enabled hostname cannot enable it again
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** apps/control-plane/src/routes/apps.ts:855-860; apps/console/src/screens/Domains.tsx:34, 289
- **Evidence:** Enabling an unverified name needs `instance:write`. A network-only hostname an operator enabled shows a Disable button to the tenant; after pressing it, Enable answers 409 `domain_not_verified`, and only an operator can restore it. The screen's text tells them to ask an operator, but not before the Disable.
- **Fix:** the shared piece is the domain route's check. Record that an operator enabled it (`enabled_by_operator`, or reuse the audit `unverified`), and for the tenant either hide Disable or allow re-enable of such a name. Test first: route test, tenant disables then enables an operator-enabled unverified name.
- **Size:** M. **Milestone:** M5. See Owner decides 2.

### APP-14 "Open to" ignores workspace-level and tenant-level bindings
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** apps/control-plane/src/routes/apps.ts:322-330 (`scope_type = 'resource'`); Apps.tsx:126-128
- **Evidence:** An app reachable through a binding at the workspace or tenant shows "Staff only", even when that binding is `anonymous`. The screen says less than the truth about who can open it, in the direction that hides exposure.
- **Fix:** list broader bindings with the scope named ("everyone in this workspace" ...) in the same `access` field and in the Share sheet as read-only rows. Test first: a workspace-level `anonymous` `app:read` binding.
- **Size:** M. **Milestone:** M5 (reported to M1 as an exposure the owner cannot see).

### APP-15 An address with a dotted last segment answers 404 instead of the app
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** apps/control-plane/src/kernel/apps/front.ts:977-980
- **Evidence:** The page fallback applies only if the last segment has no `.ext`. `/users/j.smith` or `/files/report.v2` is a screen of the app but gives 404.
- **Fix:** answer the page when no file matches and the request accepts HTML (`Accept: text/html`, as most SPA hosts do). Test first: `GET …/users/j.smith` with `Accept: text/html`.
- **Size:** S. **Milestone:** M11

### APP-16 `principal.groups` is empty for members in code apps
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** apps/control-plane/src/kernel/apps/front.ts:1027-1031
- **Evidence:** Groups are filled for `generated` (builder) apps only, so the same `useSession()` differs by how the app was built, and the SDK says nothing of it.
- **Fix:** fill them for code apps as well, since they are already given to an end user in either kind. Test first: front context for a code app and a member in a group.
- **Size:** S. **Milestone:** M11

### APP-17 Unreferenced app files are never collected
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** docs/phases/phase-6-apps.md:86
- **Evidence:** Stated in the phase as a decision to defer. Storage grows with each deploy that changes files. No fault of correctness.
- **Fix:** see Owner decides 3.
- **Size:** M. **Milestone:** M2

### APP-18 Gotchas that are by design
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** inventory (C) 1, 2, 4, 5, 9, 10, 11
- **Evidence:** No CSP in dev, row rules unexercised by a developer, `<base>` and `href="#"`, `signOut()` leaving a console session, operator grants not counting at app addresses (kernel/apps/front.ts:982 comment), widget approvals only in the console, shared origin of tenants at one APPS_URL (decision 0007). Each is stated in the code or a decision. They belong in the pages as warnings, not in fixes. The dev-server CSP is a missing part (see below).

### APP-19 Documentation errors listed in section D
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** docs/self-hosting.md:407, 415, 418; docs/phases/phase-6-apps.md:150-152; README.md:52; docs/sdk-guide.md
- **Evidence:** Line 407 says "The one app" and omits portal hostnames. 418 says the guest limit is in each replica, but the API limit is counted in Postgres. 415 names `portal_user` only. Phase 6 uses the old npm scope. README says "the workspace's Apps tab". The sdk guide has no code-app section. All as reported.
- **Fix:** the new pages carry the truth; edit those sources when they are replaced by links.
- **Size:** S. **Milestone:** M11

## Missing parts

1. **Dev server enforces the app CSP** (inventory C1). The API: `APP_POLICY` (front.ts:86). Control belongs in `volvel dev` (an `--strict` default on). Siblings: none. Permission: none. Size: S.
2. **Share sheet offers single people, service accounts and custom roles.** The API takes any principal in `POST bindings` (routes/bindings). Belongs in the Share sheet's "Share with". Siblings: Access screen. Permissions: `binding:write`, `role:read`. Size: M.
3. **Console list: sort, filter, search, and Unpublish/Delete of an app.** The manifest has `published` for docs apps; the screen has no control. Siblings: other resource lists. Permissions: `app:read` / `bundle:write`. Size: M.
4. **Workspace- and tenant-level bindings in Open to and Share** (see APP-14). Size: M.

Four missing parts: S, M, M, M.

## Owner decides

1. **Guests starting runs.** Should a guest be able to start a script or flow from an app? Options: (a) no, refuse the start; (b) yes, with a run token returned to the starter; (c) yes, fire-and-forget with no result. Recommend (a) for scripts, (c) documented for forms.
2. **Who may re-enable an operator-enabled hostname?** Options: tenant may re-enable what an operator enabled; or the Disable button is hidden for it. Recommend the first.
3. **Unreferenced files.** Collect on deploy after N days, or leave until the tenant goes? Recommend a sweep (M2), with a count in Published apps.
