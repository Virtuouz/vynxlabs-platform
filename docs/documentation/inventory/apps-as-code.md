# Inventory: apps as code

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

## (A) Pages

| Path (packages/docs/content) | Status | Topic | Purpose |
|---|---|---|---|
| build/published-apps.md | 7-line stub | `build-apps` (apps/console/src/nav.ts:115) | Screen and Share |
| build/writing-an-app.md | new | `build-writing-an-app` | defineApp, layout, build, `volvel dev`, CSP, @volvel/ui |
| build/app-client.md | new | `app-client` | @volvel/app reference |
| build/app-access.md | new | `app-access` | Sessions, roles and bindings, row policies, guests, limits |
| instance/app-addresses.md | new (from self-hosting.md:359-407) | `instance-app-addresses` | APPS_URL, hostnames, security headers |
| tenant/domains.md | stub | `tenant-domains` | Hostnames |
| tenant/branding.md, tenant/end-users.md | stubs, other slices | – | Link theming and portal from here |
| build/documentation.md | exists | – | Docs apps: link only |

Add the new build pages to `pages:` in build/index.md.

## (B) Per page

### published-apps (apps/console/src/screens/Apps.tsx)

**Where:** Build → Published apps, `/t/:t/workspaces/:w/apps`. The selected app is in `?app=` (:395). The screen has no tabs. It has a list, an inspector and a Share sheet with two tabs.

**List (:420-481)**
- Columns: App (title, path), Address (path URL plus enabled hostnames), Open to ("Staff only" if no one is bound; amber if it includes "anyone"), Built (`App Builder` / `Documentation` / `Repository`).
- Empty state: "No apps yet".
- Notice when `GET /instance` `appsAddress==="none"` and a repository app exists: "Apps built in the repository are not served on this instance yet…" (:406-415).

**Inspector (:482-555)**
- Share; "Open the live app".
- Rows: Address, Hostname / "Hostname (off)", Built, Files (code apps only: count and size), Reads ("Nothing declared"), Open to.

**Share sheet, "Share {title}" (:96-367); Done closes it**
- *Who has access:* fixed row "Staff whose role lets them read this workspace — always". Bindings at the app show "may read" (portal_reader), "may read and change" (portal_user), or "as {role}". Repository-managed ones are tagged "From repository" and can't be removed. Stop sharing asks for confirmation.
- *Add an audience:*
  - "Share with": Every end user who signs in / End users in X / Members in X / Anyone, without signing in (shows a warning).
  - "They may": Read / Read and change.
  - It POSTs one binding per app and per table read, and skips ones already held.
  - Groups are fetched with `limit=200`. Single people, service accounts and custom roles are not offered; use Access.
- *What they can read:* each table's policy tag, plus "Someone in X sees N rows" for group audiences on non-open tables (`aggregate?asGroup=`, needs `data_all:read`; someone who owns no row).

**Permissions:** list `app:read`; share `binding:read`/`binding:write` at the scope, plus `role:read`, `group:read`, `end_user_group:read`, `resource:read`. Only repository apps have a `reads` list; builder apps' tables come from their widgets.

**Absent:** no preview, branch, delete, unpublish, search, sort or filter. Publishing happens in App Builder or by deploy. Preview is `volvel dev` or the dev workspace's own address. Docs apps have a draft preview at `<app>/_draft/` (front.ts:1257).

### writing-an-app

**`defineApp(options): AppDefinition`** (packages/sdk/src/index.ts:1078-1182)
- `path, title, description?, source?|interface?|docs?` (exactly one of the three), `entry?="index.html"`, `fallback?=true`, `reads?`, and docs-only `feedback?:{table}`, `published?`. Kind schema: manifest/src/kinds.ts:1302.
- An app with no code can also be YAML: `platform/desk.app.yaml` (examples/higher-ed-devices).

**`defineBinding({path, role, principal, resource?, description?})`** (:1268)
- Principals: member (email), group, service_account, end_user (email), end_user_group (prefer `key`), `end_users`, `anonymous` (:1250).
- `defineRole` :1228, `defineTheme` :1072 (one per workspace).

**Layout:** `apps/<name>/index.html`, `main.tsx`, `styles.css` with `@import "@volvel/ui/tokens.css"; @source "./";`, and `apps/env.d.ts`. devDependencies: vite, @vitejs/plugin-react, @tailwindcss/vite, tailwindcss. Import tables as types only. See examples/acme.

**Build (packages/cli/src/apps.ts)**
- Uses the repository's own Vite. Plugins react and tailwind load automatically unless the app has its own `vite.config.*` (that config wins). `base:"./"`, production mode.
- Output goes to a temporary `.platform/apps-*` folder.
- Refused: source outside the repository, missing index.html, Vite not installed.
- Bundle checks (bundle-check.ts:409): the entry must be among the files; nothing under `_/`; no duplicate files.
- File paths match `ASSET_PATH_PATTERN` (bundle.ts:74): each segment starts with a letter or digit, no spaces.
- Limits: 25 MB per file (assets.ts:8), 5,000 files per bundle (bundle.ts:102), 20 MB bundle JSON (bundles.ts:21).
- `deploy` uploads only new files, 6 at a time, and prints "App files: N, M new." Upload is `PUT …/bundle-assets/:sha256` (`bundle:write`). A bundle with missing files gets 409 `assets_missing`. Files are stored once per tenant.

**`volvel dev [app] --tenant --workspace [--port]`** (dev.ts; cli.ts:357)
- Default port 5174; the next free one if taken.
- Proxies `/api` to the instance with your key. Works with any workspace type, production included.
- App name may be omitted only if there is one app.
- Page context: `base:"/"`, and no `groups`, `attributes` or `logo`.

**CSP (front.ts:86)**
- `default-src/script-src/connect-src 'self'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self' data:`; `object-src 'none'`; `frame-ancestors 'self'`; `base-uri` and `form-action 'self'`.
- Plus nosniff and `referrer-policy: same-origin`. Page is `no-store`; hashed-name files `private, max-age=31536000, immutable`; others ETag plus `private, no-cache`.

**Injected:** `<base>`, `#vx-context`, theme.css, tenant icons unless the app names its own (pages.ts:374).

**@volvel/ui:** `PageShell` (phone: nav scrolls in its own row), `Table`, `Form` (JSON Schema), `Chart` (Vega-Lite, CSP-safe interpreter), `Tabs`, `ToastProvider`/`useToast`, and more. Icons from `@volvel/ui/icons`.

### app-client (packages/app/src; index.ts lists all exports)

- **Context:** `appContext()` throws when not served by the platform; `setAppContext(ctx|undefined)` is for tests. Types `AppContext`, `Principal`.
- **`api.get/post/put/patch/delete<T>(path, body?)`:** paths omit `/api/v1`. Retries twice on 503 with Retry-After (at most 5 s each).
- **`ApiError`:** `{status, code, message, errors[{path,message}]}`.
- **`table<typeof t>(path)`:** `find(options)→Row[]`, `page→{items,nextCursor}`, `get(id)→Row|null`, `insert`, `insertMany` (≤1,000, all or none), `update(id, changes)`, `delete`, `aggregate({group≤3, measures≤5, filter, sort, limit})`.
  - Filter ops: eq ne gt gte lt lte in contains is_null, plus and/or; at most 50 conditions (rows.ts:461). `limit` default 50 (aggregate 200), max 1,000.
  - Aggregates have a 5 s limit; data requests answer 422 `too_slow` past theirs.
  - `totalOf(result, measure)`.
- **Runs:** `runScript(script, input?, {timeoutMs=60000, idempotencyKey})` throws `RunError`; `scriptRun(id)`.
- **Flows:** `startFlow` returns at once; `runFlow` waits and throws `FlowRunError`; `flowRun(id)`.
- **Docs:** `terms()`, `helpUrl(topic)`, `useHelp(topic)→Help|null|undefined`, `<HelpPanel topic children="Help" className>`. Docs at another origin open in a new tab.
- **Session:** `session()→{principal, signUp}`, `signInUrl(returnTo?)`, `staffSignInUrl(returnTo?)`, `signOut()`, `logoUrl()→string|null`.
- **Hooks:** `useQuery(load, deps)→{data,error,loading,reload}`; `useSession()→{principal,signedIn,groups,attributes,refresh}`; `useRun(id)`, `useFlowRun(id)→{data,error,ended,live}`. `runStream`, `changeOf(id, ms)`.
- **Realtime:** one EventSource per page on `/tenants/:t/stream`. An end user gets only runs they started, at most 2 streams; a member 5 (kernel/stream.ts:46). Guests get 401 and the client polls. A refused stream isn't retried on that page. There are no row-change subscriptions.

### app-access

- **Opening** needs `app:read` (front.ts:921). Signed-out people are redirected to sign-in; signed-in people without access see "Not for this account".
- **Built-in roles:** `portal_reader` (app:read, data:read), `portal_user` (+data:write). Both follow row policies.
- **App-only ceiling:** an end user, or a member carried to an app address, holds only app-facing kinds whatever they are bound to: script, run, flow_run, table, data, data_all, file, app, theme (permissions.ts; authorize.ts:139-143).
- **Bindings are per resource.** Binding a role at an app gives no table access. Bind each table (`data:read`), script (`run:write`) and flow (`flow_run:write`) as well. Whoever started a run may read it.
- **Scripts run as the workspace.** Use `ctx.run.startedBy` and `.as(id)` to act for the person (acme `orders/request`).
- **Policies:** open, owner, rules (apps.test.ts:562, 854, 993).
- **Sessions (sessions.ts):** cookie `vx_app_<tenantId>`, per host, HttpOnly, Lax, Secure over HTTPS. End user 30 days; carried-over member 12 hours.
  - On PUBLIC_URL a member's console session is used; elsewhere it is ignored.
  - Hand-off code: one use, 60 s, host-bound, tenant members only (apps.ts:945).
  - Non-GET requests from another origin: 403 `cross_site`.
- **Rate limits:** guest pages 600/min/IP per replica; guest API 120/min per route (http.ts:64, counted in Postgres); portal forms 20/min; docs votes 30/min.
- **Theming:** kit, then tenant, then workspace theme. A light-only value doesn't carry to dark (theme.ts:131). Values: `THEME_VALUE_PATTERN`, no `url`/`var(` (kinds.ts:1268).

### app-addresses / domains

- Path: `/apps/<tenant>/<workspace>/<app>/`; portal: `/portal/<tenant>/`; on a hostname the portal is `/_/`.
- **APPS_URL set:** PUBLIC_URL redirects apps there (307/308) and there is no console at APPS_URL. Not set: code apps answer 503 unless `APPS_ON_CONSOLE_ADDRESS=true`; builder and docs apps still work (hosts.ts:85).
- **Hostname** serves one app at `/`, or the portal plus every app of the workspace by path. The API there answers for that tenant only.
- **Domains screen:** "Add a hostname" (Workspace, Serves, App, Hostname). Steps "Point the name here", "Show the name agrees" (TXT `_vx-challenge.<host>`), "Check and enable" (Check now, Enable/Disable, Remove). Enabling without verification: operators only (409 `domain_not_verified`). Changes reach other replicas within 30 s.
- **Renames:** the app's old path redirects 308 (front.ts:841); hostnames are carried (kernel/rename.ts:57).
- **Portal home** lists up to 100 apps, production workspaces only; a portal hostname lists its own workspace's.

## (C) Gotchas

1. The dev server has no CSP. Inline scripts, CDN fonts and calls to other sites work in dev and fail deployed. WASM is also blocked (no `wasm-unsafe-eval`).
2. In dev you are the developer, usually with `data_all`, so row rules aren't exercised.
3. An unmatched path with an extension-like ending (`/users/j.smith`) gets 404, not the app page (front.ts:977).
4. `<base>` makes `href="#x"` resolve to the app root. Use `location.hash`, as fernhill does. Hard-coded `/logo.png` breaks under a path.
5. `signOut()` at PUBLIC_URL leaves a console session, so staff stay signed in.
6. `principal.groups` is empty for members in code apps (filled only for generated apps, front.ts:1029).
7. Workspace-level and tenant-level bindings appear in neither "Open to" nor Share.
8. Stop sharing also removes the table bindings, even if another app shares those tables with the same audience.
9. Operator access grants don't count at app addresses.
10. Widget approvals can't be decided where code apps can run (page-approvals.ts:63); the widget links to the console.
11. Code in two tenants' apps at one APPS_URL shares an origin and cookies (decision 0007). Give each tenant its own hostname for isolation.

## (D) Docs wrong, stale or missing

- docs/sdk-guide.md has no section on code apps, only docs apps and HelpPanel.
- docs/self-hosting.md:407 says a hostname serves "The one app"; it omits portal hostnames. The guest-limit sentence says "in each replica"; the API limit is shared in Postgres.
- self-hosting.md's `portal_user` advice omits `portal_reader`.
- phase-6-apps.md: app-facing list lacks flow_run; names the old npm scope.
- README.md: "Apps tab" is now Build → Published apps.

## (E) Likely bugs / open questions

1. **Stuck `useRun`:** a member with `run:read` in some other workspace of the tenant gets a connected stream that doesn't carry their own runs in the app's workspace. `useRun` doesn't poll while connected, so it hangs; `runScript` falls back to a 5 s check. Same for flows with `run:read` but not `flow_run:read` (routes/stream.ts:65-75, kernel/stream.ts #deliver). From code, not run.
2. **`runScript`/`runFlow` for guests:** starting may work, but reading the run needs a non-null principal id, so it ends in 401 (execution.ts:1436). From code, not run.
3. **Raw principal types in "Open to":** end-user groups and service accounts show as `end_user_group` / `service_account` (routes/apps.ts access mapping lacks those joins).
4. **`HASHED_NAME` regex** (front.ts:113) matches unhashed names like `apple-touch-icon.png` and `logo-horizontal.svg`, which get one-year immutable caching (checked the regex).
5. **`ASSET_PATH_PATTERN`** refuses segments starting with `_` or `.`, e.g. `.well-known` or a `_`-prefixed chunk.
6. **SDK `ThemeToken`** lacks structure, raised, selected, line-strong, line-control, ink-subtle, code-bg and focus, which the schema accepts (sdk index.ts:1035 vs kinds.ts:1233).
7. Inspector links disabled hostnames; the list doesn't (Portal.test.tsx:101).
8. A docs app with `published:false` is still listed, with a live link that answers "Nothing here".
9. Portal home lists code apps that answer 503.
10. In `volvel dev`, `signInUrl` points at the instance, so `return` leads there, not to localhost. `logoUrl()` isn't null without a logo.
11. Sharing is sequential with no rollback.
12. Nothing cleans up unreferenced app files (phase-6-apps.md).

## (F) Screenshots and examples

**Screenshots:** list with all three Built tags; inspector; both Share tabs; "Anyone" warning; unserved notice; Domains steps; sign-in page; "Not for this account" page; fernhill front-desk with HelpPanel open; e2e/snapshots/tenant-apps.spec.ts phone/desktop.

**Examples:** acme `portal` + `public` (bindings, `runScript`, `signInUrl`) in examples/acme/src/index.ts:474-590; fernhill `Book.tsx:170` HelpPanel and `shared.tsx:112` RunError handling; higher-ed YAML app. Write new ones for `useFlowRun` and `useRun`; no example uses them.
