# 01. Current product UI map

This document is Phase A of the UI/UX audit: discovery. It describes what the Vynxlabs console is today, who uses it, how the frontend is built, what shared infrastructure exists, and every screen, dialog, sheet, inspector and wizard a person can reach, each with a stable ID. It is descriptive, not evaluative. Judgments are confined to the short closing section and point at roadmap IDs in `09-prioritized-uiux-roadmap.md`. Documents `03-screen-by-screen-audit.md` and `11-screen-matrix.md` key on the screen IDs defined here.

Paths are relative to `apps/console/src` unless they start with `packages/`, `apps/`, `e2e/` or `docs/`. The code was read at HEAD `e737382` (phase 11 merged).

Evidence labels used in this document:

- **Verified**: read in the code at HEAD `e737382`, cited as `path:line`. Unless a statement carries another label, it is Verified.
- **Observed (mocked API)**: seen in the built console rendered in headless Chromium with fixture data at 1440x900 (light and dark), 390x844 and 2200x1100. Not a real seeded instance: no real data, timings, live updates or write flows.
- **Inferred**: reasoned from code without being run. Must be confirmed before acting.
- **Judgment**: a design opinion. Used only in section 8.

## Main findings

- The console is one single-page React application with 20 workspace sections (23 addressable workspace tabs), 16 tenant sections and 10 instance sections behind a custom router that has no route table: three nested if/else chains (`App.tsx:124-137`, `screens/Tenant.tsx:222-266`, `screens/Tenant.tsx:422-713`), one allow-list (`screens/Tenant.tsx:353-377`) and one regex list for layout modes (`nav.ts:216-246`) are kept in step by hand.
- The shell has a fixed anatomy (64 px rail, 224 px section panel, 48 px header, work surface, 352/416 px inspector) and three layout modes: page, workbench and editor. The mode is decided by the address, not by the screen (`nav.ts:261-305`, `Shell.tsx:902-914`).
- This inventory gives 149 surfaces a stable ID: 75 screens (routed pages, shared frames and end-user pages) and 74 dialogs, sheets, inspectors, panels, steps and wizards opened from them.
- Lists are built on six different primitives (`ListScreen` over the ui `Table`, the ui `Table` directly, `CollectionView`, `ListCollection`, the ui `Grid`, and hand-rolled tables). "Open a row" means four different things depending on which one a screen uses.
- There are two component kits: `packages/ui` (Base UI primitives, fields, viewers) and the console kit in `kit/` (page layout, inspector, status, motifs, palette). They overlap in panels, key/value lists, empty states, copy controls and single-choice groups.
- Object identity is in the URL for scripts, flows, tables, sources, dashboards, App Builder apps, runs, members and service accounts. View state (filters, tabs, selection, sort, steps) is in the URL only on the Runs list and for the selected trigger. Every query-string write uses `replaceState` (`router.tsx:48`), so Back never closes an inspector or undoes a filter.
- Live updates come from one server-sent-event stream per tenant that invalidates cached reads (`stream.ts:62-105`). The only visible connection indicator is a label in the Runs header (`screens/Runs.tsx:215-219`).
- The keyboard surface that is actually implemented is small: the palette, a shortcut sheet, undo/redo in the flow editor, one run shortcut in the script editor, and Enter/Space on `CollectionView` rows and read-only graph nodes. The shortcut sheet lists `j k` list movement that no handler implements (`kit/CommandPalette.tsx:744`).
- There is no error boundary (**Verified** by grep; **Observed (mocked API)**: an unknown run state blanks the whole console), no per-route `document.title`, no skip link, and no unsaved-changes guard.
- Tests are broad at the component level (42 console test files, 15 in `packages/ui` and `packages/screens`) and narrow end to end (five Playwright specs, Chromium only). There is no visual comparison and no automated accessibility check.

---

## 1. Product, users and entities

### 1.1 What the product is

Vynxlabs is a self-hostable, multi-tenant internal developer platform. An agency, the instance operator, runs each client as a tenant. Inside a tenant, work lives in workspaces of type `production` or `dev`. A dev workspace promotes its bundle (a deployed version of everything in the workspace) to a linked production workspace. Production is read-only for code: editors refuse to open there (`screens/Tenant.tsx:451-454`) and the palette's "New script" and "New flow" actions are offered only in dev (`kit/CommandPalette.tsx:390`).

The console (`apps/console`) is the administrative and authoring surface. End users never see it; they see apps served by the platform (section 6.10) and approval links sent by mail (section 6.9).

### 1.2 Users

| User | Where they work | What they come to do |
|---|---|---|
| Instance operator (agency staff) | Instance area: tenants, all members, operators, instance SSO, database locations, import, instance triggers, audit, console branding | Create and remove tenants, manage operators, stop all triggers, open time-limited access to a tenant with a reason (`screens/Tenant.tsx:165-189`) |
| Tenant admin | Tenant area | Workspaces, members, groups, roles, access grants, end users, service accounts, SSO, domains, branding, repository, workers, audit, retention, export |
| Developer | Workspace › Build, Data, Configure, Operate (dev workspace) | Write scripts and flows, build apps, define tables, declare connections, test, deploy, promote |
| Workspace admin / operator of runs | Workspace › Overview and Operate (production) | Watch runs, diagnose failures, re-run, pause triggers, cancel queued work, promote, roll back |
| Approver | Tenant › Approvals, or `/approve/:token` from mail without signing in | Approve or reject a waiting flow step |
| End user | Served apps and the tenant portal, never the console | Read rows, fill forms, start actions |
| Agent / service account | API and CLI; represented in the console under Tenant › Service accounts | Call the tenant with a key; be offered scripts and flows as tools (`screens/AgentAccess.tsx:19`, `screens/OfferToAgent.tsx:26`) |

### 1.3 Entity model

```text
instance ── operator, instance member, identity provider (instance), database location, branding
   │
   └─ tenant ── member ─┐
        │      group ───┼─ access grant (binding: principal + role + scope)
        │      role ────┘
        │      service account ── API key, agent access (tools)
        │      end user ── end-user group, attributes
        │      identity provider ── domain claim, group map, SCIM token
        │      domain (hostname → app), branding (portal theme, logo)
        │      repository (git), worker pool ── worker, worker credential
        │      approval (waiting flow step), audit entry, retention, export
        │      operator access grant (time-limited)
        │
        └─ workspace (production | dev; dev ──promotes to──▶ production)
             ├─ script ──────────────┐
             ├─ flow ── step ── approval          draft ──deploy──▶ deployment (bundle vN)
             ├─ trigger (schedule | webhook | event | form | manual) ──starts──▶ run
             ├─ run: script run (attempts, logs) | flow run (step runs, child runs)
             ├─ event (published by a run; starts runs through event triggers)
             ├─ table (columns, row rules) ── row;  data source (binding) ── external table
             ├─ dashboard;  app: App Builder interface (pages → widgets) | custom React app
             ├─ connection (declaration + per-workspace binding + secret + health)
             ├─ connection group, variable (default + per-workspace value), secret
             ├─ alert (failure handler default, overrides, history)
             ├─ extension (connector, trigger source)
             └─ promotion (request, preview, drift between dev and production)
```

Relationships the interface depends on: a script or flow reads connections, variables and secrets ("Uses" on a run, "Used by" on the resource); a run records the trigger that started it and the bundle version it ran on; a flow step runs a script, a child flow or waits for an approval; a draft exists only in dev and becomes part of the next deployment; a promotion copies a dev version to the linked production workspace.

---

## 2. Frontend architecture

### 2.1 Packages

| Package | Role | Notes |
|---|---|---|
| `apps/console` | The console SPA | React 19, Tailwind CSS 4, TanStack Query 5, `@xyflow/react` 12, `monaco-editor`, `@dagrejs/dagre`, `lucide-react` (`apps/console/package.json`) |
| `packages/ui` | Shared component kit and tokens | Base UI (`@base-ui/react` ^1.9), `vega`, `vega-lite`, `vega-interpreter`; `tokens.css` holds the design tokens |
| `packages/screens` | Renderer for App Builder interfaces | Used by the console's builder and built separately as the end-user runtime (`packages/screens/runtime/main.tsx`) |
| `packages/app` | Browser client for served apps | Rows, scripts and the signed-in user over the public API |
| `apps/control-plane` | API server | Also serves the tenant portal pages as server-rendered HTML (`apps/control-plane/src/kernel/apps/pages.ts`) |

### 2.2 Bootstrapping

- `main.tsx:8-9` applies the stored theme and appends the instance theme stylesheet before the first render; `main.tsx:11-17` renders `Providers > BrandProvider > App`. There is no `StrictMode` and no error boundary.
- `Providers` (`ask.tsx:27-41`) is `QueryClientProvider > ToastProvider > DialogsProvider > Bridge`. `Bridge` (`ask.tsx:16-20`) copies the dialog and toast contexts into module variables so that non-component code can call `ask.*` and `notify.*`.
- `BrandProvider` (`kit/brand.tsx:28-47`) loads `/instance/branding` once and sets `document.title` to the product name. The title never changes afterwards.
- `App` (`App.tsx:89`) loads `/me`. A 401 or no data shows sign-in (`App.tsx:105-114`); while `/me` loads it renders nothing (`App.tsx:104`).

### 2.3 Routing

- A custom router of about 100 lines. `navigate(to, {replace})` wraps `history.pushState`/`replaceState` (`router.tsx:6-10`); `usePath` listens to `popstate` (`router.tsx:12-24`); `match(pattern, path)` is a segment matcher with `:param` and a trailing `/*` (`router.tsx:56-68`).
- `Link` renders a real `<a href>`, lets modified clicks through, stops propagation so that links inside clickable rows work, and sets `aria-current="page"` (`router.tsx:70-97`).
- `useQueryValue(name)` reads one query parameter and always writes with `replace: true` (`router.tsx:30-53`, write at `:48`).
- There is no route table. Section 4.5 lists every pattern.
- Not found: `NotFound` (`screens/NotFound.tsx:5-23`) for unknown top-level paths, unknown tenant sections, unknown workspaces and unknown workspace tabs. Deeper unknown paths are not 404s: `flows/<anything>` renders the flow view with whatever error the API gives.

### 2.4 Data layer

- `useLoad<T>(path)` wraps `useQuery` with key `[path]` and `placeholderData: keepPreviousData`, returning `{data, error, loading, reload}` (`api.ts:142-163`). `loading` is true on every background refetch (`api.ts:160`).
- Client options: `retry: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `staleTime: 0` (`api.ts:42-54`).
- Writes go through `api.post/put/patch/delete` (`api.ts:108-113`). On success `afterWrite` invalidates every cached read under the same tenant (`api.ts:83-89`). `api.upload` does not invalidate (`api.ts:115-126`).
- There is no `useMutation`, no `setQueryData` and no optimistic update. The one local exception is the table grid, which keeps saved rows in place (`screens/Data.tsx:121-123`).
- Errors are `ApiError {status, code, fields[]}` built from the server's problem document (`api.ts:5-24`). The server sends a request ID (`apps/control-plane/src/problem.ts:15-17,54-55`); the client drops it.
- Session expiry is checked only on `/me` at load (`App.tsx:105-114`); no other call has a 401 hook (`api.ts:26-39`).

### 2.5 Live updates

- One `EventSource` per tab at `/api/v1/tenants/:t/stream`, opened by the shell (`Shell.tsx:480`, `stream.ts:37-42,62`) and reference-counted (`stream.ts:44-59`).
- Events `run`, `flow_run`, `step`, `log`, `task` carry identifiers only (`stream.ts:103-105`). Non-log events invalidate the workspace's reads plus the tenant's `summary`, `approvals`, `queue` and `workers`, throttled to once per second with a leading edge (`stream.ts:19,67-86`). A `snapshot` event after reconnect invalidates the whole tenant (`stream.ts:99-102`).
- Reconnection is left to the browser; the server sets `retry: 3000` (`apps/control-plane/src/routes/stream.ts:103`).
- When the stream is down, screens poll: the runs list every 5 s while a live row is loaded (`screens/Runs.tsx:151-156`), a script run every 1.5 s (`screens/Execution.tsx:403-409`), a flow run every 1.5 s (`screens/Flows.tsx:599`), a worker task every 2 s (`tasks.ts:42`).
- `tasks.ts` is one hook, `useTaskEnd`, that follows a single worker task to its end. It is not a background-task centre.

### 2.6 Code splitting and build

- Lazy chunks: `SingleSignOn`, `Extensions`, `ScriptEditor`, `Dashboards`, `DashboardView`, `InterfaceBuilder`, `Interfaces`, `FlowEditor` (`App.tsx:17-19`, `screens/Tenant.tsx:41-60`). Everything else is in the entry chunk. The Vega modules load on first chart (`packages/ui/src/chartEngine.ts:18`).
- Suspense fallbacks are the text "Loading…" (`App.tsx:142`) and "Loading the editor…" for the flow editor (`screens/Tenant.tsx:442`).
- Vite 8 with the React and Tailwind plugins and no `manualChunks` (`apps/console/vite.config.ts`). `build` runs `vite build && node compress.mjs dist`, writing `.br` and `.gz` beside each asset. The dev server proxies `/api` to `localhost:8080`.

### 2.7 Theming and instance branding

- Tokens are CSS variables `--vx-*` in `packages/ui/src/tokens.css`: light on `:root`, dark under `prefers-color-scheme` unless `data-theme="light"` (`:43-44`) and again under `:root[data-theme="dark"]` (`:71`). Tailwind 4 maps them with `@theme inline` (`:97-124`).
- The user chooses system, light or dark from a menu at the foot of the rail (`Shell.tsx:418-435`). The choice is stored in `localStorage["vx-theme"]` and applied as `data-theme` on `<html>` before first render (`theme.ts:27-59`). It is per browser, not per account.
- Instance branding: `main.tsx:9` appends `<link href="/api/v1/instance/theme.css">` after the console's stylesheet (`theme.ts:11-18`). The server emits only the tokens the operator set (`apps/control-plane/src/routes/branding.ts:114-134`). Product name and logo come from `/instance/branding` (`kit/brand.tsx`).
- Tenant branding styles the tenant's portal and apps. It never reaches the console (`theme.ts:5-10`).

### 2.8 Tests

| Layer | Tooling | What is covered |
|---|---|---|
| Unit and component (console) | Vitest, happy-dom per file, Testing Library; 42 test files in `apps/console/src` (39 `.test.tsx`, 3 `.test.ts`). The source notes counted 39; the directory listing at HEAD gives 42 | Shell (`Shell.test.tsx:64-182`: `whereIs`, sections and counts, rail, header chips, operator view, Ctrl+K, theme), palette (`CommandPalette.test.tsx:113-176`), app (`App.test.tsx:61-159`), stream (`Stream.test.tsx:102-141`), cache (`Load.test.tsx:41-79`), and one file per screen family |
| Unit and component (kits) | Same; 15 test files in `packages/ui/src` and `packages/screens/src` | Kit behaviour, dialogs, form, grid, schema form, result view, chart, widgets, renderer, layout, links, format |
| End to end | Playwright, Chromium only, one worker, 1500x1000, against a running instance (`e2e/playwright.config.ts`) | Five specs: `exit-criterion`, `flow-editor`, `release`, `approval-mail`, `redesign` |
| Layout smoke | `e2e/redesign.spec.ts:163-187` | 19 screens at 390, 768 and 1440 px in light and dark: no horizontal page overflow; screenshots saved but not compared |
| Not present | | Visual regression (no `toHaveScreenshot`), automated accessibility checks (no axe), tests of back/forward, scroll, focus on navigation or session expiry |

The `redesign` spec's "data" entry visits `${ws}/data` (`e2e/redesign.spec.ts:147`), which is not in `WORKSPACE_TABS`, so it measures the not-found screen rather than Tables.

---

## 3. Shell anatomy and layout modes

### 3.1 Regions (SH-SHELL, `Shell.tsx:462`, layout at `:652-959`)

| Region | Size | Shown when | Reference |
|---|---|---|---|
| Rail (`nav aria-label="Main"`) | 64 px wide; items 56 px wide, 18 px icon, 10 px label | 768 px and up | `Shell.tsx:654-667`, item `:375-416` |
| Section panel (`nav aria-label="Sections"`) | 224 px; head 48 px; filter input 30 px; rows 32 px | 1024 px and up, when the area has a panel and the user has not collapsed it | `Shell.tsx:669-702` |
| Header | 48 px | always | `Shell.tsx:705-900` |
| Work surface (`main`) | depends on layout mode (3.3) | always | `Shell.tsx:902-914` |
| Inspector | 352 px beside the list, 416 px from 1536 px; below 1280 px a side sheet (480 px, full screen on phones) | per screen | `kit/layout.tsx:85-140`; the width constant `WIDE` is at `kit/layout.tsx:23` (the source notes cite `:24` and `:25`) |
| Drawer (SH-DRAWER) | 320 px left sheet, full width below 640 px | below 1024 px, on demand | `Shell.tsx:917-946` |

### 3.2 Behaviour per breakpoint

| Width | Rail | Section panel | Inspector | Header |
|---|---|---|---|---|
| Below 768 px | hidden; a menu button opens the drawer, which holds the rail items, the current sections, the release path, account and theme (`Shell.tsx:707-714,929-945`) | in the drawer | side sheet, full screen | search is an icon only (`Shell.tsx:887-898`) |
| 768 to 1023 px | visible | never inline; a "Show navigation" button opens the drawer (`Shell.tsx:715-729`) | side sheet | failed-runs chip from 640 px |
| 1024 to 1279 px | visible | inline, collapsible; the choice is stored in `localStorage["vx-panel"]` (`Shell.tsx:107-114,510-518`) | side sheet | drafts chip appears |
| 1280 px and up | visible | inline | docked beside the list | "promotes to X" text appears (`Shell.tsx:774-787`) |
| 1536 px and up | visible | inline | 416 px | unchanged |

### 3.3 Layout modes

| Mode | Applies to | What the shell does | Reference |
|---|---|---|---|
| Page | Everything not listed below | `main` scrolls; content is centred, max 1440 px, padding 16 px (32 px from 768 px) horizontally and 24 px vertically | `Shell.tsx:909` |
| Workbench | Workspace: `runs`, `triggers`, `events` and their sub-paths (so the run page too); `flows`, `scripts`, `apps` lists; the flow editor. Tenant: `approvals`, `members`, `groups`, `roles`, `access`, `end-users`, `end-user-groups`, `audit`. Instance: `/`, `/instance/members`, `/instance/operators`, `/instance/audit` | `main` is `overflow-hidden`, with no padding and no width cap; the screen lays out its own scrolling regions | `nav.ts:229-246`, `Shell.tsx:903-906` |
| Editor | `flows/new` and `flows/edit/…`, `scripts/new` and `scripts/edit/…`, `extensions/<kind>/new` and `/edit/…`, any `screens/<path>`, `resources/new/…` and `resources/edit/…` | The section panel is removed (`Shell.tsx:530`); content is full width with 16 px vertical padding | `nav.ts:216-222` |

The flow editor is both editor and workbench: no panel, no padding, own scroll. The script editor, resource editor and App Builder are editor only: no panel, but still a padded container that scrolls as a page. The Overview area has no section panel either.

**Observed (mocked API):** page-mode content starts at x = 320 and workbench content at x = 312 at 1440 px, because the page gutter is 32 px and the workbench header gutter is 24 px (`kit/CollectionView.tsx:60`).

### 3.4 Header contents

Left to right (`Shell.tsx:705-900`):

1. Menu button (below 768 px) and section-panel toggle.
2. `nav aria-label="Where you are"` (`Shell.tsx:730-865`). In a workspace: tenant name link (hidden below 640 px), a wire-and-junction motif, the workspace switcher menu (`:750-771`), the environment tag (`:772`), a "Paused" tag when the workspace's triggers are paused (`:773`), "promotes to X" as plain text from 1280 px (`:774-787`), and the section name for screen readers only (`:788`). In a tenant: tenant switcher (`:792-817`), visible section name (`:818-829`), a "Tenant" tag. In the instance or account area: product name or email, section name, an "Instance · operator" or "Personal" tag (`:835-863`).
3. Right side: a drafts chip "N drafts Review" from 1024 px (`:868-877`), a failed-runs chip linking to `runs?status=failed` from 640 px (`:878-886`), and the search button "Search or jump to… ⌘K" (`:887-898`).

The account menu (API keys, Sign out; `Shell.tsx:437-460`) and the theme menu sit at the foot of the rail (`Shell.tsx:663-666`), not in the header.

---

## 4. Navigation model

### 4.1 Rail areas

The rail lists areas (`nav.ts:54-94`, composed at `Shell.tsx:603-646`). The first five belong to a workspace and appear whenever a tenant is open. They link to the workspace last open in that tenant, remembered in `localStorage["vx-last-workspace:<tenant>"]` (`nav.ts:316-333`); without one they are dimmed and link to the workspace list.

| Area | Icon (lucide) | Opens on | Section panel |
|---|---|---|---|
| Overview | Activity | `overview` | none |
| Build | Blocks | `flows` (first section, `nav.ts:308-314`) | yes |
| Operate | SlidersHorizontal | `runs` | yes |
| Data | Database | `tables` | yes |
| Configure | Wrench | `connections` | yes |
| Tenant | Building2 | `/t/:t` | yes, grouped |
| Instance (operators) or Tenants (everyone else) | Server / LayoutGrid | `/` | instance sections for operators |
| Account | UserRound | reached from the account menu, `/account/api-keys` | none |

### 4.2 Workspace sections (`nav.ts:102-134`)

| Area | Sections in panel order (slug) |
|---|---|
| Overview | Overview (`overview`) |
| Build | Flows (`flows`), Scripts (`scripts`), App Builder (`screens`), Published apps (`apps`), Extensions (`extensions`), All resources (`resources`) |
| Operate | Runs (`runs`), Events (`events`), Triggers (`triggers`), Releases (`release`), Git sync (`git`) |
| Data | Tables (`tables`), Data sources (`sources`), Dashboards (`dashboards`) |
| Configure | Connections (`connections`), Variables (`variables`), Secrets (`secrets`), Alerts (`alerts`), Workspace settings (`settings`) |

Section rows can carry a count, shown only when non-zero (`Shell.tsx:131-141,160-170,239-244`): Runs "N failed" (danger), Releases "N drafts" (action), Git sync "conflict", "ahead" or "behind", Connections "N missing" (attention). The panel foot shows a "Release path": draft, this workspace's version, the linked workspace's version, and whether they are the same (`Shell.tsx:305-373`). The panel has a filter input (`Shell.tsx:685-696`).

### 4.3 Tenant groups (`nav.ts:144-181`)

| Group | Sections (slug) | Counts |
|---|---|---|
| Work | Overview (`overview`), Workspaces (`workspaces`), Approvals (`approvals`) | Workspaces N, Approvals N |
| People and access | Members & access (`members`), End users (`end-users`), End-user groups (`end-user-groups`), Service accounts (`service-accounts`), Operator access (`operator-access`) | Members N, Operator access "N active" |
| Sign-in | Single sign-on (`single-sign-on`) | |
| Delivery | Branding (`branding`), Domains (`domains`), Repository (`repository`), Workers (`workers`) | Domains "N to fix", Workers "N online" |
| Governance | Audit log (`audit`), Retention (`retention`), Export (`export`) | |

### 4.4 Instance sections (`nav.ts:185-201`)

All tenants (`/`), All members (`/instance/members`), Operators (`/instance/operators`), Single sign-on (`/instance/single-sign-on`), Database locations (`/instance/databases`), Import a tenant (`/instance/import`), Triggers (`/instance/triggers`), Audit log (`/instance/audit`), Console branding (`/instance/branding`), Component kit (`/instance/kit`). The client does not gate instance routes on the operator role; the API refuses (**Inferred**).

### 4.5 Complete route table

Top level (`App.tsx:102-137`):

| Pattern | Component | Reference |
|---|---|---|
| `/approve/:token` | `ApproveLink`; no sign-in, no shell | `App.tsx:102-103` |
| any path, signed out | `SignIn` | `App.tsx:105-114` |
| `/` | `Tenants`; on first open replaced by the last workspace or tenant | `App.tsx:125`, `:63-87` |
| `/t/:tenantId/*` | `Tenant`, keyed by tenant | `App.tsx:126-127` |
| `/account/api-keys` | `Account` | `App.tsx:128` |
| `/instance/members` | `InstanceMembers` | `App.tsx:129` |
| `/instance/operators` | `Operators` | `App.tsx:130` |
| `/instance/single-sign-on` | `SingleSignOn base="/instance"` (lazy) | `App.tsx:131` |
| `/instance/audit` | `InstanceAudit` | `App.tsx:132` |
| `/instance/databases` | `DatabaseLocations` | `App.tsx:133` |
| `/instance/import` | `TenantImport` | `App.tsx:134` |
| `/instance/branding` | `InstanceBranding` | `App.tsx:135` |
| `/instance/triggers` | `InstanceTriggers` | `App.tsx:136` |
| `/instance/kit` | `KitSheet` | `App.tsx:137` |
| anything else | `NotFound` | `App.tsx:124` |

Tenant, prefix `/t/:t` (`screens/Tenant.tsx:154-266`):

| Pattern | Component | Reference |
|---|---|---|
| any, as an operator without a grant | "You have no access to this tenant" with a grant dialog | `screens/Tenant.tsx:165-189` |
| (empty), `/overview` | `TenantOverview` | `:226-227` |
| `/approvals` | `ApprovalsQueue` | `:222-223` |
| `/workers` | `Workers` | `:224-225` |
| `/members/:id` | `MemberPage` | `:228-233` |
| `/members`, `/groups`, `/roles`, `/access` | `MembersAndAccess`, tab taken from the slug | `:234-235` |
| `/end-users` | `EndUsers` | `:236-237` |
| `/branding` | `Branding` | `:238-239` |
| `/domains` | `Domains` | `:240-241` |
| `/end-user-groups` | `EndUserGroups` | `:242-243` |
| `/service-accounts`, `/service-accounts/:id` | `ServiceAccounts` | `:244-245`, `:717-768` |
| `/operator-access` | `OperatorAccess` | `:246-247` |
| `/repository` | `RepositorySettings` | `:248-249` |
| `/single-sign-on` | `SingleSignOn` | `:250-251` |
| `/export` | `ExportSection` | `:252-253` |
| `/retention` | `RetentionSettings` | `:254-255` |
| `/audit` | `AuditTable` | `:256-261` |
| `/workspaces` | `Workspaces` | `:262-263` |
| `/workspaces/:w/:tab/*` | `WorkspaceDetail` (next table) | `:191-221`, `:379` |
| other | `NotFound` | `:265` |

Workspace, prefix `/t/:t/workspaces/:w` (`screens/Tenant.tsx:422-713`). The allow-list of tabs is `WORKSPACE_TABS` (`:353-377`): `alerts`, `apps`, `changes`, `connections`, `dashboards`, `deployments`, `events`, `extensions`, `flow-runs`, `flows`, `git`, `overview`, `release`, `resources`, `runs`, `screens`, `scripts`, `secrets`, `settings`, `sources`, `tables`, `triggers`, `variables`.

| Pattern | Component | Reference |
|---|---|---|
| `/overview` | `Overview` | `:424-430` |
| `/settings` | `WorkspaceSettings` | `:431-439` |
| `/flows` | `Flows` | `:464-469` |
| `/flows/new`, `/flows/edit/<path>` | `FlowEditor` (lazy); in production a notice instead | `:440-455` |
| `/flows/<path>` | `FlowView` | `:456-463` |
| `/flow-runs/<id>` | redirect to `/runs/<id>` with replace | `:470-472`, `screens/RunPage.tsx:599-604` |
| `/dashboards`, `/dashboards/<id>` | `Dashboards`, `DashboardView` | `:473-481` |
| `/screens`, `/screens/<path>` | `Interfaces`, `InterfaceBuilder` | `:482-494` |
| `/events` | `EventsWorkbench` | `:495-496` |
| `/tables`, `/tables/<name>` | `Tables`, `TableView` | `:497-505` |
| `/sources`, `/sources/<path>` | `Sources`, `SourceView` | `:506-514` |
| `/apps` | `Apps` | `:516-517` |
| `/scripts` | `Scripts` | `:554-559` |
| `/scripts/new`, `/scripts/edit/<path>` | `ScriptEditor` | `:518-525` |
| `/extensions` | `Extensions` | `:537-542` |
| `/extensions/(connector\|trigger_source)/(new\|edit/<path>)` | `ScriptEditor` with a kind | `:526-536` |
| `/release`, `/changes`, `/deployments` | `Release`; `deployments` opens the deploy step | `:543-551` |
| `/git` | `GitSync` | `:552-553` |
| `/runs`, `/runs/<id>` | `RunsWorkbench`, `RunPage` | `:560-568` |
| `/triggers` | `TriggersWorkbench` | `:569-575` |
| `/connections` | `Connections` with `ConnectionGroups` below | `:576-580` |
| `/variables` | `Variables` | `:581-582` |
| `/alerts` | `Alerts` | `:583-589` |
| `/resources` | inline `ListScreen` | `:607-660` |
| `/resources/new/<kind>`, `/resources/edit/<kind>/<path>` | `ResourceEditor` | `:591-606` |
| `/secrets` | inline `ListScreen` | `:661-711` |
| a tab not in the allow-list | `NotFound` | `:414-421` |

### 4.6 Aliases and redirects

| From | To | Kind | Reference |
|---|---|---|---|
| `/` on first open | last workspace or tenant, read from the server | replace | `App.tsx:63-87` |
| `/t/:t` | tenant overview | same screen; highlights Overview | `nav.ts:253-258` |
| `/t/:t/groups`, `/roles`, `/access` | highlight "Members & access" | navigation alias | `nav.ts:253-258` |
| `/workspaces/<slug>/…` | `/workspaces/<id>/…`, query kept | replace, after the API refuses the slug | `screens/Tenant.tsx:393-405` |
| `flow-runs/<id>` | `runs/<id>` | replace | `screens/RunPage.tsx:599-604` |
| `changes`, `deployments` | highlight "Releases"; `deployments` opens the deploy step | navigation alias | `nav.ts:137-141`, `screens/Tenant.tsx:549` |
| new editor after first save | `…/edit/<path>` | replace; the editor remounts because it is keyed on the address | `screens/Authoring.tsx:378`, `screens/FlowEditor.tsx:690`, `screens/ResourceEditor.tsx:263` |
| sign-out | `/` | replace | `App.tsx:120` |
| `?return=` after sign-in | an app, portal or app hand-off path only | full navigation | `App.tsx:23-34` |

Tenant slugs are not resolved, only workspace slugs.

### 4.7 Switching tenant and workspace

- The workspace switcher keeps the section slug and drops the object path and the query (`Shell.tsx:766-769`).
- The tenant switcher goes to the tenant overview (`Shell.tsx:809`).
- The palette's "Switch workspace…" always lands on `overview` (`kit/CommandPalette.tsx:308`).
- The last tenant and workspace are stored on the server 800 ms after the place settles (`App.tsx:41-56`) and read back on opening `/`.

---

## 5. Infrastructure inventory

### 5.1 Shared UI components (`packages/ui/src`)

| Group | Components (file) |
|---|---|
| Actions | `Button` (`Button.tsx`; 36 px regular, 28 px small, renders `<a>` when it navigates), `Menu` (`Menu.tsx`) |
| Fields | `TextField`, `SelectField` (native select), `TextAreaField`, `NumberField`, `DateField`, `CheckboxField` (`Fields.tsx`); `ComboboxField`, `MultiSelectField` (`Combobox.tsx`); `SegmentedControl`, `DateStepper` (`Pickers.tsx`) |
| Forms | `Form` (flat, schema-driven; `Form.tsx`), `SchemaForm` (nested JSON Schema with a Fields/JSON toggle; `SchemaForm.tsx:707`) |
| Overlays | `Dialog` (`Dialog.tsx`; sizes regular 30 rem, wide 46 rem, palette), `DialogsProvider` (`Dialogs.tsx`: confirm, prompt, type-to-confirm), `SideSheet` (`SideSheet.tsx`), `ToastProvider` (`Toast.tsx`) |
| Feedback | `Notice`, `EmptyState` (`Notice.tsx`), `Skeleton` (`Surfaces.tsx:117`), `Badge` (`Badge.tsx`) |
| Data display | `Table` (`Table.tsx:18`), `Grid` (`Grid.tsx:199`), `Pagination` (`Pagination.tsx`), `Facts` (`Facts.tsx`), `Tabs` (`Tabs.tsx`), `Card`, `Avatar` (`Surfaces.tsx`) |
| Viewers | `JsonView`, `LogViewer`, `ResultView`, `Markdown`, `Timeline`, `Chart` with `chartEngine.ts` and `chartTheme.ts` |
| App runtime | `PageShell` (`PageShell.tsx`), app widgets (`widgets.tsx`: table `:198`, form `:272`, chart `:350`, card `:389`, cards `:421`) |
| Foundations | `tokens.css`, `icons.ts` (re-exports lucide) |

Exported but used by no console screen: `Skeleton`, `Card`, `Avatar`, `PageShell`, `SegmentedControl`, `DateStepper`, `Form`. Exported with no consumer anywhere outside the package: `Pagination`.

### 5.2 Console kit (`kit/` and top-level files)

| File | What it provides |
|---|---|
| `kit/layout.tsx` | `PageHeader` (`:30`), `SectionLabel` (`:59`), `Panel` (`:69`), `Inspector` (`:85`), `MasterDetail` (`:146`), `Stepper` (`:166`), `NextStep` (`:229`), `EmptyCanvas` (`:263`), `FilterChips` (`:289`), `KeyValues` (`:330`) |
| `kit/CollectionView.tsx` | The edge-to-edge list with a header, toolbar, sticky column header, column priorities and selectable rows (`:24`) |
| `kit/ListCollection.tsx` | `CollectionView` plus client-side search, an inspector and a create dialog (`:13`) |
| `kit/status.tsx` | The run-state map `STATES` (`:42-61`), `StatePill` (`:67`), `stateOf` fallback (`:90`), graph strokes (`:92-101`), `Tag` (`:116`), `EnvTag` (`:127`), `Mono` (`:136`) |
| `kit/motifs.tsx` | Decorative vocabulary: `Junction`, `Wire`, `SignalPath`, `PortBrackets`, `InsetRule`, `JunctionList` |
| `kit/CommandPalette.tsx` | `CommandPalette` (`:173`) and `ShortcutSheet` (`:750`) |
| `kit/copy.tsx` | `CopyIcon` (`:8`), `CopyableId` (`:37`), a curl helper |
| `kit/references.tsx` | `useReferences` and `UsedBy` (`:19`), the "Used by" cell |
| `kit/brand.tsx` | `BrandProvider`, `BrandMark` |
| `kit/history.ts`, `kit/diff.ts` | Undo/redo history hook (100 steps); line diff |
| `ListScreen.tsx` | `Page` (`:94`), `CreateDialog` (`:116`), `ListScreen` (`:210`), `RemoveButton` (`:308`), `CopyButton` (`:342`), date helper `when` |
| `InputDialog.tsx` | `InputDialog` (`:23`) and `InputForm` (`:59`): run input through `SchemaForm` |
| `ask.tsx` | `Providers`, `ask.confirm/prompt/typeToConfirm`, `notify.success/error` |
| `editor/` | `CodeEditor.tsx` (Monaco wrapper), `monaco.ts` (TypeScript worker setup and SDK typings) |

### 5.3 Styling system and CSS architecture

- Tailwind CSS 4 through the Vite plugin, with utility classes in JSX. There are no CSS modules and no styled components.
- `packages/ui/src/tokens.css` defines tokens and type roles; `styles.css` in the console imports it and holds global rules. `packages/screens/runtime/styles.css` does the same for the end-user runtime. Portal pages carry their own stylesheet built from the same tokens (`apps/control-plane/src/kernel/apps/pages.ts:25`).
- Global rules: a `:focus-visible` outline (`packages/ui/src/tokens.css:167-170`), a reduced-motion rule that removes transitions and animations (`:172-177`), tabular numerals on `body` (`:163`).
- Linting is Biome (`biome.json`), including `noAlert: error` and the recommended accessibility rules. `CONTRIBUTING.md:95` asks for tokens instead of raw colours or sizes; no lint rule enforces sizes.

### 5.4 Design tokens

| Kind | What exists | Reference |
|---|---|---|
| Colour | 22 semantic roles, light and dark (5.7) | `packages/ui/src/tokens.css:9-95` |
| Radius | `control` 6 px, `panel` 10 px; 4 px is hard-coded in 17 places | `tokens.css`; `packages/ui/src/Menu.tsx:49`, `Combobox.tsx:31,169`, `kit/status.tsx:119` |
| Fonts | system sans and system mono | `tokens.css` |
| Type roles | eight (5.5) | `tokens.css:130-156` |
| Spacing | none; Tailwind's default 4 px scale | |
| Shadows | none; Tailwind `shadow-sm/lg/xl/2xl` in 10 places | `packages/ui/src/Dialog.tsx:31`, `SideSheet.tsx:46` |
| Layering | no tokens; `z-40/50` sheet, `z-[60]/[61]` dialog, `z-[70]` menu, `z-[80]` toast, `z-10` sticky headers | six files |
| Motion | none | |

A second copy of the token values lives in `screens/Branding.tsx:58-111` for the branding editor and is held in step by tests (`Portal.test.tsx:242`, `apps/control-plane/src/apps.test.ts:1238`).

### 5.5 Typography

Roles (`packages/ui/src/tokens.css:131-153`): display 26/1.2 semibold, title 18/1.3 semibold, body 14/1.45, telemetry 13/1.4 (mono), meta 12.5/1.4, label 12/1.2 semibold uppercase +0.06em, tag 10.5/1 semibold uppercase +0.06em, micro 10/1.2 medium. Role classes are used 245 times in the console and twice in `packages/ui`. Arbitrary sizes are used alongside them: `text-[13px]` 101 times in the console and 33 in `packages/ui`, plus `text-[12.5px]`, `text-[12px]`, `text-base`, `text-lg` and `text-xl`. Counts are from the class scan recorded in `02-design-system-forensics.md`.

### 5.6 Icons

`lucide-react` ^1.72, re-exported from `packages/ui/src/icons.ts:8` and imported in 24 console files through the `size` prop. Sizes in use between 12 and 18 px: 15 (36 uses), 14 (21), 13 (17), 16 (9), 12 (3), 18 (2), 17 (1). Stroke width is set to 1.75 in five places (`kit/status.tsx:79`, `Shell.tsx:411`) and is the lucide default of 2 elsewhere. Components in `packages/ui` use text glyphs instead of icons: `✓` (`Menu.tsx:55`, `Combobox.tsx:69`), `×` (`Combobox.tsx:120,176`, `Toast.tsx:94`), `‹ ›` (`Pickers.tsx:120,132`), `▲ ▼` (`Grid.tsx:231`).

### 5.7 Colour variables

| Group | Variables |
|---|---|
| Surfaces | `canvas`, `surface`, `sunken`, `structure`, `raised`, `selected`, `code-bg` |
| Lines | `line`, `line-strong` |
| Text | `ink`, `ink-muted`, `ink-subtle` |
| Action | `action`, `action-ink`, `action-soft` |
| State | `attention`, `attention-soft`, `danger`, `danger-soft`, `success`, `success-soft` |
| Focus | `focus` |

No Tailwind palette class and no raw hex appears in non-test source outside the branding defaults. SVG and canvas colours go through `var(--vx-*)` (`FlowGraph.tsx:168-278`, `kit/status.tsx:92-101`, `packages/ui/src/chartTheme.ts:17-25`). Opacity modifiers on tokens are used 35 times in 17 distinct forms.

### 5.8 Spacing

There are no spacing tokens. Sixteen steps of Tailwind's scale are in use (0 to 40 px including half steps). Conventions that exist only in code: page gutter `px-4 md:px-8 py-6` (`Shell.tsx:909`); workbench header `px-4 py-4 md:px-6` (`kit/CollectionView.tsx:60`, copied at `screens/Runs.tsx:202`); page stack `gap-5` (`ListScreen.tsx:109`); panel padding `p-4`; inspector `px-4 py-4` docked (`kit/layout.tsx:132`) and `px-5 py-4` as a sheet (`packages/ui/src/SideSheet.tsx:74`); field stacks `gap-3` in `CreateDialog` (`ListScreen.tsx:141`) and `gap-4` in `Form`.

### 5.9 Responsive logic

- Tailwind's default breakpoints (640, 768, 1024, 1280, 1536). No custom breakpoints and no container queries.
- One breakpoint is read in JavaScript: `WIDE.inspector` = 1280 (`kit/layout.tsx:23`, read at `kit/layout.tsx:103` and `screens/Audit.tsx:122`). `WIDE.panel` and `WIDE.rail` are defined and unused; the shell expresses them as `lg:flex` and `md:flex` (`Shell.tsx:656,672`).
- `CollectionView` hides columns by `priority` (`kit/CollectionView.tsx:16`). The ui `Table` scrolls sideways.
- Width caps: 1440 px for pages; none for workbenches and editors; 23 distinct `max-w-*` values on individual screens.

### 5.10 Dialogs

- `Dialog` (Base UI): top-anchored at 12vh; closes on Esc or backdrop; no close button and no footer slot (`packages/ui/src/Dialog.tsx:26-46`). The palette size is full screen below 768 px (`:32-33`).
- Imperative questions through `ask` (`ask.tsx:49-53`, `packages/ui/src/Dialogs.tsx:14-46`): `ask.confirm` (30 call sites), `ask.prompt` (12), `ask.typeToConfirm` (3), with a `danger` variant. One question at a time; a second cancels the first (`Dialogs.tsx:68-71`). No native `alert`, `confirm` or `prompt` is used.
- `CreateDialog` (`ListScreen.tsx:116`): a declarative create form used by tenants, workspaces, members, groups, service accounts, pools, credentials, API keys, operators, end-user invitations, access grants and operator access. Values clear only on success (`:153`).
- `InputDialog` (`InputDialog.tsx:23`): run or start with a schema form.

### 5.11 Drawers, sheets and inspectors

- `SideSheet` (Base UI dialog on the right or left edge; `packages/ui/src/SideSheet.tsx`): 11 uses, with a close button, Esc, focus trap and focus return. Used for the phone drawer, draft history, drift, promotion review, the new-schedule form, the connection wizard, app sharing, domain details and row details.
- `Inspector` (`kit/layout.tsx:85`): 13 uses. From 1280 px it is a plain `<aside>` beside the list (`:112-139`); below that it renders as a `SideSheet` (`:103-111`). The docked form does not move focus and does not close on Esc.
- `MasterDetail` (`kit/layout.tsx:146`) lays out a list and its inspector.
- Fixed side panels that are not inspectors: the flow editor's step panel (22 rem, `screens/FlowEditor.tsx:1089-1091`), the script editor's settings panel (22 rem, `screens/Authoring.tsx:697`), and the App Builder's widget settings.

### 5.12 Forms

- Field frame: label above, control, then hint; an error replaces the hint (`packages/ui/src/Fields.tsx:15-29`). The same frame is implemented again in `Combobox.tsx:33-52` and `SchemaForm.tsx:327-378`.
- Validation runs on submit. `Form` and `SchemaForm` focus the first invalid field (`Form.tsx:166-170`). Server field errors are mapped by JSON pointer (`ListScreen.tsx:130-131`, `InputDialog.tsx:10-17`).
- Most settings forms are assembled by hand from fields, each with its own busy, error and saved state. The kit `Form` has no console caller.
- Save models in use: explicit Save (most settings); immediate save on change (sign-up checkbox, logo upload, managed-workers toggle, provider on/off, domain enable, dashboard sharing); autosave (flow editor 1.5 s after a change once saved by hand, `screens/FlowEditor.tsx:702-706`; App Builder, `screens/Interfaces.tsx:1654-1662`).
- Remaining JSON textareas: script input schema (`screens/Authoring.tsx:531,542`) and resource definitions (`screens/ResourceEditor.tsx:277-290`).

### 5.13 Tables and lists

| Primitive | Reference | Used by | Row behaviour |
|---|---|---|---|
| `ListScreen` over ui `Table` | `ListScreen.tsx:210` | Tables, Data sources, Connections, Variables, Secrets, All resources, Workspaces, Operator access, API keys, service-account keys, worker credentials, Database locations, Deployments | Bordered panel; rows inert; first cell may be a link; row action buttons; error with "Try again" |
| ui `Table` direct | `packages/ui/src/Table.tsx:18` | Dashboards, App Builder list, flow view runs, extensions, SSO providers and people, SCIM, Domains, agent tools | Same look; each screen writes its own loading and error |
| `CollectionView` | `kit/CollectionView.tsx:24` | Flows, Scripts, Triggers, Events, Approvals, Published apps, Members, Groups, Roles, Access, End users, End-user groups, Service accounts, Audit | Edge to edge, sticky header; row focusable, Enter or Space selects (`:110-121`); error without retry |
| `ListCollection` | `kit/ListCollection.tsx:13` | Tenants, Instance members, Operators | `CollectionView` plus client search and inspector |
| ui `Grid` | `packages/ui/src/Grid.tsx:199` | Table rows, source rows, the app table widget | Sort, per-column filter, in-place edit, single select |
| Hand-rolled `<table>` | `screens/Runs.tsx:316`, `screens/Execution.tsx:857,1165`, `screens/Roles.tsx:154`, `screens/RowRules.tsx:312` | Runs, worker queue, connection groups, permission grid, see-it-as preview | Runs: row click opens the inspector, with no keyboard path (`screens/Runs.tsx:392-396`) |

Paging: cursor "Load more" on Runs (100 per page, `screens/Runs.tsx:132,340-344`), "Show older entries" on Audit (50, `screens/Audit.tsx:126,279`), Previous/Next on End users (`screens/EndUsers.tsx:159-180`) and table rows; none elsewhere. No list is virtualised.

### 5.14 Editors (Monaco)

`CodeEditor` (`editor/CodeEditor.tsx:23`) wraps Monaco. While Monaco loads it shows a read-only textarea, and an editable textarea if Monaco fails (`:112-121`). `editor/monaco.ts:24-46` configures the TypeScript worker with strict options and hand-written typings for `@vynxlabs/sdk`. No custom Monaco commands are registered. It is used by the script editor (scripts, connectors, trigger sources) and the read-only repository source view (`screens/Authoring.tsx:904`).

### 5.15 Workflow canvas (xyflow)

- Editing: `@xyflow/react` in `screens/FlowEditor.tsx:378`, with `Controls`, `MiniMap` and `Background` (`:1080-1083`), zoom 0.2 to 1.5 (`:1074-1075`), `fitView` on mount, after each added step and on test-panel toggle (`:590,757-760,1072`), auto layout through dagre ("Tidy up", `:887-899`), and undo/redo through `kit/history.ts`.
- Reading: `FlowGraph` (`FlowGraph.tsx:85`), an SVG graph used in the flow view and the flow run page, with nodes as buttons (`:258-263`) and state strokes from `kit/status.tsx:92-101`.

### 5.16 Visualisation

- `Chart` (`packages/ui/src/Chart.tsx`): Vega-Lite compiled and run through the Vega interpreter, loaded on demand (`chartEngine.ts:18`), themed from tokens (`chartTheme.ts:17-25`), exposed as `role="img"` with a title and description (`Chart.tsx:81-82`). Used by dashboards and app chart widgets.
- `Timeline` (`packages/ui/src/Timeline.tsx`): per-step bars with wait, run and hold segments for flow runs.
- Overview chart: a hand-built 24-hour bar chart with a screen-reader data table (`screens/Overview.tsx:84-186`).
- `ResultView` (`packages/ui/src/ResultView.tsx`): detects table, markdown, media or JSON output.

### 5.17 Notifications

`Toast` (`packages/ui/src/Toast.tsx`): `show(message, tone)`, text only, fixed at the bottom right, 5 s for every tone, `role="status"` for every tone (`:14-20,35,56-59,84`). Console wrappers are `notify.success` (19 calls in 12 files) and `notify.error` (54 calls). Inline `Notice` has four tones and an optional action; danger is `role="alert"` (`packages/ui/src/Notice.tsx:22`). There is no notification centre and no shell-level banner.

### 5.18 Loading states

A bare "Loading…" paragraph in 37 places (`ListScreen.tsx:253`, `kit/CollectionView.tsx:78`). `Skeleton` exists and has no console use. `Chart` has a pulse placeholder (`packages/ui/src/Chart.tsx:90`). Three places render nothing while loading: `/me` (`App.tsx:104`), operator grants (`screens/Tenant.tsx:164`), the workspace (`screens/Tenant.tsx:413`). Because `useLoad` keeps previous data, a filter change shows the old rows until the new ones arrive.

### 5.19 Error states

`Notice tone="danger"` in 112 places, nine with a retry action (`ListScreen.tsx:239` covers its 13 uses). `CollectionView` shows the error without retry (`kit/CollectionView.tsx:73-76`). Detail screens usually replace the whole page with the notice (`screens/Flows.tsx:368,631`, `screens/RunPage.tsx:161`). There is no error boundary and no request ID in any error. **Observed (mocked API):** a run row with a state outside `STATES` throws in `StatePill` (`kit/status.tsx:79`) and the console becomes an empty page; a summary response without `failedRuns` does the same (`Shell.tsx:132,649`); `GET /api/v1null` is requested on every navigation outside a workspace (`Shell.tsx:500-503`).

### 5.20 Empty states

`EmptyState` (ui; dashed border, left-aligned; 17 uses), `EmptyCanvas` (console kit; centred with a junction diagram; 7 direct uses plus every `CollectionView`), and bare paragraphs (`screens/Runs.tsx:311-313`).

### 5.21 Accessibility infrastructure

- Base UI primitives for dialog, sheet, menu, tabs, combobox and field; native controls for select, radio and date.
- Landmarks with labels in the shell (`nav` "Main", "Sections", "Where you are"; `main`), `aria-current` on navigation links (`router.tsx:85`).
- A global focus ring and a global reduced-motion rule.
- Every icon-only button has an `aria-label`; decorative icons and motifs are `aria-hidden`.
- State is icon plus word (`StatePill`), not colour alone.
- The palette is an ARIA combobox with a listbox and `aria-activedescendant` (`kit/CommandPalette.tsx:607-611,641,669-670`).
- `Grid` has a name, `scope`, `aria-sort` and labelled filters. The Overview chart has a hidden data table.
- Biome's accessibility rules are on, with 12 documented ignores.
- Absent: skip link, per-route title, focus move or announcement on route change, automated checker, documentation of editor keys. Detail is in `05-accessibility-audit.md`.

### 5.22 Keyboard shortcuts (everything implemented)

| Scope | Key | Action | Reference | Shown in the interface |
|---|---|---|---|---|
| Global | ⌘K / Ctrl+K | Open the palette, also from inputs and Monaco | `kit/CommandPalette.tsx:112-123` | Header `kbd` (`Shell.tsx:895-897`); shortcut sheet |
| Global, outside fields | `?` | Open the shortcut sheet | `kit/CommandPalette.tsx:750-766` | Only inside the sheet |
| Palette input | ↑ / ↓ | Move the active row, clamped | `kit/CommandPalette.tsx:619-624` | Sheet |
| Palette input | Enter | Open the row | `:625-630` | Return icon on the active row |
| Palette input | ⌘/Ctrl+Enter | Secondary action: run a script, start a flow, run again | `:629`, `:486-510` | "⌘↵ Run" on the active row from 768 px |
| Palette input | Backspace on empty | Leave a picker | `:631-633` | No |
| Palette input | `>` `#` `/` `@` prefixes | Runs, resources, actions, people | `:153-165` | Placeholder; sheet |
| Dialog, sheet, menu | Esc | Close (Base UI) | `packages/ui/src/Dialog.tsx:26`, `SideSheet.tsx:42` | Sheet |
| Script editor (window listener, scripts only) | ⌘/Ctrl+Enter | Save if dirty and run the draft with the last input | `screens/Authoring.tsx:314-325` | `kbd` beside the run form (`:603`) |
| Flow editor, outside fields | ⌘/Ctrl+Z | Undo | `screens/FlowEditor.tsx:740-746` | Button `title` (`:904`) |
| Flow editor, outside fields | ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y | Redo | `screens/FlowEditor.tsx:747-750` | Button `title` (`:914`) |
| Flow editor step "Name" field | Enter | Rename the step | `screens/FlowEditor.tsx:1394-1412` | No |
| `CollectionView` row | Enter / Space | Select the row (opens the inspector) | `kit/CollectionView.tsx:112-121` | No |
| `FlowGraph` node | Enter / Space | Select the node | `FlowGraph.tsx:258-263` | No |
| Grid cell editor | Enter / Esc | Commit / cancel | `packages/ui/src/Grid.tsx:181-186,254-255` | No |
| `Link` | modifier-click | Browser default (new tab) | `router.tsx:87` | n/a |
| Tabs, Menu, Combobox | arrows, Home/End, typeahead | Base UI defaults (**Inferred**) | `packages/ui/src/Tabs.tsx`, `Menu.tsx` | No |
| Flow canvas | Backspace/Delete on a selection, arrows on a focused node, shift-drag box | React Flow defaults (**Inferred**; not configured) | library | No |
| Code editor | Monaco defaults | (**Inferred**) | `editor/CodeEditor.tsx:56-66` | No |

Advertised but not implemented: "j k — Move through a list" (`kit/CommandPalette.tsx:744`). Not present anywhere: ⌘S, go-to chords, `/` to focus search, next/previous run, Esc to close the docked inspector.

### 5.23 Command palette and search (SH-PALETTE)

- One input finds screens, entities, runs by ID and actions (`kit/CommandPalette.tsx:173`).
- Server search, debounced 150 ms: `GET /tenants/:t/search` (`:234-253`). The server matches resource paths by substring for `script`, `flow`, `app`, `interface`, `table`, `trigger`, `schedule`, `connection`, `event` (`apps/control-plane/src/routes/search.ts:11-22,219-224`), runs by ID, ID prefix or tag (`:170-206`), and people only in `@` mode (`:120-167`). The default limit is 20 (`:90`).
- Client filter over destinations built by the shell: every workspace section, workspace, tenant section, tenant and instance section (`Shell.tsx:545-600`).
- Result targets (`kit/CommandPalette.tsx:126-151`): script to its editor, flow to its view, interface to the builder, table to the table, trigger to `triggers?trigger=`, run to the run page. Connection, event, app, member and end user open the list.
- Actions (`:367-481`): Run script…, Start flow…, New script and New flow (dev only), Pause trigger…, Resume trigger…, Copy workspace ID, Switch workspace…, Switch theme, Open the API description.
- Sections in fixed order: Recent, This workspace, Other workspaces, Runs, People, Screens, Actions, Choose (`:88-97`).
- There is no other global search. Per-screen search exists on Runs (server), Flows, Members, End users (server), Audit, Roles (permissions), the log viewer, the flow step palette and the `ListCollection` screens.

### 5.24 Recent items, favourites and saved views

| Thing | Exists | Where |
|---|---|---|
| Last tenant and workspace across devices | Yes, on the server | `App.tsx:41-56,63-87` |
| Last workspace per tenant | Yes, `localStorage` | `nav.ts:316-333` |
| Recent objects | Yes, on the server; 20 kept per member and tenant, 8 shown, in the palette only | `recent.ts:24-38`, `apps/control-plane/src/routes/search.ts:386-394` |
| What is recorded as recent | script (editor), flow, table, App Builder app, run | `recent.ts:24-38`, `Shell.tsx:490-491`, `screens/RunPage.tsx:39` |
| Favourites, pins, saved views, saved filters | No | |
| Column visibility and density | Session state on the table rows screen only | `screens/Data.tsx:97-98` |

---

## 6. Screen inventory

Columns: Screen · Route(s) · Component · Primary user · Primary objective · Primary entity · Major actions · Layout mode and list primitive · Key shared components · Important states. Indented rows (↳) are dialogs, sheets, inspectors, panels and wizards opened from the screen above them. Workspace routes are relative to `/t/:t/workspaces/:w/`. "CV" is `CollectionView`, "LS" is `ListScreen`, "LC" is `ListCollection`.

### 6.1 Shell and shared surfaces

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| SH-SHELL | Shell | every signed-in route | `Shell.tsx:462` | everyone | Know where you are and move | tenant, workspace, section | Switch area, section, workspace, tenant; open drafts and failed runs; open search; theme; account | frame for all modes | `BrandMark`, `Menu`, `EnvTag`, `Tag`, `Junction`, `Wire`, `SideSheet` | Production tag; "Paused" tag; counts; panel collapsed; operator view; dimmed rail without a workspace |
| SH-DRAWER | ↳ Navigation drawer | below 1024 px | `Shell.tsx:917-946` | everyone | Reach navigation on small screens | section | Same as rail and panel | left `SideSheet`, 320 px | `SideSheet` | — |
| SH-PALETTE | ↳ Command palette | ⌘K / Ctrl+K, header button | `kit/CommandPalette.tsx:173` | everyone | Jump to a thing or run an action | any | Search, open, run or start, pause or resume, new script or flow, switch workspace, theme | `Dialog` palette size (620 px, full screen on phones) | `Dialog`, `InputDialog` | Empty query (recent, 12 screens, 4 actions); "Nothing matches"; picker mode; no loading or error state |
| SH-SHORTCUTS | ↳ Shortcut sheet | `?` | `kit/CommandPalette.tsx:750` | everyone | Learn the keys | — | Read | `Dialog` | `Dialog` | Lists `j k`, which is not implemented |
| SH-INPUT | ↳ Run input dialog | from palette, script inspector, flow view, run pages | `InputDialog.tsx:23` | developer, operator | Give input and start | run | Fill fields or JSON, submit | `Dialog` 30 rem | `SchemaForm`, `Notice` | Field errors by pointer; form-level error |
| SH-OFFER | ↳ Offer to an agent | from script inspector, flow view, script editor | `screens/OfferToAgent.tsx:26` | developer | Expose a script or flow as an agent tool | service account tool | Choose account, describe, save | `Dialog` 30 rem | fields | — |
| SH-ASK | ↳ Confirm, prompt, type-to-confirm | everywhere | `packages/ui/src/Dialogs.tsx:14-46` | everyone | Decide a blocking question | — | Confirm, cancel, give a reason | `Dialog` | `Dialog`, `TextField` | Danger variant; one at a time |
| SH-CREATE | ↳ Create dialog | every "New"/"Add" on LS and LC screens | `ListScreen.tsx:116` | admin | Create one record | varies | Fill, submit | `Dialog` | fields, `Notice` | Field errors; values kept on cancel |
| SH-NOTFOUND | Not found | unknown addresses | `screens/NotFound.tsx:5` | everyone | Get back | — | Go home | page | — | Shows the path |
| SH-GATE | Operator gate | `/t/:t/*` as operator without a grant | `screens/Tenant.tsx:165-189` | operator | Open time-limited access | operator access grant | Open operator access (role, duration, reason) | page | `Page`, `EmptyState`, `CreateDialog` | Renders nothing while grants load |
| SH-OPBANNER | ↳ Operator access banner | every tenant route while a grant is active | `screens/Tenant.tsx:194-213` | operator | See and end own access | grant | End access now | `Notice` above the screen | `Notice`, `Button` | — |

### 6.2 Sign-in and account

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| AC-SIGNIN | Sign in | any path when `/me` is 401 | `screens/SignIn.tsx:62` | every member | Get in by password, SSO or recovery code | session | Enter email, choose method, submit | no shell; card 25 rem | `TextField`, `Button`, `Notice`, `BrandMark`, `Junction` | Email step; method step; "Checking…"; 13 SSO error reasons (`:14-34`); instance unreachable (`App.tsx:106-111`); `?return=` hand-off |
| AC-APIKEYS | API keys | `/account/api-keys` | `screens/Account.tsx:146` | any member, CLI user | Make and revoke personal keys | API key | Create API key, revoke | page; LS | `ListScreen`, `RemoveButton`, `CopyButton` | Empty; new-key notice shown once |
| AC-APIKEY-NEW | ↳ Create API key | button | `CreateDialog` | member | Name a key | API key | Submit | `Dialog` | `CreateDialog` | — |
| AC-RECOVERY | ↳ Recovery codes panel | same page, eligible members | `screens/Account.tsx:69` | tenant owner | Keep a way in if SSO fails | recovery codes | Make new codes | `Panel` | `Panel`, `KeyValues`, `Notice` | Hidden unless eligible (`:73`); none made; two or fewer left (`:111-116`); fresh list |

### 6.3 Instance

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| IN-TENANTS | Tenants | `/` | `screens/Tenants.tsx:19` | operator (all tenants), member (own) | Find and open a tenant | tenant | Search, open, create, delete | workbench; LC | `ListCollection`, `KeyValues`, `Tag`, `Mono` | Loading text; error without retry; two empty copies; "Nothing matches" |
| IN-TENANT-INSPECT | ↳ Tenant inspector | row | `kit/ListCollection.tsx:13` | operator | Read facts, delete | tenant | Open, delete | `Inspector` | `Inspector`, `KeyValues` | — |
| IN-TENANT-NEW | ↳ Create tenant | button | `CreateDialog` | operator | Create a client | tenant | Submit | `Dialog` | `CreateDialog` | — |
| IN-TENANT-DELETE | ↳ Delete tenant | inspector | `screens/Environments.tsx:1138` | operator | Remove a tenant | tenant | Type the slug | type-to-confirm | `ask.typeToConfirm` | — |
| IN-MEMBERS | All members | `/instance/members` | `screens/Instance.tsx:46` | operator | Find any member; disable or enable | member | Search, add, disable/enable (`:21`) | workbench; LC | `ListCollection`, `StatePill`, `Tag` | 200-row cap (`:51`) |
| IN-OPERATORS | Operators | `/instance/operators` | `screens/Instance.tsx:128` | operator | Manage who operates the instance | operator | Add, remove (confirm `:164`) | workbench; LC | `ListCollection` | — |
| IN-SSO | Instance single sign-on | `/instance/single-sign-on` | `screens/SingleSignOn.tsx:1167` | operator | Connect an identity provider for the instance | identity provider | Same as TN-SSO | page; ui `Table` | as TN-SSO | as TN-SSO |
| IN-DATABASES | Database locations | `/instance/databases` | `screens/Environments.tsx:665` | operator | Register where tenant data lives | database location | Register a location; read whether each answers | page; LS | `ListScreen`, `CreateDialog` | "No dedicated databases" empty state; problem per location |
| IN-IMPORT | Import a tenant | `/instance/import` | `screens/Environments.tsx:816` | operator | Restore a tenant from an export | tenant archive | Choose file, passphrase, inspect, import | page; form | fields, `Notice` | Three steps upload → inspect → done (`:826`); import report (`:876-898`) |
| IN-TRIGGERS | Instance triggers | `/instance/triggers` | `screens/InstanceTriggers.tsx:21` | operator | Stop or resume every trigger | instance trigger switch | Pause with reason (prompt `:29`), resume | page, 60 rem | `PageHeader`, `StatePill`, `Notice` | Running; paused; environment override |
| IN-AUDIT | Instance audit log | `/instance/audit` | `screens/Instance.tsx:173` → `screens/Audit.tsx:103` | operator | Who did what at instance level | audit entry | as TN-AUDIT | workbench; CV | as TN-AUDIT | as TN-AUDIT |
| IN-BRANDING | Console branding | `/instance/branding` | `screens/InstanceBranding.tsx:19` | operator | Name and colour the console | instance branding | Edit product name, mark, tokens (light and dark), save | page | `PageHeader`, `Panel`, `SectionLabel`, token rows, preview | Inline "Saved."; error with retry |
| IN-KIT | Component kit | `/instance/kit` | `screens/KitSheet.tsx:39` | developer of the console | Reference for kit pieces | — | Read | page | console kit only | Covers tokens, type roles, motifs, state, actions, empty canvas |

### 6.4 Tenant

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| TN-OVERVIEW | Tenant overview | `/t/:t`, `/t/:t/overview` | `screens/TenantOverview.tsx:48` | tenant admin, agency lead | See what needs me and how each workspace stands | tenant, workspace | Open approvals, review promotion requests, open a workspace, create a workspace | page; panels | `PageHeader`, `Panel`, `NextStep`, `EnvTag` | "Nothing needs you"; no workspaces; attention rows (`:64-142`) |
| TN-PROMO-REVIEW | ↳ Review promotion request | request row | `screens/Promotion.tsx:229` | tenant admin | Approve or decline a promotion | promotion request | Approve, decline with reason | `SideSheet` | `SideSheet`, `PreviewPanels` | Preview possible or refused |
| TN-WORKSPACES | Workspaces | `/t/:t/workspaces` | `screens/Tenant.tsx:271` | tenant admin | Open or create a workspace | workspace | Open, create | page; LS | `ListScreen`, type badge | Empty with create (`:302-305`) |
| TN-WORKSPACE-NEW | ↳ Create workspace | button | `CreateDialog` | tenant admin | Create production or dev, linked | workspace | Name, type, "Promotes to" | `Dialog` | `CreateDialog` | Type defaults to the first option |
| TN-APPROVALS | Approvals | `/t/:t/approvals` | `screens/Operate.tsx:620` | approver | Decide waiting steps | approval | Approve, reject, switch Waiting/Decided, open the run | workbench; CV | `CollectionView`, `FilterChips`, `Button` | Waiting; decided (comment, decider, "decided from the mail", `:684-701`); empty |
| TN-APPROVAL-INSPECT | ↳ Approval inspector | row | `screens/Operate.tsx:803` | approver | Read detail before deciding | approval | Approve, reject, open the run's graph | `Inspector` | `Inspector`, `KeyValues` | Who decides and timeout (`:822-834`) |
| TN-APPROVAL-DECIDE | ↳ Decide prompt | Approve or Reject | `screens/Operate.tsx:635` | approver | Add a comment | approval | Submit | prompt | `ask.prompt` | Comment required for reject |
| TN-MEMBERS | Members | `/t/:t/members` | `screens/Members.tsx:56`, list `:117` | tenant admin | See and manage people | member | Add, search, select, view access, suspend/resume, remove | workbench; CV with link tabs (`:31`) | `CollectionView`, `TextField`, `StatePill` | Empty; 200-row cap (`:118`) |
| TN-MEMBER-INSPECT | ↳ Member inspector | row | `screens/Members.tsx:117` | tenant admin | Act on one member | member | View access, suspend/resume, remove | `Inspector` | `Inspector`, `KeyValues` | — |
| TN-MEMBER-NEW | ↳ Add member | button | `CreateDialog` (`screens/Members.tsx:300`) | tenant admin | Add a person | member | Email, name, password | `Dialog` | `CreateDialog` | — |
| TN-MEMBER-PAGE | Member page | `/t/:t/members/:id` | `screens/Access.tsx:244` | tenant admin | Answer "why can this member do X" | member, effective access | Read access by source, follow to the grant | page; panels | `PageHeader`, `EffectiveAccess` (`:99`) | Back link (`:254`) |
| TN-GROUPS | Groups | `/t/:t/groups` | `screens/Groups.tsx:138` | tenant admin | Group members for access | group | Create, Members, Delete | workbench; CV (rows not selectable) | `CollectionView` | Empty |
| TN-GROUP-MEMBERS | ↳ Who is in the group | row button | `screens/Groups.tsx:20` | tenant admin | Add and remove members | group membership | Add, remove | wide `Dialog` | `Dialog`, `ComboboxField` | — |
| TN-ROLES | Roles | `/t/:t/roles` | `screens/Roles.tsx:397` | tenant admin | See and define roles | role | Create, select, change, delete | workbench; CV | `CollectionView`, `Tag` | "From repository" tag; "No roles" |
| TN-ROLE-INSPECT | ↳ Role inspector | row | `screens/Roles.tsx:371-395` | tenant admin | Read what a role allows | role | Change, delete | `Inspector` | `Inspector` | "In short" summary |
| TN-ROLE-DIALOG | ↳ Create or change role | button | `screens/Roles.tsx:274` | tenant admin | Pick permissions | role | Search permissions, tick, save | wide `Dialog` with permission grid (`:73-255`) | `Dialog`, hand-rolled table | — |
| TN-ACCESS | Access grants | `/t/:t/access` (`?binding=`) | `screens/Members.tsx:339` | tenant admin | See and give access | access grant | Give access, filter by who, remove | workbench; CV | `CollectionView`, `FilterChips` | Highlighted binding (`:355-365`); empty |
| TN-ACCESS-NEW | ↳ Give access | button | `CreateDialog` | tenant admin | Bind principal, role, scope | access grant | Submit | `Dialog` | `CreateDialog` | Principal defaults to the first option |
| TN-ENDUSERS | End users | `/t/:t/end-users` | `screens/EndUsers.tsx:88` | tenant admin | Manage app users | end user | Invite, search (server), page, select | workbench; CV with Previous/Next (`:159-180`) | `CollectionView`, `StatePill` | Empty; disabled; invited |
| TN-ENDUSER-INSPECT | ↳ End-user inspector | row | `screens/EndUsers.tsx:88` | tenant admin | Act on one end user | end user | Attributes, link, enable/disable, delete | `Inspector` | `Inspector`, `KeyValues` | — |
| TN-ENDUSER-INVITE | ↳ Invite end user | button | `CreateDialog` | tenant admin | Invite by email | end user | Submit | `Dialog` | `CreateDialog` | — |
| TN-ENDUSER-LINK | ↳ Invitation or reset link | after invite or reset | `screens/EndUsers.tsx:47` | tenant admin | Copy a one-time link | link | Copy | `Dialog` | `Dialog`, `CopyButton` | Shown once |
| TN-ENDUSER-ATTRS | ↳ End-user attributes | inspector | `screens/Groups.tsx:314` | tenant admin | Set attributes for row rules | end-user attributes | Edit, save | `Dialog` | `Dialog`, fields | — |
| TN-ENDUSER-GROUPS | End-user groups | `/t/:t/end-user-groups` | `screens/Groups.tsx:220` | tenant admin | Group end users | end-user group | Create, Members, Delete | workbench; CV | `CollectionView` | Empty |
| TN-SERVICE-ACCOUNTS | Service accounts | `/t/:t/service-accounts` | `screens/Tenant.tsx:777` | tenant admin | Manage machine identities | service account | Create, select, open | page; CV | `CollectionView`, `Inspector` | Empty |
| TN-SERVICE-ACCOUNT | Service account page | `/t/:t/service-accounts/:id` | `screens/Tenant.tsx:717-766` | tenant admin | Keys, agent tools and access for one account | service account, API key | Edit description (`:898`), create key, revoke key | page; LS and panels | `ListScreen`, `EffectiveAccess`, `AgentAccess` | New-key notice shown once |
| TN-AGENT-ACCESS | ↳ Agent access | section of the page | `screens/AgentAccess.tsx:19` | tenant admin, developer | See which tools an agent may call | agent tool | Choose workspace, try a tool | panel; ui `Table` | `Table` | — |
| TN-AGENT-TRY | ↳ Try tool | row button | `screens/AgentAccess.tsx:156` | developer | Call a tool as the agent | tool call | Give input, run | `Dialog` | `Dialog`, `SchemaForm` | Result or error |
| TN-OPERATOR-ACCESS | Operator access | `/t/:t/operator-access` | `screens/Tenant.tsx:944` | tenant admin | See and end operator grants | operator access grant | End access (confirm `:974`) | page; LS | `ListScreen` | "No operator has accessed this tenant" |
| TN-SSO | Single sign-on | `/t/:t/single-sign-on` | `screens/SingleSignOn.tsx:1167` | tenant admin | Connect and switch on a provider | identity provider | Connect a provider, open a provider | page; ui `Table` | `Page`, `Table`, `Badge` | No providers; error with retry (`:1208`) |
| TN-SSO-CONNECT | ↳ Connect identity provider | button | `screens/SingleSignOn.tsx:141` | tenant admin | Enter provider details | identity provider | Submit | `Dialog` | `Dialog`, fields | — |
| TN-SSO-PROVIDER | ↳ Provider detail | row name; component state, no URL | `screens/SingleSignOn.tsx:935` | tenant admin | Set up, prove domains, map groups, switch on | identity provider | Tabs Set up, Domains, Groups, Settings, People, Provisioning; test sign-in; remove (type-to-confirm `:1027-1032`) | page swap; `Stepper` (`:1098`) and `Tabs` (`:1114`) | `Stepper`, `Tabs`, `Facts`, `JsonView` | Test result with raw claims (`:405-414`); paused; on/off |
| TN-SCIM | ↳ Provisioning tab | inside provider detail | `screens/Provisioning.tsx:36` | tenant admin | Let the provider push people | SCIM token, pushed user | Create token, revoke, settings | tab; ui `Table` | `Table`, `Notice` | "No tokens yet"; "Nobody pushed yet" |
| TN-BRANDING | Tenant branding | `/t/:t/branding` | `screens/Branding.tsx:401` | tenant admin | Style the portal and apps | portal branding | Sign-up toggle, 26 tokens in light and dark, logo upload, save | page | `Page`, token rows (`:133`), preview (`:197`) | Inline "Saved." (`:313-317`); error with retry (`:409`) |
| TN-DOMAINS | Domains | `/t/:t/domains` | `screens/Domains.tsx:359` | tenant admin | Give an app its own hostname | domain | Add a hostname, open details | page; ui `Table` | `Table`, `Badge` | "N to fix"; empty with action; error with retry (`:388`) |
| TN-DOMAIN-ADD | ↳ Add hostname | button | `screens/Domains.tsx:62` | tenant admin | Name the host and app | domain | Submit, then the sheet opens | `Dialog` | `Dialog`, fields | — |
| TN-DOMAIN-SHEET | ↳ Domain details | "Details" button | `screens/Domains.tsx:200` | tenant admin | Follow three DNS steps | domain | Check now, enable, remove | `SideSheet` | `SideSheet`, record lines (`:188`) | Per-step status |
| TN-REPOSITORY | Repository | `/t/:t/repository` | `screens/Git.tsx:24` | tenant admin | Connect a git repository | repository | Save or connect, disconnect | page; form, max-w xl | `Page`, fields, `Notice` | Inline success (`:116-118`) |
| TN-WORKERS | Workers | `/t/:t/workers` | `screens/Execution.tsx:922` | tenant admin, operator | See the queue; set up pools and credentials | worker pool, worker, credential | Add pool, remove pool, toggle managed workers, create credential, revoke | page; hand-rolled queue table (`:857`), pool cards (`:731`), LS section (`:1026`) | `QueuePanel` (`:824`), `ListScreen`, `Badge` | Queue depth; workers online; "No standalone workers"; one-time credential |
| TN-WORKER-POOL-NEW | ↳ Add pool | button | `CreateDialog` | tenant admin | Define a pool | worker pool | Submit | `Dialog` | `CreateDialog` | — |
| TN-WORKER-CRED-NEW | ↳ Create credential | button | `CreateDialog` | tenant admin | Issue a worker credential | credential | Submit; token shown once (`:1081-1088`) | `Dialog` | `CreateDialog`, `Notice` | — |
| TN-AUDIT | Audit log | `/t/:t/audit` | `screens/Audit.tsx:103` | tenant admin | Find who changed what | audit entry | Area, since, search, kind chips, show older, select | workbench; CV | `CollectionView`, `FilterChips`, `Badge` | "Nothing recorded yet"; "Nothing of that kind"; 50 per page (`:126,279`) |
| TN-AUDIT-INSPECT | ↳ Audit entry inspector | row; opens the newest on wide screens (`:160-162`) | `screens/Audit.tsx:103` | tenant admin | Read one entry | audit entry | Read, copy | `Inspector` | `Inspector`, `KeyValues`, `JsonView` | Request ID shown (`:315`) |
| TN-RETENTION | Retention | `/t/:t/retention` | `screens/Retention.tsx:36` | tenant admin | Set how long history is kept | retention settings | Four number fields, save | page; form | `Page`, `NumberField` | Save disabled until changed (`:105`); toast on save |
| TN-EXPORT | Export | `/t/:t/export` | `screens/Tenant.tsx:345` → `screens/Environments.tsx:557` | tenant admin | Download the tenant | tenant archive | Passphrase twice, history choice, export | page; form | fields, `Notice` | Busy; error |

### 6.5 Workspace › Overview

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| WS-OVERVIEW | Workspace overview | `overview` | `screens/Overview.tsx:193` | workspace owner, operator | Is it healthy and what is next | workspace | Open failed runs, resolve git conflict, decide approvals, configure connections, review drafts; "Review release" (dev with drafts) or "Open runs" (`:326-334`) | page; panels | `PageHeader`, `SectionLabel`, `Panel`, `NextStep`, `EmptyCanvas`, `EnvTag`, `StatePill` | Summary error (`:355`); "Checking…" (`:363`); all clear (`:365`); triggers error/loading/empty (`:456-464`); stats section absent while loading or failed (`:377`) |

### 6.6 Workspace › Build

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| WS-FLOWS | Flows | `flows` | `screens/Flows.tsx:65` | developer, operator | Find a flow, see its health and drafts | flow | New flow (dev), search, chips All / Failed today / Waiting / Drafted, select | workbench; CV | `CollectionView`, `FilterChips`, `StatePill`, `Tag`, `Mono` | Three empty variants (`:225-242`); waiting-approvals banner (`:107-112`); draft and removing tags; read-only in production |
| WS-FLOW-INSPECT | ↳ Flow inspector | row | `screens/Flows.tsx:243-310` | developer, operator | Peek and choose where to go | flow | Open, Edit, open the last run | `Inspector` | `Inspector`, `KeyValues` | — |
| WS-FLOW-VIEW | Flow view | `flows/<path>` | `screens/Flows.tsx:351` | anyone reading a deployed flow | See its shape, how it starts and recent runs; start it | deployed flow | Start flow, offer to an agent, edit, arrange by drag (layout autosaved `:422-434`), open a run | page; ui `Table` of 20 runs (`:364`) | `Page`, `FlowGraph`, `Table`, `InputDialog`, `OfferButton` | Loading (`:369`); error (`:368`); arrangement saving/saved/forbidden (`:436-443`) |
| WS-FLOW-EDITOR | Flow editor | `flows/new`, `flows/edit/<path>` (dev only) | `screens/FlowEditor.tsx:378` | developer | Assemble and test a flow | flow draft | Path, Tidy up, Undo, Redo, Test, Save draft, Review and deploy; add, select, move, connect, delete steps | editor and workbench; React Flow canvas | kit fields, `Badge`, `Tag`, `Notice`, `StatePill`, `ExpressionField` | `new` / `draft` / `deployed` / `repository` (`:395`); save status text (`:836-842`); problems strip (`:938-956`); run states on nodes (`:762-790`); production shows a notice instead (`screens/Tenant.tsx:451`) |
| WS-FLOW-PALETTE | ↳ Steps to add | "Add step" | `screens/FlowEditor.tsx:969-1040` | developer | Pick a step type | step | Search, choose | floating panel, 256 px | — | — |
| WS-FLOW-STEP | ↳ Step panel | selection | `screens/FlowEditor.tsx:1089-1343` | developer | Configure the chosen step | step | Per-type settings: trigger (manual, schedule, event, webhook `screens/FlowSteps.tsx:226`, form `:418`), script (`:86`), subflow, foreach, delay, approval, fail, respond (`:616`), branch, set; rename; remove (confirm `:1331`) | fixed aside, 352 px | kit fields, `ExpressionField` (`screens/ExpressionField.tsx:41`) | Empty selection "About this flow" (`:1345-1364`); "Last test" block (`screens/FlowTestPanel.tsx:123`) |
| WS-FLOW-TEST | ↳ Test the draft | "Test" toggle | `screens/FlowTestPanel.tsx:28` | developer | Run the draft with input | flow test run | Fill input, Run a test / Run again, open the run | bottom panel, max 45vh | `InputForm`, `StatePill` | "The flow changed since this test" (`:86-90`) |
| WS-SCRIPTS | Scripts | `scripts` | `screens/Execution.tsx:95` | developer, operator | Find a script; see last run and what it reaches | deployed script | New script (dev), chips All / Failing / Never run (`:132-149`), select | workbench; CV | `CollectionView`, `FilterChips`, `StatePill` | Three empty variants (`:207-232`) |
| WS-SCRIPT-INSPECT | ↳ Script inspector | row | `screens/Execution.tsx:235-295` | developer, operator | Peek, run or open | script | Open editor, Run, offer to an agent, open the last run | `Inspector` | `Inspector`, `KeyValues`, `InputDialog` | Failure notice with "N times in a row" (`:260-267`) |
| WS-SCRIPT-EDITOR | Script editor | `scripts/new`, `scripts/edit/<path>` | `screens/Authoring.tsx:229` | developer | Write, configure, try and ship a script | script draft | Path, edit code, Save draft, Discard draft (confirm `:644`), Review and deploy, Settings tab, Try it tab, ⌘↵ | editor (padded page); Monaco 34 rem tall | `CodeEditor`, `Tabs`, kit fields, `Badge`, `Notice` | `new` / `draft` / `deployed` / `repository` (`:420-425`); "Unsaved changes" badge (`:630`); read-only notices for production, core and repository scripts (`:675-695`); schema reading/slow/failed (`:560-571`); Monaco fallback |
| WS-SCRIPT-TEST | ↳ Test run panel | after a run | `screens/Authoring.tsx:726-742` → `screens/Runs.tsx:480` | developer | Read logs and output of the draft's run | test run | Cancel run, open full view, copy as curl; tabs Logs / Input and output / Details | section below the editor | `ScriptRunPanel`, `LogViewer`, `ResultView` | Live; failed with "Why it failed"; published events list (`:871`) |
| WS-SCRIPT-REPO | ↳ Repository source | repository scripts | `screens/Authoring.tsx:904` | developer | Read source that lives in git | source file | Pick file | read-only editor | `CodeEditor` | Empty when the bundle has no TypeScript (`:914-920`) |
| WS-APP-LIST | App Builder list | `screens` | `screens/Interfaces.tsx:1911` | developer | Find or make an app | interface | Make an app, open builder (dev), open live address | page; ui `Table` | `Table`, `Tag` | Non-dev notice (`:1942-1946`); Published vN / Not published / Edits not published / Being removed (`:1989-2007`) |
| WS-APP-NEW | ↳ Make an app | button | `screens/Interfaces.tsx:2027-2089` | developer | Name and address a new app | interface | Submit | `Dialog` | `Dialog`, fields | — |
| WS-APP-BUILDER | App Builder | `screens/<path>` | `screens/Interfaces.tsx:1590`, `PageEditor` `:1225` | developer, technical operator | Compose pages of widgets over tables and publish | interface (pages → widgets) | Rename; add, rename, remove page; add widget (8 types `:82-91`); drag, stretch; viewport preview; see it as a group; Publish; open the app | editor (padded page); canvas is `PageRenderer` in editing mode (`packages/screens/src/Renderer.tsx:542-552`) | `PageRenderer`, kit fields, `Notice` | Save status text (`:1737-1745`); problems notice (`:1794-1805`); no-app notice (`:1760-1793`); empty page; dry-run outside dev (`:1384`) |
| WS-APP-WIDGET | ↳ Widget settings | widget "Edit" button | `screens/Interfaces.tsx:400` | developer | Configure one widget | widget | Fields, format (`:317`), conditions, totals, links, actions (`screens/ActionSettings.tsx:79`), row actions (`:259`), page filters (`:1462`), remove | fixed aside | kit fields | Empty hint (`:1448-1451`) |
| WS-APP-PAGE-DIALOGS | ↳ Page prompts | page menu | `screens/Interfaces.tsx:1824,1849,1868,1766` | developer | Add, rename, remove a page; make an app for it | page | Submit | prompt and confirm | `ask.prompt`, `ask.confirm` | — |
| WS-APPS | Published apps | `apps` | `screens/Apps.tsx:370`, list `:389` | workspace admin | See what is served, to whom | app, audience binding | Select, Share, open the live app | workbench; CV | `CollectionView`, `Inspector`, `Tag` | Unserved-apps notice (`:399-408`); "anyone" warnings; "From repository" tag |
| WS-APP-INSPECT | ↳ App inspector | row | `screens/Apps.tsx:389` | workspace admin | Read address and audience | app | Share, open | `Inspector` | `Inspector`, `KeyValues` | — |
| WS-APP-SHARE | ↳ Share an app | "Share" | `screens/Apps.tsx:89` | workspace admin | Change who may open it | audience binding | Add audience, stop sharing; tabs | wide `SideSheet` with `Tabs` | `SideSheet`, `Tabs`, fields | "Anyone" warning (`:275-280`) |
| WS-EXTENSIONS | Extensions | `extensions` | `screens/Authoring.tsx:759` | developer | Manage connectors and trigger sources | extension | New connector, new trigger source, open | page; ui `Table` | `Page`, `Table`, `Badge` | — |
| WS-EXTENSION-EDITOR | Extension editor | `extensions/(connector\|trigger_source)/(new\|edit/<path>)` | `screens/Authoring.tsx:229` with a kind | developer | Write a connector or trigger source | extension draft | As the script editor without "Try it" | editor | as WS-SCRIPT-EDITOR | as WS-SCRIPT-EDITOR |
| WS-RESOURCES | All resources | `resources` | `screens/Tenant.tsx:607-660` | developer | See every declared resource of any kind | resource | New (menu of six kinds, dev only `:620-631`), open editor | page; LS | `ListScreen`, `Menu` | — |
| WS-RESOURCE-EDITOR | Resource editor | `resources/new/<kind>`, `resources/edit/<kind>/<path>` | `screens/ResourceEditor.tsx:125` | developer | Declare a connection, connection group, variable, event, schedule or trigger | resource draft | Path, kind fields, Save draft, Discard or Remove (confirm `:355`), Review and deploy | editor; form panel max 672 px (`:406`) | kit fields, `Badge`, `Notice`, `ScheduleFields` | new / draft / deployed / repository; dirty badge (`:345`); production read-only (`:393-397`); problems after a failed save (`:548-556`) |

### 6.7 Workspace › Operate

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| WS-RUNS | Runs | `runs` (`?status,kind,when,q,tag,run`) | `screens/Runs.tsx:90` | operator, on-call developer | Find a run and see why it failed | run | Search, Kind, When, status chips with counts, tag filter, select, open, Load more, Cancel queued runs (confirm `:165`) | workbench; hand-rolled table (`:316-339`) | `TextField`, `SelectField`, `FilterChips`, `MasterDetail`, `StatePill`, `Tag`, `Mono` | "Live" / "Live · updates every 5s" (`:215-219`); filtered-empty and empty (`:311-313`); per-page error (`:366-373`). **Observed (mocked API):** rows 57 px (82 px with a tag); first row at y = 282 at 1440x900 |
| WS-RUN-INSPECT | ↳ Run inspector | row click (`?run=`) | `screens/Runs.tsx:480` (script), `:450` (flow) | operator | Peek at a run without leaving the list | run | Cancel (confirm `:509`), open full view, copy as curl; tabs Logs / Input and output / Details | `Inspector` | `Inspector`, `Tabs`, `LogViewer`, `JsonView`, `ResultView`, `KeyValues`, `CopyableId` | Why it failed; diagnosis; waiting-for; attempts strip; flow runs show a summary only |
| WS-RUN-SCRIPT | Script run page | `runs/<id>` | `screens/RunPage.tsx:25,153` | developer | Diagnose and re-run | script run | Cancel (confirm `:216`), Re-run menu, copy curl, copy ID, open script, trigger, deployments, tag filter | workbench (own padding `:27`); 16 rem aside and main (`:255`) | `LogViewer`, `Tabs`, `KeyValues`, `StatePill`, `NextStep`, `CopyableId`, `Menu` | Why it failed (`:352`); diagnosis (`:362`); waiting-for (`:379`); attempts (`:257`); a fetch error replaces the page (`:161`) |
| WS-RUN-RERUN | ↳ Re-run menu and dialogs | "Re-run" | `screens/RunPage.tsx:237-245` (script), `:559-570` (flow) | developer, operator | Run again with a stated version and input | run | Same input on its version; other input (`InputDialog` `:424`, `:581`); on the version deployed now; flow: retry from the failed step (plan confirm `:483`), again from the start (`:495`) | `Menu`, confirm, `InputDialog` | `Menu`, `ask.confirm`, `InputDialog` | — |
| WS-RUN-FLOW | Flow run page | `runs/<id>` (and `flow-runs/<id>` by redirect) | `screens/Flows.tsx:615`, header `screens/RunPage.tsx:441` | developer, operator | See which step failed and decide | flow run, step run | Cancel flow run (confirm `:535`), Re-run menu, approve or reject in place (prompt `screens/Flows.tsx:642`), select a step, open the step's run or child flow run, Timeline / Graph tabs | workbench; `Timeline` and `FlowGraph` | `Timeline`, `FlowGraph`, `Tabs`, `Facts`, `ResultView`, `Notice` | Failure banner (`screens/Flows.tsx:679`); approval notices (`:684-704`); "Choose a step to see what it produced." (`:830`); "kept from" notice |
| WS-RUN-STEP | ↳ Step detail | step selection (component state) | `screens/Flows.tsx:748-828` | developer | Read one step's facts, error, logs and output | step run | Open this step's run, open child flow run | section below the tabs | `Facts`, `StepLogs` (`:837`), `ResultView` | Error text; wake time; items count |
| WS-EVENTS | Events | `events` | `screens/Operate.tsx:423` | operator, developer | See what was published and what it started | event | Filter by name (submit), select | workbench; CV | `CollectionView`, `TextField` | 100 rows, no paging (`:427`); "Nothing listens" (`:494-495`) |
| WS-EVENT-INSPECT | ↳ Event inspector | row | `screens/Operate.tsx:512` | operator | Read payload and consequences | event | Open the publishing run, open started runs | `Inspector` | `Inspector`, `JsonView`, `StatePill` | — |
| WS-TRIGGERS | Triggers | `triggers` (`?trigger=`) | `screens/Operate.tsx:65` | operator | See what starts work and stop or start it | trigger | New trigger (menu `:103`, dev), type filter, select | workbench; CV | `CollectionView`, `FilterChips`, `StatePill`, `Menu` | Workspace-paused and production-paused banners (`:207-216`); disabled "New trigger" in production (`:99`) |
| WS-TRIGGER-INSPECT | ↳ Trigger inspector | row | `screens/Operate.tsx:244` | operator | Pause, resume, fire | trigger | Pause with reason (prompt `:276`), Resume, Fire now, copy address, open target, open the last run | `Inspector` | `Inspector`, `KeyValues`, `CopyableId` | Pause reason (`:302-308`); last refusal (`:309-318`); overlap and backlog explanations (`:340-358`) |
| WS-SCHEDULE-SHEET | ↳ New schedule | New trigger › Schedule | `screens/ScheduleForm.tsx:256` | developer | Schedule a script or flow | schedule trigger | Target, schedule fields (`:68`), save | `SideSheet`, 30 rem | `SideSheet`, `ScheduleFields` | Next times preview |
| WS-RELEASE | Release | `release`, `changes`, `deployments` | `screens/Release.tsx:102` | developer (dev), operator (production "Versions") | Move changes to deployed, then to production | draft, deployment, promotion | Stepper Review → Deploy → Promote (`:155`) | page; `Stepper`, panels | `PageHeader`, `Stepper`, `Panel`, `EnvTag`, `Notice` | The step is component state (`:117-119`); only `deployments` selects a step by address |
| WS-RELEASE-REVIEW | ↳ Review step | default | `screens/Release.tsx:182` | developer | Read drafts and deploy them | draft | Open draft editor, Earlier, Set aside (confirm `:264`), write message, Deploy N changes | step panel; grouped rows and a deploy panel (`:230-378`) | `Panel`, `Tag`, `Notice` | "These changes cannot be deployed yet" (`:303-313`); unbound warnings; "Production is untouched" (`:375-377`) |
| WS-DRAFT-HISTORY | ↳ Draft history | "Earlier" | `screens/Release.tsx:389-441` | developer | Bring back an earlier draft | draft revision | Bring back | `SideSheet` (`:411`) | `SideSheet` | — |
| WS-RELEASE-DEPLOY | ↳ Deploy step (versions) | `deployments` | `screens/Release.tsx:459`, `screens/Execution.tsx:430` | developer, operator | See versions; roll back | deployment | Activate an earlier bundle (confirm `screens/Execution.tsx:460`) | step panel; versions list and LS "Bundles and rollback" | `ListScreen`, `Badge` | — |
| WS-RELEASE-PROMOTE | ↳ Promote step | stepper | `screens/Release.tsx:502` | developer, workspace admin | Send a version to production | promotion | Change target, Promote (confirm `:589-594`), request promotion (`screens/Promotion.tsx:34`), withdraw | step panel; From/To panels and `PreviewPanels` (`:622`) | `Panel`, `Notice`, `Button` (promote variant) | "Tried here: N runs, M failed" (`:689-709`); request state (`screens/Promotion.tsx:120`) |
| WS-DRIFT | ↳ Drift | inside Promote | `screens/Drift.tsx:41`, sheet `:123` | developer | See how dev and production differ | drift item | Filter, open an item's diff | list and wide `SideSheet` | `SideSheet`, `StatePill`, `kit/diff.ts` | "Nothing here." (`:82`) |
| WS-GIT | Git sync | `git` | `screens/GitSync.tsx:42` with `screens/Git.tsx:185` | developer | Push and pull the workspace to its branch | repository state | Push, Pull, Push with drafts, choose a side per conflict (`screens/GitSync.tsx:198-257`), branch form, commit message prompt (`screens/Git.tsx:323-331`) | page; panels | `PageHeader`, `Panel`, `Badge`, `Notice` | Ahead/behind (`screens/GitSync.tsx:103-145`); conflict; not connected |

### 6.8 Workspace › Data

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| WS-TABLES | Tables | `tables` | `screens/Data.tsx:490` | developer, data owner | Find a table; create one | table | Open, Create table | page; LS | `ListScreen`, `Badge`, `EmptyState` | Retired badge (`:505`); empty with action (`:521-524`) |
| WS-TABLE-NEW | ↳ Create table | button | `screens/Data.tsx:525-552` | developer | Name a table | table | Submit | `Dialog` | `CreateDialog` | — |
| WS-TABLE-ROWS | Table rows | `tables/<name>` | `screens/Data.tsx:584`, `RowsBrowser` `:89` | developer, operator | Find, read and change rows | row | Sort (`:197-204`), filter per column (`:207-212`), hide columns, compact, Add row, edit a cell, delete, Previous / Next; Rows / Definition toggle (`:592-600`) | page; ui `Grid` | `Grid`, `Button`, `Notice` | Filtered-empty and empty (`:246-248`); error with retry (`:183-187`); filter parse error (`:182`); retired notice (`:613-623`) |
| WS-ROW-SHEET | ↳ Row details | row | `screens/Data.tsx:281-312` | developer | Read a whole row | row | Delete | `SideSheet` | `SideSheet`, `KeyValues` | — |
| WS-ROW-ADD | ↳ Add row | button | `screens/Data.tsx:328-476` | developer | Insert a row | row | Fill, submit | `SideSheet` | `SideSheet`, fields | Field errors |
| WS-TABLE-DEFINITION | ↳ Table definition | "Definition" toggle (component state) | `screens/Data.tsx:685` | developer, workspace admin | Shape the table and decide who sees rows | table definition, row policy | Add, rename, retire column; bring back or purge; row rules (`screens/RowRules.tsx:58`); retire or purge table (`:656`) | same page | `Panel`, fields, `Notice` | Repository-managed read-only (`:729-734`); retired columns section |
| WS-COLUMN-ADD | ↳ Add column | button | `screens/Data.tsx:935-981` | developer | Add a column | column | Submit | `Dialog` | `Dialog`, fields | — |
| WS-SEE-AS | ↳ See it as | inside row rules | `screens/RowRules.tsx:272` | workspace admin | Check what an end user would see | row policy preview | Pick a person or group | inline panel; hand-rolled table (`:312`) | — | "Would see no rows" (`:309`) |
| WS-SOURCES | Data sources | `sources` | `screens/Data.tsx:1009` | developer, workspace admin | Point a declared source at a database and check it | data-source binding | Connect database, Test connection (`:1060-1080`), Disconnect, open | page; LS | `ListScreen`, `Badge` | Not connected; Not checked yet; reached with latency; not reached |
| WS-SOURCE-CONNECT | ↳ Connect database | row button | `screens/Data.tsx:1094-1145` | workspace admin | Enter connection details | data-source binding | Eight fields, submit | `Dialog` | `Dialog`, fields | — |
| WS-SOURCE-VIEW | Source view | `sources/<path>` | `screens/Data.tsx:1156` | developer | Browse external tables | external table, row | Pick a table, then as WS-TABLE-ROWS | page; 192 px table list and `Grid` (`:1183`) | `RowsBrowser` | "No tables found" (`:1179-1181`); read-only note for keyless tables |
| WS-DASHBOARDS | Dashboards | `dashboards` | `screens/Dashboards.tsx:37` | developer, staff | Find or start a dashboard | dashboard | New dashboard (prompt `:39-53`), open | page; ui `Table` | `Page`, `Table`, `Badge` | Error with retry (`:66`) |
| WS-DASHBOARD | Dashboard | `dashboards/<id>` | `screens/Dashboards.tsx:110` | owner (editor), others (viewer) | Arrange charts and tables; share | dashboard | Rename, Save, Delete, share to everyone or groups (`:298`), all page-editor actions | page (not editor mode); `PageEditor` or `PageView` | `PageEditor`, `Chart`, fields | Viewer mode "Shared by…" (`:143-157`); "Changes not saved." (`:201-203`); problems notice (`:266-277`) |

### 6.9 Workspace › Configure

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| WS-CONNECTIONS | Connections | `connections` (`?oauth`, `?oauth_error`, `?connection` on return) | `screens/Execution.tsx:563` | developer, workspace admin | Make an external system reachable and prove it | connection | New connection, Test (`:486`), Change / Set up, Unbind, Connect / Reconnect (OAuth) | page; LS | `ListScreen`, `Badge`, `UsedBy`, `ConnectionHealth` (`:522`) | Not bound; Not tested; Reached (latency); Failed; OAuth states; Testing…; Waiting for a worker… |
| WS-CONNECTION-WIZARD | ↳ Connection wizard | New, Change, Set up | `screens/ConnectionWizard.tsx:152` | developer | Declare, bind and test in one place | connection | Fields, Save, Test again, Connect again, change the token | wide `SideSheet` | `SideSheet`, fields, `CopyButton`, `Notice` | Test result; OAuth redirect address (`:415`) |
| WS-CONNECTION-GROUPS | ↳ Connection groups | below the list | `screens/Execution.tsx:1125` | workspace admin | Group interchangeable connections | connection group | Add a member, Remove | section; hand-rolled table (`:1165`) | — | Error without retry (`:1128`); nothing while loading (`:1129`); no groups; no members |
| WS-CONNECTION-GROUP-ADD | ↳ Add a member | button | `screens/Execution.tsx:1199-1249` | workspace admin | Add a connection to a group | group membership | Submit | `Dialog` | `Dialog`, fields | — |
| WS-VARIABLES | Variables | `variables` | `screens/Execution.tsx:663` | developer, workspace admin | Set per-workspace values | variable | Set variable, Use default (confirm `:705-714`) | page; LS | `ListScreen`, `UsedBy` | Value or "Default: x" (`:676-683`) |
| WS-VARIABLE-SET | ↳ Set variable | button | `screens/Execution.tsx:686-704` | workspace admin | Pick a variable and give a value | variable | Submit | `Dialog` | `CreateDialog`, `ComboboxField` | — |
| WS-SECRETS | Secrets | `secrets` | `screens/Tenant.tsx:661-711` | workspace admin | Set and remove secrets | secret | Set secret, Delete (confirm `:703-710`) | page; LS | `ListScreen`, `UsedBy`, `RemoveButton` | Values never shown; "Last set … by …" (`:670-679`) |
| WS-SECRET-SET | ↳ Set secret | button | `screens/Tenant.tsx:686-702` | workspace admin | Name and value | secret | Submit | `Dialog` | `CreateDialog` | — |
| WS-ALERTS | Alerts | `alerts` | `screens/Alerts.tsx:32` | workspace admin, operator | Decide what happens when a run fails; read alert history | alert default, alert | Choose handler script or connection, Save, Send a test alert, open run, Older alerts | page, max-w 2xl | `Page`, `SelectField`, `Badge` | Test waiting for a worker (`:159-163`); "+N more" folding (`:216`); notify error on the row (`:219-221`) |
| WS-SETTINGS | Workspace settings | `settings` | `screens/Environments.tsx:166`, controls `:36` | workspace admin | Pause, clone, set the promotion target, delete | workspace | Pause / Resume triggers, Clone workspace, change "Promotes to", Review and promote, Delete workspace (type the slug) | page, 60 rem | `Panel`, `Notice`, `SelectField` | Paused notice or running panel (`:68-96`); production cannot be deleted (`:147-151`) |
| WS-CLONE | ↳ Clone workspace | button | `screens/Environments.tsx:194` | workspace admin | Copy a workspace | workspace clone | Name the copy, start | `Dialog` | `Dialog`, fields | Queued / running / failed / done with a report (`:241-284`) |
| WS-PROMOTE-PREVIEW | ↳ Promotion preview | "Review and promote" | `screens/Environments.tsx:452-504` | workspace admin | Check before promoting | promotion | Promote | `Dialog` | `Dialog`, `PreviewBody` (`:509`) | Possible or refused (`:464-477`) |

### 6.10 Public and unauthenticated

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| PB-APPROVE | Approval link | `/approve/:token` | `screens/ApproveLink.tsx:33` | approver from mail, often on a phone, not signed in | Decide one approval | approval | Approve, Reject (reason required `:56-58`) | no shell; card 34 rem | `BrandMark`, `EnvTag`, `ResultView`, `Notice`, `Button` | Loading; asking; decided; gone (`:85-115`); "a test run" marker (`:122-124`); expiry sentence (`:153-156`) |

### 6.11 App runtime (what end users see)

These surfaces are outside the console but share its tokens and parts of `packages/ui`.

| ID | Screen | Route(s) | Component | Primary user | Primary objective | Primary entity | Major actions | Layout mode and list primitive | Key shared components | Important states |
|---|---|---|---|---|---|---|---|---|---|---|
| RT-APP | App Builder app | `/apps/…` on the apps origin or a tenant domain; page in the URL hash | `packages/screens/runtime/main.tsx:54` → `InterfaceRenderer` (`packages/screens/src/Renderer.tsx:964`) | end user, staff | Read rows, choose one, act on it | app page, widget, row | Switch page, filter, select a row, run an action (`packages/screens/src/actions.tsx:103,253`), sign out | own page; widgets table / form / chart / card / cards (`packages/ui/src/widgets.tsx`) | `Grid`, `Chart`, `Button`, `Notice` | Per widget: table gone, may not read, column gone, waiting for a choice, error, loading, empty; action success / failed / still running / dry-run (`actions.tsx:142-186`); ask-for-input dialog (`:222-245`) |
| RT-CUSTOM-APP | Custom React app | `/apps/…` | tenant code using `packages/app` and optionally `PageShell` (`packages/ui/src/PageShell.tsx`) | end user | Defined by the app | defined by the app | Defined by the app | own page | `PageShell`, `Card`, `Avatar`, `Skeleton`, `Form` (ui exports used here, not in the console) | — |
| RT-PORTAL-HOME | Portal home | `/portal/<tenant>/` | `apps/control-plane/src/kernel/apps/pages.ts:334` | end user | See the apps open to me | app | Open an app, sign out | server-rendered HTML, 380 px card | portal stylesheet (`pages.ts:25`) | — |
| RT-PORTAL-SIGNIN | Portal sign-in and sign-up | `/portal/<tenant>/sign-in`, `/sign-up`, `/staff` | `pages.ts:122,171`; routes `kernel/apps/front.ts:228,282,507` | end user, staff | Sign in to apps | end-user session | Submit | server-rendered HTML | — | Error message; sign-up closed (404 message page) |
| RT-PORTAL-PASSWORD | Set and forgot password | `/portal/<tenant>/set-password`, `/forgot` | `pages.ts:201,222`; `front.ts:331,368` | end user | Choose or reset a password | end-user credential | Submit | server-rendered HTML | — | Link expired (410 message page) |
| RT-FORM | Form trigger page | `/portal/<tenant>/forms/<key>` | `pages.ts:250`; `front.ts:416-471` | anyone or signed-in end user | Submit a form that starts a flow | form trigger | Fill, submit | server-rendered HTML | — | Not here (404); paused (503); sign-in required |
| RT-MESSAGE | Message page | error and terminal states | `pages.ts:315` | end user | Understand what happened | — | Follow a link | server-rendered HTML | — | Not found; not allowed; link expired |

---

## 7. Navigation relationships

### 7.1 Entity-to-entity links

"Link" means a link exists; "text" means the target is named but not linked; "missing" means nothing is shown.

| From ↓ / To → | Script | Flow | Run(s) | Trigger | Connection | Table | Version / release | App |
|---|---|---|---|---|---|---|---|---|
| Script list inspector (`screens/Execution.tsx:233-296`) | link to editor (`:245`) | missing (no "used by flows") | link to the last run only (`:290`); no "all runs of this script" | missing | text (`:278-287`) | text | missing | missing |
| Script editor (`screens/Authoring.tsx`) | — | missing | missing (no run history) | missing | missing | missing | link to Release (`:667`) | missing |
| Flow list and view (`screens/Flows.tsx`) | missing (steps do not link to their script) | link (`:155,253,257,413`) | link to the last run (`:303`); own runs table (`:481`) | missing | missing | missing | missing | missing |
| Flow run step (`screens/Flows.tsx:788-818`) | missing | link to child flow run (`:814`) | link to the step's run (`:807`); copied-from (`:792,799`) | missing | missing | missing | missing | missing |
| Run page (`screens/RunPage.tsx`) | link from the path heading (`:106-108`) | link (same) | link to re-run source and re-runs (`:201-203`), retry (`:520-522`), alert handler (`:338`) | link (`:145`) | link to the list only (`:326`) | missing | link to the deployments list only (`:113`) | missing |
| Runs inspector (`screens/Runs.tsx`) | link (`:631`) | link (`:462`) | link (`:402`) | link (`:639`) | text (`:673-684`) | missing | link (`:467,649`) | missing |
| Trigger (`screens/Operate.tsx`) | link to target (`:324-326`) | link to target | link to the last run (`:373`) | — | missing | missing | missing | missing |
| Event (`screens/Operate.tsx:512-555`) | missing | missing | link to the publishing run (`:524-528`) and started runs (`:542-555`) | missing | missing | missing | missing | missing |
| Connection (`screens/Execution.tsx:601`) | text in a `title` (`kit/references.tsx:19-30`) | text | missing | missing | — | missing | missing | missing |
| Variable, secret (`screens/Execution.tsx:673`, `screens/Tenant.tsx:669`) | text | text | missing | missing | missing | missing | missing | missing |
| Alert (`screens/Alerts.tsx`) | link (`:176`) | missing | link (`:207,223`) | missing | missing | missing | missing | missing |
| Release (`screens/Release.tsx:705`) | link to the draft editor | link to the draft editor | link to failed runs (all, not per version) | missing | missing | missing | — | missing |
| Workers queue (`screens/Execution.tsx:872`) | missing | missing | link to queued runs in that workspace | missing | missing | missing | missing | missing |
| Workspace overview (`screens/Overview.tsx`) | missing | missing | link (`:222,381`) | link to the list (`:449`) | link to the list (`:278`) | missing | link (`:296,396`) | missing |
| Approval (`screens/Operate.tsx:726,841`) | missing | missing | link to the flow run | missing | missing | missing | missing | missing |
| Audit entry | missing | missing | missing | missing | missing | missing | missing | missing |

Cross-workspace: the header's "promotes to X" and the panel's release path are text (`Shell.tsx:783-785,336-353`). No screen links an object in dev to the same object in production.

### 7.2 View state in the URL

In the path: every object identity listed under deep linking below; the four Members & access tabs (`screens/Members.tsx:31-50`); the release deploy step by alias.

In the query string (every `useQueryValue` call):

| Screen | Parameter | Use | Reference |
|---|---|---|---|
| Runs | `status` | status chip; accepts the old `cancelled` | `screens/Runs.tsx:98` |
| Runs | `kind` | script or flow | `:105` |
| Runs | `when` | time window, default 24 h | `:107` |
| Runs | `q` | search, debounced 300 ms | `:109`, `:117-123` |
| Runs | `tag` | tag filter | `:110` |
| Runs | `run` | selected run in the inspector | `:111` |
| Triggers | `trigger` | selected trigger | `screens/Operate.tsx:80` |
| Access grants | `binding` | read only: highlight a binding | `screens/Members.tsx:355` |
| Resource editor | `type` | read only: preset trigger type | `screens/ResourceEditor.tsx:146` |
| Connections | `oauth`, `oauth_error`, `connection` | OAuth return | `screens/Execution.tsx:568-570` |

### 7.3 View state not in the URL

| Screen | State kept in component state | Reference |
|---|---|---|
| Flows list | filter chip, search text, selected flow | `screens/Flows.tsx:76-78` |
| Scripts list | filter chip, selected script | `screens/Execution.tsx:107-108` |
| Triggers | type filter | `screens/Operate.tsx:77` |
| Events | name filter, selected event | `screens/Operate.tsx:424-429` |
| Approvals | Waiting/Decided, selection | `screens/Operate.tsx:621,629` |
| Release | step after load, history selection | `screens/Release.tsx:117,203` |
| Runs | loaded "Load more" pages | `screens/Runs.tsx:114` |
| Run page, run inspector, flow run | tabs; selected step | `screens/RunPage.tsx:388`, `screens/Runs.tsx:575`, `screens/Flows.tsx:705,628` |
| Flow editor | selected step, canvas viewport, test panel open | `screens/FlowEditor.tsx:392,398,1072` |
| Script editor | Settings / Try it tab, last test input | `screens/Authoring.tsx:717-723,255-256` |
| Table rows | sort, column filters, page cursor trail, hidden columns, compact, selected row, Rows/Definition | `screens/Data.tsx:91-99,586` |
| Audit | area, since, verb, search, open entry | `screens/Audit.tsx:116-120` |
| Members; Access | search, selected member; who filter | `screens/Members.tsx:121-122,352` |
| Published apps | selected app, share tab | `screens/Apps.tsx:131,392` |
| Service accounts | selection | `screens/Tenant.tsx:780` |
| Single sign-on | open provider and its six tabs | `screens/SingleSignOn.tsx:1171-1190` |
| Domains | open details sheet | `screens/Domains.tsx:359` |
| Every `ListCollection` | search, selected row | `kit/ListCollection.tsx:47-48` |
| Shell | section filter text | `Shell.tsx:523` |

### 7.4 Deep linking

- Addressable objects: script (editor), flow (view and editor), run, table, data source, dashboard, App Builder app, resource (editor), extension (editor), trigger (through `?trigger=`), member, service account, access grant (through `?binding=`).
- No address of their own: a connection, a variable, a secret, an event, an approval, a published app, a deployment version, a step of a flow run, a log line, an audit entry, an identity provider, a domain, a role, a group.
- `?run=<flow run id>` on the Runs list is not reload-safe: the inspector decides script or flow from in-memory state (`screens/Runs.tsx:295-299`), so a shared link to a flow run asks the script-run endpoint.

### 7.5 Back behaviour

- `pushState`: every `Link` and `navigate()` without options.
- `replaceState`: every `useQueryValue` change (`router.tsx:48`; one source note cites `:49`, the code has the call at `:48`), reopening the last place, sign-out, slug to ID, new to edit after the first save, the `flow-runs` redirect.
- Consequences: Back never closes an inspector and never undoes a filter. Selecting a run puts `?run=` in the address by replace, so Back leaves the Runs screen.
- No unsaved-changes guard: no `beforeunload` and no blocker in `navigate` (`router.tsx:6-10`).
- No scroll restoration. The scroll container is the persistent `<main>` (`Shell.tsx:902-904`).
- No focus move and no announcement on navigation.
- Per-screen back links, with no shared component: "Runs › id" (`screens/RunPage.tsx:94-102`), "All scripts" (`screens/Authoring.tsx:610`), "Flows /" (`screens/FlowEditor.tsx:848-853`), "All flows" below the title (`screens/Flows.tsx:409`), table (`screens/Data.tsx:608`), source (`screens/Data.tsx:1167`), dashboard (`screens/Dashboards.tsx:139`), App Builder (`screens/Interfaces.tsx:1718`), resource editor (`screens/ResourceEditor.tsx:324`), member page (`screens/Access.tsx:254`), SSO provider (a button, `screens/SingleSignOn.tsx:1008-1013`). **Observed (mocked API):** three of these patterns appear on three neighbouring screens.

---

## 8. Structural observations for later documents

These are **Judgment** unless a reference is given. They are pointers, not recommendations; the fixes are specified in `09-prioritized-uiux-roadmap.md`.

1. The frame is sound and worth keeping: rail, section panel, header, work surface and inspector, with three layout modes and counts that link to a filtered view. Later documents build on it rather than replace it.
2. Routing, the tab allow-list and the layout-mode patterns are three hand-maintained lists (`App.tsx:124-137`, `screens/Tenant.tsx:353-377`, `nav.ts:216-246`). One has already drifted from a test (`e2e/redesign.spec.ts:147`). This underlies P2-3 and P2-6.
3. Six list primitives produce four "open a row" conventions and three paging styles. The Runs list, the highest-traffic list, is the hand-rolled one and the only selectable list with no keyboard path. See P0-3, P1-1 and P2-2.
4. The inspector behaves as two components split at 1280 px: a sheet with focus management below, a plain aside above. See P0-3.
5. Query-string state is always written by replace, and most view state is not in the address at all. Sharing a view, returning to it and closing an inspector with Back all depend on this. See P2-6.
6. Reference data exists but stops at text: "Used by", "Uses", "promotes to" and the release path name their targets without linking them, and connections, variables, secrets, events, approvals and published apps have no address of their own. See P1-3 and P1-10.
7. Editors are the least protected surfaces: no unsaved-changes guard, autosave only for flows after a first manual save, remount on the first save, and fixed panel sizes. See P0-4, P1-4 and P3-5.
8. Feedback is uneven by construction: toasts are text only with one timing, 12 of 40 files with writes ever confirm success by toast, and connection state is shown in one place. See P0-7, P1-7 and P2-8.
9. Crash containment is absent at every level (**Observed (mocked API)** for the unknown run state; **Verified** absence of any boundary). See P0-1.
10. Two kits overlap (`packages/ui` and `kit/`), and the kit sheet (IN-KIT) documents only the console kit. See P2-1, P2-5 and P2-12.
11. The advertised keyboard surface is larger than the implemented one (`kit/CommandPalette.tsx:744`). See P0-6 and P3-1.
12. Earlier findings from `docs/evolution/04-ux-audit.md` that are fixed at HEAD: workspace slug addresses and the not-found screen (`screens/Tenant.tsx:393-421`), the remembered place (`App.tsx:63-87`), the failed-runs chip opening a filtered list (`Shell.tsx:880`), one live stream per tenant (`stream.ts`), run input through a schema form (`InputDialog.tsx:78`), and a distinct "Waiting for approval" state (`kit/status.tsx:42-61`). Still open: Build opens on Flows (`nav.ts:107-108`), approvals leave the workspace (`screens/Overview.tsx:259`), no visible section name in a workspace header (`Shell.tsx:788`), no multi-select, and the editors' path to deploy.

---

## Appendix: screen ID index

Workspace routes are relative to `/t/:t/workspaces/:w/`. "(from X)" means the surface has no address of its own and is opened from screen X.

| ID | Screen | Route |
|---|---|---|
| SH-SHELL | Shell | every signed-in route |
| SH-DRAWER | Navigation drawer | (from SH-SHELL, below 1024 px) |
| SH-PALETTE | Command palette | (from SH-SHELL, ⌘K) |
| SH-SHORTCUTS | Shortcut sheet | (from anywhere, `?`) |
| SH-INPUT | Run input dialog | (from SH-PALETTE, WS-SCRIPT-INSPECT, WS-FLOW-VIEW, run pages) |
| SH-OFFER | Offer to an agent | (from WS-SCRIPT-INSPECT, WS-FLOW-VIEW, WS-SCRIPT-EDITOR) |
| SH-ASK | Confirm, prompt, type-to-confirm | (from any screen) |
| SH-CREATE | Create dialog | (from list screens) |
| SH-NOTFOUND | Not found | unknown addresses |
| SH-GATE | Operator gate | `/t/:t/*` as operator without a grant |
| SH-OPBANNER | Operator access banner | `/t/:t/*` while a grant is active |
| AC-SIGNIN | Sign in | any path, signed out |
| AC-APIKEYS | API keys | `/account/api-keys` |
| AC-APIKEY-NEW | Create API key | (from AC-APIKEYS) |
| AC-RECOVERY | Recovery codes panel | `/account/api-keys` |
| IN-TENANTS | Tenants | `/` |
| IN-TENANT-INSPECT | Tenant inspector | (from IN-TENANTS) |
| IN-TENANT-NEW | Create tenant | (from IN-TENANTS) |
| IN-TENANT-DELETE | Delete tenant | (from IN-TENANT-INSPECT) |
| IN-MEMBERS | All members | `/instance/members` |
| IN-OPERATORS | Operators | `/instance/operators` |
| IN-SSO | Instance single sign-on | `/instance/single-sign-on` |
| IN-DATABASES | Database locations | `/instance/databases` |
| IN-IMPORT | Import a tenant | `/instance/import` |
| IN-TRIGGERS | Instance triggers | `/instance/triggers` |
| IN-AUDIT | Instance audit log | `/instance/audit` |
| IN-BRANDING | Console branding | `/instance/branding` |
| IN-KIT | Component kit | `/instance/kit` |
| TN-OVERVIEW | Tenant overview | `/t/:t`, `/t/:t/overview` |
| TN-PROMO-REVIEW | Review promotion request | (from TN-OVERVIEW) |
| TN-WORKSPACES | Workspaces | `/t/:t/workspaces` |
| TN-WORKSPACE-NEW | Create workspace | (from TN-WORKSPACES) |
| TN-APPROVALS | Approvals | `/t/:t/approvals` |
| TN-APPROVAL-INSPECT | Approval inspector | (from TN-APPROVALS) |
| TN-APPROVAL-DECIDE | Decide prompt | (from TN-APPROVALS, TN-APPROVAL-INSPECT, WS-RUN-FLOW) |
| TN-MEMBERS | Members | `/t/:t/members` |
| TN-MEMBER-INSPECT | Member inspector | (from TN-MEMBERS) |
| TN-MEMBER-NEW | Add member | (from TN-MEMBERS) |
| TN-MEMBER-PAGE | Member page | `/t/:t/members/:id` |
| TN-GROUPS | Groups | `/t/:t/groups` |
| TN-GROUP-MEMBERS | Who is in the group | (from TN-GROUPS, TN-ENDUSER-GROUPS) |
| TN-ROLES | Roles | `/t/:t/roles` |
| TN-ROLE-INSPECT | Role inspector | (from TN-ROLES) |
| TN-ROLE-DIALOG | Create or change role | (from TN-ROLES) |
| TN-ACCESS | Access grants | `/t/:t/access` |
| TN-ACCESS-NEW | Give access | (from TN-ACCESS) |
| TN-ENDUSERS | End users | `/t/:t/end-users` |
| TN-ENDUSER-INSPECT | End-user inspector | (from TN-ENDUSERS) |
| TN-ENDUSER-INVITE | Invite end user | (from TN-ENDUSERS) |
| TN-ENDUSER-LINK | Invitation or reset link | (from TN-ENDUSERS) |
| TN-ENDUSER-ATTRS | End-user attributes | (from TN-ENDUSER-INSPECT) |
| TN-ENDUSER-GROUPS | End-user groups | `/t/:t/end-user-groups` |
| TN-SERVICE-ACCOUNTS | Service accounts | `/t/:t/service-accounts` |
| TN-SERVICE-ACCOUNT | Service account page | `/t/:t/service-accounts/:id` |
| TN-AGENT-ACCESS | Agent access | (section of TN-SERVICE-ACCOUNT) |
| TN-AGENT-TRY | Try tool | (from TN-AGENT-ACCESS) |
| TN-OPERATOR-ACCESS | Operator access | `/t/:t/operator-access` |
| TN-SSO | Single sign-on | `/t/:t/single-sign-on` |
| TN-SSO-CONNECT | Connect identity provider | (from TN-SSO, IN-SSO) |
| TN-SSO-PROVIDER | Provider detail | (from TN-SSO, IN-SSO; component state) |
| TN-SCIM | Provisioning tab | (tab of TN-SSO-PROVIDER) |
| TN-BRANDING | Tenant branding | `/t/:t/branding` |
| TN-DOMAINS | Domains | `/t/:t/domains` |
| TN-DOMAIN-ADD | Add hostname | (from TN-DOMAINS) |
| TN-DOMAIN-SHEET | Domain details | (from TN-DOMAINS) |
| TN-REPOSITORY | Repository | `/t/:t/repository` |
| TN-WORKERS | Workers | `/t/:t/workers` |
| TN-WORKER-POOL-NEW | Add pool | (from TN-WORKERS) |
| TN-WORKER-CRED-NEW | Create credential | (from TN-WORKERS) |
| TN-AUDIT | Audit log | `/t/:t/audit` |
| TN-AUDIT-INSPECT | Audit entry inspector | (from TN-AUDIT, IN-AUDIT) |
| TN-RETENTION | Retention | `/t/:t/retention` |
| TN-EXPORT | Export | `/t/:t/export` |
| WS-OVERVIEW | Workspace overview | `overview` |
| WS-FLOWS | Flows | `flows` |
| WS-FLOW-INSPECT | Flow inspector | (from WS-FLOWS) |
| WS-FLOW-VIEW | Flow view | `flows/<path>` |
| WS-FLOW-EDITOR | Flow editor | `flows/new`, `flows/edit/<path>` |
| WS-FLOW-PALETTE | Steps to add | (from WS-FLOW-EDITOR) |
| WS-FLOW-STEP | Step panel | (from WS-FLOW-EDITOR) |
| WS-FLOW-TEST | Test the draft | (from WS-FLOW-EDITOR) |
| WS-SCRIPTS | Scripts | `scripts` |
| WS-SCRIPT-INSPECT | Script inspector | (from WS-SCRIPTS) |
| WS-SCRIPT-EDITOR | Script editor | `scripts/new`, `scripts/edit/<path>` |
| WS-SCRIPT-TEST | Test run panel | (from WS-SCRIPT-EDITOR) |
| WS-SCRIPT-REPO | Repository source | (from WS-SCRIPT-EDITOR) |
| WS-APP-LIST | App Builder list | `screens` |
| WS-APP-NEW | Make an app | (from WS-APP-LIST) |
| WS-APP-BUILDER | App Builder | `screens/<path>` |
| WS-APP-WIDGET | Widget settings | (from WS-APP-BUILDER, WS-DASHBOARD) |
| WS-APP-PAGE-DIALOGS | Page prompts | (from WS-APP-BUILDER) |
| WS-APPS | Published apps | `apps` |
| WS-APP-INSPECT | App inspector | (from WS-APPS) |
| WS-APP-SHARE | Share an app | (from WS-APPS) |
| WS-EXTENSIONS | Extensions | `extensions` |
| WS-EXTENSION-EDITOR | Extension editor | `extensions/(connector\|trigger_source)/(new\|edit/<path>)` |
| WS-RESOURCES | All resources | `resources` |
| WS-RESOURCE-EDITOR | Resource editor | `resources/new/<kind>`, `resources/edit/<kind>/<path>` |
| WS-RUNS | Runs | `runs` |
| WS-RUN-INSPECT | Run inspector | `runs?run=<id>` |
| WS-RUN-SCRIPT | Script run page | `runs/<id>` |
| WS-RUN-FLOW | Flow run page | `runs/<id>`, `flow-runs/<id>` (redirect) |
| WS-RUN-RERUN | Re-run menu and dialogs | (from WS-RUN-SCRIPT, WS-RUN-FLOW) |
| WS-RUN-STEP | Step detail | (from WS-RUN-FLOW) |
| WS-EVENTS | Events | `events` |
| WS-EVENT-INSPECT | Event inspector | (from WS-EVENTS) |
| WS-TRIGGERS | Triggers | `triggers` |
| WS-TRIGGER-INSPECT | Trigger inspector | `triggers?trigger=<id>` |
| WS-SCHEDULE-SHEET | New schedule | (from WS-TRIGGERS) |
| WS-RELEASE | Release | `release`, `changes`, `deployments` |
| WS-RELEASE-REVIEW | Review step | `release`, `changes` |
| WS-DRAFT-HISTORY | Draft history | (from WS-RELEASE-REVIEW) |
| WS-RELEASE-DEPLOY | Deploy step (versions) | `deployments` |
| WS-RELEASE-PROMOTE | Promote step | (from WS-RELEASE; component state) |
| WS-DRIFT | Drift | (from WS-RELEASE-PROMOTE) |
| WS-GIT | Git sync | `git` |
| WS-TABLES | Tables | `tables` |
| WS-TABLE-NEW | Create table | (from WS-TABLES) |
| WS-TABLE-ROWS | Table rows | `tables/<name>` |
| WS-ROW-SHEET | Row details | (from WS-TABLE-ROWS, WS-SOURCE-VIEW) |
| WS-ROW-ADD | Add row | (from WS-TABLE-ROWS, WS-SOURCE-VIEW) |
| WS-TABLE-DEFINITION | Table definition | `tables/<name>` (component state) |
| WS-COLUMN-ADD | Add column | (from WS-TABLE-DEFINITION) |
| WS-SEE-AS | See it as | (from WS-TABLE-DEFINITION) |
| WS-SOURCES | Data sources | `sources` |
| WS-SOURCE-CONNECT | Connect database | (from WS-SOURCES) |
| WS-SOURCE-VIEW | Source view | `sources/<path>` |
| WS-DASHBOARDS | Dashboards | `dashboards` |
| WS-DASHBOARD | Dashboard | `dashboards/<id>` |
| WS-CONNECTIONS | Connections | `connections` |
| WS-CONNECTION-WIZARD | Connection wizard | (from WS-CONNECTIONS) |
| WS-CONNECTION-GROUPS | Connection groups | `connections` (section) |
| WS-CONNECTION-GROUP-ADD | Add a member | (from WS-CONNECTION-GROUPS) |
| WS-VARIABLES | Variables | `variables` |
| WS-VARIABLE-SET | Set variable | (from WS-VARIABLES) |
| WS-SECRETS | Secrets | `secrets` |
| WS-SECRET-SET | Set secret | (from WS-SECRETS) |
| WS-ALERTS | Alerts | `alerts` |
| WS-SETTINGS | Workspace settings | `settings` |
| WS-CLONE | Clone workspace | (from WS-SETTINGS) |
| WS-PROMOTE-PREVIEW | Promotion preview | (from WS-SETTINGS) |
| PB-APPROVE | Approval link | `/approve/:token` |
| RT-APP | App Builder app | `/apps/…` |
| RT-CUSTOM-APP | Custom React app | `/apps/…` |
| RT-PORTAL-HOME | Portal home | `/portal/<tenant>/` |
| RT-PORTAL-SIGNIN | Portal sign-in and sign-up | `/portal/<tenant>/sign-in`, `/sign-up`, `/staff` |
| RT-PORTAL-PASSWORD | Set and forgot password | `/portal/<tenant>/set-password`, `/forgot` |
| RT-FORM | Form trigger page | `/portal/<tenant>/forms/<key>` |
| RT-MESSAGE | Message page | error and terminal states |
