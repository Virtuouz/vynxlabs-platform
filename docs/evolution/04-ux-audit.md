# 4. UI/UX audit

**Scope.** The console as built on `main` after the phase 8 redesign ("Signal Workshop"). Screens were walked on a seeded instance at 1440 px and 390 px ([05-journeys.md](05-journeys.md) has the method). Code references are under `apps/console/src` unless stated otherwise.

**Overall judgment.** Phase 8 gave the console a coherent frame:
- a rail, a section panel and a header that shows the environment;
- workbenches built from a list plus an inspector;
- overviews that lead with "needs attention";
- design tokens, light and dark themes, and phone widths.

The visual language is calm and consistent, and it already looks intentional. The remaining problems are not cosmetic. They are about **depth**: execution views that are too narrow, a missing entity search, JSON where forms belong, and actions that dead-end one link short of where the user needs to be. Below the surface, four list implementations and three status vocabularies are the main sources of inconsistency.

---

## 4.1 Information architecture

### Current structure (verified: `nav.ts`, `Shell.tsx`, `App.tsx`, `screens/Tenant.tsx`)

```
Rail ─┬─ Workspace: Overview · Build · Operate · Data · Configure
      ├─ Tenant
      └─ Instance / Tenants
Build:     Flows · Scripts · Extensions · App Builder · Published apps · All resources
Operate:   Runs · Events · Triggers · Releases · Git sync
Data:      Tables · Data sources · Dashboards
Configure: Connections · Variables · Secrets · Settings
Tenant:    Overview · Workspaces · Approvals | Members & access · End users · End-user groups ·
           Service accounts · Operator access | Single sign-on | Branding · Domains ·
           Repository · Workers | Audit log · Export
```

### Findings

| # | Issue | Evidence | Recommendation | Why |
| --- | --- | --- | --- | --- |
| IA1 | **Build opens on Flows.** No overview of what the workspace is built from, and Scripts is a second click | Observed | Keep the deep link, but make Build's landing a compact **catalog**: scripts, flows, apps and triggers in one filterable table with a kind column. Each row shows its trigger count, last run state and owner (repository or console) | The user's mental model is "the things in this workspace", not one kind at a time. One table also gives bulk actions and search a home |
| IA2 | **Triggers live in Operate, but are created in Build › All resources or inside a flow** | Observed: Triggers has no New | Add **New trigger ▾** to Triggers that opens the same `ResourceEditor` form. Each trigger row links to its target, and the target's inspector lists its triggers | Creation belongs where things are seen. Today the user has to know that "All resources" exists |
| IA3 | **"All resources" is a generic escape hatch** listing connection, variable, event, schedule and trigger forms | Observed | Keep it as an advanced list, but put each kind's **New** on its own home: Connections, Variables, Triggers, Events | It mirrors the code's resource model rather than the user's tasks |
| IA4 | **Connections are split three ways:** declared in Build, bound in Configure, used in the script settings | Traced, [Journey 5](05-journeys.md#journey-5-connect-an-api-and-reuse-the-credential) | One **connection page** per connection with tabs Definition · Binding per workspace · Used by · Health, and an "Add connection" wizard | A connection is one thing to the user |
| IA5 | **App Builder (Build) and Dashboards (Data)** build similar widget pages with different publishing rules | Traced (`Interfaces.tsx`, `Dashboards.tsx`) | Keep both models. Label them by audience: "Apps (shared, published)" and "My dashboards (private)". Put "Save as app" on a dashboard | Two near-identical builders in two areas read as duplication |
| IA6 | **Approvals is tenant-level only.** The workspace shows them as a count | Observed | Keep the tenant queue. Add a workspace-filtered view reachable from the workspace overview's "Decide" without leaving the workspace context | Context preservation: today "Decide" switches the rail to Tenant |
| IA7 | **Header shows no visible section name** inside a workspace (screen-reader only, `Shell.tsx:775`) | Verified | Show `Workspace › Section › Item` as a breadcrumb in the header. On phones keep only the last item | On detail pages (a flow run, an editor) the only back affordance is "All flows"-style links that differ by page |
| IA8 | **Workspace URLs use UUIDs.** A URL with a slug returns the raw text "The request params is not valid." | Observed (`/t/<id>/workspaces/clinics/overview`) | Accept slugs in console routes and resolve them, or redirect. Add a **404 screen**. Unknown paths today fall back silently to Tenants or Workspaces (`App.tsx:85`, `Tenant.tsx:252`) | URLs are shared in chat and tickets. They should be readable and should fail clearly |
| IA9 | **Remembered location isn't used.** `PUT /me/recent` is sent on every scope change but never read back, and each call writes an audit entry | Verified `App.tsx:43-52`, `routes/identity.ts:461`. Observed: 17 `member.recent_set` audit rows after one walk, shown as tenant "Recent changes" | Read it on `/` to reopen the last workspace. **Stop auditing it.** It is a preference, not a change. Filter preference actions out of "Recent changes" | It pollutes an append-only log that cannot be pruned, and buries real changes on the tenant overview |

## 4.2 Information density and hierarchy

| # | Interface | Problem | Proposal | Why |
| --- | --- | --- | --- | --- |
| D1 | Runs list | Rows about 57 px tall, with a second line that repeats "Script" or "Flow". The **What** column takes about 45% of the width while **the error is not shown**. Native `<select>`s for Kind and When sit beside chip filters | 36–40 px single-line rows. A kind icon instead of the subtitle. A **"Result" column with the first line of the error or the output summary**. Kind and When become chips or a segmented control. Keep "Live · updates every 5s" | Operators scan dozens of runs. The why-it-failed text is the most useful datum and is currently two clicks away |
| D2 | Run inspector | 22–26 rem side panel. Logs wrap structured fields to about 20 characters a line. Log controls take three rows | A **full-page run view** at `/runs/:id` with a step and attempt timeline on the left and logs at full width. Keep the inspector as a quick peek with **Open full view**. The finished `RunDetail` (`screens/Execution.tsx:348`) is unused and is a starting point | Logs are the main evidence when debugging and need width |
| D3 | Workspace overview | Strong. The 24-hour chart is a single bar when runs cluster; the Release card says "This workspace promotes nowhere" in production | Show the chart at a resolution that fits the data (for example 15-minute buckets for the last 6 h). In production, make the Release card show the source workspace and the last promotion | Small gains on an already good page |
| D4 | Tenant overview | "Recent changes" is dominated by preference and operator-access entries | Show deploys, promotions, bindings and member changes. Link "Audit log" for everything else | The panel should answer "what changed that matters" |
| D5 | Script editor (repository-owned) | Banner: "its source is not kept here" while the source is shown. "Defined at line 679", but the editor opens at line 1 | Correct the copy ("Source from the repository, read-only here"). Scroll and highlight the definition | Contradictory copy erodes trust, and the line hint isn't acted on |
| D6 | Flow run graph | Clipped at 1440 px with no fit-to-view. The status says "Running" while waiting on an approval. The approval payload is raw JSON | Fit to view on open, with zoom controls (React Flow `fitView` exists in the editor). A **Waiting for approval** state. Show the payload as `Facts` (key–value) with JSON behind a toggle | The graph is the flow's main debug view |
| D7 | Phone runs list | Paths truncate to `billing/record-…`. Status takes a third of the width | At narrow widths show a status icon only, and wrap the path over two lines rather than truncating it | Paths are the identifier, so truncating them loses the row's identity |
| D8 | Forms (schedule, resource editor) | A single narrow column at 1440 px leaves 45% empty | Put a **live preview** in the right column: next fire times, the resolved webhook URL, the input form preview | Uses the space for feedback rather than whitespace |

## 4.3 Interaction design

| # | Interaction | Current | Proposal |
| --- | --- | --- | --- |
| X1 | Command palette (⌘K) | Destinations only. "reminders" returns nothing (Observed) | Index **entities**: scripts, flows, apps, tables, triggers, connections and runs by ID. Add **actions**: run a script, start a flow, open a run by ID, pause a trigger, switch workspace, toggle theme. Use prefixes as Windmill does (`>` runs). Recent items first |
| X2 | Failed-runs chip and "Open runs" | Opens unfiltered | Carry `?status=failed&from=…`. Write chip changes back to the URL (`Runs.tsx` reads `?status` once) |
| X3 | Run again | Same input, no edit | **Re-run ▾**: same input, or edit input (schema form prefilled). For flows: **Retry from failed step** or re-run from the start |
| X4 | Bulk actions | None anywhere | Multi-select on Runs (cancel, re-run), Approvals (approve or reject with one comment), Drafts (discard), Triggers (pause or resume) |
| X5 | Input entry | JSON textareas in Try it, Start flow, schedule input. The flow editor's "Run by hand" sends `{}` | One **SchemaForm** used everywhere, covering nested objects, arrays, enums and dates, with a JSON toggle. `InputDialog` today handles flat schemas only |
| X6 | Copying identifiers | `CopyButton` exists (`ListScreen.tsx:342`) but not on run, event or step IDs | Copy on every mono identifier. **Copy as curl** on a run (the API call that would start it again) and on webhook triggers |
| X7 | Success feedback | `notify.success` used in 5 files. Most actions show nothing or an inline notice | A toast for every write, with an **undo** where it is reversible (pause trigger, discard draft) and a **link to the resulting object** (the run started, the deployment made) |
| X8 | Keyboard | ⌘K, ⌘↵ in the script editor, and Enter on rows only | `j/k` row movement and `Enter`/`Esc` in every CollectionView. `g r` / `g f` go-to chords. `?` for a shortcut sheet. ⌘S in editors |
| X9 | Live updates | Polling in four places, none elsewhere | One SSE stream per workspace ([spec S5](specs/S5-run-event-stream.md)) driving the runs list, run pages, shell counts, the overview and approvals |
| X10 | Editors' path to deploy | Review and deploy leaves the editor for Release | A **Deploy** split button in the editor header for "this change only", with the Release page kept for multi-change review |

## 4.4 Visual consistency

| # | Inconsistency | Evidence | Unify on |
| --- | --- | --- | --- |
| V1 | Three status presentations: `StatePill` (Runs, Triggers, Approvals), kit `Badge` (FlowView, FlowRunView, Data, Domains, SSO; 16 screens), `Tag` (drafts, environments) | Verified | `StatePill` for **lifecycle state** (icon and word). `Tag` for **classification** (DEV, PRODUCTION, From the repository). `Badge` only for counts |
| V2 | Three run-state label maps, with "Waiting" meaning queued in one and waiting for approval in another | `Execution.tsx:30`, `Flows.tsx:31`, `kit/status.tsx:28` | One map in `kit/status.tsx`, driven by the API's state enum, plus a distinct **Awaiting approval** state |
| V3 | Four list implementations: `ListScreen`, `CollectionView`, `ListCollection`, and hand-rolled `<table>` in `Runs.tsx:195`, `Execution.tsx:1199`, `Roles.tsx`, `RowRules.tsx` | Verified | `CollectionView` as the one list primitive, with paging, selection, column priority and an empty state. `ListScreen`'s create dialog becomes a slot on it |
| V4 | Loading is a bare "Loading…" paragraph about 36 times. Kit `Skeleton` and `Pagination` are unused | Verified (grep) | Skeleton rows inside `CollectionView` and the inspector. "Loading…" only for code-split editors |
| V5 | Errors: only `ListScreen` offers "Try again". `ConnectionGroups` renders nothing when empty | Verified | One `LoadState` wrapper giving loading, error (with retry and request ID) and empty (with the primary action) |
| V6 | Empty-state copy points to the CLI in dev workspaces where console creation exists ("Scripts arrive with a deploy… run: platform deploy") | `Execution.tsx:198` | Empty states that offer **both** paths: "New script" and "or deploy from your repository with `platform deploy`" |
| V7 | Arbitrary text sizes beside the type roles: `text-[13px]` ×87, `text-[12.5px]` ×11 | Verified | Map them to `text-meta` / `text-body-sm`. Add a Biome or grep check that rejects `text-[` in screens |
| V8 | Pre-redesign pages (`FlowView`, `FlowRunView`) still use the `Page` + "All flows" link pattern | Verified | Move them to the workbench header (breadcrumb, title, actions) |
| V9 | Dead components: `RunDetail`, `Triggers`, `Approvals`, `Events` (`Flows.tsx:798,871`), `Changes` (`Authoring.tsx:684`, still under test) | Verified | Delete or revive. `RunDetail` becomes the full-page run view (D2). Remove the rest and their tests |

## 4.5 Execution contexts

Questions a user should be able to answer at a glance, and where the console stands:

| Question | Today | Gap |
| --- | --- | --- |
| What is running now? | Runs chip "Running" (polling), and the overview "In progress" | Not live outside Runs. No running-job view per worker or pool |
| What succeeded or failed? | Overview counts, Runs chips, header chip | The chip ignores the failed filter. History is capped at 100 |
| Why did it fail? | "Why it failed" and the suggested next step in the run inspector | Not shown in the list. Logs cramped |
| Which resources are affected? | "Uses" in run Details shows connections and bound state | No link to the connection page, and no table writes shown |
| What can I do next? | NextStep "Open {section}", Run again, Cancel | No re-run with edit, no flow retry, no "open code" |
| Where does the configuration live? | — | No link from a run to its script, trigger, connection binding or bundle version |

## 4.6 Page-by-page

Each entry gives what the screen shows, then its problems and proposals. Items marked (→ Dn/Xn/Vn) refer to the tables above.

### Instance and account

| Route | Component | Assessment |
| --- | --- | --- |
| `/` | `Tenants` (`ListCollection`) | Good list with search. **Proposal:** reopen the last workspace from `/me/recent` (IA9). Show per-tenant health (failed runs, approvals) as the tenant overview does |
| `/account/api-keys` | `Account` | Keys with description, last four characters and "last here". **Proposal:** show scopes once keys get them. Copy on create is good |
| `/instance/members`, `/instance/operators` | `InstanceMembers`, `Operators` | Plain lists. Fine at instance scale |
| `/instance/audit` | `InstanceAudit` | Paged with "Show older entries". **Proposal:** filters by actor, action and resource, and CSV export |
| `/instance/single-sign-on` | `SingleSignOn` | Thorough (tests, domains, links, group maps). Long single page. **Proposal:** tabs per provider |
| `/instance/databases`, `/instance/import` | `DatabaseLocations`, `TenantImport` | Staged import is a good safety pattern. Keep it |
| `/instance/branding` | `InstanceBranding` | Tokens, logo, light and dark. Raw hex only as defaults. Fine |
| `/instance/kit` | `KitSheet` | A component showcase. **Proposal:** add StatePill, LoadState and SchemaForm here as the reference for V1–V5 |

### Tenant

| Route | Component | Assessment |
| --- | --- | --- |
| `/t/:t`, `/overview` | `TenantOverview` | Strong "needs attention". Polluted "Recent changes" (D4, IA9). No auto-refresh (X9) |
| `/workspaces` | `Workspaces` | Production is marked with `TypeBadge` here and `EnvTag` in the header (V1). **Proposal:** show the promotion link (dev → prod) as a column |
| `/approvals` | `ApprovalsQueue` | Waiting and Decided chips; Approve and Reject on rows; a comment through `ask.prompt`, required for reject. **Proposals:** bulk decide (X4); show the payload as facts (D6); a filter for "mine to decide" by approver group; live (X9) |
| `/members`, `/groups`, `/roles`, `/access` | `MembersAndAccess` | URL tabs are good. `Roles.tsx` uses a hand-rolled table (V3). **Proposal:** an effective-permissions view per member ("why can X do Y") from `authorize.ts` bindings |
| `/end-users`, `/end-user-groups` | `EndUsers`, `EndUserGroups` | Invite gives a link. **Proposal:** bulk invite from CSV; show attributes as columns |
| `/service-accounts`, `/service-accounts/:id` | list and inspector, keys, `AgentAccess` | Agent access with a snippet and a tool list is distinctive. **Proposal:** a "Try a tool" form (Journey 9) |
| `/operator-access` | grants | Good transparency (time-boxed, audited). Fine |
| `/single-sign-on` | `SingleSignOn` + `Provisioning` | As at instance level |
| `/branding`, `/domains` | `Branding`, `Domains` | DNS records with copy. **Proposal:** a "check now" on domain verification with the last check time, as Repository has |
| `/repository` | `RepositorySettings` | "Verified at" and "Check again" are good. Fine |
| `/workers` | `Workers` | Pool cards and a credentials list; the token is shown once. **Proposals:** **queue depth per workspace and pool**, **running jobs** per worker, and the version of each worker. Cards → a table at more than 6 pools (D1) |
| `/audit` | `AuditTable` | Search plus cursor paging. **Proposal:** facet filters; group a request's entries; hide preference actions by default |
| `/export` | `TenantExport` | Fine. **Proposal:** show past exports and their size |

### Workspace: Overview and Build

| Route | Component | Assessment |
| --- | --- | --- |
| `overview` | `Overview` | The best screen in the console (Observed). D3, X2, X9 apply |
| `settings` | `WorkspaceSettings` | Pause triggers, clone, promotion target, delete with type-to-confirm. **Proposal:** concurrency limit and retention (when added) here |
| `flows` | `Flows` | `CollectionView` with search. **Proposal:** last run state and next trigger per row |
| `flows/:path` | `FlowView` | Pre-redesign layout (V8). "Start flow" passes no schema, so it is JSON only (X5). **Proposals:** a runs tab filtered to this flow; triggers listed with pause |
| `flows/new`, `flows/edit/:path` | `FlowEditor` | Capable (palette, aside, problems list, Tidy up, MiniMap). **Proposals:** test run with input in place (Journey 3); undo and redo; a CEL field with completion and evaluated preview; autosave from the first change |
| `flow-runs/:id` | `FlowRunView` | Timeline and Graph tabs, step facts, approvals in place. D6, X3. Polls every 1.5 s even while waiting days for an approval (X9). **Proposal:** step **input** beside output |
| `scripts` | `Scripts` | In production: an inspector with Run. In dev: the row opens the editor, so Run is lost (Journey 1). **Proposal:** the same inspector in both, with **Edit** as an action |
| `scripts/new`, `scripts/edit/:path` | `ScriptEditor` | Monaco with SDK types, Save and run with ⌘↵, events shown inline. JSON schema textarea and JSON input (X5). D5 for repository scripts. **Proposals:** derive the schema from a zod `input` in the source; a run history tab for this script |
| `extensions`, `extensions/(connector\|trigger_source)/…` | `Extensions`, `ScriptEditor` | Same editor. **Proposal:** a test harness per kind (call `create(config)` for a connector; one poll for a trigger source) |
| `screens`, `screens/:path` | `Interfaces` (App Builder) | Pages, widgets, linked selection, "see it as group" preview, Publish. **Gap:** no action widget (Journey 7). Its 1,998-line file is the largest screen; split widget editors out when adding actions |
| `apps` | `Apps` | Addresses and sharing in a side sheet with "what they can read". Good. **Proposal:** last-opened and usage counts if collected |
| `resources`, `resources/(new\|edit)/:kind/:path` | inline ListScreen, `ResourceEditor` | Generic forms. IA3, D8. Schedule: free cron, free time zone, JSON input, no preview (Journey 4) |

### Workspace: Operate

| Route | Component | Assessment |
| --- | --- | --- |
| `runs`, `runs/:id` | `RunsWorkbench` | D1, D2, D7, X2–X4. Capped at 100, no search (spec gap). Deep-linkable selection is good |
| `events` | `EventsWorkbench` | Search by exact name. **Proposals:** prefix search; "subscribers started" per event with links to the runs; publish a test event from here (dev) |
| `triggers` | `TriggersWorkbench` | Pause and resume with a reason, last refusal, next and last fired, copy address. Good. **Gap:** no New (IA2); no **Fire now** for schedules; no refused-request list beyond the last one |
| `release`, `changes`, `deployments` | `Release` | Review → Deploy → Promote stepper. The step is held in component state, not the URL. **Proposals:** URL step; a diff per resource; "Request promotion" (Journey 8); rollback to a previous deployment shown as one click with its preview |
| `git` | `GitSync` | Push, pull, compare, operations. Fine. **Proposal:** show the last commit SHA with a link to the forge |

### Workspace: Data and Configure

| Route | Component | Assessment |
| --- | --- | --- |
| `tables`, `tables/:name` | `Data.tsx` | Grid with cursor paging, row sheets. **Proposals:** column filters; export CSV; "who can see this row" from the policy (phase 8 shows audiences on apps) |
| `sources`, `sources/:path` | `Data.tsx` | Health check and browse. Fine |
| `dashboards`, `dashboards/:id` | `Dashboards.tsx` | IA5 |
| `connections` | `Connections` + `ConnectionGroups` | Bind and Unbind only; groups are invisible when empty (V5); **no Test** (Journey 5). IA4 |
| `variables`, `secrets` | `Variables`, secrets ListScreen | "Used by" on secrets is good. **Proposal:** show connection credentials here, read-only, so all secrets are visible in one place |

## 4.7 Design language to hold the line on

Phase 8's direction is right. These rules keep new work consistent with it:

1. **One list primitive** (`CollectionView`) for every collection: dense rows, a priority column, filters in the URL, cursor paging, selection.
2. **Three tiers of detail:** a row, an inspector for a quick look, and a full page for work (runs, flows, connections). A detail page never lives only in the inspector.
3. **State vocabulary:** one enum and one `StatePill`. `Tag` for classification. Color only for state.
4. **Every identifier is copyable, and every reference is a link.** A path, run ID, version, connection or trigger shown anywhere navigates to its home.
5. **Forms come from schemas.** JSON input is an "advanced" toggle, never the default.
6. **Feedback names its result:** a toast that links to what was created or changed.
7. **Live by default** for operational screens, through one stream.
