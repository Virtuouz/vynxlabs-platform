# Inventory: shell and start

Read from the code at `270e509` on 2026-11-22. Refreshed against the code at `4992c9da` on 2026-11-23.

**Refreshed 2026-11-23.** What phase 29 changed, and what to trust:
- Section A is rewritten: every page has a collection and a Diátaxis type, laid out as in [docs-platform-design §5](docs-platform-design.md). New pages for sessions and password change, the read-only notice, "what you may do here", and Account's other panels. The paths are a proposal until phase 30 M6 moves the files.
- Section B was checked line by line against the code. Corrected: **Review release** is **Review changes**; "Release" on the workspace overview is **Deploy** (link **Deployments**); "Release path" is **Deploy path**; "n missing" is **n not set up**; the account menu says **Account**, not "API keys"; Account now has Profile, Password, Sessions and key expiry; the palette finds variables, secrets, queries and data sources; a batch of more than 100 is sent in slices; Instance has **Health** and **Component kit**; Data has **Files**.
- Section E is now a list of settled findings with the outcome. Nothing in it is open except the items marked "still true".
- Not verified: no browser walk, no test run. The member password reset link of D4 was not found in the code (see E, last item). The "renewed after a day" session rule is the library's default and was not read. Whether the server accepts a `?return=` that is a console path rests on the SHL lane's note (`fixed/shl.md`, SHL-05).
- Vocabulary applied: Flow, Deploy and Versions, "Deploy this version", "Roll back to this version", Access changes, Apps, canceled.

**Slice: console shell and "Start".** Read-only; `docs:check` and tests not run. Behaviors come from code unless marked "inferred". Prefixes:
- `C/` = apps/console/src/
- `S/` = apps/control-plane/src/
- Docs pages are under packages/docs/content/

## A. Pages

Collections: Get started (`start/`), Console (`console/`), Develop, Administer (`administer/`), Self-host. Types: tutorial, how-to, reference, explanation. A screen's F1 page is reference and keeps its topic, so `nav.ts` ids keep resolving. `packages/docs/check.mjs` fails a handwritten page that no folder `pages:` lists, and a screen topic that does not resolve.

| Path (proposed) | Collection | Type | Purpose | Sources |
|---|---|---|---|---|
| start/index | Get started | landing | Map of the collection | content/start/index.md (rewrite: it says the tenant list is where you start each day; the root reopens your last place) |
| start/explanation/concepts | Get started | explanation | Terms: instance, operator, tenant, workspace, environment, trigger, approval, deploy, version, access change | content/start/concepts.md (extend; topic exists) |
| start/tutorials/first-steps | Get started | tutorial | An empty tenant to a first script, run and deploy. Merges tutorial 1 of tutorials-and-style | C/screens/Overview.tsx:166-267; e2e/first-run.spec.ts; C/screens/starters.ts:38 |
| start/how-to/sign-in | Get started | how-to | Sign in with a password, an identity provider, or a recovery code; what each failure says | C/screens/SignIn.tsx; S/kernel/auth.ts |
| console/reference/screens/account/sign-in | Console | reference | Steps, buttons and the fourteen provider error sentences | C/screens/SignIn.tsx:14-43 |
| console/how-to/decide-from-mail | Console | how-to | Approve or reject from the link in an approval mail | C/screens/ApproveLink.tsx; C/kit/approvals.ts:5 |
| console/reference/screens/tenants (topic `tenants`, `instance-tenants` for operators) | Console | reference | The tenant list, its columns, inspector, and what an operator sees | C/screens/Tenants.tsx; C/nav.ts (`whereIs`) |
| administer/how-to/create-a-tenant | Administer | how-to | An operator makes a tenant, chooses a database location, becomes its tenant admin or asks for operator access | C/screens/Tenants.tsx:128-168; C/screens/Tenant.tsx:125 |
| console/reference/screens/shell | Console | reference | Rail, panel, header, switchers, Live, operator strip, widths, phone drawer, theme | C/Shell.tsx; C/nav.ts; C/kit/LiveIndicator.tsx; C/kit/OperatorStrip.tsx |
| console/how-to/find-and-jump | Console | how-to | Open the palette, use the prefixes `>` `#` `/` `@`, pin, Recent | C/kit/CommandPalette.tsx; S/routes/search.ts |
| console/reference/shortcuts | Console | reference | Every key, drawn from one list. A candidate for the phase 30 M9 generator | C/kit/shortcuts.ts (complete) |
| console/how-to/work-with-lists | Console | how-to | Filter, sort, choose columns and density, save a view, select rows and run a batch | C/kit/DataTable.tsx; views.tsx; paged.tsx; BatchResult.tsx; S/routes/preferences.ts, batch.ts |
| console/explanation/saving-and-leaving | Console | explanation | Autosave and drafts, the save bar, the leave guard, Undo, toasts, an ended session | C/kit/SaveBar.tsx; C/router.tsx; C/ask.tsx; C/SessionSheet.tsx |
| console/explanation/what-you-may-do | Console | explanation (new) | Why a button is grey or a screen says "You can see X, not change it", and who to ask | C/kit/Can.tsx; fixed/sweep-can.md, fix-gating.md |
| console/how-to/use-the-help | Console | how-to | F1, search, "From your team", "Underline my team's terms" | C/help/HelpPanel.tsx, HelpDock.tsx. Phase 30 M7 changes the panel: write after it |
| console/reference/screens/account | Console | reference | Account: API keys, Profile, Password, Sessions, Recovery codes; what is not there | C/screens/Account.tsx |
| console/how-to/make-an-api-key | Console | how-to | Make a key with an expiry, copy it once, revoke it | C/screens/Account.tsx:28-76; C/kit/expiry.ts; C/kit/OneTimeSecret.tsx |
| console/how-to/end-sessions-and-change-password | Console | how-to (new) | See where you are signed in, end one or all others, change the password | C/screens/Account.tsx `Sessions`, `ChangePassword` |
| administer/how-to/keep-recovery-codes | Administer | how-to | A tenant admin makes recovery codes before requiring single sign-on, and uses one | C/screens/Account.tsx:80-165; S/routes/identity.ts:560-620 |
| console/reference/screens/workspace-overview | Console | reference | The workspace overview: First steps, Needs attention, Runs, Deploy, triggers | C/screens/Overview.tsx |
| administer/reference/screens/tenant-overview (topic `tenant-overview`) | Administer | reference | Needs attention, promotion requests, workspaces, at a glance, recent changes | C/screens/TenantOverview.tsx |
| console/reference/screens/not-found-and-crash | Console | reference | "Nothing here", "For operators", "This page could not be shown", "Your session ended". Short; may fold into the shell page | C/screens/NotFound.tsx; C/SessionSheet.tsx |

**Say it is not there** (Account page, and the concepts page): no self sign-up; no profile picture; no MFA or passkeys; no preferences page (settings follow you silently); no member password reset link (see E, last item); no CSV or single-entry route for the instance audit log; no recent entries for apps, triggers, schedules or dashboards.

Operators at `/` get `instance-tenants`, not `tenants` (C/nav.ts `whereIs`).

## B. Contents

**sign-in** (C/screens/SignIn.tsx)
- Steps "Email", "How you sign in"; Email, **Continue** ("Checking…"), **Change** (SignIn.tsx:95-190).
- A failed provider lookup is shown, not turned into the password form: "We could not check how this address signs in. {reason} Press Continue to try again." (SignIn.tsx:118-139).
- "Sign in with {provider}"; Password with "Show/Hide what you typed"; **Sign in**, or **Sign in with a password** when providers exist (SignIn.tsx:194-260).
- SSO required: "Your organization requires its own sign-in. There is no password to enter here.", **Use a recovery code**, Recovery code (hint "One of the codes you made on your account page. It works once, even if the password is wrong."), **Sign in with the recovery code**, **Back to your organization's sign-in**.
- A wrong password with a recovery code: "That email and password do not match an account. The recovery code was used up by this try; use another code." A wrong code (403): "That recovery code is not right, or was already used. Each code works once." (SignIn.tsx:140-146; D18).
- 14 SSO error sentences plus the fallback "You could not be signed in. Try again." (SignIn.tsx:14-43; reason read from `?sso_error` and removed from the address).
- Wrong password: "That email and password do not match an account."; a disabled account reads the same (S/kernel/auth.ts).
- No self sign-up; 12-character minimum (`MIN_PASSWORD_LENGTH`, S/config.ts:122). Console session 7 days (`CONSOLE_SESSION_DAYS`, S/config.ts:125, S/kernel/auth.ts:82; D51; SECURITY.md says it). Sign-in is limited to 20 attempts a minute from one address, counted in Postgres (S/kernel/auth.ts:23-50).
- Sign-in works only at the instance's main address (S/routes/auth.ts:22). Single sign-on from a deep link returns to that console page: the provider link carries `?return=` or the current path and query (SignIn.tsx:73-79; SHL-05). After sign-in, `?return=` is followed only for `/apps/`, `/portal/`, `/api/v1/app-handoffs/start` (C/App.tsx:25-41).
- Opening `/` returns to the last workspace's overview or the tenant, on any device, only on opening (not on reload, not with a filter in the address) (C/App.tsx:100-135).

**approve-link** (C/screens/ApproveLink.tsx)
- `/approve/:token`, no sign-in; opening it decides nothing.
- Tenant · workspace · Dev/Production tag, "a test run", title, "The flow {flow} waits for a decision, since {time}.", "What it is about", "Comment (needed to reject)", **Approve**/**Reject**, "This link is yours and works once, until {time}, or until someone decides."
- Rejecting says "Rejecting fails the step: the flow takes its error path, or fails if it has none." (C/kit/approvals.ts:5).
- Done: "Approved/Rejected. Thank you, {name}.", **Open the run**. Dead link: "Nothing to decide here", **See the approvals waiting in the console**.

**first-steps** (needs: see tutorials-and-style, tutorial 1)
- `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` create the first operator; at least 12 characters; remove both afterwards (docs/self-hosting.md:37, 54).
- Operator at `/`: **Create tenant** sheet: Name; Slug ("Lowercase letters, digits and hyphens. It cannot be changed later."; server pattern, at most 63, S/routes/shared.ts:13); Database location (optional, chosen once); "Make me a member, as tenant admin" (on). Then it opens the tenant (C/screens/Tenants.tsx:128-168). Toast: "Tenant {name} is made." with **Open {name}**. Permission: instance `tenant:write`.
- Workspace overview "First steps", "n of 4 done": A worker to run code (button **Workers**; done when a worker is online or the instance starts workers for the tenant) → A first script (**New script** in dev, **Scripts** in production) → A first run (**Scripts**; "Run it from its editor with ⌘↵") → A first deploy (**Deploy**). Only the next step shows its button. Shows while nothing has run or been deployed, and only once the viewer may read those counts (C/screens/Overview.tsx:166-267, 410-420).

**tenants** (C/screens/Tenants.tsx)
- Title "Tenants". Description: operators "Every client organization on this instance. Opening one needs an access grant unless you are a member of it."; members "The organizations you belong to."
- Columns: Name, Slug, Workspaces, (operators) You = "Member"/"Through a grant", (operators) "Tables kept in", Created. Operators have a filter **Tables kept in** (Anywhere or a location; `?location=`) when locations exist.
- "Search tenants" searches on the server by name or slug; 50 per page; "Showing the first N tenants." **Load more** (C/kit/ListCollection.tsx, paged.tsx).
- Inspector: Slug, Workspaces, (op) Your access, (op) Tables kept in (link to the location), Created, ID. Operators also get two controls from `TenantPowers`: "Workers the instance starts" (button "Start no workers for it" / "Start workers for it"; an operator's off locks it, D16) and "History kept" (**Change how long**, a sheet). Footer: **Open**, **Rename** (hidden unless `mayRename`), a console-code switch ("Turn off/on code in the console for {name}?", D17), (op) **Delete** (type the slug).
- Empty: members "Nobody has added you to a tenant yet. Ask your administrator."; operators "No tenants yet"; with a location filter "No tenant keeps its tables there". The list no longer shows a tenant you are suspended in (SHL-15).
- Operator without membership: "You have no access to this tenant" → **Open operator access**: Reason, Access level, Duration 1 hour/4 hours/24 hours (C/screens/Tenant.tsx:100-170, 287).

**finding-your-way** (C/Shell.tsx, C/nav.ts)
- Rail: Overview, Build, Operate, Data, Configure, then Tenant, then Instance (operators) or Tenants. Areas with several sections *reveal* them and navigate nowhere; press again, click away or Esc to close. Dimmed areas use this browser's last workspace.
- Sections (nav.ts:105-300). Workspace: Build = Flows, Scripts, App Builder, Apps, Extensions, Documentation, All resources. Operate = Runs, Events, Triggers, Approvals, **Deploy** (**Versions** in production), Git sync. Data = Tables, Queries, Data sources, Dashboards, **Files**. Configure = Connections, Variables, Secrets, Alerts, Workspace settings. Tenant groups: Work (Overview, Workspaces, Approvals), People and access (Members & access, End users, Service accounts, Operator access), Sign-in (Single sign-on), Delivery (Branding, Domains, Repository, Workers), Governance (Audit log, Retention, Export). Instance: All tenants, All members, Operators, Single sign-on, Database locations, Import a tenant, Triggers, **Health**, Audit log, Console branding, **Component kit**.
- Panel: "Filter", "Hide navigation"/"Show navigation", counts ("n failed", "n drafts", "conflict"/"ahead"/"behind", "n not set up", "n active", "n to fix", "n online"; Shell.tsx:159-197), "Deploy path" (Shell.tsx:436). A person who reaches only a resource inside a workspace sees no section list (`onlyInside`).
- Header: tenant link, "Switch workspace" (inside a workspace), "Switch tenant" (inside a tenant, outside a workspace), env tag, Paused / "Paused by the instance", "promotes to X", breadcrumbs, operator mark, Live, "n drafts Review", "n failed runs", Help for this page (F1), "Search or jump to…". Outside a tenant the tag says "Instance · operator" or "Personal".
- Switching workspace keeps the same object if it exists there, else the section; list filters carry over.
- Account menu: "Signed in as {email}", **Account**, **What I may do here** (inside a tenant; opens your own member page, needs no read permission), Help for this page, Keyboard shortcuts, Sign out. "Color theme": Match the system/Light/Dark.
- Live/Connecting…/Reconnecting… (3 s)/Offline · last updated (30 s) (C/kit/LiveIndicator.tsx). 5 streams per caller (S/routes/stream.ts). A stream does not notice an ended session; the next request does.
- Production: amber tag plus rule under the header. Operator strip: **End now**, **Hide**; mark menu: "Show the notice", "End access now" (C/kit/OperatorStrip.tsx).
- **The instance is read only**: when the database takes no writes, a strip under the header says so on every screen, and every Save and create button is off with the reason (C/kit/ReadOnly.tsx:9-28; INS-MP5). `/readyz` is asked every 30 s.
- Widths: rail ≥768, docked panel ≥1024, docked inspector ≥1280. Phone: "Open the menu" drawer holds areas, sections, Deploy path, account, theme; "Back to {section}" chevron.
- "Skip to content"; tab title = object · section · workspace · product; focus moves to the heading.
- `/workspaces/<slug>` works and becomes the ID (C/screens/Tenant.tsx:510-515).

**search** (C/kit/CommandPalette.tsx, S/routes/search.ts)
- Dialog "Go to". Prefixes `>` runs, `#` resources, `/` actions, `@` people. ↑↓, Enter, Mod+Enter (Run/Start/Run again), Mod+P pin (12 per tenant; pins outside a tenant are kept too, SHL-12), Backspace leaves a picker.
- Empty query: the open object's own commands, Pinned, Recent (8 shown, 20 kept per tenant), 12 screens, 4 actions.
- Actions: Run script…, Start flow…, New script/New flow (dev), Pause trigger…, Resume trigger…, Copy workspace ID, Switch workspace… (>1), Switch to dark/light theme, Open the API description, Help for this page, Keyboard shortcuts (CommandPalette.tsx:454-575).
- Finds deployed resources by **path**: script, flow, app, interface, table, trigger, schedule, connection, event, doc, and now **variable** (`variable:read`), **saved query** (`resource:read`), **data source** (`data_source:read`), and secrets **by name** (`secret:read`, never a value) (S/routes/search.ts:12-27; SHL-13). Runs by ≥8 hex characters of the ID or `tag:x`. People by name/email, only with `@` (`member:read`, `end_user:read`). 20 results (limit 1 to 50); filtered by permission.
- Recent now holds pages, variables, saved queries (opened by `?query=`) and data sources. **Still not**: apps, triggers, schedules, dashboards, drafts that were never deployed (fixed/t3-account.md, SHL-13).

**shortcuts** (C/kit/shortcuts.ts, complete)
- Everywhere: Mod+K; ?; /; F1 or Mod+/.
- Go to (second key within 1 s): g o, g r, g f, g s, g t, g a. Outside a workspace only g a works.
- Lists: j k ↑ ↓; Enter; Mod+Enter; x or Space; Shift+j/k (works now, SHL-02); Mod+A; Esc (uncheck); Esc (close inspector).
- Editors: a (add to page), Mod+S, Mod+Enter ("Run the draft"), Mod+Z, Shift+Mod+Z or Ctrl+Y.
- Flow editor: Mod+D; Mod+C/X/V; Shift+F10. Palette: > # / @ Mod+Enter. Logs: Mod+F.
- Not on the sheet: ←→ Home End PageUp/PageDown, Ctrl/Cmd+Home/End, Shift+↑↓, Shift+click, middle-click (DataTable.tsx); Mod+P; splitter arrows (Shift = bigger), Home, End, Enter folds, double-click resets.
- "Single-key shortcuts" checkbox (CommandPalette.tsx:967). The sheet marks a row "(off)" only when every key of it turns off, and "(single keys off)" when some do; Enter, Space and Shift+F10 stay on (C/kit/keys.ts:71; SHL-03). Undo/redo/Mod+D are ignored in fields. Keys show as ⌘ on a Mac and Ctrl elsewhere (`formatCombo`, SHL-04).

**lists** (C/kit/DataTable.tsx, views.tsx, paged.tsx, ListCollection.tsx, BatchResult.tsx, layout.tsx)
- Header sort ▲ ▼ ↕: ascending → descending → none. Among workspace lists only Runs (Started, Duration) uses DataTable sorting; table rows use the grid's own.
- "Columns" dialog: checkbox, drag, arrows, "Show every column", "Done"; first column fixed unless the list says otherwise (views.tsx:202-330). Where: Runs, Audit, table rows, result tables.
- "Row density" Compact/Standard/Comfortable: Runs only (default Compact) (C/screens/Runs.tsx:227). Table rows have "Compact rows"/"Standard rows".
- "Saved views" on Runs, Events, tenant Audit log, table rows: "Save this view…", "Save over “x”", "Rename “x”…", "Delete “x”", "Copy a link to this view". Private; 50 per list, name ≤80, unique (S/routes/preferences.ts:23, 38). Members only. The audit log's new filters (dates, workspace, who, action, done to) are kept in a view and in the address.
- Batch bar: "n selected", actions, **Clear**. Runs: Cancel, Run again; Triggers: Pause, Resume; Approvals: Approve, Reject; Release drafts: discard. A selection of more than 100 is sent in slices of 100, one after the other, and the answers are added up (C/kit/BatchResult.tsx `inSlices`; S/routes/batch.ts:19 allows 100 per request). Rows that leave the list are dropped from the selection (opsa). Failures dialog: "n done, n not done.", per-item reason, Request ID, "Retry the n not done" (BatchResult.tsx:132-168).
- "Load more" (50; Runs 100); Audit "Show older entries".
- Empty/filtered/error: "Nothing matches these filters" + **Clear filters**; "Nothing matches" + "Try fewer or other words." for a search; "Could not load x." + Request ID + **Try again** (403: ask an owner/administrator, no retry).
- Address: filters replace, opening a row pushes, so Back closes it. Inspector resizes 288–720 px, one width for all lists. A docked inspector moves toasts left of it (WLK-12f).
- Tables are never narrower than their columns need: they scroll sideways in their frame; headers do not wrap (fix-narrow; WLK-17a).
- Create: >3 fields opens a side sheet; Cancel forgets input.

**saving-and-leaving**
- SaveBar: "Unsaved changes", **Discard**, **Save**, Mod+S (C/kit/SaveBar.tsx:74-88). Used by Branding, SSO, Provisioning, Retention, Workspace settings, Component kit. It rests on the bottom edge and returns focus to where it was after Discard or Save.
- Guard: "Leave without saving?" **Leave**/**Stay**; closing the tab uses the browser's prompt (C/router.tsx, C/ask.tsx:25). **Sign out** asks first, and if the sign-out request fails says "You could not be signed out. Check your connection and try again." and stays signed in (C/App.tsx:177-190; SHL-06, SHL-17). Signing out clears this browser's settings, pins and cached reads (C/clearSession.ts; SHL-07).
- **Your session ended**: when a request is refused as signed out, a dialog over the page asks you to sign in again (password, or the provider in a new tab). The same person resumes with the draft kept; another person gets a clean reload. It cannot be dismissed (C/SessionSheet.tsx:64; SHL-08).
- Toasts: 5 s, 10 s with link/action, failures until dismissed, 3 visible, hover/focus holds, Esc dismisses; "What does this mean?" opens reference/errors. Undo in toasts: App Builder, page editor, Documentation, flow editor (removing a step never asks, D34).
- Tasks: the person is told after 20 s without a worker (C/tasks.ts).
- NotFound: "Nothing here" + link back. "For operators" for an Instance address when you are not one. Crash: "This page could not be shown." Try again/Reload/Go back.

**what-you-may-do** (C/kit/Can.tsx; fixed/sweep-can.md, fix-gating.md)
- A screen a person may read and not change shows a line under the title: "You can see X, not change it. It needs P. Ask …". Its create and row-action controls are greyed with the reason, not hidden. A permission given at a workspace counts there alone; a role given on one flow counts for that flow.
- "What I may do here" in the account menu opens your own member page, and lists what you hold and where it comes from.
- A person with a grant only inside a workspace sees its name but no section list.
- Counts the person may not read are said, not shown as 0: workspace overview "Nothing you can see needs you here", "Some of this you cannot see" (Overview.tsx:432-445, SHL-09).

**help** (C/help/HelpPanel.tsx, HelpDock.tsx). **Phase 30 M7 changes this panel** (breadcrumbs, previous and next, "Open in documentation"); write this page after it.
- Today: Title, "Back to the help for this page", "Copy a link to this help", "Close help", "Search the help" (results show up to three places per page, opening at the heading), "From your team", "Underline my team's terms on screens" (kept now, SHL-01), "New in version X" under a page that sets `since`.
- Docked ≥1280 (over the page if an inspector is docked, until 1680), overlay on tablet, full screen on phone. `?help=<topic>`. Served by the instance; offline.
- ⓘ: "About {title}"; descriptions show once per list, then fold. Field ⓘ text comes from kind schemas.

**account** (C/screens/Account.tsx), at `/account/api-keys`; title "Account", "Your name, your password, your sessions and the keys that act as you." Panels in this order:
- **API keys**: columns Name, Key (`prefix…last4`), Last used, **Expires**, Status Active/Expired/Revoked. **Create API key**: Name and **Expires** (Never, In 30 days, In 90 days, In a year; C/kit/expiry.ts); shown once, "Copy this key now…", **Copy the key**, **Done** (asks "Close without copying the key?" if not copied); **Revoke**. A key acts with your permissions.
- **Profile**: Name (read only, "Your name comes from {provider}. Change it there.", when a SCIM directory pushes it), your email, Save; "Your name is saved."
- **Password**: Current password, New password (at least 12), New password again; changing it signs your other sessions out; a wrong one says "The current password is not right."
- **Sessions**: Device ("Firefox on Linux"), Address, Signed in, "This session" marked; **End** (asks, "End this session?") and **End other sessions** ("End all other sessions?"); "You are not signed in anywhere." when empty. The session in use has no End: sign out is in the account menu.
- **Recovery codes**: only for direct `tenant_admin` holders. "Codes left", "Made", **Make recovery codes**/**Make new codes** ("Make new recovery codes?"), "Copy these codes now. They are not shown again.", **Copy all**, **I have kept them**. 10 codes, `xxxxx-xxxxx`; warning at ≤2.
- **Absent:** MFA, passkeys, a preferences page, a profile picture.

**workspace-overview** (C/screens/Overview.tsx)
- Header: env tag, "Triggers paused"/"Triggers paused by the instance", "Running vN", **Review changes** (dev with drafts; opens `/changes`, which is the Deploy screen's review step) or **Open runs**.
- "Needs attention": failed runs in the last 24 hours (Open failed runs), git conflict (Resolve), approvals "waiting for you" (Decide) or "for someone else to decide" (See who), connections "have nothing bound here" (Configure), "n drafts not deployed" (Review), triggers paused (View settings), else "Nothing needs you here"; for counts the person cannot read "Nothing you can see needs you here" or "Some of this you cannot see".
- "Runs · last 24 hours": Succeeded, Failed, In progress, Median time, hourly bars; **All runs**.
- **Deploy** (was "Release"): Draft n → this workspace "vN" or "nothing deployed" → the linked workspace; "{name} runs the same bundle as this workspace." / "runs a different bundle. Promote to bring it up to date." / "This workspace promotes nowhere."; link **Deployments**.
- "What starts work here" (first 8; "Nothing starts by itself yet")/**All triggers**.
- Count permissions: S/routes/summary.ts:133-143.

**tenant/overview** (C/screens/TenantOverview.tsx)
- Needs attention: approvals "waiting for you" / "for someone else to decide", "n hostnames to check" (Check), "n operators inside this tenant now" (Review), "No worker is online" (shown only when the tenant has no managed workers, SHL-10). Empty: "Nothing needs you" or "Nothing you can see needs you".
- "Promotion requests" (PromotionRequests, C/screens/Promotion.tsx) → **Review**: **Promote**, **Decline** (reason required).
- Workspaces (12, production first; **All workspaces**), "At a glance", "Recent changes" (8, `audit:read`; "The audit log is not open to you here."), **Rename**, and the console-code switch.

## C. Gotchas
- Tenant Approvals counts only approvals surfaced to the tenant; a workspace counts all of its own.
- A wrong password with a valid recovery code still spends the code; the form says so (D18).
- A view's link works for anyone who may open the list; deleting the view does not break it.
- Failed counts: last 24 hours, flow steps not double-counted.
- List keys work only with focus inside the table.
- Recent and "last place" are kept only where you are a member, not under operator access; not audited.
- Preferences follow the member across browsers; max 200, 4 KB each (S/routes/preferences.ts:20-22). Allowed keys are fixed (`PREFERENCE_KEY`, line 17).
- API keys act with your permissions.
- Retry of a batch covers only failures.
- Sign-in at an app's own address is a different sign-in (30 days for an end user, 12 hours for a member at an app's address, SECURITY.md); the console's is 7 days.
- Tutorial and screenshot work: dev workspaces start with triggers paused.

## D. Wrong, stale or missing docs (existing pages, unchanged since phase 28)
- start/account (7 lines): promises "your own preferences"; none exist. Says nothing of Profile, Password, Sessions, key expiry, recovery codes.
- start/tenants (7 lines): says it opens the last workspace; it opens the tenant overview. Root-URL return undocumented.
- start/index: "where you start each day" is wrong: the root reopens the last place.
- start/workspace-overview (11 lines): omits First steps, git, connections, paused, Deploy, triggers.
- tenant/overview (11 lines): omits promotion requests.
- docs/evolution/specs/S8-command-palette.md: trigram match and Pause as a secondary action are not what shipped.
- Missing glossary terms: instance, operator, trigger, approval, deploy, environment.
- Every page that says "Release" for the deploy screen, "Activate", or "Published apps" (fixed/voc-state.md, voc-access.md).

## E. Findings, settled
Each was a bug or open question at `270e509`. Outcomes are in `fixed/shl.md` unless named.
1. `terms.underline` refused by the server: **fixed** (SHL-01). Also `palette.pins:none` (SHL-12).
2. Shift+j/k: **fixed** (SHL-02).
3. "(off)" marks on single-key rows: **fixed** (SHL-03).
4. ⌘ shown on every platform: **fixed** (SHL-04, `formatCombo`).
5. SSO from a deep link loses the link: **fixed** (SHL-05).
6. Sign out skipped the unsaved guard: **fixed** (SHL-06); failed sign-out stays signed in (SHL-17).
7. Settings stay in the browser after sign-out: **fixed** (SHL-07, C/clearSession.ts). A setting changed less than 400 ms before sign-out is dropped.
8. Expired session left errors on screen: **fixed** (SHL-08, "Your session ended"). Still true: a page with only an event stream notices at its next request; `C/prefs.ts` sends and `Authoring.tsx:66` bypass the handler.
9. Counts the person may not read read as 0: **fixed** (SHL-09).
10. "No worker is online" ignored managed workers: **fixed** (SHL-10).
11. Rename showed without `tenant:write`: **fixed** (SHL-11, `mayRename`).
12. Palette: pins outside a tenant fixed (SHL-12). Variables, secrets, queries, data sources found and remembered (SHL-13, fixed/t3-account.md). **Still true:** drafts, dashboards, apps, triggers, schedules are not remembered.
13. Failed provider lookup fell back to password: **fixed** (SHL-14).
14. Sessions, password change, key expiry, profile name: **built** (fixed/t3-account.md MP2-MP4; fixed/ins2.md `ChangePassword`). A forgotten password for a locked-out operator: `recover-operator <email>` (D3; S/commands.ts:13-30), which `docs/self-hosting.md` does not yet mention (grep finds nothing). **A reset link for other members was not found in the code** (D4 says one is built; only end users have "Password reset link", C/screens/EndUsers.tsx:225). Ask the owner before writing "who resets a forgotten password".
15. `/tenants` listed a tenant you are suspended in: **fixed** (SHL-15).
16. A wrong password spends a recovery code: kept by decision D18; the form says so.

## F. Screenshots
Sign-in steps 1, 2 and recovery; "Your session ended"; approve link; tenants as member and operator with inspector; First steps; workspace overview (busy); tenant overview with promotion request; shell annotated (dev and production); revealed rail flyout; read-only strip; palette empty, results, `/`; shortcut sheet; Runs with batch bar and inspector; Columns dialog; Saved views menu; batch result; toast with Undo; Leave dialog; a screen with "You can see … not change it"; help docked and on phone; phone drawer; Account (keys, Profile, Password, Sessions); new key; recovery codes; dark theme; operator strip; NotFound. Existing under packages/docs/assets/screenshots/console: documentation, page-editor, table-help. Phase 30 M10 takes them with the screenshot spec.
