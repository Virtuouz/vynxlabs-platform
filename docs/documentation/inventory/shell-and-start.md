# Inventory: shell and start

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

**Slice: console shell and "Start".** Read-only; `docs:check` and tests not run. Behaviours come from code unless marked "inferred". Prefixes:
- `C/` = apps/console/src/
- `S/` = apps/control-plane/src/
- Docs pages are under packages/docs/content/

## A. Proposed pages

| Path | State | Topic | Purpose |
|---|---|---|---|
| start/index | rewrite | – | Map of Start |
| start/concepts | exists, extend | concepts | Terms |
| start/first-steps | new | – | Empty instance to first deploy |
| start/sign-in | new | – | Password, SSO, recovery code, errors |
| start/approve-link | new | – | Deciding from the mail |
| start/tenants | 7-line stub | tenants | Tenant list |
| start/finding-your-way | new | – | Rail, panel, header, switchers, Live, phone, theme |
| start/search | new | – | Palette |
| start/shortcuts | new | – | All keys |
| start/lists | new | – | Filters, columns, views, batch, URL |
| start/saving | new | – | Autosave, SaveBar, guard, Undo, toasts, errors |
| start/help | new | – | F1 panel, terms |
| start/account | 7-line stub | account | Keys, recovery codes |
| start/workspace-overview | thin | workspace-overview | Overview |
| tenant/overview | exists | tenant-overview | Tenant overview |

`packages/docs/check.mjs` fails any non-index page that no screen opens and no other page links to. Link new pages from start/index and add them to its `pages:`. Operators at `/` get `instance-tenants`, not `tenants` (C/nav.ts whereIs).

## B. Contents

**sign-in** (C/screens/SignIn.tsx)
- Steps "Email", "How you sign in"; Email, **Continue** ("Checking…"), **Change** (89–158).
- "Sign in with {provider}"; Password with "Show/Hide what you typed"; **Sign in**, or **Sign in with a password** when providers exist (170–239).
- SSO required: "Your organization requires its own sign-in…", **Use a recovery code**, Recovery code, **Sign in with the recovery code**, **Back to your organization's sign-in**.
- 13 SSO error sentences plus a fallback (14–43). Wrong password: "That email and password do not match an account."; a disabled account reads the same (S/kernel/auth.ts:158–176).
- No self sign-up; 12-character minimum (S/kernel/auth.ts:26, S/config.ts:113). Session lifetime is unset, so library default: 7 days, renewed after a day. Library rate limit is on in production.
- Sign-in works only at the instance's main address (S/routes/auth.ts:22). `?return=` follows only `/apps/`, `/portal/`, `/api/v1/app-handoffs/start` (C/App.tsx:25).

**approve-link** (C/screens/ApproveLink.tsx)
- `/approve/:token`, no sign-in; opening it decides nothing.
- Tenant · workspace · Dev/Production tag, "a test run", title, flow, waiting since, "What it is about", "Comment (needed to reject)", **Approve**/**Reject**, expiry line.
- Done: "Approved/Rejected. Thank you, {name}.", **Open the run**. Dead link: "Nothing to decide here", **See the approvals waiting in the console**.

**first-steps**
- `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` create the first operator when there are no members; remove both afterwards (docs/self-hosting.md:37).
- Operator `/`: **Create tenant** sheet: Name; Slug (lowercase, digits, hyphens, ≤63, permanent); Database location (optional, chosen once); "Make me a member, as tenant admin" (on). Then it opens the tenant (C/screens/Tenants.tsx:126–172). Permission: instance `tenant:write`.
- Workspace "First steps", "n of 4 done": A worker to run code → A first script → A first run → A first deploy. Only the next step shows its button. Shows while nothing has run or been deployed (C/screens/Overview.tsx:163–276).

**tenants** (C/screens/Tenants.tsx)
- Columns: Name, Slug, Workspaces, (operators) You = "Member"/"Through a grant", (operators) "Tables kept in", Created.
- "Search tenants" searches on the server by name or slug; 50 per page; "Showing the first N tenants." **Load more**.
- Inspector: Slug, Workspaces, (op) Your access, (op) Tables kept in, Created, ID. **Open**, **Rename** (`tenant:write`), (op) **Delete** (type the slug).
- Empty for members: "Nobody has added you to a tenant yet. Ask your administrator."
- Operator without membership: "You have no access to this tenant" → **Open operator access**: Reason, Access level, Duration 1/4/24 hours (C/screens/Tenant.tsx:108+).

**finding-your-way** (C/Shell.tsx, C/nav.ts)
- Rail: Overview, Build, Operate, Data, Configure, then Tenant, then Instance (operators) or Tenants. Areas with several sections *reveal* them and navigate nowhere; press again, click away or Esc to close (501–560, 750–797). Dimmed areas use this browser's last workspace.
- Every section label: nav.ts:105–257. Panel: "Filter", "Hide navigation"/"Show navigation", counts ("n failed", "n drafts", "conflict"/"ahead"/"behind", "n missing", "n active", "n to fix", "n online"; 159–197), "Release path".
- Header: tenant link, "Switch workspace", env tag, Paused, "promotes to X", breadcrumbs, operator mark, Live, "n drafts Review", "n failed runs", Help, "Search or jump to…". "Switch tenant" exists only outside a workspace.
- Switching workspace keeps the same object if it exists there, else the section; list filters carry over (348–373).
- Account menu: Signed in as…, API keys, Help for this page, Keyboard shortcuts, Sign out. "Color theme": Match the system/Light/Dark.
- Live/Connecting…/Reconnecting… (3 s)/Offline · last updated (30 s). 5 streams per caller (S/routes/stream.ts).
- Production: amber tag plus rule under the header. Operator strip: **End now**, **Hide**; mark menu: "Show the notice", "End access now".
- Widths: rail ≥768, docked panel ≥1024, docked inspector ≥1280. Phone: "Open the menu" drawer holds areas, sections, Release path, account, theme; "Back to {section}" chevron.
- "Skip to content"; tab title = object · section · workspace · product; focus moves to the heading.
- Opening `/` returns to the last workspace's overview or tenant, on any device (C/App.tsx:65).
- `/workspaces/<slug>` works and becomes the ID (Tenant.tsx:424).

**search** (C/kit/CommandPalette.tsx, S/routes/search.ts)
- Dialog "Go to". Prefixes `>` runs, `#` resources, `/` actions, `@` people. ↑↓, Enter, Mod+Enter (Run/Start/Run again), Mod+P pin (12 per tenant), Backspace leaves a picker.
- Empty query: the open object's own commands, Pinned, Recent (8 shown, 20 kept), 12 screens, 4 actions. Object commands: search `useCurrentObject`/`<Current`; e.g. C/screens/RunPage.tsx:296–345, 706–760.
- Actions: Run script…, Start flow…, New script/New flow (dev), Pause trigger…, Resume trigger…, Copy workspace ID, Switch workspace… (>1), Switch to dark/light theme, Open the API description, Help for this page, Keyboard shortcuts.
- Finds deployed resources by **path**: script, flow, app, interface, table, trigger, schedule, connection, event, doc. Runs by ≥8 hex characters of the ID or `tag:x`. People by name/email, only with `@` (`member:read`, `end_user:read`). 20 results; filtered by permission.

**shortcuts** (C/kit/shortcuts.ts, complete)
- Everywhere: Mod+K; ?; /; F1 or Mod+/.
- Go to (second key within 1 s): g o, g r, g f, g s, g t, g a. Outside a workspace only g a works.
- Lists: j k ↑ ↓; Enter; Mod+Enter; x or Space; Shift+j/k; Mod+A; Esc (uncheck); Esc (close inspector).
- Editors: a (add to page), Mod+S, Mod+Enter, Mod+Z, Shift+Mod+Z or Ctrl+Y.
- Flow editor: Mod+D; Mod+C/X/V; Shift+F10. Palette: > # / @ Mod+Enter. Logs: Mod+F.
- Not on the sheet: ←→ Home End PageUp/PageDown, Ctrl/Cmd+Home/End, Shift+↑↓, Shift+click, middle-click (DataTable.tsx); Mod+P; splitter arrows (Shift = bigger), Home, End, Enter folds, double-click resets.
- "Single-key shortcuts" checkbox. Undo/redo/Mod+D are ignored in fields.

**lists** (C/kit/DataTable.tsx, views.tsx, paged.tsx, ListCollection.tsx, BatchResult.tsx, layout.tsx)
- Header sort ▲ ▼ ↕: ascending → descending → none. Among workspace lists only Runs (Started, Duration) uses DataTable sorting; table rows use the grid's own.
- "Columns" dialog: checkbox, drag, arrows, "Show every column", "Done"; first column fixed unless the list says otherwise. Where: Runs, Audit, table rows, result tables.
- "Row density" Compact/Standard/Comfortable: Runs only (default Compact). Table rows have "Compact rows"/"Standard rows".
- "Saved views" on Runs, Events, tenant Audit log, table rows: "Save this view…", "Save over “x”", "Rename “x”…", "Delete “x”", "Copy a link to this view". Private; 50 per list, name ≤80, unique (S/routes/preferences.ts). Members only.
- Batch bar: "n selected", actions, **Clear**. Runs: Cancel, Run again; Triggers: Pause, Resume; Approvals: Approve, Reject. Max 100 (S/routes/batch.ts:19). Failures dialog: "n done, n not done.", per-item reason, Request ID, "Retry the n not done".
- "Load more" (50; Runs 100); Audit "Show older entries".
- Empty/filtered/error: "Nothing matches these filters" + **Clear filters**; "Could not load x." + Request ID + **Try again** (403: ask an owner/administrator, no retry).
- Address: filters replace, opening a row pushes, so Back closes it. Inspector resizes 288–720 px, one width for all lists.
- Create: >3 fields opens a side sheet; Cancel forgets input.

**saving**
- SaveBar: "Unsaved changes to …", **Discard**, **Save**, Mod+S (C/kit/SaveBar.tsx).
- Guard: "Leave without saving?" **Leave**/**Stay**; closing the tab uses the browser's prompt (C/router.tsx, C/ask.tsx).
- Toasts: 5 s, 10 s with link/action, failures until dismissed, 3 visible, hover/focus holds, Esc dismisses; "What does this mean?" opens reference/errors. Undo in toasts: App Builder, page editor, Documentation.
- Tasks: the person is told after 20 s without a worker (C/tasks.ts).
- NotFound: "Nothing here" + link back. Crash: "This page could not be shown." Try again/Reload/Go back.

**help** (C/help/HelpPanel.tsx, HelpDock.tsx)
- Title, "Back to the help for this page", "Copy a link to this help", "Close help", "Search the help" (12 results), "From your team", "Open this page online" (if the docs URL is set), "Underline my team's terms on screens".
- Docked ≥1280 (over the page if an inspector is docked, until 1680), overlay on tablet, full screen on phone. `?help=<topic>`. Served by the instance; offline.
- ⓘ: "About {title}"; descriptions show once per list, then fold. Field ⓘ text comes from kind schemas.

**account** (C/screens/Account.tsx), at `/account/api-keys`
- Columns: Name, Key (`prefix…last4`), Last used, Status Active/Expired/Revoked. **Create API key** (Name); shown once, **Copy the key**, **Done** (asks if not copied); **Revoke**.
- "Recovery codes": only for direct `tenant_admin` holders. "Codes left", "Made", **Make recovery codes**/**Make new codes**, **Copy all**, **I have kept them**. 10 codes, `xxxxx-xxxxx`; warning at ≤2.
- **Absent:** sessions list, password change, profile, MFA, passkeys, preferences page.

**workspace-overview** (C/screens/Overview.tsx)
- Header: Triggers paused, "Running vN", **Review release** (dev with drafts) or **Open runs**.
- "Needs attention": failed runs (Open failed runs), git conflict (Resolve), approvals (Decide / See who), connections (Configure), drafts (Review), triggers paused (View settings), else "Nothing needs you here".
- "Runs · last 24 hours": Succeeded, Failed, In progress, Median time, hourly bars. "Release"/Deployments. "What starts work here" (first 8)/All triggers.
- Count permissions: S/routes/summary.ts:133–143.

**tenant/overview** (C/screens/TenantOverview.tsx)
- Needs attention: approvals, hostnames to check, operators inside now, No worker is online.
- "Promotion requests" → Review: **Promote**, **Decline…** (reason required).
- Workspaces (12, production first), "At a glance", "Recent changes" (8, `audit:read`), **Rename**.

## C. Gotchas
- Tenant Approvals counts only approvals surfaced to the tenant; a workspace counts all of its own.
- A wrong password with a valid recovery code still spends the code.
- A view's link works for anyone who may open the list; deleting the view does not break it.
- Failed counts: last 24 hours, flow steps not double-counted.
- List keys work only with focus inside the table.
- Recent and "last place" are kept only where you are a member, not under operator access; not audited.
- Preferences follow the member across browsers; max 200, 4 KB each.
- API keys act with your permissions.
- Retry of a batch covers only failures.

## D. Wrong, stale or missing docs
- start/account: promises "your own preferences"; none exist. No recovery codes.
- start/tenants: "opens its last workspace" is wrong: it opens the tenant overview. Root-URL return undocumented.
- start/index: the tenant list is not "where you start each day" (root reopens the last place).
- start/workspace-overview: omits First steps, git, connections, paused, Release, triggers.
- docs/evolution/specs/S8-command-palette.md: trigram match and Pause as a secondary action are not what shipped.
- Missing glossary terms: instance, operator, trigger, approval, release, environment.

## E. Likely bugs and open questions
1. `terms.underline` is not in `PREFERENCE_KEY` (S/routes/preferences.ts:16), so the PUT is refused and the next load deletes the local value (C/prefs.ts:221). "Underline my team's terms" resets.
2. Shift+j/k: the browser sends "J"/"K"; DataTable.tsx:276,286 handle only lowercase. Only Shift+arrows work (the only ones tested).
3. Shortcut sheet marks Enter, Space rows and Shift+F10 "(off)" when single keys are off; they still work (keys.ts:66).
4. Header shows "⌘K" and First steps "⌘↵" on every platform (Shell.tsx:1262, Overview.tsx:204).
5. SSO from a deep link: only `?return` is passed (SignIn.tsx:69), so the link is lost.
6. Sign out uses `replace`, skipping the unsaved guard (C/App.tsx:126).
7. Settings stay in localStorage after sign-out and load once per page; a second person in the same tab sees the first's.
8. Expired session: `/me` is not re-read by tenant requests, so screens show errors until reload (inferred).
9. Null (not permitted) counts read as 0: "Nothing needs you here … everything bound". First steps never complete for limited readers; production says "Write one here".
10. "No worker is online" ignores managed workers (TenantOverview.tsx:122).
11. Rename shows without `tenant:write`.
12. Palette misses drafts, dashboards, queries, variables, secrets. Opened docs and dashboards are never Recent. Pins outside a tenant use key `palette.pins:none`, which the server refuses.
13. Failed provider lookup silently falls back to password.
14. Decide: are sessions, password change, key expiry (the API has `expiresAt`, and `/auth/change-password` works) intentionally API-only? Who resets a forgotten password?
15. /tenants lists a tenant you are suspended in; the switcher does not.

## F. Screenshots
Sign-in steps 1, 2 and recovery; approve link; tenants as member and operator with inspector; First steps; workspace overview (busy); tenant overview with promotion request; shell annotated (dev and production); revealed rail flyout; palette empty, results, `/`; shortcut sheet; Runs with batch bar and inspector; Columns dialog; Saved views menu; batch result; toast with Undo; Leave dialog; help docked and on phone; phone drawer; new key; recovery codes; dark theme; operator strip; NotFound. Existing under packages/docs/assets/screenshots/console: documentation, page-editor, table-help.
