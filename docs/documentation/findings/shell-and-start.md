# Findings: console shell and Start

Prefix `SHL`. Settled from the code at `270e509` (the tree at `~/.local/share/volvel-walk/tree29`). Inventory: [shell-and-start.md](../inventory/shell-and-start.md). Paths: `C/` = `apps/console/src/`, `S/` = `apps/control-plane/src/`. No phase document or decision record settles any item below as intended. Only SHL-01 and SHL-12 were also run (the key pattern was tested against the two keys); the rest are proved from the code path.

## Rows

### SHL-01 "Underline my team's terms" resets itself
- **Outcome:** confirmed by code (key pattern run: refused).
- **Severity:** broken
- **Where:** `S/routes/preferences.ts:16` (PREFERENCE_KEY), `C/help/glossary.tsx:45-47`, `C/prefs.ts:221`.
- **Evidence:** `terms.underline` does not match `PREFERENCE_KEY`, so the PUT is refused (400). The next page load finds the key absent on the server and deletes the local value, so the choice reverts to "on".
- **Fix:** one shared list of preference keys used by both the console and the server (or add `terms\.underline`). Siblings: SHL-12 (`palette.pins:none`). A test that every key the console passes to `usePreference` matches the pattern should fail first.
- **Size:** S. **Milestone:** M10

### SHL-02 Shift+J / Shift+K select nothing
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `C/kit/DataTable.tsx:265` (lists "J","K" as single keys) and the switch at 276, 286 (cases `"j"`, `"k"` only, no default).
- **Evidence:** with Shift held the browser sends `event.key === "J"`. No case matches, so the key is ignored. Shift+arrow reaches `ArrowDown`/`ArrowUp` and works, and that is all the tests cover. The shortcut sheet lists Shift+j/k.
- **Fix:** match on lowercased key (or add the `"J"`/`"K"` cases) in DataTable. Siblings: any other list or grid handling j/k itself (the flow editor, logs); search `case "j"`. Test: Shift+J across rows.
- **Size:** S. **Milestone:** M10

### SHL-03 Shortcut sheet marks Enter, Space and Shift+F10 "(off)" while they work
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `C/kit/CommandPalette.tsx:967`, `C/kit/keys.ts:66`, `C/kit/shortcuts.ts:47`.
- **Evidence:** `off` is `!singles && every key isSingle`. Enter (handled by DataTable, `handledBy`) and Space pass `isSingle`, so they are greyed and marked off. Shift+F10 also passes: the F-key exemption matches only a bare `F10`, not `Shift+F10`, so it is greyed too although it types nothing.
- **Fix:** mark off only the shortcuts the toggle really turns off (add a flag on the definition, or exclude `handledBy` entries). Test: sheet with single keys off.
- **Size:** S. **Milestone:** M10

### SHL-04 "⌘K" and "⌘↵" shown on every platform
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `C/Shell.tsx:1262`, `C/screens/Overview.tsx:204`.
- **Evidence:** both are literals. `formatCombo(combo, mac)` and `isMac()` exist in `C/kit/keys.ts:37,198` and the shortcut sheet uses them.
- **Fix:** render both from `formatCombo`. Siblings: grep for `⌘` in `C/` outside `keys.ts` (docs copy and hints too). Test: platform stubbed to Linux.
- **Size:** S. **Milestone:** M13

### SHL-05 Single sign-on from a deep link loses the link
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `C/screens/SignIn.tsx:69-70` (`withReturn` uses only `?return=`), `S/routes/sso.ts:838-849`, `S/kernel/auth.ts:82`.
- **Evidence:** a signed-out visit to `/t/…/runs/…` shows the sign-in in place. A password sign-in then stays on that URL. The provider link carries no return, so the server sends the person to `/`, which reopens the last place or the tenant list. The server already takes any console path in `return` and rejects `//`, `/api/`, backslashes and line breaks, so passing the current path is safe.
- **Fix:** `withReturn` falls back to `location.pathname + location.search`. Test: provider link href on a deep URL.
- **Size:** S. **Milestone:** M10

### SHL-06 Sign out skips the unsaved-changes guard
- **Outcome:** confirmed by code
- **Severity:** data
- **Where:** `C/App.tsx:124-128`, `C/router.tsx:143-147`.
- **Evidence:** `signOut` posts `/auth/sign-out` first, then `navigate("/", { replace: true })`. `navigate` skips blockers whenever `replace` is set. Then `me.reload()` swaps the shell for the sign-in screen, so the editor unmounts with its draft. `beforeunload` covers closing the tab only. Even if the guard had run, the session would already be gone when the person chose Stay.
- **Fix:** ask the guard before the POST (a `confirmLeave()` from the router that the account menu calls), then sign out. Siblings: any other `navigate(..., {replace:true})` made as a leave (check the callers in `C/`), and session expiry (SHL-08). Test: edit a draft, choose Sign out, expect "Leave without saving?".
- **Size:** S. **Milestone:** M2

### SHL-07 Settings and cached data stay for the next person in the same tab
- **Outcome:** confirmed by code (the cache part is inferred)
- **Severity:** security (low: a shared browser, same tab)
- **Where:** `C/App.tsx:97-100,124-128`, `C/prefs.ts:209` (`loaded ??=`, once per page), `C/api.ts:116-127`.
- **Evidence:** sign-out clears nothing: `vx-pref:*` stays in localStorage, `loaded` stays resolved, so a second person who signs in without a page load is not given their own settings. They see the first person's theme, panel, pinned resources (`palette.pins:<tenant>`, resource names) and operator-strip state. Their own first change sends only that key. The query client is not cleared, so the first person's cached reads (default 5-minute `gcTime`) can show before the refetch. A full reload makes the server's settings replace the local ones.
- **Fix:** one `clearSession()` on sign-out and on a 401 from `/me` that calls `resetPreferences`, removes `vx-pref:*`, drops pending sends, and clears the query client. Siblings: `sessionStorage` `vx-viewport:*` keys (flow canvas position), `useRememberPlace`'s `sent` ref. Test: two sign-ins in one mounted `App`.
- **Size:** S. **Milestone:** M1

### SHL-08 A session that expires mid-use is not noticed
- **Outcome:** confirmed by code (not run)
- **Severity:** data
- **Where:** `C/App.tsx:92-111`, `C/api.ts:116-127`, no 401 handler anywhere (`grep "401"` finds only App and SignIn).
- **Evidence:** `/me` is read once. Window focus and reconnect refetch are off. After expiry (library default 7 days, renewed daily) each screen shows "Could not load x." with Try again, and a Save in an editor fails with a 401 message. Nothing says the session ended or offers to sign in again, and a reload to recover loses the draft. The matrix (`docs/uiux/11-screen-matrix.md`, AC-SIGNIN) already asked for "detect an expired session".
- **Fix:** one 401 handler in `api.ts` that marks the session ended; App then shows a sign-in sheet over the page (keeps the page and its drafts, signs in with the same cookie flow) and retries. Siblings: the event stream (`S/routes/stream.ts`), tasks, uploads, `fetch` calls that bypass `api`. Test: a 401 on a save, expect the sheet and the draft intact.
- **Size:** M. **Milestone:** M2

### SHL-09 A reader who may not see a count is told "Nothing needs you here"
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `C/screens/Overview.tsx:176-200,280-380,417,476`, `S/routes/summary.ts:125-150`.
- **Evidence:** the server returns no count (undefined/null) for what the caller may not read. The screen turns each into 0. Without `run:read` the text "No failed runs in the last 24 hours, nothing waiting, everything bound" is shown, and First steps can never complete (`scripts ?? 0`, `everRan`), and on production it says "Write one here".
- **Fix:** keep "unknown" distinct from 0: say "You can't see failed runs" per hidden item, and show First steps and "Nothing needs you" only when everything it states is known. Siblings: TenantOverview's counts, the panel's count badges (`Shell.tsx:159-197`). Test: summary with the counts missing.
- **Size:** M. **Milestone:** M10

### SHL-10 "No worker is online" on a tenant with managed workers
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `C/screens/TenantOverview.tsx:122`, `S/routes/summary.ts:432-441`.
- **Evidence:** the tenant overview counts rows in `worker` seen in the last 60 s. Managed workers are started on demand and exit when idle (`S/kernel/execution/supervisor.ts`), so zero is normal and "Runs wait in the queue until one connects" is untrue. The workspace overview already handles it (`Overview.tsx:184`, `|| managedWorkers`).
- **Fix:** the tenant overview reads `tenant.managedWorkers` as the workspace one does. Siblings: any other "no worker" warning (Workers screen, run page waiting text, `C/tasks.ts` 20 s message). Test: summary with 0 workers and `managedWorkers: true`.
- **Size:** S. **Milestone:** M10

### SHL-11 Rename is offered to someone who may not rename
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `C/screens/TenantOverview.tsx:146-151`, `C/screens/Environments.tsx:1335`.
- **Evidence:** the button shows for everyone with the page; the tenant list gates the same action on `tenant:write`. The server refuses on submit, after the person has typed a name.
- **Fix:** gate the button on the permission, in `RenameTenantButton` itself so both call sites follow. Test: member without `tenant:write`.
- **Size:** S. **Milestone:** M10

### SHL-12 Palette pins outside a tenant are never kept
- **Outcome:** confirmed by code (key pattern run: refused)
- **Severity:** broken
- **Where:** `C/kit/CommandPalette.tsx:240` (`palette.pins:${tenantId ?? "none"}`), `S/routes/preferences.ts:16`.
- **Evidence:** `palette.pins:none` fails `palette\.pins:[0-9a-f-]{36}`. The PUT is refused and the next load drops the local pin. Same class as SHL-01.
- **Fix:** as SHL-01; or do not offer pinning outside a tenant. Test: pin on `/`, reload.
- **Size:** S. **Milestone:** M10

### SHL-13 Palette finds and remembers only part of the product
- **Outcome:** missing part
- **Severity:** rough
- **Where:** `S/routes/search.ts:11-22` (ten resource kinds), `C/recent.ts:5-14`, `openedAt` at 30+.
- **Evidence:** search has no variables, secrets, queries, dashboards or drafts. `RecentKind` omits `app`, `trigger`, `schedule` and `doc`, though `PUT /me/recent-items` accepts them (`search.ts:340-352`), so opening those is never recorded. The inventory's claim that opened docs and dashboards are never Recent is true for docs; for dashboards it depends on whether they are a resource kind (not checked).
- **Fix:** add the kinds to `RecentKind` and `openedAt`; add kinds to `READ` with their read permission. See Missing parts.
- **Size:** M. **Milestone:** M10

### SHL-14 Failed provider lookup silently shows the password form
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `C/screens/SignIn.tsx:119-122`.
- **Evidence:** any error (rate limit, network, 500) becomes `{ providers: [], password: true }`. A person whose organization requires its provider then types a password and is refused with "Sign in with X. Passwords are turned off" (the server holds, `S/kernel/auth.ts:176-212`), so no access is gained, but the screen misleads and a limited lookup is invisible.
- **Fix:** on a lookup error show the error with a retry, not the password step. Test: lookup returns 429.
- **Size:** S. **Milestone:** M10

### SHL-15 The tenant list shows tenants a person is suspended in
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `S/routes/tenants.ts:113-150` (no `suspended_at` condition), against `S/routes/identity.ts:667-674` (the switcher filters).
- **Evidence:** the member branch selects all `tenant_member` rows. A person who left (suspended) still sees the tenant's name, slug and workspace count, and nothing in it opens.
- **Fix:** add `suspended_at is null` to the member branch of `GET /tenants`. Siblings: every other query that lists by `tenant_member` (search `from("tenant_member")` in `S/routes`). Test: suspended member lists tenants.
- **Size:** S. **Milestone:** M1

### SHL-16 A wrong password spends a recovery code
- **Outcome:** reproduced, and deliberate (D18: kept, and the form says so). The same fault as GOV-12, settled the same way: the code is spent before the password is checked (`S/kernel/auth.ts:180-182`); the sign-in form says it works once even if the password is wrong, and a 401 says the code was used up by this try (fixed in `fixed/gov2.md`, test "a wrong password with a recovery code says the code is spent (GOV-12, D18)")
- **Severity:** rough
- **Where:** `S/kernel/auth.ts:182-186`, `C/screens/SignIn.tsx:125,138`.
- **Evidence:** the code is spent before the password is checked. A typo burns one of ten codes, and the form does not warn. The error text ("not right, or was already used") is shown only for 403.
- **Fix:** none in the server. Say it on the form and in start/sign-in. See the owner's questions.
- **Size:** S. **Milestone:** M13

### SHL-17 Ancillary claims in the inventory, settled
- **Outcome:** confirmed by code (all)
- **Severity:** rough
- Ends at `/approve/:token` take no sign-in and decide nothing on open (`C/App.tsx:104`): as stated.
- The `?return=` allow-list and the server's `consolePath` are both strict (no open redirect): as stated.
- The inventory's "mail" omission: members have no reset or invite mail (phase 1, `docs/phases/phase-1-kernel.md:304`); end users do (`S/routes/endusers.ts:294,952,1018`). See the owner's questions.
- Sign-out failing (network) throws from `signOut` unhandled in `C/App.tsx:125` and nothing is shown. **Fix:** catch and toast. **Size:** S. **Milestone:** M10.

## Missing parts

The API already has all of these. None has a console control.

1. **Sessions list and sign-out of others.** Better Auth `/auth/list-sessions`, `/auth/revoke-session`, `/auth/revoke-sessions`, `/auth/revoke-other-sessions` (reached through `S/routes/auth.ts:15`, plugin in `S/kernel/auth.ts`). Belongs on Account as "Sessions" beside API keys (`C/screens/Account.tsx`). Siblings: the portal's end-user account. Permission: signed-in member for their own. **Size:** M.
2. **Change password.** `/auth/change-password` (takes `revokeOtherSessions`), the 12-character rule at `S/kernel/auth.ts:26`. Belongs on Account as "Password". Siblings: end users have `S/routes/endusers.ts:1068` and the portal page. Permission: signed-in member. **Size:** S (with 1: M together).
3. **Profile name.** `/auth/update-user`. Account "Profile", with the name now shown in "Signed in as…". **Size:** S.
4. **API key expiry at creation.** `POST /api-keys` takes `expiresAt` (`S/routes/identity.ts:90,121-124`), and the list already shows "Expired" (`C/screens/Account.tsx:51`) but the create sheet sends only `name` (`Account.tsx:160-170`). Add an optional "Expires" (none, 30/90/365 days, a date). Siblings: service-account and tenant key screens that call the same route. Permission: signed-in. **Size:** S.
5. **Recent and search coverage** (SHL-13): kinds the server accepts but the client does not send, plus the missing resource kinds. **Size:** M.
6. **Preferences page.** `/me/preferences` stores 8 keys, but the controls are scattered (help panel, shortcut sheet, theme). Not a missing API part; listed only because start/account promises "your own preferences". **Size:** S to decide, M to build.

Recovery codes are shown only to direct `tenant_admin` holders: by design (`Account.tsx:57-60`), not a gap.

## Owner decides

1. **Are sessions, password change and key expiry meant to be API-only?** Options: (a) yes, document the calls; (b) add Sessions, Password and Profile to Account. Recommend (b): they are small, the API is done, and a console that cannot change its own password is the first thing a person tries.
2. **Who resets a member's forgotten password?** Today nobody in the product: no email for members (phase 1), no reset link, no operator action, and the sign-in page says nothing. Options: (a) an admin or operator makes a one-time reset link like the end-user flow; (b) an SMTP "Forgot your password" like the portal's; (c) document "ask your administrator". Recommend (a), with (c) printed on the sign-in screen now.
3. **Should a recovery code be spent by a wrong password?** Options: keep (no guessing against a code), or spend only after the password is right. Recommend keep, and say so on the form.
4. **Session lifetime.** Unset, so 7 days renewed after a day. Options: leave, or a setting. Recommend leave, and state it on start/sign-in; revisit with Sessions.
