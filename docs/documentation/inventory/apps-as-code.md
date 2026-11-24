# Inventory: apps as code

Read from the code at `270e509` on 2026-11-22. Refreshed 2026-11-23 against the code after phase 29 (branch phase-30-docs-system). A report, not checked prose.

**Refreshed 2026-11-23.**
- Changed since the first reading: the Apps screen has search, a Built filter, sorting and a Remove button (APP-MP3); "Open to" names every kind of principal and the broader bindings (APP-03, APP-14); an unpublished docs app has no link (APP-08); Stop sharing keeps tables another shared app reads (APP-12); file names may start with `.` or `_` (APP-05); only hash-shaped names are cached for a year (APP-04); a screen with a dot answers the page (APP-15); a member's groups reach code apps (APP-16); `volvel dev` serves under the app policy and returns sign-in to localhost (APP-MP1, APP-10); files no app names are swept after a week (APP-17); a guest cannot start a script or a flow (APP-02, D39); a member's own runs reach `useRun` (APP-01); the portal home leaves out code apps that cannot be served (APP-09); the tenant may enable again a hostname an operator enabled (APP-13, D48); the guest-pages limit is counted in the database (section B, rate limits).
- Vocabulary applied: Apps (not Published apps), Flow, canceled in prose (the stored status value stays `cancelled`).
- Section E is settled: each item names its outcome in `fixed/app.md` or says it is still open.
- Not verified: nothing was run in a browser; every claim below was read in code. The walks of the Apps list and Share sheet at 390 px are written in `fixed/app.md` and `fixed/t3-config.md` as not run. The `SCREENS_DIR` 503 message and the `Accept`-header page rule were read, not exercised. The claim that two tenants' code at one APPS_URL share an origin is from the code's design (separate hosts per tenant are the remedy), not a test.
- Findings that no longer apply are deleted, not kept as history: see `fixed/app.md`.

## (A) Pages

Collections: Get started, Console, Develop, Administer, Self-host. Types: tutorial, how-to, reference, explanation. Paths are today's (`packages/docs/content`); phase 30 M4 moves and renames them.

| Page (today's path) | Collection | Type | Topic | Purpose | Sources |
|---|---|---|---|---|---|
| Apps (build/published-apps.md, 7-line stub; retitle "Apps") | Console | reference | `build-apps` (apps/console/src/nav.ts:126) | The Apps screen: list, inspector, search and filter, Remove | apps/console/src/screens/Apps.tsx:476-742 |
| Share an app (new) | Console | how-to | `build-apps-share` (new topic; the Share sheet has none) | Who may open an app, what each choice gives, Stop sharing | Apps.tsx:109-454 |
| Your first app as code (new) | Develop | tutorial | – | From `defineApp` to a deployed, shared app, using `volvel dev` on the way | examples/acme/src/index.ts:519-560; packages/cli/src/cli.ts:577 |
| Write an app (build/writing-an-app.md, new; topic `build-writing-an-app`) | Develop | how-to | `build-writing-an-app` | Layout, Vite, `defineApp`, `defineBinding`, deploy, file rules, limits | packages/sdk/src/index.ts:1216, 1360; packages/cli/src/apps.ts:92-162; packages/manifest/src/bundle.ts:79-120 |
| Run an app while you write it: `volvel dev` (new) | Develop | how-to | – | Start, port, `--no-strict`, what differs from deployed | packages/cli/src/cli.ts:577-618; packages/cli/src/dev.ts |
| App client, @volvel/app (build/app-client.md, new) | Develop | reference | `app-client` | Every export: context, `api`, `table`, runs, flows, session, hooks, help | packages/app/src/index.ts; client.ts; hooks.ts; stream.ts; help.tsx |
| Follow a run from an app (new) | Develop | how-to | – | `startFlow`/`useFlowRun`, `runScript`/`useRun`; no example uses them yet | client.ts:333-460; hooks.ts:88-170 |
| App access (build/app-access.md, new) | Develop | explanation | `app-access` | Sessions, roles and bindings, row policies, guests, limits | apps/control-plane/src/kernel/authorize.ts:170-200; kernel/apps/sessions.ts; kernel/http.ts:83-90 |
| What an app may load: the content policy (new) | Develop | reference | – | The policy, cache headers, injected context | packages/manifest/src/app-policy.ts; kernel/apps/front.ts:1020-1090; pages.ts:374-392 |
| Hostnames for apps (tenant/domains.md, stub) | Administer | how-to | `tenant-domains` | Add, verify, enable, change what it serves, disable, remove | apps/console/src/screens/Domains.tsx; routes/apps.ts:960-1010 |
| App addresses (instance/app-addresses.md, new, from self-hosting.md:359-407) | Self-host | reference | `instance-app-addresses` | APPS_URL, APPS_ON_CONSOLE_ADDRESS, hostnames, portal | kernel/apps/hosts.ts:55-95; config.ts:70-80, 233-241 |
| tenant/branding.md, tenant/end-users.md (stubs, other inventories) | Administer | – | – | Link theming and sign-in from here | – |
| build/documentation.md (exists) | Develop | – | – | Docs apps: link only | – |

Add the new pages to `pages:` in the collection's index.

Deliberately not there, and the pages say so:
- `volvel dev` for interface and docs apps (CLI-MP7). Decision D64 builds it in phase 30 after M1; until then it serves code apps only ("This repository defines no app." otherwise: dev.ts:47). Check at write time.
- Unpublishing an app made in the console: only docs apps have `published` (fixed/t3-config.md, APP-MP3 Left). Taking one out of service is removing it.
- Preview, branch, a count of files an app no longer names, row-change subscriptions, single people, service accounts and custom roles in the Share sheet (use Access).

## (B) Per page

### Apps (apps/console/src/screens/Apps.tsx)

**Where:** Build → Apps (nav label "Apps", nav.ts:126), `/t/:t/workspaces/:w/apps`. The selected app is in `?app=` (:488), by ID or by path. No tabs: a list, an inspector, and a Share sheet with two tabs. Opening an app is remembered in Recent (:492).

**List (:529-634)**
- Title "Apps". Toolbar: a search box ("Find by name or path"; label "Find an app"), and "Built" filter chips with counts: All, App Builder, Repository, Documentation.
- Columns: App (title, path; sortable), Address (the path URL plus enabled hostnames; "Not published" for a docs app switched off), Open to ("Staff only" if no one is bound; amber if public), Built (sortable; `App Builder` / `Documentation` / `Repository`).
- "Open to" lists who is bound at the app and, after them, who reaches every app by a binding at the workspace or tenant, as "customers (whole workspace)" or "anyone (whole tenant)" (:63-71; fixed/app.md APP-03, APP-14).
- Empty states: "No apps yet" (text: an app is defined in the repository with defineApp, or made in the App Builder); "No app matches" ("Clear the search or choose All.").
- The list shows deployed apps. An app removed in the console stays listed until its removal draft is deployed.
- Notice when `GET /instance` `appsAddress==="none"` and a repository app exists: "Apps built in the repository are not served on this instance yet…" (:519-528).
- Search and filter are not kept in the address; a reload clears them.

**Inspector (:635-738)**
- Footer: Share (needs `binding:write`); for an app made in the console, the shared Remove draft button (needs `resource:write`, or `interface:write`/`doc:write` for an app of that kind; says "Its address stops serving once that draft is deployed."); for a repository app, "Managed in the repository: the app is removed there."; "Open the live app" (absent for an unpublished docs app).
- A notice "Anyone with the address can open it, without signing in." when public by a binding at the app, the workspace or the tenant.
- Rows: Address ("Not published: switched off in the repository, so nothing is served" for a docs app with `published:false`), Hostname / "Hostname (off)" (a disabled one is still linked), Built ("In the App Builder (<interface>)", "From the pages under <docs>", "In the repository"), Files (repository apps only: count and size), Reads ("Nothing declared"), Open to ("Staff whose role lets them read this workspace" when empty).

**Share sheet, "Share {title}" (:109-454); the footer button is Done**
- *Who has access:* a fixed row "Staff whose role lets them read this workspace" ("always"). Then read-only rows for broader bindings: "{who} may open every app of the whole workspace / whole tenant", tagged "under Access". Then the bindings at the app, each "may read" (portal_reader), "may read and change" (portal_user), or "as {role}". A binding made by the repository is tagged "From repository" and has no button. "Nobody else yet." when none. Stop sharing asks first and names what goes with it: the app's tables; a table another shared app of the workspace reads, for the same people and role, stays, and the text says "N table stays, for K other app that uses it: names".
- *Add an audience* (button "Share"):
  - "Share with": Every end user who signs in / End users in X / Members in X / Anyone, without signing in (shows a warning).
  - "They may": Read / Read and change.
  - It POSTs one binding for the app and one for each table it reads, skipping ones already held. It is sequential, with no rollback (:310-326). A line says which tables are given with it.
  - Groups and end-user groups are fetched with `limit=200`. Single people, service accounts and custom roles are not offered; use Access.
- *What they can read:* each table's policy tag ("Row rules", open, owner), and "Someone in X sees N rows" for group audiences on non-open tables (`aggregate?asGroup=`; needs `data_all:read`). The empty text depends on how the app was built: a code app "declares no tables. Ask its developer to list them with `reads` in defineApp."; a docs app "reads no table"; a builder app "shows no table".

**Permissions:** list `app:read`; share `binding:read`/`binding:write` at the scope, plus `role:read`, `group:read`, `end_user_group:read`, `resource:read`. Only repository apps have a `reads` list; builder apps' tables come from their widgets. `workspace_admin` now holds `interface`, `doc` and `git` (D57).

**Absent:** no preview, branch, unpublish (see Section A) or per-person sharing. Publishing happens in the App Builder or by deploy. Preview is `volvel dev` or the dev workspace's own address. A docs app has a draft preview at `<app>/_draft/` (front.ts:845-850).

**Also changed:** an app's name is at most 100 characters (D52; kinds.ts app `title`).

### writing-an-app

**`defineApp(options): AppDefinition`** (packages/sdk/src/index.ts:1216)
- `path, title, description?, source?|interface?|docs?` (exactly one of the three, else the SDK throws), `entry?="index.html"`, `fallback?=true`, `reads?` (at most 100 paths), and docs-only `feedback?:{table}`, `published?` (a docs-only field; used elsewhere it throws). Kind schema: manifest/src/kinds.ts:1336-1405.
- An app with no code can also be YAML: `platform/desk.app.yaml` (examples/higher-ed-devices). Tenant access (groups, roles, bindings at the tenant) is YAML only (D53).

**`defineBinding({path, role, principal, resource?, description?})`** (:1360)
- Principals (:1325-1343): member (email), group (prefer `key`; `name` still works and stops working when the title changes), service_account (`key` or `name`), end_user (email), end_user_group (`key` or `name`), `end_users`, `anonymous`.
- `defineRole` :1315, `defineTheme` :1148 (one per workspace; path defaults to `theme`). The SDK's `ThemeToken` has every token the schema accepts (APP-06).

**Layout:** `apps/<name>/index.html`, `main.tsx`, `styles.css` with `@import "@volvel/ui/tokens.css"; @source "./";`, and `apps/env.d.ts`. devDependencies: vite, @vitejs/plugin-react, @tailwindcss/vite, tailwindcss. Import tables as types only. See examples/acme.

**Build (packages/cli/src/apps.ts:92-162)**
- Uses the repository's own Vite. The react and tailwind plugins load automatically unless the app has its own `vite.config.*` (that config wins) (:88-90). `base:"./"`, production mode.
- Output goes to a temporary `.platform/apps-<pid>-<random>/` folder, so a build beside `volvel dev` does not clash.
- Refused: source outside the repository, missing index.html, Vite not installed.
- Bundle checks (packages/manifest/src/bundle-check.ts:491-541): the entry must be among the files; nothing under `_/`; no duplicate files.
- File paths match `ASSET_PATH_PATTERN` (bundle.ts:79) and are at most 500 characters: letters, digits and `. _ @ ~ -`; a part may start with one `.` or `_` followed by a letter or digit (so `.well-known/assetlinks.json` and `_commonjsHelpers-1a2b.js` deploy); `.` and `..` and a path starting `_/` are refused; spaces and non-ASCII are refused. The error names the file and says to rename it, in `public/` or in `build.rollupOptions.output` (APP-05).
- Limits: 25 MB per file (assets.ts:10), 5,000 files per bundle (bundle.ts:120), 20 MB bundle JSON (kernel/execution/bundles.ts:21).
- `deploy` uploads only new files, 6 at a time, and prints "App files: N, M new." (cli.ts:331-356). Upload is `PUT …/bundle-assets/:sha256` (`bundle:write`). A bundle with missing files gets 409 `assets_missing` (bundles.ts:108). Files are stored once per tenant.
- Files no deployable bundle names are removed a week after the deploy that stopped naming them (APP-17, D40). A bundle older than a week is deployed again by uploading its files again, which the CLI does by itself.

**`volvel dev [app] --tenant --workspace [--port] [--no-strict]`** (cli.ts:577-618; dev.ts)
- Default port 5174; the next free one if taken.
- Serves under the platform's own content policy (the same `appPolicy()` the instance uses, plus a per-run nonce on `script-src` and `ws://localhost:*` on `connect-src` for reload), so what a deployed app would refuse is refused here. It prints that, and "A browser's console says what it refused". `--no-strict` turns the policy off and says so (APP-MP1).
- Proxies `/api` to the instance with your key, and `/portal` to the instance, so sign-in returns to localhost (APP-10). Works with any workspace type, production included.
- App name may be omitted only if there is one app ("Say which app: …").
- Page context: `base:"/"`, `portal:"/portal/<tenant slug>"`, `tenant.logo` true or false (read from the instance), `principal.groups` and `.attributes` not filled. End-user sign-in in dev does not change the API calls, which carry the developer's key.
- Code apps only for now (see Section A).

**Content policy (packages/manifest/src/app-policy.ts; front.ts:1020)**
- `default-src 'self'`; `script-src 'self'`; `connect-src 'self'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self' data:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'self'`.
- Plus nosniff and `referrer-policy: same-origin`. The page is `no-store`. A file is `private, max-age=31536000, immutable` only when its name holds the first 8 hex characters of its digest, or `-`/`.` plus exactly eight `[A-Za-z0-9_-]` with a digit or capital (`isHashedName`, front.ts:105; `logo-horizontal.svg` is not); other files get an ETag and `private, no-cache` (:1083-1087).
- An address that names no file answers the page when the app's `fallback` is not false and either the browser asks for HTML or the last part has no dot (:1016-1019). Otherwise 404.

**Injected:** `<base>`, `#vx-context`, theme.css, tenant icons unless the app names its own (pages.ts:374-392).

**@volvel/ui:** `PageShell` (phone: nav scrolls in its own row), `Table`, `Form` (JSON Schema), `Chart` (Vega-Lite, CSP-safe interpreter), `Tabs`, `ToastProvider`/`useToast`, and more. Icons from `@volvel/ui/icons`. (Not re-read in this refresh.)

### app-client (packages/app/src; index.ts lists all exports)

- **Context:** `appContext()` throws when not served by the platform; `setAppContext(ctx|undefined)` is for tests. Types `AppContext`, `Principal`.
- **`api.get/post/put/patch/delete<T>(path, body?)`:** paths omit `/api/v1`. Retries on 503 with Retry-After, waiting at most 5 s each (client.ts:88-104).
- **`ApiError`:** `{status, code, message, errors[{path,message}]}`.
- **`table<typeof t>(path)`:** `find(options)→Row[]`, `page→{items,nextCursor}`, `get(id)→Row|null`, `insert`, `insertMany` (≤1,000, all or none), `update(id, changes)`, `delete`, `aggregate({group≤3, measures≤5, filter, sort, limit})` (rows.ts MAX_GROUPS, MAX_MEASURES).
  - Filter ops: eq ne gt gte lt lte in has contains not_contains is_null, plus and/or; at most 50 conditions (rows.ts:505, 601). `limit` default 50 (aggregate 200), max 1,000.
  - Aggregates have a 5 s limit (rows.ts:773); data requests answer 422 `too_slow` past theirs.
  - `totalOf(result, measure)`.
- **Runs:** `runScript(script, input?, {timeoutMs=60000, idempotencyKey})` throws `RunError`; `scriptRun(id)`. Run status: queued, running, succeeded, failed, `cancelled` (the stored value; say "canceled" in prose).
- **Flows:** `startFlow` returns at once; `runFlow` waits and throws `FlowRunError`; `flowRun(id)`.
- **Signed-in only:** a guest who starts a script or a flow gets 403 "Sign in to start a script/flow…" (APP-02, D39). A form on a page still starts a run for a guest. Say so on the app-client page.
- **Docs:** `terms()`, `helpUrl(topic)`, `useHelp(topic)→Help|null|undefined`, `<HelpPanel topic children="Help" className>`. Docs at another origin open in a new tab.
- **Session:** `session()→{principal, signUp}`, `signInUrl(returnTo?)`, `staffSignInUrl(returnTo?)`, `signOut()`, `logoUrl()→string|null`.
- **Hooks:** `useQuery(load, deps)→{data,error,loading,reload}`; `useSession()→{principal,signedIn,groups,attributes,refresh}`; `useRun(id)`, `useFlowRun(id)→{data,error,ended,live}` (looks every 2 s while no stream is connected). `runStream`, `changeOf(id, ms)`.
- **Realtime:** one EventSource per page on `/tenants/:t/stream`. A person who may read runs here gets those, and their own runs wherever they are (APP-01). Someone who may read no runs follows only their own, on at most 2 streams; others get 5 (kernel/stream.ts:67-69; 429 `too_many_streams`). Guests get 401 and the client polls. A refused stream isn't retried on that page. There are no row-change subscriptions.

### app-access

- **Opening** needs `app:read` (front.ts:957). Signed-out people are redirected to sign-in (`/sign-in?return=`); signed-in people without access get 403 and the page "Not for this account".
- **Built-in roles:** `portal_reader` (app:read, data:read), `portal_user` (+data:write) (builtinRoles.ts:27-28). Both follow row policies. Neither includes files.
- **App-only ceiling:** an end user, or a member carried to an app address, holds only app-facing kinds whatever they are bound to: script, run, flow_run, table, data, data_all, file, app, theme (manifest/permissions.ts, `appFacing`; authorize.ts:170-200). A binding to `anonymous` gives nothing outside those kinds (D8, ACC-01).
- **Bindings are per resource.** Binding a role at an app gives no table access; the Share sheet adds each table's binding for you. Bind each table (`data:read`), script (`run:write`) and flow (`flow_run:write`) as well. Whoever started a run may read it.
- **Scripts run as the workspace.** Use `ctx.run.startedBy` and `.as(id)` to act for the person (sdk/context.ts:22; acme `orders/request`).
- **Policies:** open, owner, rules (apps.test.ts).
- **Sessions (kernel/apps/sessions.ts):** cookie `vx_app_<tenantId>`, per host, HttpOnly, Lax, Secure over HTTPS. End user 30 days (:8); carried-over member 12 hours (:10). (A console session is 7 days, D51; not this cookie.)
  - On PUBLIC_URL a member's console session is used; elsewhere it is ignored.
  - Hand-off code (`/app-handoffs/start`, routes/apps.ts:1084): one use, 60 s (:163), host-bound, a member's own sign-in only (an API key is refused).
  - Non-GET requests from another origin: 403 `cross_site` (kernel/principal.ts:92).
- **Rate limits:** guest pages 600/min per address, counted in the database so every replica shares it (front.ts:179); guest files (hashed assets, icons, fonts) 1,200/min per address, counted in each replica's memory (:181); guest API 120/min per route (kernel/http.ts:83-90); forms 20/min; docs votes 30/min.
- **Theming:** kit, then tenant, then workspace theme. A light-only value doesn't carry to dark (theme.ts:131). Values: `THEME_VALUE_PATTERN` (kinds.ts:1302), and `url`, `image`, `expression`, `var(`, `env(`, `attr(` refused (:1303).

### app-addresses / domains

- Path: `/apps/<tenant>/<workspace>/<app>/`; portal: `/portal/<tenant>/`; on a hostname the portal is `/_/`.
- **APPS_URL set:** PUBLIC_URL redirects apps there (307 for pages, 308 otherwise; front.ts:1487) and there is no console at APPS_URL. APPS_URL must be a different host from PUBLIC_URL (config.ts:241). Not set: code apps answer 503 unless `APPS_ON_CONSOLE_ADDRESS=true`; builder and docs apps still work (hosts.ts:86).
- **Hostname** serves one app at `/`, or the portal plus every app of the workspace by path. The API there answers for that tenant only.
- **Domains screen (Domains.tsx):** "Add a hostname" (Workspace, Serves, App, Hostname). A hostname's sheet shows its state (on/off; unverified, verified, or "Verified, record gone"), "Change what it serves" (to another app, or the portal; GOV-P6), then steps "1 · Point the name here", "2 · Show the name agrees" (Record name `_vx-challenge.<host>`, Record value, each with Copy), "3 · Check and enable" (Check now, Enable/Disable, Remove). Disable on an enabled hostname asks first and says sign-ins end (GOV-35). Needs `domain:write`.
  - Enabling without verification: operators only (409 `domain_not_verified`, with the words "Create the DNS TXT record and run a check first. An operator of the instance can enable a hostname without it."). A name an operator enabled may be enabled again by the tenant after the tenant turned it off, until an operator disables it (APP-13, D48).
  - A verified name whose record disappears keeps working, is shown as "Verified, record gone", and is audited once (D45). A verified, disabled hostname answers 404 "not served here".
  - A hostname is unique only while verified or enabled; another tenant holding it makes a check or enable answer 409 (GOV lane gov.md).
  - Changes reach other replicas within 30 s (not re-verified in this refresh).
- **Renames:** the app's old path redirects 308 (front.ts:873-888); hostnames are carried (kernel/rename.ts:57).
- **Portal home** lists up to 100 apps (front.ts:795), production workspaces only, and leaves out code apps the instance cannot serve (APP-09); a portal hostname lists its own workspace's.

## (C) Gotchas

1. The dev server now has the app's content policy unless `--no-strict`. Inline scripts, CDN fonts and calls to other sites fail in dev as deployed. WASM is also blocked (no `wasm-unsafe-eval`).
2. In dev you are the developer, usually with `data_all`, so row rules aren't exercised.
3. (Fixed, APP-15.) A screen with a dot (`/users/j.smith`) answers the page when the browser asks for HTML. A request for a missing file with an extension, not asking for HTML, is 404.
4. `<base>` makes `href="#x"` resolve to the app root. Use `location.hash`, as fernhill does. Hard-coded `/logo.png` breaks under a path.
5. `signOut()` at PUBLIC_URL leaves a console session, so staff stay signed in.
6. (Fixed, APP-16.) `principal.groups` is now filled for a member in code apps too. It is still empty under `volvel dev`.
7. Bindings at the workspace or tenant to anyone, end users or an end-user group whose role holds `app:read` now show in "Open to" and in Share, read-only, "under Access" (APP-14). A workspace-level binding to members does not show there.
8. (Fixed, APP-12.) Stop sharing keeps a table another shared app reads for the same people.
9. Operator access grants don't count at app addresses.
10. Widget approvals can't be decided where code apps can run; the widget links to the console (403 `decide_in_console`, kernel/pages/approvals.ts:531; decision 0007).
11. Code of two tenants' apps at one APPS_URL shares an origin. Give each tenant its own hostname for isolation. (From design, not tested.)
12. A guest cannot start a script or a flow from an app (D39); use a form on a page.
13. Sharing is sequential and has no rollback: a failure part-way leaves some bindings made.

## (D) Docs that were wrong, now checked

- docs/sdk-guide.md now has a section on `HelpPanel` from `@volvel/app` (:361); it still has no section on code apps as a whole (writing-an-app and app-client fill that).
- docs/self-hosting.md was corrected by lane t2-docs: the hostname row says an app at the root or the portal at `/_`; `portal_reader` sits beside `portal_user`; the guests' API limit is counted in the database (:458-461). Its troubleshooting row (:649) still says "the workspace's Apps tab"; the screen is Build → Apps.
- docs/phases/phase-6-apps.md: app-facing list lacks flow_run; names the old npm scope (historical document; not touched).
- README.md no longer says "Apps tab".

## (E) Findings: settled

All of APP-01 to APP-19 are named in fixed/app.md except where noted.
1. Stuck `useRun` (members with `run:read` elsewhere): fixed, APP-01 (stream follows the member's own runs).
2. `runScript`/`runFlow` for guests: settled by D39, APP-02: refused with 403 at start.
3. Raw principal types in "Open to": fixed, APP-03.
4. `HASHED_NAME` regex: fixed, APP-04 (`isHashedName`).
5. `ASSET_PATH_PATTERN` and `_`/`.` names: fixed, APP-05.
6. SDK `ThemeToken`: fixed, APP-06.
7. Inspector links disabled hostnames, the list doesn't: still so; the list shows enabled ones only and the inspector shows "Hostname (off)" with a link. Not a bug the lane fixed.
8. Docs app with `published:false`: fixed, APP-08 (tag "Not published", no link).
9. Portal home lists code apps that answer 503: fixed, APP-09.
10. `volvel dev` sign-in and logo: fixed, APP-10. Left: end-user sign-in in dev does not change API calls.
11. Sharing sequential with no rollback: open; stated in Section B.
12. Unreferenced app files: fixed, APP-17 (D40).
Also settled: CLI-MP7 (`volvel dev` for interface and docs apps) is decided in D64, built in phase 30; Unpublish for a console app is asked, not built.

## (F) Screenshots and examples

**Screenshots:** list with all three Built tags; the search and Built chips; "No app matches"; inspector (repository app with Files; console app with Remove); both Share tabs; "Anyone" warning; a Stop sharing confirmation that keeps a table; unserved notice; Domains sheet with the three steps and "Verified, record gone"; sign-in page; "Not for this account" page; fernhill front-desk with HelpPanel open; e2e/snapshots/tenant-apps.spec.ts phone/desktop. Pictures are taken at 1440 and, for the phone, 390.

**Examples:** acme `portal` + `public` (bindings, `runScript`, `signInUrl`) in examples/acme/src/index.ts:519-590; fernhill `Book.tsx:170` HelpPanel and `shared.tsx:112` RunError handling; higher-ed YAML app (`desk.app.yaml`). Write new ones for `useFlowRun` and `useRun`; no example under examples/ uses them (checked by search).
