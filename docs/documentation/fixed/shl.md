# Fixed: lane shl (console shell and Start)

Paths: `C/` = `apps/console/src/`, `S/` = `apps/control-plane/src/`. No migration. No contract file changed: the two tenant responses gained `mayRename` (SHL-11), and `schemas/` and `docs/contracts/` do not describe them. Each row's commit is the one named `(SHL-xx)` in `git log`.

Tests: `S/preferences.test.ts`, `S/tenant-list.test.ts`, `C/Session.test.tsx`, `C/DataTable.test.tsx`, `C/CommandPalette.test.tsx`, `C/Shell.test.tsx`, `C/TenantScreens.test.tsx`, `C/Approvals.test.tsx`, `C/App.test.tsx`. Typecheck (`tsc -b`, ui, screens, console) is clean.

## SHL-01, SHL-12 preference keys
`S/routes/preferences.ts:16-17`: `PREFERENCE_KEY` now allows `terms.underline` and `palette.pins:none`. Test `every key the console passes to usePreference is one the server keeps` reads the console source and PUTs each key; it failed on exactly those two. Siblings: every `usePreference`/`useKeptChoice` call (scanned by the test). Seen: the choice and pins now survive a reload. Gate: states and lifecycle unchanged; no copy.

## SHL-15 suspended member's tenant list
`S/routes/tenants.ts` `GET /tenants` member branch adds `suspended_at is null`. Test `a member suspended in a tenant does not see it in the tenant list`. Siblings listed from `tenant_member` reads: `S/routes/apps.ts:985`, `worker.ts:188`, `preferences.ts:159`, `identity.ts:585,933`, `search.ts:361`, `permissions.ts:1090` are membership checks, not lists, and were left (suspension is not what they answer). Not changed: whether `identity.ts:933` (members' tenants in the instance member list) should show suspended ones: left as a fact about the member.

## SHL-06 sign-out guard, SHL-07 clearing, SHL-17 failed sign-out
`C/router.tsx` `confirmLeave()`; `C/App.tsx` `signOut` asks first, catches a failed POST (toast "You could not be signed out…", stays signed in), then `endSession()` and `clearSession()` (`C/clearSession.ts`: `forgetPreferences` in `C/prefs.ts`, `clearReads` in `C/api.ts`, `vx-viewport:*`), and `useRememberPlace` forgets what it sent. Tests `SHL-06`, `SHL-07`, `SHL-17` in `Session.test.tsx`. Siblings: other `navigate(..., {replace:true})` callers are post-save redirects, not leaves. Left out: a setting changed less than 400 ms before sign-out is dropped, not sent.
Walk: sign out with an unsaved editor (Stay, then Leave); sign in as a second person in the same tab and check theme and pins. Polish gate: states (dialog, failed toast), lifecycle (draft is asked about), keyboard (menu and dialog are the shared ones), copy as above.

## SHL-08 session ended
`C/session.ts` (state), `C/api.ts` `apiFetch` (one 401 handler: a signed-in page's request waits, then is sent again), `C/SessionSheet.tsx` (dialog "Your session ended" over the page, password or provider in a new tab, focus re-checks `/me`; the same person resumes and reads are marked stale; another person gets a clean reload). Routed through it: `api.*`, `api.upload`, the three bare `fetch` calls in `C/screens/Environments.tsx`. Tests: `SHL-08` in `Session.test.tsx` (a 401 in the middle of a save keeps the draft, shows the sheet, the save completes after sign-in; another account does not resume).
Left out: the event stream (`C/stream.ts`) does not probe on a dropped connection, so a page with only a stream notices at its next request; `C/prefs.ts` sends and `C/screens/Authoring.tsx:66` (own base URL) bypass `apiFetch`.
Walk: expire the cookie in dev tools, press Save in an editor, sign in in the sheet; do it at 390 px and with the keyboard only. The sheet cannot be dismissed (the page waits on it).

## SHL-05 single sign-on return, SHL-14 lookup failure
`C/screens/SignIn.tsx`: `withReturn` falls back to the current console path and query; the provider lookup no longer turns an error into the password form, it shows "We could not check how this address signs in. … Press Continue to try again." Tests `SHL-05` and `SHL-14`. The server already limits `return` to console paths. `C/App.test.tsx` now mocks the lookup.

## SHL-02, SHL-03, SHL-04 keys
`C/kit/DataTable.tsx` matches the lowercased letter (so Shift+J/K and Shift+X work). `C/kit/keys.ts`: `isSingle` exempts `Shift+F10`; new `turnsOff`; `C/kit/CommandPalette.tsx` marks "(off)" only when every key turns off, and "(single keys off)" when some do. `formatCombo` now renders ⌘K and ⌘↵ in `Shell.tsx`, `Overview.tsx`, `Authoring.tsx`, `Queries.tsx`, `KitSheet.tsx`. Tests in `DataTable.test.tsx`, `CommandPalette.test.tsx`, `Shell.test.tsx`. Siblings: grep of `case "j"` finds only DataTable. Comments naming ⌘ left as they are.

## SHL-09 unknown counts, SHL-10 managed workers, SHL-11 Rename
SHL-09: `C/screens/Overview.tsx` says "Nothing you can see needs you here" with "You cannot see failed runs, approvals… Ask an administrator for read access", and shows First steps only when `scripts` and `everRan` are known; `TenantOverview.tsx` the same for its counts. Panel count badges (`Shell.tsx:159-197`) were looked at, not changed. SHL-10: `TenantOverview.tsx` warns only when the tenant has no managed workers. SHL-11: `GET /tenants` rows and `GET /tenants/:t` carry `mayRename` (`S/routes/tenants.ts`); `RenameTenantButton` (`C/screens/Environments.tsx`) hides itself when it is false, so the list and the overview follow. The finding's claim that the list already gated on `tenant:write` was not true; there was nothing to copy. Tests: `Approvals.test.tsx`, `TenantScreens.test.tsx`, `tenant-list.test.ts`.
Walk: a read-only member on the workspace and tenant overview; a managed-workers tenant with no worker running; Rename on both screens.

## Found
- `git stash` was used once by this lane (stash then apply, then dropped its own entry) against the coordinator's rule: no stash of this lane remains; the other entries in the list belong to other lanes and were not touched.
- The event stream never notices an ended session (see SHL-08).
