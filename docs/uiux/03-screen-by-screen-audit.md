# 3. Screen-by-screen audit

This document audits every major page, drawer, dialog, editor, panel and configuration surface of the console: 83 surfaces, each with a score out of 100, what is already strong, and specific problems with evidence. It ends with four inventories that span the whole console: dialogs and confirmations, toasts and feedback, list behaviour, and empty states. Nothing here is implemented, and every fix points at an item in [09-prioritized-uiux-roadmap.md](09-prioritized-uiux-roadmap.md).

Screen IDs such as `WS-RUNS` are defined in [01-current-product-ui-map.md](01-current-product-ui-map.md). One row per surface, with priority, effort and target score, is in [11-screen-matrix.md](11-screen-matrix.md).

## How to read this document

**Paths** are relative to `apps/console/src` unless they start with `packages/` or `apps/`.

**Evidence labels.** In the findings tables a claim is **Verified** (read in the code at `e737382`) unless its cell says otherwise:

- **Observed (mocked API)**: seen in the built console, rendered in headless Chromium with fixture data at 1440 × 900 in both themes, 390 × 844 and 2200 × 1100. A real seeded instance could not be run in the audit sandbox.
- **Inferred**: reasoned from code without being run. Confirm before acting on it. The list to confirm first is in [10-validation-plan.md](10-validation-plan.md) §10.9.
- **Judgment**: a design opinion, not an empirical finding.

**Scores** use this rubric. Each category is scored 0 to 5 and weighted:

| Category | Weight |
| --- | ---: |
| Task clarity and hierarchy | 12 |
| Information architecture | 10 |
| Interaction efficiency | 12 |
| Data readability and density | 10 |
| Feedback and system state | 12 |
| Error recovery | 10 |
| Keyboard and expert efficiency | 10 |
| Accessibility | 10 |
| Design-system consistency | 7 |
| Visual craft and polish | 7 |

| Score | Band |
| ---: | --- |
| 90–100 | Reference quality |
| 80–89 | Strong professional product |
| 70–79 | Good but visibly improvable |
| 60–69 | Functional / inconsistent |
| Under 60 | Major UX debt |

Scores come from code review plus limited observation with mocked data. Treat each as accurate to about ±5 points. Three groups of screens were scored by different reviewers using the same rubric, so compare scores within a group with more confidence than across groups. The three groups also lay out their score tables slightly differently. The numbers mean the same thing.

**Each section** gives, in order: the route, component and density class; the user's objective; the score; what the eye sees first and whether that is what the user needs first; the strongest existing decisions, which should be kept; and a table of findings by dimension.

## Main findings

- **Nothing is reference quality and nothing is broken.** The mean is 65.8 and the range is 54 to 80. 12 surfaces are under 60, 47 are in the 60s, 23 are in the 70s, and one, sign-in, reaches 80.
- **The weak categories are the same on almost every screen:** keyboard and expert efficiency, interaction efficiency, and design-system consistency. Visual craft is rarely the lowest sub-score. A visual restyle alone would move these scores very little.
- **The most-used surfaces are below the average.** The runs list is 63.5, the flow run page 62.5, and the script editor 58. The workspace overview, at 72, is the best of the daily screens.
- **State and failure are often quiet.** On the script run page the state is a 13 px word in a meta line under a 20 px path. On the flow run page the banner says "The flow failed." without naming the step, and no step is selected.
- **Operational lists are loose.** Runs rows are 57 px, or 82 px with a tag, and the first row starts 282 px down a 900 px viewport (Observed).
- **Editors are forms around the work.** Script code gets about 39% of the viewport and its test output renders below the fold. The App Builder puts about 200 px of chrome above its canvas and has no undo.
- **Work can be lost.** The script and resource editors have no autosave and no unsaved-changes guard. The console has no error boundary, so one unexpected response blanks the whole interface (Observed).
- **The interface says things that are not true** in a handful of places: a shortcut that does not exist, a failed test announced as a success, a starter script that opens with an error on its own first line.
- **Each pattern exists several times.** There are six list implementations, seven page-header variants and six back patterns, so "open a row" behaves four ways across four neighbouring admin screens.
- **The strongest parts are worth protecting:** the overviews' "Needs attention" lists, state shown as icon plus word, the scope path in the header, the destructive-action copy, `SchemaForm`, the flow editor's undo, and the connection wizard's test step.

## Scores at a glance

| ID | Surface | Score | Band |
| --- | --- | ---: | --- |
| AC-SIGNIN | Sign in | 80 | Strong professional |
| PB-APPROVE | Approval link page | 78 | Good but visibly improvable |
| IN-IMPORT | Tenant import | 77 | Good but visibly improvable |
| IN-TRIGGERS | Instance triggers | 76 | Good but visibly improvable |
| SH-INPUT | Input dialog and schema form | 75 | Good but visibly improvable |
| TN-RETENTION | Retention | 75 | Good but visibly improvable |
| TN-OVERVIEW | Tenant overview | 74 | Good but visibly improvable |
| TN-ENDUSERS | End users | 74 | Good but visibly improvable |
| TN-MEMBER-PAGE | Member page / effective access | 73 | Good but visibly improvable |
| WS-FLOWS | Flows list | 72 | Good but visibly improvable |
| WS-OVERVIEW | Workspace overview | 72 | Good but visibly improvable |
| UI-RESULTVIEW | ResultView (shared viewer) | 72 | Good but visibly improvable |
| TN-ROLES | Roles | 72 | Good but visibly improvable |
| WS-TRIGGERS | Triggers | 71 | Good but visibly improvable |
| SH-NOTFOUND | Not found | 71 | Good but visibly improvable |
| IN-TENANTS | Tenants list | 71 | Good but visibly improvable |
| TN-DOMAINS | Domains | 71 | Good but visibly improvable |
| IN-MEMBERS | Instance members | 71 | Good but visibly improvable |
| WS-RELEASE-PROMOTE | Promotion and promotion requests | 70.5 | Good but visibly improvable |
| WS-SCHEDULE-SHEET | Schedule form and New schedule sheet | 70 | Good but visibly improvable |
| SH-OFFER | Offer to agent | 70 | Good but visibly improvable |
| WS-CONNECTIONS | Connections and connection wizard | 70 | Good but visibly improvable |
| WS-SETTINGS | Workspace settings | 70 | Good but visibly improvable |
| IN-OPERATORS | Operators | 70 | Good but visibly improvable |
| WS-SCRIPTS | Scripts list and inspector | 69 | Functional / inconsistent |
| WS-RELEASE | Release: review, deploy, ledger | 69 | Functional / inconsistent |
| WS-APPS | Published apps and sharing | 69 | Functional / inconsistent |
| TN-MEMBERS | Members | 69 | Functional / inconsistent |
| WS-FLOW-TEST | Flow test panel and "Last test" | 68 | Functional / inconsistent |
| WS-RUN-SCRIPT | Script run page | 68 | Functional / inconsistent |
| UI-TIMELINE | Timeline (shared viewer) | 68 | Functional / inconsistent |
| TN-APPROVALS | Approvals queue | 68 | Functional / inconsistent |
| SH-GATE | Operator gate and banner | 68 | Functional / inconsistent |
| TN-AUDIT | Audit log (tenant and instance) | 68 | Functional / inconsistent |
| WS-DRIFT | Drift | 67.5 | Functional / inconsistent |
| TN-EXPORT | Export | 67–69 | Functional / inconsistent |
| TN-OPERATOR-ACCESS | Operator access | 67 | Functional / inconsistent |
| SH-PALETTE | Command palette | 66 | Functional / inconsistent |
| WS-FLOW-EDITOR | Flow editor, inspector and step forms | 66 | Functional / inconsistent |
| WS-FLOW-GRAPH | Flow graph (read-only) | 66 | Functional / inconsistent |
| TN-REPOSITORY | Repository | 66–70 | Functional / inconsistent |
| WS-TABLES | Tables list | 66 | Functional / inconsistent |
| WS-APP-LIST | App Builder list | 66 | Functional / inconsistent |
| WS-EXPRESSION | Expression field | 65 | Functional / inconsistent |
| WS-DASHBOARDS | Dashboards list | 65 | Functional / inconsistent |
| TN-ENDUSER-GROUPS | End-user groups | 65 | Functional / inconsistent |
| TN-AGENT-ACCESS | Agent access | 65 | Functional / inconsistent |
| TN-SSO | Single sign-on (tenant and instance) | 65 | Functional / inconsistent |
| TN-SCIM | Provisioning | 65 | Functional / inconsistent |
| SH-SHELL | Shell | 64 | Functional / inconsistent |
| WS-SECRETS | Secrets | 64 | Functional / inconsistent |
| AC-APIKEYS | Account (API keys, recovery codes) | 64 | Functional / inconsistent |
| TN-GROUPS | Groups | 64 | Functional / inconsistent |
| WS-RUNS | Runs list and run inspector | 63.5 | Functional / inconsistent |
| WS-TABLE-DEFINITION | Table definition and row rules | 63 | Functional / inconsistent |
| RT-APP | App runtime (Renderer) | 63 | Functional / inconsistent |
| TN-WORKSPACES | Workspaces | 63 | Functional / inconsistent |
| WS-RUN-FLOW | Flow run page | 62.5 | Functional / inconsistent |
| WS-EVENTS | Events | 62.5 | Functional / inconsistent |
| UI-JSONVIEW | JsonView (shared viewer) | 62 | Functional / inconsistent |
| WS-VARIABLES | Variables | 62 | Functional / inconsistent |
| TN-WORKERS | Workers | 62–63 | Functional / inconsistent |
| IN-DATABASES | Database locations | 62 | Functional / inconsistent |
| IN-BRANDING | Instance branding | 62 | Functional / inconsistent |
| IN-KIT | Kit sheet | 62 | Functional / inconsistent |
| WS-TABLE-ROWS | Table rows browser and Grid | 61 | Functional / inconsistent |
| WS-SOURCE-VIEW | Data source view | 61 | Functional / inconsistent |
| TN-ACCESS | Access grants | 61 | Functional / inconsistent |
| TN-BRANDING | Tenant branding | 61 | Functional / inconsistent |
| WS-GIT | Git sync | 60.5 | Functional / inconsistent |
| WS-EXTENSIONS | Extensions list and editor | 60 | Functional / inconsistent |
| WS-SCRIPT-EDITOR | Script editor | 58 | Major UX debt |
| WS-ALERTS | Alerts | 58 | Major UX debt |
| WS-SOURCES | Data sources list | 58 | Major UX debt |
| SH-NAV | Navigation model | 57 | Major UX debt |
| WS-APP-BUILDER | App Builder workspace | 56 | Major UX debt |
| TN-SERVICE-ACCOUNTS | Service accounts | 56 | Major UX debt |
| WS-FLOW-VIEW | Flow view | 55 | Major UX debt |
| WS-RESOURCE-EDITOR | Resource editor | 55 | Major UX debt |
| UI-LOGVIEWER | LogViewer (shared viewer) | 55 | Major UX debt |
| WS-CONNECTION-GROUPS | Connection groups | 55 | Major UX debt |
| WS-RESOURCES | All resources | 54 | Major UX debt |
| WS-DASHBOARD | Dashboard editor and viewer | 54 | Major UX debt |

## Shell and Build: notes for these sections

Part A covers the console frame (shell, navigation model, command palette) and every Build surface: flows, scripts, extensions, resources, schedules and the shared input dialogs. Fix IDs (P0-1 … P4-6) refer to `09-prioritized-uiux-roadmap.md`. Accessibility items are cross-referenced to `05-accessibility-audit.md` by the IDs used there (K1, F1, N1 and so on).

- Paths are relative to `apps/console/src` unless they start with `packages/` or `apps/`.
- In the findings tables, evidence is **Verified** (read at HEAD `e737382`) unless the cell starts with **Inferred**, **Observed (mocked API)** or **Judgment**. Pixel figures marked "computed" are derived from Tailwind classes at 1440x900, not measured.
- Scores come from code review plus limited mocked observation; confidence is about ±5 points.
- Score tables list the ten rubric categories with their weights in the header; each cell is the 0–5 sub-score. Sub-scores are the ones recorded in the audit notes; none was changed on re-verification.
- One conflict between notes was resolved in code: an accessibility note says the script editor autosaves drafts. It does not. `screens/Authoring.tsx` has no save timer (the only timers are the published-events poll at `:877-878`); only the flow editor autosaves, and only after a first manual save (`screens/FlowEditor.tsx:702-706`).

## Shell and Build: main findings

- No surface in this part reaches the "strong professional" band. The best are the input dialog and schema form (75) and the flows list (72); the script editor, where a developer spends most time, scores 58.
- The shell has no error boundary. An unknown run state or a summary missing one field blanks the whole console (Observed, mocked API; `kit/status.tsx:79`, `Shell.tsx:132`).
- The script editor and resource editor have no autosave and no unsaved-changes guard; a new flow has none until its first manual save. Any link, the rail, the palette or Back discards the work silently.
- The script editor shows code and its output on different screens: the editor is a fixed 544 px block in a scrolling page, the test result renders below it, and Run sits behind the second tab of the side panel.
- Connecting flow steps is drag-only on 6 px handles. There is no keyboard path, no "goes to" field and no step outline (WCAG 2.1.1, 2.5.7, 2.5.8).
- The interface says things that are not true: the shortcut sheet lists `j k` list movement that no code handles; the starter script shows a type error on its own first line; a new flow carries a "Draft" tag beside "Not saved".
- Navigation state mostly lives outside the URL, every query write replaces history, the tab title never changes and three neighbouring screens use three different back patterns.
- Production is marked by a 10.5 px amber tag that shares its tone with "Paused" and "Instance · operator".
- Draft scripts and draft resources are missing from the lists their own editors link back to (inferred for scripts, verified for resources).
- There are three ways to schedule something, with three capability levels, and none starts from the script or flow being scheduled.

Surface index for this part:

| ID | Surface | Score | Band |
|---|---|---|---|
| SH-SHELL | Shell | 64 | functional / inconsistent |
| SH-NAV | Navigation model | 57 | major UX debt |
| SH-PALETTE | Command palette | 66 | functional / inconsistent |
| WS-FLOWS | Flows list | 72 | good but visibly improvable |
| WS-FLOW-VIEW | Flow view | 55 | major UX debt |
| WS-FLOW-EDITOR | Flow editor, inspector and step forms | 66 | functional / inconsistent |
| WS-FLOW-TEST | Flow test panel and "Last test" | 68 | functional / inconsistent |
| WS-EXPRESSION | Expression field | 65 | functional / inconsistent |
| WS-FLOW-GRAPH | Flow graph (read-only) | 66 | functional / inconsistent |
| WS-SCRIPTS | Scripts list and inspector | 69 | functional / inconsistent |
| WS-SCRIPT-EDITOR | Script editor | 58 | major UX debt |
| WS-EXTENSIONS | Extensions list and editor | 60 | functional / inconsistent |
| WS-RESOURCE-EDITOR | Resource editor | 55 | major UX debt |
| WS-RESOURCES | All resources | 54 | major UX debt |
| WS-SCHEDULE-SHEET | Schedule form and New schedule sheet | 70 | good but visibly improvable |
| SH-INPUT | Input dialog and schema form | 75 | good but visibly improvable |
| SH-OFFER | Offer to agent | 70 | good but visibly improvable |

## Shell, navigation and command palette

### SH-SHELL · Shell — 64/100 (functional / inconsistent)

Every signed-in route · `Shell.tsx:652-959`, bootstrapped at `main.tsx:8-17` · density class: compact chrome (64 px rail, 224 px section panel, 48 px header, 32 px nav rows); the class fits, the labels inside it are too small.

**User objective.** Know which tenant, workspace and environment is open, see what needs attention, and reach any section in one or two actions.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.5 | 3.5 | 3.0 | 3.5 | 3.0 | 2.0 | 2.5 | 3.5 | 4.0 | 4.0 | **64** |

**What the eye sees first.** Observed (mocked API): the brand mark at top left, then the selected rail item (accent bar, dot and selected background), then the bordered workspace switcher with its `DEV` tag and "promotes to Clinics", and the red-bordered failed-runs chip when there are failures. The header is canvas-coloured in every environment. This matches the user's priority for scope and for failures. It does not match for environment: production looks the same as dev apart from one small tag.

**Strongest existing decisions (keep).**
- The frame of rail, section panel, header and inspector, with its three modes: page, editor (section panel removed) and workbench (the screen owns its scrolling) (`nav.ts:216-246`).
- Counts that appear only when non-zero and link to a filtered view: "N drafts · Review" and the failed-runs chip to `runs?status=failed` (`Shell.tsx:868-886`).
- Section-panel counts with tones ("2 failed", "3 drafts", "1 missing", "behind") and the release path at the panel foot (`Shell.tsx:131-141,305-373`).
- The phone drawer holding rail, sections, release path, account and theme (`Shell.tsx:917-946`), and the remembered panel collapse (`Shell.tsx:107-114`).
- Labelled landmarks (`nav aria-label="Main"`, `"Sections"`, `"Where you are"`, `main`) and `aria-current="page"` on links (`Shell.tsx:654,670,730,902`; `router.tsx:85`).
- The junction-and-wire motif as the one decorative vocabulary (`kit/motifs.tsx`), and colour used only for state and the primary action (Observed).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | Production is signalled only by a 10.5 px uppercase amber `EnvTag`, a 5 px amber ring in the breadcrumb motif and "(production)" in the switcher menu; header, rail and page background do not change. | `Shell.tsx:744-747,764,772`; `kit/status.tsx:103-131` | P4-5 |
| Visual hierarchy | The amber tag tone that means production is also used for "Paused" and "Instance · operator", so amber does not uniquely mean "you are in production". | `Shell.tsx:773,858` | P4-5, P2-5 |
| Visual hierarchy | In a workspace the header never shows the section or the open object; the section name is rendered for screen readers only. Earlier finding IA7 is still open. | `Shell.tsx:788` | P2-3 |
| Spacing | Page gutters differ between screen families: Runs and Triggers content starts at x = 312 px, Connections, Settings and the tenant overview at x = 320 px. | Observed (mocked API), O12 | P2-1, P2-3 |
| Alignment | Rail and junction alignment relies on one-off pixel nudges (`py-[3px]`, `pt-[7px]`, `mt-[5px]`, `-mt-[3.5px]`, `left-[9px]`) instead of the spacing scale. | `Shell.tsx:264-407`; `kit/motifs.tsx:105-112` | P2-1 |
| Typography | Rail labels are 10 px (`text-micro`) and panel counts are 10.5 px mono; both are below the smallest role in the planned type scale. | `Shell.tsx:291,412` | P2-1 |
| Density | The section filter input filters at most six entries in a workspace area; it is useful only for the 17 tenant sections and is noise elsewhere. | `Shell.tsx:685-696` | P4-1 |
| Interaction friction | "promotes to X" in the header and the release-path rows in the panel are plain text, so the user cannot jump to the linked workspace from the place that names it. | `Shell.tsx:783-785,336-353` | P1-3 |
| Interaction friction | `GET /api/v1null` is requested on every navigation outside a workspace, because `reload()` is called on a query whose path is `null`. | Observed (mocked API), O2; `Shell.tsx:498-504` | P0-1 |
| Discoverability | Account and theme menus sit at the bottom of the rail as a 28 px one-letter circle with a native `title`; the account menu has two items (API keys, Sign out) and no help, documentation or shortcut-sheet entry. | `Shell.tsx:437-460,663-666` | P3-1 |
| Discoverability | The header search button shows "⌘K" on Windows and Linux as well, where the key is Ctrl+K. | `Shell.tsx:895-897` | P3-1 |
| Inconsistent patterns | Panel counts carry meaning by colour and text only, with no badge shape, while other counts in the console use `Badge`. | `Shell.tsx:291` | P2-5 |
| Accessibility | There is no skip link and `main` has no `id` or `tabIndex`; the first Tab stop is the rail logo and eight stops are spent on the rail before content (05: F5). | `Shell.tsx:653-915`; Observed, O11 | P0-7 |
| Accessibility | `document.title` is the product name on every route (05: F2). | `kit/brand.tsx:43-45`; Observed, O11 | P0-7 |
| Accessibility | Rail links are dimmed with `opacity-55` when no workspace is open, giving 2.14:1 in light and 3.13:1 in dark although the links still work (05: C4). | `Shell.tsx:397,613` | P0-2 |
| Accessibility | Nav group labels at 10.5 px use `ink-subtle` on the structure surface at 3.96:1; "Release path" uses the same colour. | `Shell.tsx:271,354` | P0-2 |
| Accessibility | The workspace switcher and theme menu mark the current item with bold text and an `aria-hidden` check mark, so assistive technology is not told which item is active. | `packages/ui/src/Menu.tsx:47-56`; `Shell.tsx:418-435,750-770` | P0-7 |
| Accessibility | The release-path list has a stray `span` child inside its `ol`, which is invalid list content. | `Shell.tsx:356-361` | P2-12 |
| Accessibility | Instance branding can set an accent, focus colour or attention colour that fails contrast; nothing checks it in either scheme. | `screens/InstanceBranding.tsx:81-83,217`; `theme.ts:11-24` | P0-2 |
| Missing states | No error boundary exists anywhere; a render crash unmounts the whole tree and leaves an empty page with no message or reload button. | `main.tsx:11-17`; Observed, O1 (`kit/status.tsx:79`, `Shell.tsx:132,649`) | P0-1 |
| Missing states | Session expiry is checked only on `/me` at load; a session that ends mid-use leaves the shell up while each screen shows its own inline error. | `App.tsx:105-114`; Inferred from `api.ts:26-39` having no 401 hook | P0-1, P2-4 |
| Missing states | A non-401 failure of `/me` shows one danger notice with no retry button. | `App.tsx:106-112` | P2-4 |
| Missing states | The shell has no connection indicator; the only "Live" label is in the Runs header and only while a run is in progress. | `stream.ts:123-132`; `screens/Runs.tsx:215-219` | P1-7 |
| Missing states | The work area is blank, with no indicator, while `/me`, operator grants or the workspace load. | `App.tsx:104`; `screens/Tenant.tsx:164,413` | P2-4 |
| Missing states | Lazy-route fallback is the bare text "Loading…"; the `Skeleton` component exists in the kit and is never used by the console. | `App.tsx:142`; `packages/ui/src/Surfaces.tsx:117` | P2-4 |
| Missing states | The API's `requestId` is dropped by the client, so no error anywhere in the shell can show one for support. | `api.ts:5-24`; `apps/control-plane/src/problem.ts:15-17,54-55` | P2-4 |
| Missing states | There is no global pending indicator and no background-task list; `tasks.ts` follows one task at a time. | `tasks.ts:11,41-42` | P2-8 |
| Keyboard limitations | The docked inspector (1280 px and wider) is a plain `aside`: it does not take focus, and Esc closes it only when it is a side sheet. | `kit/layout.tsx:112-139` | P0-3 |
| Keyboard limitations | The shortcut sheet is reachable only by pressing `?`; nothing visible in the header, account menu or palette mentions it. | `kit/CommandPalette.tsx:750-782` | P3-1 |
| Responsive | Between 768 and 1023 px the section panel is never inline; reaching a sibling section takes two actions through the drawer. | `Shell.tsx:672,715-729` | P3-8 |
| Responsive | The JS breakpoint constants `WIDE.panel` and `WIDE.rail` are defined and never read; the same values are restated as `lg:flex` and `md:flex`. | `kit/layout.tsx:25`; `Shell.tsx:656,672` | P2-1 |
| Simplification | Hover help across the shell is the native `title` attribute because the kit has no Tooltip component. | `Shell.tsx:444`; `packages/ui/src/index.ts` | P3-1 |

### SH-NAV · Navigation model — 57/100 (major UX debt)

All routes · `router.tsx:6-97`, `App.tsx:124-137`, `screens/Tenant.tsx:191-266,422-713`, `nav.ts:107-141,216-333` · density class: not applicable (a model, not a screen).

**User objective.** Move between objects and scopes without losing place, and share or return to exactly what is on screen.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.0 | 3.5 | 3.0 | 3.0 | 2.5 | 3.0 | 2.0 | 2.5 | 3.0 | 3.0 | **57** |

**What the eye sees first.** Observed (mocked API): on arrival at an object, the back affordance differs by screen: "Runs › r1" on the run page, an "All scripts" link above the title in the script editor, and "Flows /" inline in the flow editor (O10). The user's priority is "where am I and how do I get back"; the answer is in a different place on each screen and the browser tab always reads "Vynxlabs".

**Strongest existing decisions (keep).**
- Real `<a href>` links that let modified clicks through and work inside clickable rows (`router.tsx:70-97`).
- Slug addresses redirected to IDs with the query kept, and a 404 screen with a way back (`screens/Tenant.tsx:393-421`; `screens/NotFound.tsx:5-23`). Earlier finding IA8 is fixed.
- Old-address aliases and redirects (`nav.ts:137-141`; `screens/Tenant.tsx:470-472`).
- The Runs URL contract of `status`, `kind`, `when`, `q`, `tag` and `run` (`screens/Runs.tsx:98-111`). Earlier finding X2 is fixed.
- Reopening the last place across devices (`App.tsx:63-87`; earlier finding IA9 fixed) and the per-tenant last workspace on the rail (`nav.ts:316-333`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | Build still opens on Flows with no catalogue or overview of what exists. Earlier finding IA1 is open. | `nav.ts:107-114,308-314` | P2-13 |
| Interaction friction | Every query-state write uses `replaceState`, so Back never closes an inspector or undoes a filter; selecting a run and pressing Back leaves Runs entirely. | `router.tsx:48` | P2-6 |
| Interaction friction | The workspace switcher keeps only the section slug and drops the object path and query: from `scripts/edit/orders/sync` in dev it lands on the Scripts list in production. | `Shell.tsx:766-769` | P1-3 |
| Interaction friction | The tenant switcher always goes to the tenant overview and loses the section. | `Shell.tsx:809` | P1-3 |
| Interaction friction | "Decide" on a waiting approval still leaves the workspace for the tenant-level queue. Earlier finding IA6 is open. | `screens/Overview.tsx:259` | P1-10 |
| Interaction friction | Scroll position is neither reset nor restored on navigation; the persistent `main` is the scroll container, so one page can hand its offset to the next. | Inferred from `Shell.tsx:902-904` and no `scrollTo` in the router | P0-7, P2-6 |
| Discoverability | Cross-links are missing where users need them most: script to its runs, script or flow to its triggers, flow step to its script, anything to a table, and a dev object to the same object in production. | `screens/Execution.tsx:233-296`; `screens/Flows.tsx:788-818`; `screens/Authoring.tsx:667` | P1-10, P1-3 |
| Discoverability | "Used by" on connections, variables and secrets lists names as text inside a `title`, not as links. | `kit/references.tsx:19-30`; `screens/Execution.tsx:601,673`; `screens/Tenant.tsx:669` | P1-10 |
| Discoverability | Connections, variables, secrets, events, approvals, published apps, deployment versions, a flow-run step, a log line and an audit entry have no address of their own. Earlier finding IA4 is partly fixed (wizard and Test exist; no per-connection URL). | `screens/Tenant.tsx:576-580`; `screens/Execution.tsx:495-499,601` | P1-10, P2-6 |
| Inconsistent patterns | Ten screens each hand-build a back link and there is no shared breadcrumb component. | `screens/RunPage.tsx:94-102`; `screens/Authoring.tsx:610`; `screens/FlowEditor.tsx:848-853`; `screens/Flows.tsx:409`; `screens/Data.tsx:608,1167`; `screens/Dashboards.tsx:139`; `screens/Interfaces.tsx:1718`; `screens/ResourceEditor.tsx:324`; `screens/Access.tsx:254` | P2-3 |
| Inconsistent patterns | Only Runs filters and the selected trigger are in the URL; filter, tab, search, sort and selection state on Flows, Scripts, Triggers, Events, Approvals, Release, Table view, Audit, Members, Apps, Service accounts and every `ListCollection` is component state. | `screens/Flows.tsx:76-78`; `screens/Execution.tsx:107-108`; `screens/Operate.tsx:77,424-429,621,629`; `screens/Release.tsx:117,203`; `screens/Data.tsx:91-99,586`; `screens/Audit.tsx:116-120`; `screens/Members.tsx:121-122,352`; `screens/Apps.tsx:131,392`; `screens/Tenant.tsx:780`; `kit/ListCollection.tsx:47-48` | P2-6 |
| Inconsistent patterns | The palette's "Switch workspace…" always lands on the overview while the header menu keeps the section. | `kit/CommandPalette.tsx:308`; `Shell.tsx:768` | P1-3, P3-2 |
| Inconsistent patterns | Routing is three hand-written if/else chains, a separate allow-list and a separate regex list for frame modes, kept in step by hand; the end-to-end test's "data" route already drifted and measures the 404 screen. | `App.tsx:124-137`; `screens/Tenant.tsx:222-266,353-377,422-713`; `nav.ts:216-246`; `e2e/redesign.spec.ts:147` | P2-12 |
| Accessibility | Nothing moves focus or announces the new screen on route change (05: F4). | `router.tsx:6-10` | P0-7 |
| Accessibility | The breadcrumb's current location is an `sr-only` text with no `aria-current`. | `Shell.tsx:788` | P2-3 |
| Missing states | There is no unsaved-changes guard: no `beforeunload` and no blocker in `navigate`. Editors show a badge and then discard on any link. | `router.tsx:6-10`; `screens/Authoring.tsx:630`; `screens/ResourceEditor.tsx:345` | P0-4 |
| Missing states | Unknown deeper paths are not 404s: `flows/<anything>` renders the flow view with whatever error the API returns. | `screens/Tenant.tsx:456-463,604` | P2-4 |
| Missing states | After sign-in there is no return to the previous console address; `?return=` accepts only app and portal paths. | `App.tsx:23-34` | P0-1 |
| Missing states | Recent objects exist only inside the palette; there are no favourites, pins or saved views anywhere. | `recent.ts:24-38`; grep finds no pin or favourite code | P3-2, P3-4 |
| Keyboard limitations | There are no go-to chords, no `/` to focus search and no previous/next between sibling objects. Earlier finding X8 is partly fixed. | `kit/CommandPalette.tsx:735-746` (complete list of advertised keys) | P3-1 |
| Responsive | Returning to Runs shows "Loading…" again because the query key embeds a `from` time computed on mount. | Inferred from `screens/Runs.tsx:126-135` | P2-4, P1-1 |
| Simplification | One route table should feed matching, the allow-list, frame mode, titles and breadcrumbs, so a new screen cannot be half-registered. | Judgment, from the drift above | P2-3, P2-12 |

### SH-PALETTE · Command palette — 66/100 (functional / inconsistent)

Global, ⌘K / Ctrl+K · `kit/CommandPalette.tsx:88-782`, mounted at `Shell.tsx:948-956`; server search in `apps/control-plane/src/routes/search.ts` · density class: compact list in a 620 px dialog; fits.

**User objective.** Jump to any object or run an action by typing a few characters, without leaving the keyboard.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 3.5 | 3.5 | 3.5 | 2.5 | 2.0 | 3.5 | 3.5 | 3.5 | 3.5 | **66** |

**What the eye sees first.** Observed (mocked API): a dialog titled "Go to" with the placeholder "Find anything. > runs, # resources, / actions, @ people". With an empty query it lists twelve Screens rows first, which repeat the section panel beside it, and puts Actions below the fold; the fixture had no recent items (O14). The user's priority on opening is the object they were just working on and the action for the current object; neither leads.

**Strongest existing decisions (keep).**
- One input for screens, entities, runs by ID or tag, and actions, with four prefix modes (`>` runs, `#` resources, `/` actions, `@` people) (`kit/CommandPalette.tsx:153-165`). Earlier finding X1 is mostly fixed.
- Server-side, permission-checked search ordered current workspace first (`apps/control-plane/src/routes/search.ts:219-224`), with a 150 ms debounce and a stale-answer guard (`kit/CommandPalette.tsx:234-253`).
- Server-side recents that follow the member across devices (`kit/CommandPalette.tsx:208-229`).
- ⌘↵ secondary actions with the label on the active row (`:486-510,695-702`), and Run / Start through the schema form (`:258-279,711-731`).
- Dev-only gating of "New script" and "New flow" (`:390`).
- The combobox, listbox and `aria-activedescendant` pattern (`:607-611,641,669-670`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | The fixed section order (Recent, This workspace, Other workspaces, Runs, People, Screens, Actions, Choose) puts an exact action or screen match below up to 20 entity rows. | `kit/CommandPalette.tsx:88-97,579-582` | P3-2 |
| Visual hierarchy | The dialog title is "Go to", which undersells search and actions. | `kit/CommandPalette.tsx:601` | P3-2 |
| Density | The empty state spends twelve rows on screens the section panel already lists and shows only four actions. | `kit/CommandPalette.tsx:545-551`; Observed, O14 | P3-2 |
| Interaction friction | Connection, event, app, member and end-user results open the list screen with nothing selected. | `kit/CommandPalette.tsx:126-151` | P3-2, P1-10 |
| Interaction friction | Search matches path substrings only, returns 20 results in total because the client never sends `limit`, and finds people only in `@` mode; descriptions and titles are not searched. | `apps/control-plane/src/routes/search.ts:90,101,120-167,219-224` | P3-2 |
| Interaction friction | Screen ranking is substring-only with no fuzzy or acronym matching, and recents do not boost results. | `kit/CommandPalette.tsx:100-109` | P3-2 |
| Interaction friction | Pickers for Run script, Start flow and Pause trigger load whole lists with no cap. | `kit/CommandPalette.tsx:315-357` | P3-2 |
| Discoverability | There are no commands for the open object: on a script no "Run this", "Open its runs" or "Open in production"; on a run no "Run again", "Cancel" or "Copy ID". The palette is given only tenant, workspace and workspace type. | `Shell.tsx:948-956` | P3-2 |
| Discoverability | Missing actions: deploy, promote, rollback, cancel run, approve, create connection / trigger / table / variable / secret, sign out, open shortcuts, open documentation. | `kit/CommandPalette.tsx:367-481` | P3-2 |
| Discoverability | Variables, secrets, dashboards, data sources, extensions, alerts, approvals, deployments, service accounts, groups, roles, domains and settings sub-sections are not searchable. | `apps/control-plane/src/routes/search.ts:11-22`; `Shell.tsx:545-600` | P3-2 |
| Discoverability | No prefix-mode chip appears when a prefix is active, and Backspace-to-leave-a-picker is not written anywhere; the palette has no key legend. | `kit/CommandPalette.tsx:596,631-633` | P3-2, P3-1 |
| Discoverability | Recents record scripts (editor only), flows, tables, App Builder screens and runs; triggers, connections, apps, dashboards and data sources are never recorded. | `recent.ts:24-38`; `Shell.tsx:490-491`; `screens/RunPage.tsx:39` | P3-2 |
| Inconsistent patterns | The shortcut sheet advertises "j k — Move through a list", and no handler for those keys exists anywhere in the console or the kit. | `kit/CommandPalette.tsx:744` | P0-6 |
| Inconsistent patterns | Triggers have no ⌘↵ secondary action although scripts, flows and runs do; the phase 9 acceptance asked for Pause. | `kit/CommandPalette.tsx:486-510` | P3-2 |
| Inconsistent patterns | Actions are not permission-filtered, so a user can pick an action the API will refuse. | `docs/phases/phase-9-maturity.md:157` | P3-2 |
| Inconsistent patterns | The theme action toggles light and dark and cannot return to "system", which the rail menu offers. | `kit/CommandPalette.tsx:461-470`; `Shell.tsx:418-435` | P3-2 |
| Accessibility | `aria-expanded` is hard-coded to "true", the input's `aria-label` is the long placeholder, and section titles are `role="presentation"` so groups are not exposed (05: N7). | `kit/CommandPalette.tsx:601,608,611,655` | P3-2 |
| Accessibility | Results arriving, their count and "Nothing matches" are not announced (05: N2). | `kit/CommandPalette.tsx:638-646` | P0-7 |
| Accessibility | The active row is shown by an `action-soft` background at about 1.2:1 against the surface. | `packages/ui/src/Menu.tsx:49`; contrast data in 05 | P0-2 |
| Missing states | There is no loading state: while the debounce and request are in flight the list shows client matches only, or "Nothing matches", and results then pop in. | `kit/CommandPalette.tsx:192,234-253,645-648` | P3-2, P2-4 |
| Missing states | A failed search sets results to empty, so the user sees "Nothing matches" instead of an error; a failed recents load is also silent. | `kit/CommandPalette.tsx:227,249` | P3-2, P2-4 |
| Missing states | There is no result count and no "showing 20 of more". | `kit/CommandPalette.tsx:638-648` | P3-2 |
| Keyboard limitations | ⌘K is captured at window level with `preventDefault`, overriding Monaco's ⌘K chord prefix; pressing it again does not close the palette. | `kit/CommandPalette.tsx:112-123` | P3-1 |
| Keyboard limitations | ⌘↵ with the palette open over the script editor can run both the palette's secondary action and the script draft, because two independent handlers listen. | Inferred from `kit/CommandPalette.tsx:625-630` and `screens/Authoring.tsx:314-325` | P3-1, P1-4 |
| Keyboard limitations | Esc inside a picker closes the whole palette instead of stepping back; arrows clamp without wrap; there is no Home/End, PageUp/PageDown or ⌘1–9. | `kit/CommandPalette.tsx:619-633` | P3-2 |
| Responsive | Below 768 px the palette is full screen with no close control, so on a phone the only exits are picking a row or a hardware back or Esc (05: F6). | `packages/ui/src/Dialog.tsx:27-48`; Inferred for device behaviour | P3-2, P0-7 |
| Simplification | Lead the empty state with recent and pinned objects and context actions; drop the screens list to a `#`-free fallback that appears once the user types. | Judgment | P3-2 |

## Build: flows

### WS-FLOWS · Flows list — 72/100 (good but visibly improvable)

`/t/:t/workspaces/:w/flows` · `screens/Flows.tsx:65` (`Flows`), resolved at `screens/Tenant.tsx:464-469`, workbench frame (`nav.ts:231`) · density class: standard with two-line rows (about 52 px, computed); fits, and could go compact.

**User objective.** Find a flow, see whether it is healthy and whether it has a draft, then open or edit it.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 4.0 | 3.5 | 4.0 | 3.5 | 3.0 | 2.5 | 3.5 | 4.0 | 4.0 | **72** |

**What the eye sees first.** Verified from classes: the 26 px display title "Flows" and the solid primary "New flow" at top right (`kit/CollectionView.tsx:63`; `screens/Flows.tsx:100`), then the attention banner when approvals wait (`:107-112`), then in each row the mono path and the coloured state pill. This matches an operator's priority (state) and a builder's (New). The 75-character description sentence under the title (`:97`) is permanent onboarding copy that costs a row of height on every visit.

**Strongest existing decisions (keep).**
- "Started by" with the trigger detail in mono (`screens/Flows.tsx:167-185`).
- Last run and "N today · N failed · N waiting" in one cell (`:193-207`).
- Version tag beside Draft / Removing tags (`:213-215`).
- Filter chips with counts: All, Failed today, Waiting, Drafted (`:123-145`).
- Role-aware empty states, including production copy (`:225-242`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | The description sentence under the title is always shown and pushes the list down. | `screens/Flows.tsx:97` | P4-1 |
| Density | Every row is two lines (path plus description; pill plus counts), about 52 px, against a 36 px standard row. | `screens/Flows.tsx:153-163,197-204` | P2-2, P3-4 |
| Density | The "Steps" column draws up to six dots and connectors to express a number that is also printed. | `screens/Flows.tsx:316-329` | P4-2 |
| Interaction friction | Each row has two click targets with different results: the row opens the inspector while the path link opens the read-only view; in dev the builder's intent, Edit, is the secondary inspector button or a text link on the next page. | `screens/Flows.tsx:155,223,257,413` | P1-3, P2-2 |
| Discoverability | The link to waiting approvals is built by a regular expression on the address. | `screens/Flows.tsx:110` | P1-10 |
| Inconsistent patterns | Filter, search and selection are component state while Triggers keeps its selection in the query string; Back from a flow resets the filter. | `screens/Flows.tsx:76-78`; `screens/Operate.tsx:80` | P2-6 |
| Inconsistent patterns | The search box is hand-built markup rather than a kit field, and the Scripts list has no search at all. | `screens/Flows.tsx:114-122`; `screens/Execution.tsx:131-149` | P2-2 |
| Inconsistent patterns | Trigger labels differ between lists: "By hand" here, "Started by hand" on Scripts. | `screens/Flows.tsx:42`; `screens/Execution.tsx:64` | P2-5 |
| Accessibility | Rows are focusable `<tr>` elements with `aria-selected` outside a grid or listbox role, and each contains a second focusable link, giving two tab stops per row. | `kit/CollectionView.tsx:106-108` | P2-2, P0-3 |
| Accessibility | The selected row is shown by `bg-selected` at 1.03:1 (light) against the canvas, and the search placeholder uses `ink-subtle`. | `kit/CollectionView.tsx:122-124`; `screens/Flows.tsx:120` | P0-2 |
| Missing states | A never-deployed draft flow is listed, and its link goes to the flow view, which loads the deployed flow and would show only a danger notice. | Inferred from `screens/Flows.tsx:268,362,368`; confirm what the API returns for a draft-only flow | P1-3, P2-4 |
| Missing states | Loading is the bare paragraph "Loading…", and a load error has no retry. | `kit/CollectionView.tsx:73-78` | P2-4 |
| Keyboard limitations | There is no key to focus search and no row-to-row movement beyond Tab; the advertised `j k` does not exist. | `kit/CollectionView.tsx:112-121`; `kit/CommandPalette.tsx:744` | P3-1, P0-6 |
| Responsive | Filter and selection state is lost on return because it is not in the URL, which matters most on narrow screens where the inspector is a sheet. | `screens/Flows.tsx:76-78` | P2-6 |
| Simplification | Make the row's primary action "open" (Edit in dev, view in production) and keep the inspector for a secondary gesture. | Judgment | P2-2 |

### WS-FLOW-VIEW · Flow view — 55/100 (major UX debt)

`/t/:t/workspaces/:w/flows/<path>` · `screens/Flows.tsx:351` (`FlowView`), resolved at `screens/Tenant.tsx:456-463`, plain page frame (`Shell.tsx:909`) · density class: low; does not fit, there is room for run statistics, trigger state and a draft diff.

**User objective.** Read a deployed flow: its shape, how it starts and how it has been running, and start it by hand.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.0 | 2.5 | 3.0 | 3.0 | 3.0 | 2.5 | 2.0 | 3.0 | 2.5 | 3.0 | **55** |

**What the eye sees first.** Verified from classes: the page title (the flow path in display type) and, only when the flow has a manual trigger, the primary "Start flow" (`screens/Flows.tsx:384-391`); then the bordered graph. A builder's priority is "is this the deployed version, is there a draft, edit it". None of that is visible: the version is fetched (`:333`) and never rendered, there is no draft or deployed tag, and Edit is a 14 px text link under the header (`:413`).

**Strongest existing decisions (keep).**
- "Start flow" draws its form from the manual trigger's schema (`screens/Flows.tsx:394-407`).
- The honest line "Arranging changes nothing about how the flow runs" and the 403-specific message when the layout cannot be saved (`:429-431,436-443`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | "All flows" and "Edit this flow" are equal-weight coloured text links in one row, and the header action slot is empty for any flow without a manual trigger, so a scheduled flow's page has no button at all. | `screens/Flows.tsx:384-391,408-417` | P2-3, P1-3 |
| Visual hierarchy | The permanent helper sentence under the graph, at 13 px, competes with real content. | `screens/Flows.tsx:436-443` | P4-1 |
| Typography | Section headings are ad-hoc `text-base font-semibold` and inline code uses a local `text-[13px]` helper that is copied into six files. | `screens/Flows.tsx:30,446,472` | P2-1, P2-12 |
| Density | Recent runs show absolute start, state and trigger type only; no duration, no error summary, capped at 20 with no link to Runs filtered by this flow. | `screens/Flows.tsx:363-365,473-489` | P1-10, P1-1 |
| Interaction friction | The webhook address is `select-all` text with no copy button although `CopyButton` exists. | `screens/Flows.tsx:455`; `screens/OfferToAgent.tsx:109` | P2-8 |
| Discoverability | Steps do not link to the script they run, and the page does not link to the flow's triggers. | `screens/Flows.tsx:418-434` | P1-10 |
| Inconsistent patterns | The page still uses the pre-redesign `Page` with a back link below the title. Earlier finding V8 is open. | `screens/Flows.tsx:380-381,409-411` | P2-3 |
| Inconsistent patterns | The same flow is drawn by two renderers one click apart: hand-drawn SVG here with 176x54 nodes, React Flow in the editor with 208 px cards, different labels and handles; layout is saved through two APIs. | `FlowGraph.tsx:17-18`; `screens/FlowEditor.tsx:231,672`; `screens/Flows.tsx:425` | P1-2, P0-8 |
| Inconsistent patterns | The trigger list's fallback sentence says "starts when its event is published" for every type that is not a schedule with a next time or a webhook, which includes manual and form triggers and a schedule whose next fire time is null. This is a copy bug. | `screens/Flows.tsx:463-465` | P0-6 |
| Accessibility | Every graph node is a focusable `role="button"`, but no select handler is passed on this page, so each is a tab stop that does nothing; focus on those nodes is also invisible (05: F1). | `FlowGraph.tsx:244-245,250` | P0-8 |
| Accessibility | Arranging nodes is drag-only with no keyboard or click alternative (05: D1). | `FlowGraph.tsx:136-156,252-256`; `screens/Flows.tsx:422-426` | P0-8 |
| Missing states | No version, no "a draft of this flow exists" and no last-run state appear in the header. | `screens/Flows.tsx:333,380-391` | P1-3, P2-5 |
| Missing states | The runs table shows "This flow has not run yet" while runs are still loading and ignores a load error. | `screens/Flows.tsx:474-476` | P2-4 |
| Missing states | Loading is a bare paragraph and a load failure replaces the page with a notice that has no retry. | `screens/Flows.tsx:368-369` | P2-4 |
| Keyboard limitations | There is no shortcut to start or edit the flow, and the graph offers no zoom or fit when movable; it scrolls inside `overflow-auto`. | `FlowGraph.tsx:113-122` | P3-1 |
| Responsive | The page stretches to 1440 px with a single column; nothing sits beside the graph on wide screens. | `Shell.tsx:909` | P3-8 |
| Simplification | Give the page one header (path, version, draft state, last run, Start, Edit in dev) and replace the helper sentence with a "Reset layout" control. | Judgment | P2-3, P1-3 |

### WS-FLOW-EDITOR · Flow editor, inspector and step forms — 66/100 (functional / inconsistent)

`/t/:t/workspaces/:w/flows/new`, `/flows/edit/<path>` (dev workspaces only; production shows a notice, `screens/Tenant.tsx:451-454`) · `screens/FlowEditor.tsx:378` (`FlowEditor`, lazy, keyed on the address at `screens/Tenant.tsx:440-449`), step forms in `screens/FlowSteps.tsx:86,226,418,616`, editor + workbench frame (`nav.ts:217,232`) · density class: standard canvas (fits) with a low-density inspector (too loose for its 352 px width and its longest forms).

**User objective.** Assemble a flow from steps, wire them, configure each step and test the result without leaving the page.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.5 | 3.5 | 3.0 | 3.5 | 4.0 | 3.5 | 2.5 | 2.5 | 3.5 | 3.5 | **66** |

**What the eye sees first.** Observed (mocked API) for a new flow, O9: the canvas fills the work area minus a 350 px right panel; the toolbar holds "Flows /", a Path field whose label sits above the input and makes the bar about 80 px tall, a DRAFT tag, "Not saved", Tidy up, undo, redo, Test and Save draft; one "start" node; minimap and zoom controls shown for a single node. Verified from classes: the blue primary "Add step" floats at the canvas top left (`screens/FlowEditor.tsx:960-967`) and a second primary, "Save draft" or "Review and deploy", sits in the header (`:923-935`). The quiet graph on a sunken ground is right. The header is not: it carries eleven items at near-equal weight on one wrapping row (`:846-937`), and Test, the action of the main loop, is a default small button between Redo and Save.

**Strongest existing decisions (keep).**
- The undo model: labelled, coalesced within one second, one step per drag, selection preserved, 100 steps (`screens/FlowEditor.tsx:489-504,1069`; `kit/history.ts:4,36`).
- Autosave with an honest relative timestamp and a secondary Save once clean (`:702-706,841,925`).
- Run state painted on node borders and taken edges, never saved into the draft (`:762-790`).
- Live expression values against the last test, and `problemsOf` running client-side on every change (`:307-375`).
- Drafts offered in pickers with "A draft, not yet deployed." (`:433,449`); `flowFrom` plus an allow-list for dynamic sub-flows (`:1223-1237`).
- A canvas themed entirely from tokens (`:268-285`), the minimap hidden while testing (`:1083`) and the explained repository take-over notice (`:940-944`).
- Schema-driven step forms for labelled nodes, including resource pickers that also write the step's grants (`screens/FlowSteps.tsx:86-209,103,139-151`), and Up / Down buttons rather than drag for form questions (`screens/FlowSteps.tsx:527-542`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | Up to two solid primary buttons show at once: "Add step" on the canvas plus "Save draft" or "Review and deploy" in the header. | `screens/FlowEditor.tsx:925,932,961` | P1-5, P4-1 |
| Visual hierarchy | "Tidy up", a rare layout command, is a labelled button leading the action group while Undo and Redo are quiet icon buttons. | `screens/FlowEditor.tsx:887-919` | P3-6 |
| Visual hierarchy | A new flow shows a "Draft" tag beside the status text "Not saved": the tag says a draft exists and the text says it does not. | `screens/FlowEditor.tsx:838,872-876` | P0-6, P2-5 |
| Spacing | The problems list is a full-width notice between header and canvas that takes roughly 60–140 px (computed) whenever there is something to fix, and repeats the header's "N to fix". | `screens/FlowEditor.tsx:877-881,938-956` | P1-8 |
| Spacing | Inspector fields stack label, control, hint and preview with `gap-3`, so a webhook trigger with signature checking is eight controls tall and a form trigger with three questions is roughly 25 controls in a 320 px column, with no sections or collapsing. | `screens/FlowSteps.tsx:249-361,451-611` | P2-7, P3-5 |
| Alignment | Node cards are 208 px wide and grow with a state pill, but auto-layout assumes 176x54, so "Tidy up" spaces nodes about 32 px tighter than designed. | `screens/FlowEditor.tsx:231,242-246`; `FlowGraph.tsx:17-18,58`; spacing effect Inferred | P3-6 |
| Typography | Ad-hoc pixel sizes replace type roles: `text-[13px]`, `text-[12px]`, `text-[12.5px]`, and a 16 px mono title here against 18 px in the script editor. | `screens/FlowEditor.tsx:238,241,243,858,1178,1180,1428,1470,1491`; `screens/Authoring.tsx:616` | P2-1, P2-12 |
| Density | `ValuesEditor` splits the 320 px inspector into `1fr / 1.4fr`, leaving an expression about 170 px wide. | `screens/FlowEditor.tsx:1494` | P3-5 |
| Density | "Last test" is inserted between Name and the settings, so opening the test panel shifts every setting down by the height of a result view. | `screens/FlowEditor.tsx:1097` | P1-8 |
| Interaction friction | A new step is dropped 280 px right of the right-most node, unconnected, regardless of the selection, and the view is re-fitted; every step then needs a drag to connect. | `screens/FlowEditor.tsx:572-590` | P1-8 |
| Interaction friction | A plain script step gets one free-text "Input" expression although every script's `inputSchema` is already loaded; the schema-driven form is reserved for labelled nodes. | `screens/FlowEditor.tsx:408-415,1264,1271-1277` | P1-8 |
| Interaction friction | Renaming a step rewrites edges only; expressions that say `steps.<old>.output` are left pointing at nothing, under a hint that says "Expressions refer to a step by this name". | `screens/FlowEditor.tsx:603-621,1412` | P1-8 |
| Interaction friction | Rename commits only on Enter, with no commit on blur and no pending indicator if the user tabs away. | `screens/FlowEditor.tsx:1394-1412` | P1-8 |
| Interaction friction | `ValuesEditor` renames keys by rebuilding the object from entries, so typing a name equal to another key collapses the two rows and loses a value. | `screens/FlowEditor.tsx:1499-1504` | P1-8 |
| Interaction friction | Fit-to-view runs after every Add step and every test-panel toggle, moving the user's viewport without being asked. | `screens/FlowEditor.tsx:590,757-760` | P3-5 |
| Interaction friction | A deployed flow with no draft cannot be tested until something is changed, and a flow whose trigger is not manual is told to "Set the trigger to start by hand", that is, to change what is being built in order to test it. | `screens/FlowEditor.tsx:733,736-738` | P1-8 |
| Interaction friction | A flow's own schedule trigger is a bare cron text field with no presets, no time zone, no validation and no next-times preview, unlike the schedule sheet. | `screens/FlowEditor.tsx:1138-1148` | P1-9 |
| Interaction friction | "Review and deploy" leaves the editor for the Release page. Earlier finding X10 is open. | `screens/FlowEditor.tsx:932` | P1-5 |
| Discoverability | Plain workspace scripts are not in the "Steps to add" palette, only "Run a script" and labelled nodes; typing a script's path into "Find a step" finds nothing. | `screens/FlowEditor.tsx:111-116,1006-1039` | P1-8 |
| Discoverability | The palette is an `aside`, not a menu: its search is not focused on open, it has no arrow-key movement, no Esc and no click-outside dismissal. | `screens/FlowEditor.tsx:969-979` | P1-8 |
| Discoverability | Removing a connection requires selecting the edge and pressing Backspace, a library default with nothing visible to teach it. | Inferred from library defaults; nothing configured in `screens/FlowEditor.tsx` | P0-8 |
| Discoverability | Problems are plain list items that do not select the node, and nodes carry no problem marker. | `screens/FlowEditor.tsx:946-954` | P1-8 |
| Inconsistent patterns | One node type has up to four names: the card badge shows the raw type (`foreach`, `subflow`, `respond`, `delay`), the read-only graph says "For each", "Sub-flow", "Answer", and the palette says "Run a flow", "Answer the request", "Wait". | `screens/FlowEditor.tsx:119,133,161-164,239`; `FlowGraph.tsx:21-33` | P2-5 |
| Inconsistent patterns | Removing a step with the button asks for confirmation; removing it with Backspace does not; both are undoable. | `screens/FlowEditor.tsx:1051,1331-1337` | P1-8 |
| Inconsistent patterns | State is a `Tag` here and a `Badge` in the script and resource editors; the `STATE` map of badge tones is copied here and only its label is read. | `screens/FlowEditor.tsx:808-813,842,870-876`; `screens/Authoring.tsx:629` | P2-5 |
| Inconsistent patterns | The "Test" toggle passes `aria-pressed` to `Button`, which does not style a pressed state. | `screens/FlowEditor.tsx:920` | P2-8 |
| Inconsistent patterns | Branch cases are "tried in order" but can only be added or removed, never reordered. | `screens/FlowEditor.tsx:1428,1449-1468` | P3-6 |
| Accessibility | Steps cannot be connected without a pointer; the error path and branch cases are also drag-only, and the instructions describe only dragging (05: K1; WCAG 2.1.1 and 2.5.7). | `screens/FlowEditor.tsx:236,248-261,1067,1359-1363` | P0-8 |
| Accessibility | Connection handles are the library's 6x6 px default, and branch nodes stack several on one edge (05: T1; WCAG 2.5.8). | `screens/FlowEditor.tsx:236,248-261` | P0-8 |
| Accessibility | The canvas is the only representation of the flow; there is no list or outline of steps and connections (05: N1). | `screens/FlowEditor.tsx:1046-1084` | P0-8 |
| Accessibility | Handles are identified only by a `title` attribute. | `screens/FlowEditor.tsx:260` | P0-8 |
| Accessibility | The problems notice is not a live region while the 12.5 px save-status text is; each expression preview is its own `role="status"`, so six expressions announce six values when a test finishes. | `screens/FlowEditor.tsx:882`; `screens/ExpressionField.tsx:114,121,128` | P0-7 |
| Accessibility | A new flow page has no `h1`, because the Path field takes the heading's place. | `screens/FlowEditor.tsx:857-869` | P0-7, P2-3 |
| Accessibility | `fitView({ duration: 200 })` ignores the reduced-motion preference. | `screens/FlowEditor.tsx:590,758` | P4-4 |
| Accessibility | A selected node with a test state loses its state-coloured border to the selection colour; the pill inside remains. | `screens/FlowEditor.tsx:232-234` | P2-5 |
| Missing states | A new, never-saved flow is not autosaved and no unsaved-changes guard exists; earlier "autosave from the first change" is only partly done. | `screens/FlowEditor.tsx:702-706` | P0-4 |
| Missing states | Autosave retries every 1.5 s forever after a persistent failure such as a revision conflict, and offers no "reload theirs / keep mine". | Inferred from `screens/FlowEditor.tsx:683,702-706` | P0-4 |
| Missing states | The first save replaces the address and, because the editor is keyed on it, remounts the editor: undo history, selection and test panel state reset at that moment. | Inferred from `screens/FlowEditor.tsx:690` and `screens/Tenant.tsx:444` | P0-6 |
| Missing states | There is no read-only editor for production, no failed-save badge distinct from the notice, and loading is a bare "Loading…" paragraph. | `screens/Tenant.tsx:451-454`; `screens/FlowEditor.tsx:805,945` | P2-4, P1-3 |
| Missing states | Problems do not block or warn on Save, autosave or Test. | `screens/FlowEditor.tsx:307-375` | P1-8 |
| Keyboard limitations | There is no ⌘S (the browser's save dialog opens), and no shortcut to open Add step, toggle Test or run a test; Undo and Redo keys are shown only in button `title`s. | `screens/FlowEditor.tsx:740-753,904,914` | P3-1 |
| Keyboard limitations | There is no copy, paste, duplicate or context menu; five similar steps cost five passes through Add step, pick and configure. | No clipboard or `onNodeContextMenu` code in `screens/FlowEditor.tsx` | P3-6 |
| Keyboard limitations | With several nodes selected the inspector silently shows the first and offers no bulk action. | `screens/FlowEditor.tsx:1070`; multi-select itself Inferred from library defaults | P3-6 |
| Responsive | Below 1024 px the header, a canvas with a 28rem minimum and a non-shrinking inspector stack inside a `main` that hides overflow, so the inspector can be clipped (05: R1). | Inferred from `screens/FlowEditor.tsx:957-958,1091` and `Shell.tsx:903` | P3-5, P0-8 |
| Responsive | The inspector cannot be collapsed to give the canvas the full width, and nothing is resizable. | `screens/FlowEditor.tsx:1091` | P3-5 |
| Simplification | Drop the confirm on Remove, fold the problems strip into a popover on "N to fix", make Test the header's primary once saved, and move Tidy up into the canvas controls. | Judgment | P1-8, P4-1 |
| Simplification | A full-size red "Remove this step" sits at the bottom of every inspector although removal is undoable. | `screens/FlowEditor.tsx:1327-1341` | P1-8, P0-9 |

**Workspace behaviour.**
- Panel layout and proportions (computed, 1440x900): header row about 49 px (`:846`); canvas 1024 px wide (71% of viewport width) and about 803 px tall with no notices; inspector fixed at 352 px (`:1091`). With the test panel open (`max-h-[45vh]`, `screens/FlowTestPanel.tsx:58`) the canvas drops to about 400 px, floor 16rem (`:958`). Canvas share of the viewport is about 63% idle and 31% while testing.
- Resizability: none. Inspector, palette (`w-64 max-h-[60vh]`, `:971`) and test panel are fixed; the inspector cannot be collapsed.
- Persistence: node positions are saved in the draft body (`:672-677`). Selected step, viewport, test-panel state and last test run are component state (`:392,398,399`); undo history is cleared on open (`:509`).
- Validation surfacing: client-side problems as a header count and a notice strip (`:877-881,938-956`), not clickable; expression errors inline once a run exists; deploy-time validation only on the Release page (`screens/Release.tsx:303-313`).
- Execution actions: "Test" toggle in the header (`:920`), then "Run a test" / "Run again" in the panel. No cancel, no run-from-step, no run-single-step, no pinned step output.
- Selection and multi-select: single selection drives the inspector (`:1070`); library box-select is available (Inferred) with no bulk actions.
- Undo/redo: yes, ⌘Z and ⇧⌘Z / Ctrl+Y outside fields (`:740-753`), labelled in button titles.
- Context menus: none.
- Keyboard actions: undo, redo, Enter to rename (`:1394-1412`); library defaults for Tab to nodes, arrows to move, Backspace to delete, Esc to deselect (Inferred, not configured). No ⌘S, no connect.

### WS-FLOW-TEST · Flow test panel and "Last test" — 68/100 (functional / inconsistent)

Inside the flow editor · `screens/FlowTestPanel.tsx:28` (`FlowTestPanel`), `:123` (`LastTest`) · density class: standard; fits.

**User objective.** Run the saved draft with a chosen input and see which step did what.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 3.5 | 3.5 | 3.0 | 4.0 | 3.0 | 2.5 | 3.5 | 3.5 | 3.5 | **68** |

**What the eye sees first.** Verified from classes: "Test the draft" in 18 px title type (`screens/FlowTestPanel.tsx:61`) and the primary "Run a test" at the bottom right of the form column; after a run, the run's state pill. This matches the user's priority.

**Strongest existing decisions (keep).**
- It runs what is saved and says so (`screens/FlowTestPanel.tsx:66-68`), and saves first when dirty (`screens/FlowEditor.tsx:724`).
- "The flow changed since this test" when the canvas has moved on (`screens/FlowTestPanel.tsx:86-90`).
- Plain-language reasons when a test is blocked (`screens/FlowEditor.tsx:732-738`).
- The step list doubles as a node selector (`screens/FlowTestPanel.tsx:96-103`; `screens/FlowEditor.tsx:1379-1382`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | The panel title and a sentence of explanation take two rows of a 45vh panel on every run. | `screens/FlowTestPanel.tsx:60-68` | P4-1 |
| Density | The step list shows state and time but no one-line output or error, so each step costs a click and a look to the far-right inspector. | `screens/FlowTestPanel.tsx:101-102` | P1-8, P1-2 |
| Typography | Step durations are set in sans inside the state pill's detail while list columns elsewhere use mono for durations. | `screens/FlowTestPanel.tsx:102`; `kit/status.tsx:81` | P4-6 |
| Interaction friction | There are no step logs in the editor; the only route is "Open the run", which leaves the page, and a step's resolved input is never shown, only its output. | `screens/FlowTestPanel.tsx:83,123-167` | P1-8, P1-6 |
| Interaction friction | The whole flow always runs from the manual trigger; there is no run-from-step or run-one-step. | `screens/FlowEditor.tsx:725-728` | P1-8 |
| Interaction friction | The submit button is right-aligned at the bottom of a possibly long form and can scroll out of the panel. | `packages/ui/src/SchemaForm.tsx:851` | P2-7 |
| Inconsistent patterns | A running flow test cannot be cancelled here, while the script test panel has "Cancel run". | `screens/FlowTestPanel.tsx:28-106`; `screens/Runs.tsx:504` | P1-8 |
| Inconsistent patterns | `LastTest` formats time with `toLocaleTimeString()` and durations with a local helper, while the rest of the console uses shared `when` / `fromNow`. | `screens/FlowTestPanel.tsx:9,139` | P4-6 |
| Missing states | Closing the panel removes run states from the canvas although the run is still held in memory. | `screens/FlowEditor.tsx:761` | P1-8 |
| Missing states | The last test run is lost on reload or on the first-save remount because it is component state. | `screens/FlowEditor.tsx:399` | P2-6, P0-6 |
| Keyboard limitations | There is no shortcut to open the panel or run a test. | `screens/FlowEditor.tsx:740-753` | P3-1 |
| Responsive | The panel is capped at 45vh and is not resizable, so on a short display the form and step list scroll inside a small box. | `screens/FlowTestPanel.tsx:58,69` | P3-5 |

**Workspace behaviour.** Bottom panel, two columns `minmax(0,22rem) | 1fr` (`screens/FlowTestPanel.tsx:69`): input form, then run state, "Open the run" and the step list. Not resizable; open state not persisted (`screens/FlowEditor.tsx:398`). Validation: client check then server refusals placed on fields by `InputForm`. Execution: "Run a test" / "Run again"; no cancel. Selection: clicking a step selects its node. No undo, context menu or keyboard action of its own.

### WS-EXPRESSION · Expression field — 65/100 (functional / inconsistent)

Inside flow step forms · `screens/ExpressionField.tsx:41` · density class: compact; fits.

**User objective.** Write an expression that reads data from the trigger or earlier steps and confirm what it evaluates to.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.5 | 3.5 | 3.0 | 3.0 | 4.5 | 3.5 | 2.0 | 3.0 | 3.5 | 3.0 | **65** |

**What the eye sees first.** Verified from classes: a plain text input, and once a test run exists, the evaluated value in 12 px mono beneath it (`screens/ExpressionField.tsx:111`). The value preview is the right priority; before a run exists the field gives no sign that a preview is possible.

**Strongest existing decisions (keep).**
- The evaluated value under the field, debounced 400 ms, with stale answers discarded (`screens/ExpressionField.tsx:76-89`).
- "A case must give true or false" for conditions (`:126-131`).
- First-item preview for a for-each step (`:81`; `screens/FlowEditor.tsx:824-828`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Typography | The preview is 12 px mono, below the smallest text role, and the input itself has no monospace guarantee. | `screens/ExpressionField.tsx:103,111` | P2-1 |
| Density | The preview is truncated at 160 characters with no way to expand it. | `screens/ExpressionField.tsx:9,31-34` | P4-6 |
| Interaction friction | The field is a plain `TextField` or `TextAreaField`: no syntax colour, no completion of `trigger.*` or `steps.<name>.output.*`, and no picker from the last run's data. | `screens/ExpressionField.tsx:103` | P1-8 |
| Discoverability | Nothing is shown until a run exists and the field does not say why; the "run a test" note comes only from the server. | `screens/ExpressionField.tsx:72-74,120-124` | P1-8 |
| Inconsistent patterns | The resource editor's event-trigger "Only when" is a bare textarea for the same kind of expression, without this preview. | `screens/ResourceEditor.tsx:523-532` | P2-7 |
| Accessibility | Each field's preview is its own `role="status"` live region, so a form with several expressions announces all of them at once when a test finishes. | `screens/ExpressionField.tsx:114,121,128` | P0-7 |
| Keyboard limitations | There is no completion key, no reference picker and no way to insert a step reference without typing it from memory. | `screens/ExpressionField.tsx:103` | P1-8 |

### WS-FLOW-GRAPH · Flow graph (read-only) — 66/100 (functional / inconsistent)

Used on the flow view (`screens/Flows.tsx:418`) and the run page's Graph tab (`screens/Flows.tsx:734`) · `FlowGraph.tsx:85` · density class: standard; fits.

**User objective.** Read a flow's shape and, on a run, see which steps ran, failed or were skipped.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.5 | 3.5 | 3.0 | 3.5 | 3.5 | 3.0 | 3.0 | 3.5 | 3.0 | 3.5 | **66** |

**What the eye sees first.** Verified from classes: surface-coloured node boxes with the step's kind and name, state carried on the outline and a 5 px dot (`FlowGraph.tsx:278-281,294-298`), and red error edges. On a run page the priority is the failed step; red edges are drawn even when not taken, so red is not reserved for what failed.

**Strongest existing decisions (keep).**
- Every node is a labelled button with the state in its accessible name and `aria-pressed` (`FlowGraph.tsx:244-247`).
- Status on the outline, never the fill (`:278-281`); taken and not-taken edges with titles (`:194-214`).
- The corner-bracket selection mark (`:265-272`) and the "Fit to view / Actual size" toggle (`:114-122`). Earlier finding D6 is fixed.
- All colours from tokens (`:168-278`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | Error edges are danger-coloured even when not taken, so a healthy run still shows red. | `FlowGraph.tsx:201-203` | P2-5, P1-2 |
| Typography | Labels are hard-truncated in JavaScript at 20 and 26 characters with no title or tooltip for the full text. | `FlowGraph.tsx:284,291` | P4-6 |
| Interaction friction | Dragging clamps at zero and the movable graph has no zoom or fit; it scrolls inside `overflow-auto`. | `FlowGraph.tsx:113,144-145` | P1-2 |
| Inconsistent patterns | This renderer and the editor's React Flow canvas draw the same flow with different node sizes, labels and handles. | `FlowGraph.tsx:17-18,21-33`; `screens/FlowEditor.tsx:231,239` | P1-2, P0-8 |
| Inconsistent patterns | SVG marker ids `arrow` and `arrow-error` are global, so two graphs on one page collide. | `FlowGraph.tsx:160,171` | P2-12 |
| Accessibility | Focusable node groups have `outline: "none"` inline with no replacement ring, so keyboard focus is invisible unless the node is selected (05: F1; WCAG 2.4.7). | `FlowGraph.tsx:241-251` | P0-8 |
| Accessibility | Node state is the stroke colour plus a coloured dot; only "skipped" has a non-colour cue (dashed), and that stroke is 1.41:1 (05: C5). | `FlowGraph.tsx:279-281,294-298` | P2-5, P0-2 |
| Accessibility | Edges have no accessible name, so order and branching are not conveyed (05: N1). | `FlowGraph.tsx:196-229` | P0-8 |
| Accessibility | The fit toggle is about 23.5 px high, borderline against the 24 px minimum target. | `FlowGraph.tsx:118` | P2-1 |
| Keyboard limitations | Enter and Space select a node, but there is no keyboard path to move one (05: D1). | `FlowGraph.tsx:136-156,252-263` | P0-8 |
| Simplification | One graph renderer for view, run and editor would remove the vocabulary and size mismatches. | Judgment | P1-2 |

## Build: scripts and extensions

### WS-SCRIPTS · Scripts list and inspector — 69/100 (functional / inconsistent)

`/t/:t/workspaces/:w/scripts` · `screens/Execution.tsx:95` (`Scripts`), inspector "The chosen script" at `:233-296`, resolved at `screens/Tenant.tsx:554-559`, workbench frame · density class: standard; fits.

**User objective.** Find a script, see its last run and what it reaches, and run or edit it.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 3.5 | 3.5 | 4.0 | 3.0 | 3.0 | 2.5 | 3.5 | 4.0 | 4.0 | **69** |

**What the eye sees first.** Verified from classes: the title and primary "New script"; in rows the mono path, the state pill and a red "N in a row" failure streak (`screens/Execution.tsx:182-184`). The failure streak is the vivid element, which matches the operator's priority.

**Strongest existing decisions (keep).**
- The "Uses" column, reading "Nothing outside" when empty (`screens/Execution.tsx:171-173`).
- The streak count, and the inspector's failure notice with "N times in a row" (`:182-184,260-267`).
- Source tags Platform / Console / Repository (`:192-199`).
- Run from the inspector through a schema form in both dev and production (`:249-254,319-329`); the earlier gap is fixed.
- Empty states that offer both the console and the CLI path (`:207-232`); earlier finding V6 is fixed.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | The inspector footer mixes a default-size primary with two small buttons. | `screens/Execution.tsx:243-255` | P2-1 |
| Interaction friction | The row link goes to `scripts/edit/…` in production too, an "edit" address for a read-only view. | `screens/Execution.tsx:157` | P1-3 |
| Discoverability | The inspector links to the last run only; there is no "all runs of this script", no list of its triggers and no "used by" flows. | `screens/Execution.tsx:233-296` (`:290` last run) | P1-10 |
| Discoverability | Connections in the inspector's "Uses" list are text, not links. | `screens/Execution.tsx:278-287` | P1-10 |
| Discoverability | There is no "Schedule" or "Add trigger" entry from a script. | `screens/Execution.tsx:241-257` | P1-9 |
| Inconsistent patterns | There is no search here while Flows has one; this is the list that grows fastest. | `screens/Execution.tsx:131-149`; `screens/Flows.tsx:114-122` | P2-2 |
| Inconsistent patterns | The "Source" tag for console-written scripts uses the `draft` tone to mean "Console", which reads as "this is a draft". | `screens/Execution.tsx:196` | P2-5 |
| Inconsistent patterns | Filter chip and selection are component state, not in the URL. | `screens/Execution.tsx:107-108` | P2-6 |
| Inconsistent patterns | A dead `_TONE` map remains in the file and the section heading is an `h3` directly under the `h1`. | `screens/Execution.tsx:28,745` | P2-12 |
| Accessibility | Rows are focusable `<tr>` with a second focusable link inside, as on Flows; the docked inspector does not take focus. | `kit/CollectionView.tsx:106-108`; `kit/layout.tsx:112-139` | P0-3, P2-2 |
| Missing states | A script saved as a draft and not yet deployed does not appear, so the editor's "All scripts" link leads to a list without the script just written; Extensions and Flows both show drafts. | Inferred from `ScriptRow` having no draft field (`screens/Execution.tsx:76-92`) and the API summary at `apps/control-plane/src/routes/execution.ts:867` | P1-3, P2-5 |
| Missing states | A deployed script with a pending draft carries no Draft tag. | `screens/Execution.tsx:192-199` | P2-5 |
| Missing states | Loading is "Loading…" and a load error has no retry. | `kit/CollectionView.tsx:73-78` | P2-4 |
| Keyboard limitations | There is no row movement beyond Tab, no key to run or edit the selected script, and Esc does not close the docked inspector. | `kit/CollectionView.tsx:112-121`; `kit/layout.tsx:112-139` | P3-1, P0-3 |
| Simplification | Give Scripts and Flows the same toolbar (search, chips, URL state) from the shared list primitive. | Judgment | P2-2 |

### WS-SCRIPT-EDITOR · Script editor — 58/100 (major UX debt)

`/t/:t/workspaces/:w/scripts/new`, `/scripts/edit/<path>` (and the extension routes, see WS-EXTENSIONS) · `screens/Authoring.tsx:229` (`ScriptEditor`, keyed on the address at `screens/Tenant.tsx:518-525`), `editor/CodeEditor.tsx:23`, `editor/monaco.ts` · density class: standard but chrome-heavy; does not fit a code-first surface.

**User objective.** Write, configure, try and ship a script, iterating between code and its output.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.0 | 3.0 | 3.0 | 3.5 | 3.0 | 2.0 | 2.5 | 3.0 | 3.0 | 3.0 | **58** |

**What the eye sees first.** Observed (mocked API) for a new script at 1440x900, O8: the code area is about 940x540 px, 39% of the viewport. Above it sit an "All scripts" text link, a labelled Path field with a two-line hint, a grey "Not saved" pill and "Save draft", about 150 px of header. To the right is a 350 px card with Settings and Try it tabs, Settings first; it overflows the viewport, so the page scrolls while the editor keeps a fixed height with empty canvas below it. The starter code shows a red squiggle under `z` on line 1 before the user types anything. Verified from classes: on a saved script, a solid red "Discard draft" sits immediately left of the solid primary "Save draft" (`screens/Authoring.tsx:640-665`). The code block is rightly the largest region, but the most dangerous action is the second most prominent control, and the action repeated most, running the script, is not visible on arrival.

**Strongest existing decisions (keep).**
- The input schema read from the code's own `input` export, echoed read-only with "Change it there, and save" (`screens/Authoring.tsx:263-278,529-540`).
- The test form re-drawn from that schema and prefilled with the last input (`:592-599`), and "Save and run" as one act (`:392,597`).
- The textarea fallback so code is never unreachable (`editor/CodeEditor.tsx:112-121`).
- The Monaco theme built from tokens and following theme changes (`editor/monaco.ts:49-69`; `editor/CodeEditor.tsx:77-80`).
- Role-specific read-only notices that say where to make the change (`screens/Authoring.tsx:675-695`), and repository source with file picker and reveal-line (`:904-950`; earlier finding D5 fixed).
- One editor for scripts, connectors and trigger sources, and "Events it published" beside the run (`:871`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | There is no Run in the header; running is two levels down (the "Try it" tab, then a button), and the panel opens on "Settings" every time. | `screens/Authoring.tsx:597,717-723` | P1-4 |
| Visual hierarchy | "Discard draft" is a solid red button beside the primary "Save draft", same size and weight. | `screens/Authoring.tsx:640-665` | P0-9, P1-4 |
| Visual hierarchy | The dirty signal is a neutral grey badge "Unsaved changes" next to the state badge, so "Deployed" and "Unsaved changes" appear together and neither is strong. | `screens/Authoring.tsx:629-630` | P0-4, P2-5 |
| Spacing | About 108 px (computed) of link, header and gaps sits above the code, and the frame keeps page padding and page scroll because it is "editor" but not "workbench". | `screens/Authoring.tsx:610-696`; `nav.ts:218,229-233`; `Shell.tsx:909` | P1-4 |
| Alignment | The editor is a fixed 34rem (544 px) regardless of display height; on a taller display the page has dead space rather than more code. | `screens/Authoring.tsx:708` | P1-4, P3-5 |
| Typography | `text-[13px]` is hard-coded seven times and the title is 18 px mono against 16 px in the flow editor. | `screens/Authoring.tsx:561,573,579,601,610,616,846`; `editor/CodeEditor.tsx:119` | P2-1, P2-12 |
| Density | Three stacked multi-selects for connections, secrets and variables, each reading "None", take most of the Settings panel for scripts that use nothing. | `screens/Authoring.tsx:427-585` | P1-4, P2-7 |
| Interaction friction | Code and its output cannot be seen together at 1440x900: the "Test run" section renders after the editor grid, starting at about y = 716 px (computed), and nothing scrolls it into view on run. | `screens/Authoring.tsx:697-742` | P1-4 |
| Interaction friction | The result panel is keyed by run id, so its tab resets to Logs on every run and reading the output costs one click per iteration. | `screens/Authoring.tsx:738`; `screens/Runs.tsx:575-610` | P1-4 |
| Interaction friction | A run error shows the message but no link from a stack frame to the editor line, although `revealLine` exists on the editor. | `screens/Runs.tsx:531-553`; `editor/CodeEditor.tsx:15`; `screens/Authoring.tsx:947` | P1-4 |
| Interaction friction | The JSON Schema fallback is a 7-row plain textarea although the editor component supports JSON. | `screens/Authoring.tsx:541-558`; `editor/CodeEditor.tsx:8` | P1-4, P2-7 |
| Interaction friction | Retries exposes only "times" although the body carries `delaySeconds` and `backoff`. | `screens/Authoring.tsx:107,478-497` | P2-7 |
| Interaction friction | "Review and deploy" is a text link that leaves the editor, and the deploy carries every draft in the workspace. Earlier finding X10 is open. | `screens/Authoring.tsx:667-669`; `screens/Release.tsx:351-377` | P1-5 |
| Interaction friction | Each keystroke in the Path field of a new script disposes and recreates Monaco, dropping cursor, scroll and Monaco's undo stack, because the editor's create effect depends on a label that embeds the path. | `editor/CodeEditor.tsx:81-99`; `screens/Authoring.tsx:703`; runtime effect Inferred | P0-6 |
| Discoverability | The `⌘↵` hint is printed only inside the "Try it" tab. | `screens/Authoring.tsx:603` | P1-4, P3-1 |
| Discoverability | The editor offers no run history for this script, no link to its triggers, no "used by" flows, no diff against the deployed version and no link to draft history, which exists on the Release page. | `screens/Authoring.tsx:610-742`; `screens/Release.tsx:389-441` | P1-10, P1-3, P3-7 |
| Discoverability | Schema-reading status and its failure notice live in the Settings tab only, so the Try it tab can show a form drawn from the previous schema with no "updating" hint. | `screens/Authoring.tsx:560-571` | P1-4, P1-7 |
| Discoverability | Monaco captures Tab and the way out (Ctrl+M) is not mentioned in the shortcut sheet or near the editor (05: M1). | `editor/CodeEditor.tsx:56-66`; `kit/CommandPalette.tsx:735-746` | P3-1 |
| Inconsistent patterns | "Review and deploy" is a text link here and a primary button in the flow editor; state is a `Badge` here and a `Tag` there; the back link is "All scripts" above the title here and "Flows /" inline there; Discard exists here and not there. | `screens/Authoring.tsx:610,629,640-669`; `screens/FlowEditor.tsx:848-856,870-876,932`; Observed, O10 | P2-3, P2-5, P1-5 |
| Inconsistent patterns | The "Draft" badge is an amber fill here and a teal dashed tag in the flow editor and flows list. | `screens/Authoring.tsx:420-425`; `screens/FlowEditor.tsx:875`; `screens/Flows.tsx:214` | P2-5 |
| Inconsistent patterns | The starter script imports `z` from `@vynxlabs/sdk`, but the type stub given to Monaco does not export it, so the platform's own template shows a type error on line 1 and `z.object(...)` has no completion. | `screens/Authoring.tsx:27`; `editor/monaco.ts:39-41`; Observed, O8 | P0-6 |
| Accessibility | A new script page has no `h1`, because the Path field takes the heading's place. | `screens/Authoring.tsx:615-628` | P0-7, P2-3 |
| Accessibility | The schema-reading status is one of the few live regions; run state changes in the test panel are not announced. | `screens/Authoring.tsx:561`; `kit/status.tsx:67-84` | P0-7 |
| Missing states | There is no autosave, no leave guard and no local backup; an hour of unsaved work is lost by clicking "All scripts", any rail item, Back, reload or tab close, and the Monaco model is disposed on unmount. | `screens/Authoring.tsx:344,392,610`; `editor/CodeEditor.tsx:86` | P0-4 |
| Missing states | There is no "saved at" confirmation; a successful save removes the grey badge and disables the button. | `screens/Authoring.tsx:375,661` | P0-4, P2-8 |
| Missing states | "Save and run" on a brand-new script saves, replaces the address and remounts the editor; the continuation sets the test run on the unmounted instance, so the first run of a first script may show no result panel. | Inferred from `screens/Authoring.tsx:378,392-399` and `screens/Tenant.tsx:520`; verify live | P0-6 |
| Missing states | Monaco diagnostics appear only as squiggles: there is no error count, no problems list, and Save and Run are not informed by type errors. | `editor/monaco.ts:24-46`; no `onDidChangeMarkers` or `getModelMarkers` in the console | P1-4 |
| Missing states | Field-level server errors are mapped for only two fields (timeout and the schema textarea); everything else lands in one notice above the editor. | `screens/Authoring.tsx:475,553,696` | P2-7 |
| Missing states | The first ⌘↵ runs with an empty input, and for a script with required input the refusal lands in the page-level notice, not on the form fields. | `screens/Authoring.tsx:256,408,696` | P1-4 |
| Missing states | There is no undo for "Discard this draft?" beyond its confirm, and no input history, saved inputs or "use the input of run X". | `screens/Authoring.tsx:255-256,644` | P1-3, P2-8 |
| Missing states | Loading is a bare paragraph. | `screens/Authoring.tsx:331` | P2-4 |
| Keyboard limitations | There is no ⌘S; the browser's "Save page" dialog opens. | No handler in `screens/Authoring.tsx` or `editor/CodeEditor.tsx` | P1-4 |
| Keyboard limitations | ⌘↵ is a window listener and is not registered with Monaco, which binds the same keys to "insert line below"; the shortcut likely does not fire, or fires after inserting a line, while the cursor is in the code. | `screens/Authoring.tsx:314-325`; no `addCommand` or `addAction` anywhere in the console; delivery Inferred | P1-4 |
| Keyboard limitations | There is no format-on-save and no key to switch between Settings, Try it and output. | `screens/Authoring.tsx:717-723` | P1-4, P3-1 |
| Responsive | Below 1280 px the right panel stacks under the code, so on a 1280x800 laptop Settings and Try it are entirely below a 544 px editor. | `screens/Authoring.tsx:697` | P1-4, P3-5 |
| Simplification | Move Discard into an overflow menu, put Run and Deploy in the header, dock output beside or under the code, and open on Try it. | Judgment | P1-4, P1-5 |

**Workspace behaviour.**
- Panel layout and proportions (computed, 1440x900): code 944 px wide (66%) by a fixed 544 px (60% of height), about 40% of the viewport; right panel 352 px (`xl:grid-cols-[1fr_22rem]`, `screens/Authoring.tsx:697`); test output below the grid, off-screen at 900 px.
- Resizability: none. No split pane, no collapse.
- Persistence: the Settings / Try it tab is not remembered (`:717-723`); the last test input is kept only while the editor is open (`:255-256`); no draft autosave.
- Validation surfacing: Monaco squiggles only; one save-error notice (`:696`); client check "The schema is not valid JSON." (`:357`); run errors in "Why it failed" (`screens/Runs.tsx:531-537`).
- Execution actions: "Save and run" / "Run the draft" in the Try it tab (`:597`), ⌘↵ (`:316-326`), then Cancel run, Open full view and copy-as-curl in the result panel (`screens/Runs.tsx:504-527`). Read-only scripts say "This script is not run from here." (`:590`).
- Selection and multi-select: Monaco's own.
- Undo/redo: Monaco's own for code; browser undo for settings fields; none for discard.
- Context menus: Monaco's default only.
- Keyboard actions: ⌘↵ (scope problem above), ⌘K captured from inside Monaco, Monaco defaults (Inferred). No ⌘S.

### WS-EXTENSIONS · Extensions list and editor — 60/100 (functional / inconsistent)

`/t/:t/workspaces/:w/extensions` · `screens/Authoring.tsx:759` (`Extensions`), resolved at `screens/Tenant.tsx:537-542`, plain page frame; editor routes `/extensions/(connector|trigger_source)/(new|edit/<path>)` reuse `ScriptEditor` with a `kind` (`screens/Tenant.tsx:526-536`) · density class: standard; fits.

**User objective.** See the workspace's connectors and trigger sources and write or change one.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.5 | 3.0 | 3.0 | 3.0 | 3.0 | 3.0 | 2.5 | 3.5 | 2.5 | 3.0 | **60** |

**What the eye sees first.** Verified from classes: the page title, a three-sentence description (`screens/Authoring.tsx:814`) and two creation buttons, primary "New connector" and secondary "New trigger source" (`:818-823`); then a bordered table of path, "What it is", "What it does" and State. The user's priority, which extension is in use and whether it works, has no column.

**Strongest existing decisions (keep).**
- Drafts are merged into the list (`screens/Authoring.tsx:794-803`), the behaviour the Scripts list lacks.
- The empty state explains when an extension is not needed (`:834-838`).
- The editor is the same component as the script editor, so every fix to WS-SCRIPT-EDITOR applies.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | "New connector" is primary and "New trigger source" secondary for no stated reason. | `screens/Authoring.tsx:818-823` | P2-3 |
| Density | The three-sentence description repeats in the empty state. | `screens/Authoring.tsx:814,834-838` | P4-1 |
| Density | There is no last-used or "used by N connections" column, so the list has nothing operational to read. | `screens/Authoring.tsx:812-862` | P1-10 |
| Interaction friction | Connectors and trigger sources cannot be tried in the editor; the panel says to deploy first. The earlier "test harness per kind" finding is open. | `screens/Authoring.tsx:572-583` | P1-4 |
| Inconsistent patterns | The list uses the older `Page` plus `Table` pattern with no inspector, search or filters, unlike Flows and Scripts. | `screens/Authoring.tsx:812-862` | P2-2 |
| Inconsistent patterns | State is a `Badge` here where sibling lists use `Tag`; the `STATE` map is copied a second time in this file. | `screens/Authoring.tsx:805,859` | P2-5 |
| Inconsistent patterns | For a trigger source the editor still renders a tab bar with a single tab. | `screens/Authoring.tsx:719-722` | P1-4 |
| Missing states | A draft row loses its description because the draft list carries no body. | `screens/Authoring.tsx:800` | P2-5 |
| Missing states | Loading is a bare "Loading…" paragraph. | `screens/Authoring.tsx:864` | P2-4 |
| Keyboard limitations | Rows are not selectable and there is no list movement. | `screens/Authoring.tsx:812-862` | P3-1, P2-2 |
| Simplification | One "New" menu with two kinds, on the shared list primitive. | Judgment | P2-2 |

**Workspace behaviour (editor).** As WS-SCRIPT-EDITOR, with these differences: no "Try it" tab and no ⌘↵ (the handler is for the script kind only, `screens/Authoring.tsx:314-325`); the extension schema is a plain JSON textarea (`:542-558`); no test output panel.

## Build: resources, schedules and inputs

### WS-RESOURCE-EDITOR · Resource editor — 55/100 (major UX debt)

`/t/:t/workspaces/:w/resources/new/<kind>`, `/resources/edit/<kind>/<path>` · `screens/ResourceEditor.tsx:125` (keyed on the address at `screens/Tenant.tsx:591-606`), editor frame (`nav.ts:221`) · density class: low; does not fit the full-width editor frame it is given.

**User objective.** Declare a connection, connection group, variable, event, schedule or trigger and save it as a draft.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.0 | 2.5 | 3.0 | 3.0 | 2.5 | 2.5 | 2.0 | 3.5 | 3.0 | 2.5 | **55** |

**What the eye sees first.** Verified from classes: the mono path heading followed by three badges of equal weight (kind, state, "Unsaved changes") (`screens/ResourceEditor.tsx:343-345`), and a red Remove or Discard beside the primary Save (`:350-383`); then a 672 px panel with about 640 px of empty canvas to its right at 1440 px (computed). The form, which is the task, is the least emphasised region.

**Strongest existing decisions (keep).**
- A one-sentence "what this is" per kind (`screens/ResourceEditor.tsx:41-80,392`).
- "Remove" saves a deleting draft and says nothing changes until deploy (`:359`).
- Trigger type preselected from the Triggers page through `?type=` (`:146-150,181-185`).
- `WebhookSettings`, `FormDesigner` and `ScheduleFields` reused across the flow and resource editors.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | Three equal-weight badges follow the title and a red button sits beside the primary. | `screens/ResourceEditor.tsx:343-345,350-383` | P2-5, P0-9 |
| Spacing | The form is a single `max-w-2xl` (672 px) column in a frame that removed the section panel to gain width. Earlier finding D8 is open here. | `screens/ResourceEditor.tsx:406`; `nav.ts:216,221` | P3-8, P2-7 |
| Interaction friction | Clicking Save with problems only sets a flag; the list of problems renders below the form, far from the Save button at the top, so on a long form the click appears to do nothing. | `screens/ResourceEditor.tsx:240-244,381,548-556` | P2-7 |
| Interaction friction | The container is a `div`, not a `<form>`, so Enter in a field does not save. | `screens/ResourceEditor.tsx:406` | P2-7 |
| Interaction friction | A connection here has only kind and description; address and secret are "set under Connections" with no link to that screen for this connection. | `screens/ResourceEditor.tsx:45` | P1-10 |
| Interaction friction | Event payload schema and variable default are plain JSON textareas. | `screens/ResourceEditor.tsx:277-291,439-447` | P2-7 |
| Discoverability | The back link is always "All resources", even when the user arrived from Triggers ▸ New trigger, and discarding also lands on All resources. | `screens/ResourceEditor.tsx:324-326,373`; `screens/Operate.tsx:116` | P2-3, P1-9 |
| Discoverability | The trigger type is locked after first save with the hint "Make another.", but the disabled select still looks editable. | `screens/ResourceEditor.tsx:477-485` | P2-7 |
| Inconsistent patterns | A schedule made here starts with cron `0 8 * * *` and no time zone (UTC), while the schedule sheet starts with `0 9 * * *` and the browser's zone. | `screens/ResourceEditor.tsx:72`; `screens/ScheduleForm.tsx:113,268-271` | P1-9 |
| Inconsistent patterns | The event trigger's "Only when" is a bare textarea without the expression preview used in flows. | `screens/ResourceEditor.tsx:523-532` | P2-7, P1-8 |
| Inconsistent patterns | State uses `Badge` and a third copy of the `STATE` map. | `screens/ResourceEditor.tsx:271,343-345` | P2-5 |
| Accessibility | A new resource page has no `h1`, because the Path field takes its place. | `screens/ResourceEditor.tsx:329-342` | P0-7 |
| Missing states | There is no autosave and no leave guard. | `screens/ResourceEditor.tsx:232` | P0-4 |
| Missing states | A successful save is confirmed only by the badge flipping to "Draft"; there is no toast, although the schedule sheet toasts. | `screens/ResourceEditor.tsx:260-261`; `screens/ScheduleForm.tsx:290` | P2-8 |
| Missing states | The first save replaces the address and remounts the editor. | Inferred from `screens/ResourceEditor.tsx:263` and `screens/Tenant.tsx:596` | P0-6 |
| Missing states | Loading is a bare paragraph; an unknown kind shows a danger notice instead of the 404 screen. | `screens/ResourceEditor.tsx:206`; `screens/Tenant.tsx:604` | P2-4 |
| Keyboard limitations | There is no ⌘S, no undo and no implicit submit. | `screens/ResourceEditor.tsx:232,406` | P2-7, P3-1 |
| Responsive | At 1440 px and wider about half the work area is empty; nothing uses it for a preview, "used by" or next fire times. | `screens/ResourceEditor.tsx:406` | P3-8 |
| Simplification | Triggers and schedules should open in the same sheet as "New schedule" from where the user is; the full page should remain only for long forms. | Judgment | P1-9 |

**Workspace behaviour.** One form panel switching by kind (`screens/ResourceEditor.tsx:406-547`); not resizable; nothing persisted beyond the saved draft; validation as a problems list below the form after a save attempt (`:548-556`); no execution action (a webhook's address exists only after deploy); no selection model, no undo, no context menu, no keyboard action.

### WS-RESOURCES · All resources — 54/100 (major UX debt)

`/t/:t/workspaces/:w/resources` · inline `ListScreen` at `screens/Tenant.tsx:607-660`, plain page frame · density class: standard; fits.

**User objective.** See everything deployed to the workspace in one ledger and open or create a resource.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.0 | 2.0 | 2.5 | 3.0 | 2.5 | 2.5 | 2.0 | 3.5 | 3.0 | 3.0 | **54** |

**What the eye sees first.** Verified from classes: the page title, a three-sentence description (`screens/Tenant.tsx:617`), a "New" menu, and a bordered table whose rows mix links and dead text. The user cannot tell from the row which entries can be opened.

**Strongest existing decisions (keep).**
- An honest "everything deployed" ledger with version and managed-in columns.
- `ListScreen` gives it the only list error state in this part with "Try again" (`ListScreen.tsx:239-241`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | The description is a three-sentence paragraph above the table. | `screens/Tenant.tsx:617` | P4-1 |
| Typography | The "Kind" column prints the raw enum (`trigger_source`, `connection_group`), and the "New" menu labels are made by string surgery on the enum. | `screens/Tenant.tsx:626,648` | P2-5 |
| Interaction friction | Only the six kinds edited here are links; scripts, flows, apps, tables and connectors are listed as dead text with no route to their own screens. | `screens/Tenant.tsx:637-645` | P1-10 |
| Discoverability | No kind filter or search is configured for a list that mixes every kind. | `screens/Tenant.tsx:607-660` | P2-2 |
| Inconsistent patterns | The empty text says resources "appear here when they are deployed from the tenant's repository", contradicting the description two lines up that says they can be made here. | `screens/Tenant.tsx:617,657-658` | P0-6, P2-13 |
| Inconsistent patterns | The screen remains in the Build nav as an escape hatch although triggers and connections have their own entry points. Earlier finding IA3 is partly fixed. | `nav.ts:113`; `screens/Operate.tsx:109-116` | P2-3 |
| Missing states | Drafts are not shown, because only `${root}/resources` is read, so a resource just saved as a draft is absent from the list its editor links back to. | `screens/Tenant.tsx:618` | P1-3, P2-5 |
| Missing states | Loading is "Loading…". | `ListScreen.tsx:253` | P2-4 |
| Keyboard limitations | There is no row selection or list movement. | `screens/Tenant.tsx:607-660` | P3-1, P2-2 |
| Simplification | Either make every row a link to the object's own screen with a kind filter, or retire the screen in favour of the per-kind lists. | Judgment | P2-2, P1-10 |

### WS-SCHEDULE-SHEET · Schedule form and New schedule sheet — 70/100 (good but visibly improvable)

Triggers ▸ New trigger ▸ Schedule (`screens/Operate.tsx:99-120,191`) and inside the resource editor · `screens/ScheduleForm.tsx:68` (`ScheduleFields`), `:256` (`NewScheduleSheet`), side sheet `sm:w-[min(30rem,92vw)]` · density class: standard; fits.

**User objective.** Make a script or flow run on a schedule, and be sure when it will next fire.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 3.0 | 3.5 | 4.0 | 4.0 | 3.5 | 2.5 | 3.5 | 3.5 | 3.5 | **70** |

**What the eye sees first.** Verified from classes: the sheet title "New schedule", then Path, then "What it starts"; the primary "Save draft" is in the footer with the first outstanding problem in muted text to its left (`screens/ScheduleForm.tsx:306-316`). This matches the user's priority and the footer reason is a pattern worth reusing.

**Strongest existing decisions (keep).**
- One target picker for scripts and flows with the kind as hint (`screens/ScheduleForm.tsx:90-99`).
- Presets that write the cron line (`:32-38,162-171`).
- "Next times" computed by the scheduler itself, in the chosen zone, in mono (`:188-203`).
- The browser's time zone as the default (`:270`).
- Input drawn from the target's schema and validated before save (`:127-135,217-225`).
- The footer's running reason for a disabled Save (`:306-316`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Typography | Labels for "Next times" and the input are ad-hoc `text-[13px] font-medium` spans rather than the field frame. | `screens/ScheduleForm.tsx:189,216` | P2-1, P2-7 |
| Density | The cron line has no plain-language reading such as "At 09:00, Monday to Friday"; only presets and next times explain it. | `screens/ScheduleForm.tsx:162-203` | P1-9 |
| Interaction friction | There is no entry from the script or flow being scheduled, so the target is always re-picked from a combobox. | `screens/ScheduleForm.tsx:144-160`; `screens/Execution.tsx:241-257` | P1-9 |
| Interaction friction | Changing the target silently clears the input already typed. | `screens/ScheduleForm.tsx:157` | P2-8 |
| Interaction friction | Only flows with a manual trigger are offered as targets, and nothing explains when to use a flow's own schedule trigger instead. | `screens/ScheduleForm.tsx:97` | P1-9 |
| Discoverability | The preset select's group labels are "Often used" and "Your own", an odd pair for presets versus a custom line. | `screens/ScheduleForm.tsx:164-167` | P1-9 |
| Inconsistent patterns | There are three ways to schedule with three capability levels: this sheet; the resource page, which defaults to UTC; and a flow's own schedule trigger, a bare cron field with no zone, presets, validation or preview. | `screens/ResourceEditor.tsx:72`; `screens/FlowEditor.tsx:1138-1148` | P1-9 |
| Inconsistent patterns | Dates here are formatted by a local helper, one of several duplicated across the console. | `screens/ScheduleForm.tsx:53` | P4-6 |
| Missing states | After Save the sheet closes with a toast that names "Changes" in text but offers no link. | `screens/ScheduleForm.tsx:290` | P2-8, P1-5 |
| Missing states | The Triggers list it returns to is reloaded but shows deployed triggers only, so the new schedule is not visible. | `screens/Operate.tsx:197-198`; visibility Inferred | P1-9, P2-5 |
| Missing states | "Turned on", paused, draft and deployed are four independent states with no single summary. | `screens/ScheduleForm.tsx:235-241` | P2-5 |
| Keyboard limitations | There is no ⌘↵ to save from the sheet. | `screens/ScheduleForm.tsx:306-316` | P3-1 |
| Responsive | `timeZones()` rebuilds about 400 options on every render, which will be felt on slower devices. | `screens/ScheduleForm.tsx:183` | P1-9 |

### SH-INPUT · Input dialog and schema form — 75/100 (good but visibly improvable)

Opened by "Start flow" (`screens/Flows.tsx:394`), script "Run" (`screens/Execution.tsx:319`) and the palette; the form is also embedded in Try it, the flow test panel and the schedule sheet · `InputDialog.tsx:23` (`InputDialog`), `:59` (`InputForm`), `packages/ui/src/SchemaForm.tsx:707` · density class: standard; fits.

**User objective.** Give a script or flow its input as a form, with the option of raw JSON, and get refusals on the field they concern.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 4.0 | 3.5 | 3.5 | 4.0 | 4.0 | 3.0 | 4.0 | 4.0 | 3.5 | **75** |

**What the eye sees first.** Verified from classes: the dialog title ("Run {script}" or "Start {path}"), the Fields / JSON toggle (`packages/ui/src/SchemaForm.tsx:806-817`), the fields, and a right-aligned submit (`:851,860-862`). This matches the user's priority.

**Strongest existing decisions (keep).**
- One form engine everywhere: run, start flow, try it, flow test and schedule input (`InputDialog.tsx:78`; `screens/Authoring.tsx:592`; `screens/FlowTestPanel.tsx:74`; `screens/ScheduleForm.tsx:217`; `screens/Flows.tsx:399`). Earlier finding X5 is fixed.
- Fields ⇄ JSON round-trip that keeps the value (`packages/ui/src/SchemaForm.tsx:749-764`).
- Parts that cannot be drawn fall back to JSON for that part only (`:553,638-678`).
- Client check with focus moved to the first failing field (`:779-785`), and server refusals placed by JSON pointer (`InputDialog.tsx:10-17,89-93`).
- Segmented control for up to four required choices (`:358-378`), discriminated unions as a select plus sub-form (`:487-547`), unknown properties preserved (`:157`), nullable as an explicit "No {label}" checkbox (`:324-341`).
- Up / Down buttons rather than drag for list items (`:597-612`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | List rows carry three text buttons each ("Up", "Down", "Remove"), which dominate lists of simple strings. | `packages/ui/src/SchemaForm.tsx:597-620` | P4-3, P2-7 |
| Alignment | The form is capped at `max-w-xl` with right-aligned buttons, which puts submit at the far right of a 576 px form but in the left third of a wide panel. | `packages/ui/src/SchemaForm.tsx:851,860-862` | P2-7 |
| Typography | Labels, hints and errors are `text-[13px]`, and the field frame is re-implemented here instead of shared with `Fields` and `Combobox`. | `packages/ui/src/SchemaForm.tsx:327-378` | P2-1, P2-7 |
| Density | `InputDialog` is 30rem wide regardless of schema depth, so nested objects and lists are cramped. | `InputDialog.tsx:23` | P2-7 |
| Interaction friction | JSON mode is a plain 10-row textarea with no highlighting or bracket help, although the console ships Monaco's JSON worker. | `packages/ui/src/SchemaForm.tsx:830-848`; `editor/monaco.ts:8` | P1-4, P2-7 |
| Interaction friction | Inputs are not remembered per script, and there is no "use the input of run X". | `InputDialog.tsx:59-93` | P1-3 |
| Inconsistent patterns | Optional choice selects add an empty-labelled option. | `packages/ui/src/SchemaForm.tsx:381` | P2-7 |
| Inconsistent patterns | Form-level errors appear above the form here, above the buttons in `CreateDialog` and as toasts elsewhere. | `InputDialog.tsx:77`; `ListScreen.tsx:197` | P2-7 |
| Accessibility | Field errors are `role="alert"` paragraphs that are not linked to the control by `aria-describedby` and replace the hint (05: FM1); required fields show no marker (05: FM2). | `packages/ui/src/SchemaForm.tsx:371,478,575`; `packages/ui/src/Fields.tsx:15-29` | P2-7 |
| Accessibility | Input borders are 1.41:1 against the surface, and the dialog has no close control beyond Cancel. | `packages/ui/src/Fields.tsx:6`; `packages/ui/src/Dialog.tsx:27-48` | P0-2 |
| Missing states | Validation runs on submit only; nothing validates on blur. | `packages/ui/src/SchemaForm.tsx:782,862` | P2-7 |
| Keyboard limitations | There is no ⌘↵ to submit from the JSON textarea. | Inferred: a textarea does not submit a form on Enter (`packages/ui/src/SchemaForm.tsx:830-848`) | P3-1 |
| Simplification | Icon buttons with labels for list-row actions, and a dialog width that follows schema depth. | Judgment | P4-3, P2-7 |

### SH-OFFER · Offer to agent — 70/100 (good but visibly improvable)

Dialog opened from the flow view (`screens/Flows.tsx:386`), the script inspector (`screens/Execution.tsx:255`) and the script editor header (`screens/Authoring.tsx:635`) · `screens/OfferToAgent.tsx:26` (`OfferToAgent`), `:207` (`OfferButton`) · density class: low; fits, because it is a short dialog.

**User objective.** Let a service account's agent call one script or flow, and understand exactly what that grants.

| Clarity (12) | IA (10) | Interaction (12) | Data (10) | Feedback (12) | Recovery (10) | Keyboard (10) | A11y (10) | DS (7) | Craft (7) | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.0 | 3.5 | 3.5 | 3.5 | 4.0 | 3.0 | 3.0 | 3.5 | 3.5 | 3.5 | **70** |

**What the eye sees first.** Verified from classes: the dialog title, the service-account choice and the plain statement of what is granted, "and nothing else" (`screens/OfferToAgent.tsx:175-179`). This matches the user's priority, which is the blast radius.

**Strongest existing decisions (keep).**
- The plain statement of blast radius (`screens/OfferToAgent.tsx:175-179`).
- "Already offered → Continue" (`:191-200`).
- The done state with the agent's address and a copy button (`:98-110`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | A default-weight "Offer to an agent…" button sits beside the primary action in three places; a rare governance action is given first-row placement. | `screens/Flows.tsx:386`; `screens/Execution.tsx:255`; `screens/Authoring.tsx:635` | P4-1, P2-3 |
| Interaction friction | With no service accounts the dialog sends the user away through a link, with no return path and no inline create. | `screens/OfferToAgent.tsx:130-143` | P2-11 |
| Discoverability | The button is absent for drafts with no explanation where it would be. | `screens/Authoring.tsx:634` | P2-13 |
| Inconsistent patterns | Tenant and workspace ids are parsed out of the API root by position, which will break if the address shape changes. | `screens/OfferToAgent.tsx:219` | P2-12 |
| Missing states | A failed load of existing bindings is not treated as a failure, so it silently reads as "not offered yet". | `screens/OfferToAgent.tsx:94` | P0-6, P2-4 |
| Keyboard limitations | None beyond the shared dialog gaps (no close control other than Cancel). | `packages/ui/src/Dialog.tsx:27-48` | P2-7 |
| Simplification | Move the entry to an overflow menu on the object's header and keep the dialog as it is. | Judgment | P2-3 |

## Overview, Operate, Data, Apps and Configure: notes for these sections

Paths are relative to `apps/console/src` unless they start with `packages/` or `apps/`. Evidence in the findings tables is **Verified** (read at HEAD `e737382`) unless a cell says **Observed (mocked API)**, **Inferred** or **Judgment**. Row heights are computed from the utility classes unless marked Observed. In the score tables the column heads abbreviate the rubric: TC task clarity and hierarchy (12), IA information architecture (10), IE interaction efficiency (12), DR data readability and density (10), FB feedback and system state (12), ER error recovery (10), KB keyboard and expert efficiency (10), A11y accessibility (10), DS design-system consistency (7), VC visual craft and polish (7). The total is the sum of sub-score ÷ 5 × weight. "Fix" cells name roadmap IDs from `09-prioritized-uiux-roadmap.md`; "screen-local" means the change belongs to this screen only and rides along with the named ID.

## Workspace overview

### WS-OVERVIEW · Workspace overview — 72/100 (good but visibly improvable)

`/t/:t/workspaces/:w/overview` · `Overview` `screens/Overview.tsx:193` (resolved at `screens/Tenant.tsx:424`) · density: standard; fits.

**User objective.** A workspace owner or operator starting a session wants to know whether the workspace is healthy and what to do next.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 4 | 3.5 | 3.5 | 3.5 | 3 | 2.5 | 4 | 4.5 | 4 | **72** |

**What the eye sees first.** Observed (mocked API): the workspace name at 26 px semibold (`kit/layout.tsx:47`), then the first coloured 28 px tile in the "Needs attention" list (`kit/layout.tsx:250`), then the 24-hour chart with failures in red, the triggers list and the release path. This matches the user's priority (problems first). The 24-hour figures are 18 px mono, all in ink (`screens/Overview.tsx:109-114`): the failed count is not red, so the red bar segments of the chart carry the failure signal instead of the number.

**Strongest existing decisions (keep).**
- The attention list is built only from facts the API reports and each row has exactly one action (`screens/Overview.tsx:209-324`).
- The failed-runs link carries `?status=failed` into the runs list (`screens/Overview.tsx:96, 222`).
- The release strip draws the dev → production path with the `Junction` and `Wire` motifs (`screens/Overview.tsx:404-431`).
- The chart has a screen-reader-only data table with a caption (`screens/Overview.tsx:166-186`).
- Production is always marked in amber.

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The header action "Open runs" is a default button that duplicates the nav entry and the "All runs" link in the same view. | `screens/Overview.tsx:333, 381` | P4-1 |
| Visual hierarchy | Attention rows all carry equal weight; "failed runs" is first only by code order, not by size or emphasis. | `screens/Overview.tsx:209-324` | P4-1 (screen-local) |
| Typography | The release strip uses a literal `text-[13px]` instead of a type role. | `screens/Overview.tsx:404` | P2-1, P2-12 |
| Typography | The chart prints durations as "1.2s" with no space while every other screen prints "1.2 s". | `screens/Overview.tsx:78-80` | P4-6 |
| Interaction friction | No failed run is listed on the overview; reaching one always costs a hop through the runs list. | `screens/Overview.tsx:222` | P1-3 (screen-local: list the 3–5 newest failures) |
| Interaction friction | Chart bars are `aria-hidden`, have a hover-only tooltip and cannot be clicked to open that hour in the runs list. | `screens/Overview.tsx:120-151` | P2-6, P1-1 |
| Interaction friction | The "In progress" and "Succeeded" figures are not links, although the failed figure is. | `screens/Overview.tsx:92-98` | P1-1 |
| Interaction friction | Trigger rows are neither links nor focusable; only "All triggers" is. | `screens/Overview.tsx:470-497` | P1-10 |
| Discoverability | The triggers list is silently capped at 8 with no "+N more". | `screens/Overview.tsx:467` | P2-4 (screen-local) |
| Discoverability | "Decide" jumps to the tenant approvals queue, unfiltered by workspace, and switches the rail area (finding IA6 of `docs/evolution/04-ux-audit.md`, still open). | `screens/Overview.tsx:259` | P2-6, P1-10 |
| Discoverability | A production workspace reads "This workspace promotes nowhere." and does not name the dev workspace it is promoted from (earlier finding D3, still open). | `screens/Overview.tsx:439` | P1-3 |
| Inconsistent patterns | An enabled non-schedule trigger is labelled "Waiting", the same word the run-state map uses for a paused run. | `screens/Overview.tsx:494` | P2-5 |
| Inconsistent patterns | "Paused" is drawn with the amber production `Tag`, which elsewhere means "this is production". | `screens/Overview.tsx:344` | P2-5, P4-5 |
| Accessibility | Succeeded and failed bar segments differ by green and red only, and the legend is colour swatches; failed is always the upper segment, a weak positional cue. | `screens/Overview.tsx:135-146, 160-163` | P0-2 (screen-local) |
| Accessibility | The screen-reader table's `<th>` cells have no `scope`. | `screens/Overview.tsx:172-174` | P2-2 |
| Missing states | The 24-hour statistics have no loading and no error state; the section simply does not render. | `screens/Overview.tsx:377` | P2-4 |
| Missing states | Summary error, attention "Checking…", all-clear and triggers loading / empty / error exist, which shows the pattern is known but unevenly applied. | `screens/Overview.tsx:355, 363, 365, 456-464` | P2-4 |
| Missing states | A summary response without `failedRuns` throws in the shell and blanks the console. | Observed (mocked API): `Shell.tsx:132, 649` | P0-1 |
| Keyboard limitations | Nothing exists beyond tab order; the per-hour tooltip (`hidden group-hover:block`) cannot be reached by a sighted keyboard user. | `screens/Overview.tsx:149` | P3-1 |
| Responsive | No finding: the grid collapses at `xl`. | `screens/Overview.tsx:357` | — |

## Operate: runs and observability

### WS-RUNS · Runs list and run inspector — 63.5/100 (functional / inconsistent)

`/t/:t/workspaces/:w/runs` (query: `status`, `kind`, `when`, `q`, `tag`, `run`) · `RunsWorkbench` `screens/Runs.tsx:90` (resolved at `screens/Tenant.tsx:567`); inspector `ScriptRunPanel` `screens/Runs.tsx:480` and `FlowRunSummary` `screens/Runs.tsx:450` · density: standard (57–81 px rows, about 10 rows in a 900 px viewport); does not fit an executions list, which should be compact (32–36 px, one line).

**User objective.** An operator or on-call developer wants to find a run and see why it failed.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 4 | 3 | 3 | 4 | 3 | 1.5 | 2.5 | 3 | 3.5 | **63.5** |

**What the eye sees first.** Observed (mocked API) at 1440 px: the "Runs" heading at 26 px (`screens/Runs.tsx:205`), a full sentence of description, a row of labelled Search / Kind / When fields and a row of filter chips. The first data row starts at y = 282 px and about 10 rows are visible. Inside a row the eye lands on the coloured state pill, then the mono path; failed rows add a red error line. Row-level priority is right; page-level chrome is too heavy for an operations list. At 2200 px the "What" column is about 1240 px wide and mostly empty, and at 390 px there are 480 px of title, description, live label and stacked filters before the first row.

**Strongest existing decisions (keep).**
- Every filter and the selection are in the URL (`screens/Runs.tsx:98-111`), and the legacy `?status=cancelled` is still accepted (`:100`).
- Chips carry counts from the server's `stateCounts` (`screens/Runs.tsx:159, 260-265`).
- The error summary is in the row (`screens/Runs.tsx:407-410`); clicking a tag filters by it (`:422-428`).
- A row click opens a peek, the path link opens the full page (`screens/Runs.tsx:401`).
- Keyset "Load more", retention stated in the header (`screens/Runs.tsx:209-211`), and "Cancel queued runs" as a backlog escape (`:267`).
- The inspector opens on Logs (`screens/Runs.tsx:579`) and offers copy ID and copy-as-curl (`:524, 665`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 57 px (`py-2.5` + 18.2 px path line + 17.5 px second line + border), about 81 px with tags (`screens/Runs.tsx:397-435`, `kit/status.tsx:119`); Observed (mocked API): 57 px and 82 px. Header about 34 px. Earlier finding D1 is not fixed: the second line earns its place only on failed rows and otherwise repeats "Script · attempt 1 of 3" (`:412-417`). |
| Columns | Status (`w-32`, `md:w-40`) · What (flex) · Started by (`w-44`, from `lg`) · Started (`w-28`) · Took (`w-24`, from `sm`, right, mono) (`screens/Runs.tsx:319-325`). Missing: run ID, version, trigger name (only the type word, `:438`), attempt as its own datum, worker or pool, queue wait. "Started" shows `createdAt`, the time received (`:441`). "Took" is "—" for running runs (`screens/Execution.tsx:58-59`). |
| Sort | None; newest first only, no sortable headers. |
| Filter | `status` (all / failed / running / waiting / queued / succeeded / canceled), `kind`, `when` (1 h / 24 h / 7 d / all), `tag`; written with `replace: true` so filter changes add no history entries (`router.tsx:49`). Not offered: custom date range (the API has `from` / `to`), per-script or per-flow `target` (the API has it, `apps/control-plane/src/routes/operations.ts:196`; the console never sends it, `screens/Runs.tsx:132-137`), trigger type, version, duration, several tags, several statuses. The "Waiting" chip merges waiting for approval and waiting for time (`:63`). |
| Search | One field with a 300 ms debounce (`screens/Runs.tsx:118-123`); the server matches path prefix, exact ID, exact tag and error substring (`apps/control-plane/src/routes/operations.ts:199-203`). The placeholder says so (`:227`) but nothing explains prefix versus contains; no `/` shortcut. |
| Paging / virtualisation | `limit=100`, cursor "Load more" appends pages as extra components (`screens/Runs.tsx:132, 330-343`); no virtualisation, no total and no "showing N of M". Loaded pages reset on any filter change and on leaving the screen (`:142-145`), so Back from a run page loses scroll position and extra pages. |
| Selection | Single (`?run=`), by pointer only. |
| Batch actions | None for a selection. "Cancel queued runs" cancels every queued run in the workspace regardless of the current filter (`screens/Runs.tsx:165-177`) yet sits beside the filter chips, where it reads as scoped to them. |
| Saved views | None. |
| Column customisation | None. |
| Copy | Nothing in the row (the run ID is not shown); the inspector has copy ID and copy-as-curl (`screens/Runs.tsx:524, 665`). |
| Row actions | None: no hover actions, no context menu, no Re-run or Cancel in the row. |
| Keyboard | The `<tr>` has `onClick` but no `tabIndex` or key handler (`screens/Runs.tsx:392-396`); Tab reaches only the path link and tag buttons, so the inspector cannot be opened by keyboard. No row movement, no Esc for the docked inspector, no shortcut for search or filters. |
| Truncation | The path is `sm:truncate` with no `title` (`screens/Runs.tsx:401-406`) and `break-all` on phones (Observed: "billing/record-p / ayment"); the error summary truncates with a `title` (`:408`), which keyboard and touch users cannot reach. |
| Responsive | Columns drop at `lg` and `sm`; the inspector becomes a sheet below 1280 px (`kit/layout.tsx:24, 103`); the status column is still 128 px on a phone (earlier finding D7, partly open). |
| Loading / empty / error | "Loading…" text (`screens/Runs.tsx:309`); an empty sentence that tells filtered from none (`:311-313`) but offers no "clear filters"; error `Notice` (`:304-307`) and a per-page error row (`:366-373`). `useLoad` keeps previous data (`api.ts:149`), so a filter change shows the old rows with no busy sign. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | Title, description, three labelled fields and a chip row put the first row about 190 px below the header (computed) and 282 px from the top of the window. | `screens/Runs.tsx:201-318`; Observed (mocked API) | P4-1, P1-1 |
| Spacing | The workbench gutter is `md:px-6` while pages use `md:px-8`, so the title shifts 8 px between Runs and a page such as Connections. | `screens/Runs.tsx:202`; Observed (mocked API): content at x = 312 versus x = 320 | P2-1, P2-3 |
| Alignment | The toolbar mixes a 36 px `TextField` with a label, 28 px `FilterChips` and 32 px native selects, which cannot share a baseline. | `screens/Runs.tsx:219-250`; Observed (mocked API) | P2-1, P4-1 |
| Alignment | "Waiting for approval" overflows the Status column and is overdrawn by the path ("Waiting for approvavisits/after-visit"). | Observed (mocked API) at 1440 and 2200 px; `screens/Runs.tsx:319` | P1-1 |
| Typography | "Took" renders "3.0 s" with a wide gap before the unit; durations are mono in the column but sans in the pill's detail. | Observed (mocked API); `screens/Runs.tsx:447, 502`, `kit/status.tsx:81` | P4-6 |
| Density | Two-line rows at 57–81 px show about 10 runs per screen; the second line is useful only when it holds an error. | `screens/Runs.tsx:397-435` | P1-1 |
| Interaction friction | The inspector has no Re-run; the commonest action after reading a failure needs the full page. | `screens/Runs.tsx:480-696` | P1-1, P3-3 |
| Interaction friction | The flow-run inspector shows no steps, no failed-step name and no retry, only an error notice and "Open full view". | `screens/Runs.tsx:450-477` | P1-2 |
| Interaction friction | "Uses" rows in the inspector are plain text, while the same rows on the run page are links. | `screens/Runs.tsx:673-684`, `screens/RunPage.tsx:324` | P1-10 |
| Interaction friction | Coming Back from a run page drops loaded pages and scroll position. | `screens/Runs.tsx:142-145` | P2-6, P1-1 |
| Discoverability | Runs cannot be filtered by one script, flow, trigger or version, so "all runs of this" has no address; the only workaround is a path prefix in search. | `screens/Runs.tsx:132-137` | P1-1, P1-10 |
| Discoverability | The single live-update signal on the whole console is the header text "Live" or "Live · updates every 5s", shown only while a live run is among the loaded rows. | `screens/Runs.tsx:215-220`, `stream.ts:98-108` | P1-7 |
| Inconsistent patterns | The table is hand-rolled and re-implements the `CollectionView` header, toolbar and table (earlier finding V3, still open). | `screens/Runs.tsx:201-339` | P2-2 |
| Inconsistent patterns | The attempts strip shows only when there is more than one attempt in the inspector but from one attempt on the page; the inspector decides "active" from `run.status`, the page from `run.state`. | `screens/Runs.tsx:558, 491-496`, `screens/RunPage.tsx:257, 163` | P2-5 |
| Inconsistent patterns | "Not bound" is a production-toned `Tag` here and an attention `Badge` on Connections. | `screens/Runs.tsx:681`, `screens/Execution.tsx:614` | P2-5 |
| Accessibility | A row click opens the inspector but the keyboard cannot (WCAG 2.1.1). | `screens/Runs.tsx:392-396` | P0-3 |
| Accessibility | The docked inspector takes no focus on open, returns none on close and ignores Escape (WCAG 2.4.3). | `kit/layout.tsx:85-140, 156-162` | P0-3 |
| Accessibility | The table has no accessible name and its `<th>` cells no `scope`; headers are `ink-subtle` on canvas at 12.5 px (4.19:1). | `screens/Runs.tsx:316-323` | P2-2, P0-2 |
| Accessibility | The selected row is marked by `bg-selected` only, 1.03:1 against the canvas in light. | `screens/Runs.tsx:395` | P0-2, P2-2 |
| Accessibility | Tag filter buttons are about 20 px tall, under the 24 px minimum target. | `screens/Runs.tsx:421-433` | P2-1 |
| Missing states | A run whose `state` is not in the state map throws in `StatePill` and blanks the whole console; `stateOf()` exists but the list does not use it. | Observed (mocked API); `kit/status.tsx:79, 90` | P0-1 |
| Missing states | Opening `?run=<flow run id>` after a reload or from a shared link asks `/runs/:id` for a flow run and shows an error titled "Run", because script-or-flow is decided from the in-memory row; the file's own comment promises reload safety. | `screens/Runs.tsx:87-88, 291, 295-299` | P0-5 |
| Missing states | One failed poll leaves the inspector showing only the error until the user navigates away, because `useLiveRun` never clears `error`. | `screens/Execution.tsx:375-383`, `screens/Runs.tsx:493` | P0-5 |
| Missing states | The empty result for a filter offers no "clear filters" action. | `screens/Runs.tsx:311-313` | P2-4 |
| Keyboard limitations | The shortcut sheet advertises "j k — Move through a list" but no handler exists anywhere. | `kit/CommandPalette.tsx:744` | P0-6, P3-1 |
| Responsive | At 400 % zoom the fixed header and filters can leave the scrolling list a sliver, because only the list scrolls inside an `overflow-hidden` main. | `screens/Runs.tsx:200-300` (Inferred) | P4-1 |
| Responsive | At 2200 px one column stretches across the window instead of showing list and detail side by side. | Observed (mocked API) | P3-8 |
| Simplification | Fold Kind and When into the chip row, drop the description to a help affordance, and move "Cancel queued runs" into an overflow menu that states its scope. | Judgment | P4-1, P1-1 |

### WS-RUN-SCRIPT · Script run page — 68/100 (functional / inconsistent)

`/t/:t/workspaces/:w/runs/:id` (and the `flow-runs/:id` redirect, `screens/RunPage.tsx:599`) · `RunPage` → `ScriptRunPage` `screens/RunPage.tsx:25, 153` (resolved at `screens/Tenant.tsx:560`) · density: standard; fits, but the log deserves the full height.

**User objective.** A developer debugging one script run wants to know what happened, why, and what to run next.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3.5 | 3.5 | 3 | 3.5 | 2 | 3.5 | 4 | 3.5 | **68** |

**What the eye sees first.** Observed (mocked API): the breadcrumb "Runs › r1", then the script path in mono at about 18–20 px (`screens/RunPage.tsx:105-109`), then the action cluster at the top right. The state ("Failed", icon and word) sits in a muted meta row at about 13 px with duration, attempt, trigger and version (`:110-115`): the most important fact on the page is one of the smallest. In the body the soft-red "Why it failed" box (`:353`) is the strongest element, which is right. The mismatch is in the header only; "Re-run" is far from the failure text, and the 224 px section panel stays open on this detail page.

**Strongest existing decisions (keep).**
- One page for either kind of run, resolved by ID (`screens/RunPage.tsx:33-64`).
- Re-run menu wording that states the version and the input (`screens/RunPage.tsx:171-178, 237-245`), with a schema form prefilled from the run's input (`:424-435`).
- A server-derived diagnosis with a route to the fix (`screens/RunPage.tsx:362-377`).
- The attempts list (`:257-276`), the alert-suppression sentence (`:342-348`) and copy-as-curl.

**Questions a run page must answer.**

| Question | Answered today? | How | Evidence |
| --- | --- | --- | --- |
| What happened? | Yes | State pill, duration and attempt in the header; attempts list in the aside. | `screens/RunPage.tsx:189-195, 257-276` |
| Still running? | Partly | The pill says "Running", Cancel is present and the log shows Follow, but there is no elapsed timer and no live / stale indicator. | `screens/RunPage.tsx:211, 383`, `screens/Execution.tsx:59` |
| What failed? | Yes | "Why it failed" box with `error.message`; Error tab with the raw `{error}` JSON. | `screens/RunPage.tsx:352-361, 402-413` |
| Where? | No | No file or line, no stack rendering, no jump to the failing log line; only which attempt failed. | `screens/RunPage.tsx:357-359` |
| Why? | Partly | Server diagnosis (`cause` / `next`) with "Open {section}"; unbound connections flagged under Uses. | `screens/RunPage.tsx:362-377, 330-332` |
| Input? | Yes | Input tab, the default. | `screens/RunPage.tsx:391-398` |
| Output? | Yes | Output tab through `ResultView`; not the default even on success. | `screens/RunPage.tsx:388-392, 405-406` |
| How long did each stage take? | Partly | Received / Started / Finished stamps; "took" is started → finished; the queue wait is not computed. | `screens/RunPage.tsx:279-285` |
| What can I retry? | Yes | Same input on the version it ran, other input through a form, or the version deployed now; curl. No "re-run attempt N". | `screens/RunPage.tsx:237-245` |
| What source produced it? | No | The path opens the current editor and "version N" opens the generic deployments list; the code at version N cannot be viewed. | `screens/RunPage.tsx:188, 113` |
| What changed since a success? | No | No last-success link, no version diff, no input diff. | — |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The run state is a 14 px pill in a 12.5 px muted meta row under an 18 px path. | `screens/RunPage.tsx:105-115`; Observed (mocked API) | P2-3, P1-7 |
| Visual hierarchy | The heading is a link drawn as plain ink with no affordance. | `screens/RunPage.tsx:106` | P2-3 |
| Alignment | The action row mixes a 28 px small button, a 32 px menu trigger and a 24 px copy icon. | `screens/RunPage.tsx:235`, `packages/ui/src/Button.tsx:32`, `kit/copy.tsx:26` | P2-1 |
| Alignment | Received / Started / Finished timestamps wrap onto two lines each in the 256 px aside. | Observed (mocked API); `screens/RunPage.tsx:255, 277-285` | P4-6 |
| Typography | The heading uses a literal `text-lg` with no weight instead of the `title` role. | `screens/RunPage.tsx:105` | P2-1, P2-12 |
| Typography | `took()` prints "3725.0 s" for a long run while the timeline prints "1 h 2 m". | `screens/Execution.tsx:61`, `packages/ui/src/Timeline.tsx:35-41` | P4-6 |
| Density | The log is boxed at 28 rem on a full page with no expand; input and output sit below it, two scroll regions away on a long log. | `packages/ui/src/LogViewer.tsx:46, 154` | P1-6, P3-5 |
| Interaction friction | The Input / Output tabs are not in the URL and open on Input even for a succeeded run, where Output is the point. | `screens/RunPage.tsx:388-392` | P2-6 |
| Interaction friction | The queue wait must be worked out by eye from three absolute timestamps. | `screens/RunPage.tsx:279-285` | P1-7 |
| Interaction friction | The version link goes to the generic deployments list and the script link to whatever is current. | `screens/RunPage.tsx:113, 188` | P1-3 |
| Interaction friction | "Uses" links go to the connections list, not the connection. | `screens/RunPage.tsx:326` | P1-10 |
| Interaction friction | A run started by a flow prints "A flow" as plain text although the engine stores `flowRunId` in the trigger detail; event-started runs do not link to the event. | `screens/RunPage.tsx:140-151`, `apps/control-plane/src/kernel/flows/engine.ts:789-793` | P1-3, P1-10 |
| Discoverability | "Re-run of a run" and "Run again N times" name no state or time and link only to the first re-run. | `screens/RunPage.tsx:201-206` | P1-3 |
| Discoverability | There is no previous / next run of the same script and no "last successful run". | `screens/RunPage.tsx:153-440` | P3-7 |
| Inconsistent patterns | Breadcrumb "Runs › id" here, an "All scripts" link in the script editor and "Flows /" in the flow editor: three back patterns on neighbouring screens. | Observed (mocked API); `screens/RunPage.tsx:94-102` | P2-3 |
| Accessibility | The state pill re-renders on stream events with no live region, so a screen-reader user is not told the run finished. | `screens/RunPage.tsx:111`, `kit/status.tsx:67-84` | P0-7 |
| Accessibility | Tag links are about 20 px tall. | `screens/RunPage.tsx:118-126` | P2-1 |
| Missing states | A finished run with more than 500 log lines shows only the first 500 while the stream is connected, and the viewer says "500 lines". | `apps/control-plane/src/routes/execution.ts:1328, 1368-1371`, `screens/Execution.tsx:371-373, 399-409`, `packages/ui/src/LogViewer.tsx:139-141` | P0-5 |
| Missing states | Any fetch error replaces the whole page, and the error is never cleared after a later success. | `screens/RunPage.tsx:161`, `screens/Execution.tsx:375-383` | P0-5 |
| Missing states | A running run has no elapsed time: `took()` is empty until it finishes and the pill is a still icon. | `screens/Execution.tsx:59`, `kit/status.tsx:42-61` | P1-7, P4-4 |
| Missing states | No stream-health sign, "last updated" or manual refresh; `useLoad` does not refetch on focus or reconnect. | `api.ts:46-50`, `stream.ts:98-108` | P1-7 |
| Missing states | The error is a message only: no stack presentation, exit code, timeout cause or resource usage. | `screens/RunPage.tsx:357-359, 408-413` | P1-3 (screen-local) |
| Keyboard limitations | No shortcut for re-run, cancel, focus log or previous / next run. | `screens/RunPage.tsx:153-440` | P3-1, P3-2 |
| Responsive | The 224 px section panel stays open on a detail page, taking width from the log. | Observed (mocked API) | P3-5, P3-8 |
| Simplification | Put state, elapsed time and Re-run together beside the failure; lead with Output on success. | Judgment | P1-7, P2-3 |

### WS-RUN-FLOW · Flow run page — 62.5/100 (functional / inconsistent)

`/t/:t/workspaces/:w/runs/:id` · `FlowRunView` `screens/Flows.tsx:615` with `FlowRunHeader` `screens/RunPage.tsx:441` · density: standard; fits (timeline rows are about 32 px, `h-5` + `py-1.5`).

**User objective.** A developer or operator wants to see which step of a flow run failed or is waiting, why, and what can be retried.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 3 | 3.5 | 3.5 | 3.5 | 2.5 | 3.5 | 2.5 | 3 | **62.5** |

**What the eye sees first.** Observed (mocked API): the same header as a script run, then on failure a full-width red notice "The flow failed. The supplier refused." with no step name (`screens/Flows.tsx:679-683`), then the Timeline / Graph tabs and, at the foot, "Choose a step to see what it produced." (`:830`). No step is selected on arrival, so the first thing the eye is given is a message and the thing the user needs (the failed step's error, input and logs) is one search and one click away. In the fixture the failed step's bar was drawn grey rather than red; the fixture had no `pickedUpAt`, so treat that colour as unverified.

**Strongest existing decisions (keep).**
- The retry-plan confirm names what runs again, what is kept and which approvals are kept (`screens/RunPage.tsx:468-493`).
- Kept steps are marked and linked to the run they came from (`screens/Flows.tsx:535-545, 789-803`).
- The timeline splits each step into wait / run / hold segments with a flow-specific legend (`screens/Flows.tsx:557-566, 720-724`).
- The graph overlay is coloured by step state with reached edges and is fitted by default (`FlowGraph.tsx:99-128, 191-194, 234-247`).
- Approvals are decided in place (`screens/Flows.tsx:684-704`) and step logs are inline (`:806`).

**Questions a run page must answer.**

| Question | Answered today? | How | Evidence |
| --- | --- | --- | --- |
| What happened? | Yes | State pill and elapsed time in the header; timeline and graph. | `screens/RunPage.tsx:513-514`, `screens/Flows.tsx:705-746` |
| Still running? | Partly | Pill, "Cancel flow run", in-progress bars ending in "…"; no stream-health sign, and `now` is captured at render so bars grow only on re-render. | `screens/RunPage.tsx:530`, `packages/ui/src/Timeline.tsx:108` |
| What failed? | Partly | Banner "The flow failed. message", a red bar and a red node; the step is not named unless the server message happens to name it (Inferred). | `screens/Flows.tsx:679` |
| Where? | Partly | Red timeline row and red node stroke, found by eye; not selected automatically. | `screens/Flows.tsx:556`, `kit/status.tsx:97` |
| Why? | Partly | The step's error text and a "carried on down its error path" note; no diagnosis at flow level. | `screens/Flows.tsx:778-785` |
| Input? | No | The flow input appears only inside "Again, with other input…" and the curl copy; step inputs are never shown. | `screens/RunPage.tsx:574, 581-592`, `screens/Flows.tsx:495-512` |
| Output? | Partly | Per succeeded step only; the flow's own output is not shown. | `screens/Flows.tsx:825` |
| How long did each stage take? | Yes | Per-step wait / run / hold segments and "Waited" / "Took" facts; flow total only in seconds. | `screens/Flows.tsx:557-566, 760-773`, `screens/RunPage.tsx:460-462, 514` |
| What can I retry? | Yes | Retry from the failed step (with a plan), again from the start, with other input, on the current version; no retry from an arbitrary step. | `screens/RunPage.tsx:559-570` |
| What source produced it? | No | The path opens the current flow page and the graph draws the current definition, not the one at `run.bundleVersion`. | `screens/RunPage.tsx:512`, `screens/Flows.tsx:629` |
| What changed since a success? | No | Not answered. | — |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The failure banner neither names nor links the failed step, and no step is selected on open. | `screens/Flows.tsx:628, 679-683`; Observed (mocked API) | P1-2 |
| Visual hierarchy | The step panel renders below the tabs; after clicking a node on a tall graph it is off-screen with no scroll-into-view. | `screens/Flows.tsx:748` | P1-2, P3-5 |
| Spacing | The step section nests four boxes: section panel → `Facts` → `Notice` → `ResultView`. | `screens/Flows.tsx:749, 757, 790, 826` | P4-2 |
| Typography | The step section uses `text-base font-semibold`, the copied `code()` helper at 13 px, `Facts` with literal 12.5 / 13 px sizes and locale `when()` dates, while the script page uses `KeyValues`, section labels and `stamp()`: two dialects on one route. | `screens/Flows.tsx:750-777`, `ListScreen.tsx:361` | P2-1, P4-6 |
| Typography | The header elapsed time is `createdAt → finishedAt` in seconds only, a different definition from the script page's `startedAt → finishedAt`. | `screens/RunPage.tsx:460-462, 514` | P4-6 |
| Interaction friction | The selected step is `useState`, not in the URL: a failed step cannot be linked or shared, and a reload loses it. | `screens/Flows.tsx:628` | P1-2, P2-6 |
| Interaction friction | Flow input and output are never shown, step input is never shown, and output appears only for succeeded steps. | `screens/Flows.tsx:495-512, 825`, `screens/RunPage.tsx:574, 587` | P1-2 |
| Interaction friction | The step error is a bare red paragraph with no "Why it failed" block, diagnosis or stack; the diagnosis is one more page away behind "Open this step's run". | `screens/Flows.tsx:778-785, 807` | P1-2 |
| Interaction friction | The step's "Run ID" is plain text, neither a link nor copyable. | `screens/Flows.tsx:774` | P1-10 |
| Interaction friction | A step has no link to its script or to its node in the flow editor. | `screens/Flows.tsx:748-828` | P1-3 |
| Interaction friction | Loop and map steps show only "N of M items done." although the items are loaded. | `screens/Flows.tsx:639, 819-824` | P1-2 |
| Interaction friction | There is no "retry from this step" on a chosen step, only from the first failed one. | `screens/RunPage.tsx:559-570` | P1-2 |
| Discoverability | No flow-level facts panel (received, finished, who started it, worker); `startedBy` is loaded but never shown. | `screens/Flows.tsx:523` | P1-2 |
| Discoverability | A child flow run has no link back to its parent. | `screens/Flows.tsx:804-818` | P1-3 |
| Inconsistent patterns | The approval detail is raw `JSON.stringify` in a notice (earlier finding D6, still open), and approver and timeout are not shown here although the queue shows them. | `screens/Flows.tsx:700-702` | P1-2 |
| Accessibility | Timeline bars expose their kind only by colour to assistive technology, and the "wait" bar is drawn at 50 % opacity (2.11:1 in light). | `packages/ui/src/Timeline.tsx:98` | P0-2, P1-2 |
| Accessibility | In the graph, node state is the stroke colour plus a 5 px dot; the state word is only in `aria-label` and an SVG `<title>`, and edges have no accessible name. | `FlowGraph.tsx:196-229, 279-281, 294-298` | P0-8, P2-5 |
| Accessibility | Graph nodes move by pointer drag only; Enter and Space only select. | `FlowGraph.tsx:136-156, 252-256` | P0-8 |
| Accessibility | Step state changes arrive with no live region. | `screens/RunPage.tsx:111` | P0-7 |
| Missing states | Polling stops for good after one failed read while the stream is down. | `screens/Flows.tsx:596-602` | P0-5 |
| Missing states | The graph uses the current flow definition, so after a redeploy an old run is drawn on a different graph and steps without a status are dimmed. | `screens/Flows.tsx:629`, `FlowGraph.tsx:274` (Inferred risk) | P1-2 |
| Missing states | A "kept" row has zero width and reads "0 ms"; the label column is 160 px, truncated with no `title`. | `screens/Flows.tsx:535-544`, `packages/ui/src/Timeline.tsx:114` | P1-2, P4-6 |
| Keyboard limitations | Steps are reachable only by Tab; there is no next / previous step, no "jump to failed step". | `packages/ui/src/Timeline.tsx`, `FlowGraph.tsx:259` | P3-1 |
| Responsive | At wide widths the timeline and the step detail stay stacked instead of side by side. | `screens/Flows.tsx:705-830` (Judgment) | P3-8 |
| Simplification | Open on the first failed or waiting step with error, diagnosis, input, output and logs in one panel beside the timeline. | Judgment | P1-2 |

### UI-RUN-VIEWERS · Shared viewers: LogViewer, Timeline, ResultView, JsonView — 55 / 68 / 72 / 62 (not sub-scored)

Used by the run inspector, both run pages, the script editor's test panel, approvals and the approval link page · `packages/ui/src/LogViewer.tsx`, `Timeline.tsx`, `ResultView.tsx`, `JsonView.tsx` · density: compact (12.5–13 px mono rows); fits, except that the log is confined to a fixed 28 rem box.

**User objective.** Read what a run printed, how long each part took and what it returned, and take a value away.

The notes scored these four as tools (out of 100) without rubric sub-scores, so no score table is given: LogViewer about 55, Timeline about 68, ResultView about 72, JsonView about 62.

**What the eye sees first.** Observed (mocked API) for LogViewer: a toolbar of search, level select, Wrap, Download and "14 lines", then level-coloured lines with structured fields under each line. This puts evidence near the top of the run page and is the right order. The others are Verified from classes only.

**Strongest existing decisions (keep).** Shape detection in ResultView with an honest "more in the JSON" note; wait / run / hold segmentation in Timeline; level word plus colour in LogViewer; scroll regions that are keyboard-reachable and labelled (`packages/ui/src/JsonView.tsx:77-80`, `LogViewer.tsx:151-153`, `ResultView.tsx:141-144, 257-260`).

**LogViewer** (about 55).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Keep | Search over message and fields, minimum-level select, Wrap (on by default), Follow while live, Download of all lines, "x of y" count, local time to the millisecond, level word and colour. | `packages/ui/src/LogViewer.tsx:25-36, 50, 55-65, 73-84, 101-129, 138-142, 153, 163` | — |
| Interaction friction | Search filters lines out instead of highlighting matches: no next / previous match, no match count, no context around a match, no regex or case toggle. | `packages/ui/src/LogViewer.tsx:55-65` | P1-6 |
| Interaction friction | No copy line, copy visible or copy all; no line numbers; no permalink to a line. | `packages/ui/src/LogViewer.tsx:157-171` | P1-6 |
| Interaction friction | While Follow is on, every new batch forces `scrollTop`, so scrolling up to read is undone; there is no "jump to latest". | `packages/ui/src/LogViewer.tsx:68-71` | P1-6 |
| Density | Fixed 28 rem height, no fullscreen or resize; every shown line is a DOM node (no virtualisation). | `packages/ui/src/LogViewer.tsx:46, 154, 157-171` | P1-6, P3-5 |
| Data readability | Structured fields render as one muted JSON string; the per-line `attempt` the API returns is dropped, so attempts are not separated; no date or UTC toggle; no ANSI colour; unknown levels rank as info. | `packages/ui/src/LogViewer.tsx:3-11, 59, 166-168`, `apps/control-plane/src/routes/execution.ts:1336` | P1-6 |
| Inconsistent patterns | Controls use a literal `text-[13px]` / `h-7` and a bare native `<select>` rather than kit fields; the code background is `bg-sunken` while three console one-offs use the `code-bg` token. | `packages/ui/src/LogViewer.tsx:86, 101, 155` | P2-1, P2-12 |
| Accessibility | The line count is `aria-live="polite"`, so during a live run a screen reader is told the new count on every batch. | `packages/ui/src/LogViewer.tsx:138` | P0-7, P1-6 |
| Missing states | With the stream connected, only the first page of 500 lines is ever fetched for a finished run. | `screens/Execution.tsx:371-373, 399-409` | P0-5 |

**Timeline** (about 68).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Keep | Clear wait / run / hold segments, a legend limited to the kinds in use, rows that are buttons with `aria-pressed`. | `packages/ui/src/Timeline.tsx` | — |
| Data readability | Ticks are offsets only (no absolute time axis); no zoom or brush; no hover detail per segment; no nesting for loop items or child flows. | `packages/ui/src/Timeline.tsx:143-155` | P1-2 |
| Truncation | The 160 px label column truncates with no `title`. | `packages/ui/src/Timeline.tsx:114` | P4-6 |
| Accessibility | Bars and axis are `aria-hidden`; segment kinds have no text alternative ("waited 3 s, ran 1 s"); the wait bar is at 50 % opacity. | `packages/ui/src/Timeline.tsx:98` | P0-2, P1-2 |
| Typography | Durations are formatted here ("1 h 2 m") differently from `took()` elsewhere. | `packages/ui/src/Timeline.tsx:35-41` | P4-6 |

**ResultView** (about 72).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Keep | Detects table, markdown, media and JSON; caps tables at 500 × 12 and says so; remote images load on click; sticky table header. | `packages/ui/src/ResultView.tsx:131-178, 147-166, 187-190` | — |
| Interaction friction | No copy or download for a table, no column sort, no cell expand. | `packages/ui/src/ResultView.tsx:131-178` | P2-2, P4-6 |
| Accessibility | The inner table is unnamed, truncation relies on `title`, and the download chip is about 23 px tall. | `packages/ui/src/ResultView.tsx:147, 212-214` | P2-2 |

**JsonView** (about 62).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Keep | Coloured, with Copy; scroll region is focusable and labelled. | `packages/ui/src/JsonView.tsx:53-85` | — |
| Interaction friction | No collapse / expand, no search, no copy of a path; the whole value is stringified and regex-painted on every render with no large-value guard. | `packages/ui/src/JsonView.tsx:53, 85` | P1-6 (same viewer work) |
| Discoverability | Copy is `opacity-0` until hover or focus, so it is invisible on touch; it is about 23 px tall. | `packages/ui/src/JsonView.tsx:63` | P2-8, P2-1 |
| Accessibility | Strings are `text-success` on `bg-sunken` (4.31:1) and numbers `text-attention` (4.07:1) in light; success and attention colours inside a payload also read as status. | `packages/ui/src/JsonView.tsx:4-7, 57` | P0-2 |
| Inconsistent patterns | `Facts` (fixed 64 px label column, truncated values with no title, literal sizes) overlaps with `KeyValues`: two key / value components. | `packages/ui/src/Facts.tsx:22-24`, `kit/layout.tsx:330` | P2-12 |

## Operate: events, triggers, approvals, alerts

### WS-EVENTS · Events — 62.5/100 (functional / inconsistent)

`/t/:t/workspaces/:w/events` · `EventsWorkbench` `screens/Operate.tsx:423` (resolved at `screens/Tenant.tsx:495`) · density: compact-leaning single-line rows (about 40 px); fits.

**User objective.** An operator wants to confirm that an event was published and see what it started.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 2.5 | 3 | 2.5 | 2.5 | 3 | 3.5 | 4.5 | 3.5 | **62.5** |

**What the eye sees first.** Verified from classes: the heading, then a labelled text field with a "Show" button; in rows, the relative time and the mono event name. The filter form outranks the list, and the row gives no hint of what the event carried.

**Strongest existing decisions (keep).** "Nothing listens" in amber for an event with no listener (`screens/Operate.tsx:494-495`); the started-runs list with states in the inspector (`:542-555`); the publisher linked to its run (`:524-528`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 40 px, one line (`py-2.5` in `kit/CollectionView.tsx:127`). |
| Columns | When · Event (mono) · From (priority 3) · Started (priority 2) (`screens/Operate.tsx:470-488`). No payload preview or summary column. |
| Sort | None. |
| Filter | By event name only, exact match (Inferred from the `name=` parameter, `screens/Operate.tsx:427`), applied on submit with a "Show" button; no time window. |
| Search | None beyond the name field. |
| Paging / virtualisation | Capped at 100 with no paging and no notice that older events exist (`screens/Operate.tsx:427`). |
| Selection | Single; opens the inspector (`screens/Operate.tsx:512`); not in the URL (`:424-429`). |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | The Event ID in the inspector is not copyable (`screens/Operate.tsx:536`). |
| Row actions | None; no replay or republish. |
| Keyboard | Row is focusable; Enter / Space selects (`kit/CollectionView.tsx:110-121`); no row movement. |
| Truncation | None needed at current widths. |
| Responsive | Priority columns hide at `sm` / `lg` (`kit/CollectionView.tsx:16`). |
| Loading / empty / error | "Loading…" text, `EmptyCanvas`, error `Notice` with no retry (`kit/CollectionView.tsx:73-81`, `screens/Operate.tsx:506`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | A labelled field and a submit button sit above the list as if filtering were the main task. | `screens/Operate.tsx:436-455` | P4-1 |
| Typography | "When" shows only a relative time; the absolute time is in the inspector eyebrow. | `screens/Operate.tsx:472, 516` | P4-6 |
| Interaction friction | The filter needs an explicit submit and an exact name, unlike the debounced search on Runs. | `screens/Operate.tsx:427, 449` | P2-2, P2-6 |
| Discoverability | Filter and selection are not in the URL, so an event cannot be linked, and a run started by an event does not link back (the run page shows only "Event <trigger>"). | `screens/Operate.tsx:424-429`, `screens/RunPage.tsx:140-151` | P1-10, P2-6 |
| Inconsistent patterns | A ternary with identical branches, and `stateOf(one.status)` that maps legacy statuses and falls back to "Note". | `screens/Operate.tsx:548, 552`, `kit/status.tsx:86` | P2-5 |
| Accessibility | `aria-selected` on a `<tr>` inside a plain table is not a supported state; the row does not say it opens details. | `kit/CollectionView.tsx:105-124` | P2-2 |
| Missing states | The 100-event cap is silent. | `screens/Operate.tsx:427` | P2-2, P2-4 |
| Keyboard limitations | No `j` / `k` or arrow movement; the docked inspector does not close on Esc. | `kit/CollectionView.tsx:115`, `kit/layout.tsx:104` | P3-1, P0-3 |
| Simplification | Replace the form with one search field in the toolbar plus a time-window chip row, as on Runs. | Judgment | P2-2 |

### WS-TRIGGERS · Triggers — 71/100 (good but visibly improvable)

`/t/:t/workspaces/:w/triggers` (`?trigger=`) · `TriggersWorkbench` `screens/Operate.tsx:65` (resolved at `screens/Tenant.tsx:569`); `NewScheduleSheet` `:191` · density: standard (two-line rows, about 57 px); acceptable for a short list.

**User objective.** An operator wants to see what starts work in this workspace, whether each trigger is healthy, and pause or fire one.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 4 | 3.5 | 3.5 | 3 | 3 | 3 | 3.5 | 4.5 | 4 | **71** |

**What the eye sees first.** Verified from classes: the heading and the filled teal "New trigger" button (`screens/Operate.tsx:110`); in rows the mono path, then the State column. In a production workspace the first thing seen is a disabled button whose explanation is a `title` tooltip (`:99`).

**Strongest existing decisions (keep).**
- The selection is in the URL, so a run can deep-link to its trigger (`screens/Operate.tsx:80`, `screens/RunPage.tsx:145`).
- The pause reason is shown to everyone (`screens/Operate.tsx:302-308`), with the last refusal and its cause (`:309-318`) and overlap / backlog skip explanations (`:340-358`).
- "Fire now" lands on the new run (`screens/Operate.tsx:87-93`).
- Workspace-paused and production-paused banners (`screens/Operate.tsx:207-216`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 57 px, two lines. |
| Columns | Trigger (mono path) · Starts (priority 3) · State · Last fired (priority 2) (`screens/Operate.tsx:123-169`). The State column mixes pills with plain "Next in 2m" text (`:153-165`). |
| Sort | None. |
| Filter | Type chips with counts (`screens/Operate.tsx:217-225`); held in component state, not the URL (`:77`). |
| Search | None. |
| Paging / virtualisation | None; all triggers are rendered. |
| Selection | Single, in the URL (`?trigger=`). |
| Batch actions | None; no bulk pause or resume. |
| Saved views | None. |
| Column customisation | None. |
| Copy | Webhook address copy in the inspector only. |
| Row actions | None in the row; pause, resume and "Fire now" live in the inspector. |
| Keyboard | Row focusable, Enter / Space selects (`kit/CollectionView.tsx:115`); no `j` / `k`. |
| Truncation | None noted. |
| Responsive | Priority columns hide at `sm` / `lg`. |
| Loading / empty / error | "Loading…", `EmptyCanvas` (`screens/Operate.tsx:238`), error `Notice` with no retry. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | In production the first element is a disabled "New trigger" that explains itself only through `title`, unreachable by keyboard or touch. | `screens/Operate.tsx:99` | P2-13, P3-1 (Tooltip) |
| Alignment | The State column mixes state pills and plain text in one column. | `screens/Operate.tsx:153-165` | P2-5 |
| Interaction friction | Pausing takes row → inspector → button → reason prompt (3–4 interactions, one dialog) with no row action. | `screens/Operate.tsx:244, 276` | P3-3 |
| Interaction friction | No success toast and no undo after pause or resume. | `screens/Operate.tsx:259, 289` | P2-8 |
| Interaction friction | "New trigger" starts from an empty form; there is no "Add trigger" on a script or flow with the target prefilled. | `screens/Operate.tsx:103-114` | P1-9 |
| Discoverability | The inspector shows only "Open the last run"; there is no list of recent runs, no history of firings or refusals beyond the last, and the runs list cannot filter by trigger. | `screens/Operate.tsx:373` | P1-1, P1-10 |
| Discoverability | No search and no sort on a list that can grow long. | `screens/Operate.tsx:65-240` | P2-2 |
| Inconsistent patterns | "Listening" reuses the `running` pill, and "Off" reuses `cancelled`. | `screens/Operate.tsx:158, 164` | P2-5 |
| Inconsistent patterns | The webhook example is a one-off `bg-code-bg` block. | `screens/Operate.tsx:383` | P2-12 |
| Accessibility | Same row semantics as Events (`aria-selected` on `<tr>`); the docked inspector takes no focus. | `kit/CollectionView.tsx:105-124`, `kit/layout.tsx:85-140` | P0-3, P2-2 |
| Missing states | An instance-wide trigger stop is not shown here; the screen knows only `workspacePaused`. | `screens/Operate.tsx:207` (Inferred) | P1-7 |
| Keyboard limitations | No shortcut to pause, resume or fire. | `screens/Operate.tsx:244-380` | P3-1, P3-2 |

### TN-APPROVALS · Approvals queue — 68/100 (functional / inconsistent)

`/t/:t/approvals` · `ApprovalsQueue` `screens/Operate.tsx:620` (resolved at `screens/Tenant.tsx:222`) · density: standard; fits.

**User objective.** An approver wants to decide waiting approval steps quickly and with enough context to decide safely.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3.5 | 3.5 | 3 | 3 | 2.5 | 3 | 4.5 | 4 | **68** |

**What the eye sees first.** Verified from classes: the heading; then in each row the bold title and the filled primary "Approve" button (`screens/Operate.tsx:782`). This is appropriate for a decision queue.

**Strongest existing decisions (keep).** Oldest first; the `detailSummary` line that tells sibling approvals apart (`screens/Operate.tsx:587-602`); who decides and the timeout in the inspector (`:822-834`); the Decided list with comment, decider and "decided from the mail" (`:684-701`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | Two lines, about 57 px. |
| Columns | Waiting: Decision (title and summary) · Waiting · Who decides (priority 3) · actions (priority 2). Decided: Decision · Flow (priority 2) · By (priority 3) · When (`screens/Operate.tsx:684-778`). The timeout is not in the list. |
| Sort | Fixed, oldest first. |
| Filter | Waiting / Decided chips only (`screens/Operate.tsx:659-669`), held in component state (`:621`); no workspace filter although the queue is tenant-wide (workspace is a subtitle, `:755`). |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | Single (component state, `screens/Operate.tsx:629`); decided rows have no inspector. |
| Batch actions | None; no bulk decide (earlier finding X4, still open). |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | Approve (primary) and Reject in the row; both always open a prompt (`screens/Operate.tsx:635-643`). |
| Keyboard | Row focusable, Enter / Space selects; no keys for approve or reject. |
| Truncation | None noted. |
| Responsive | The action column is priority 2, so it hides on the narrowest widths and deciding then needs the inspector. |
| Loading / empty / error | "Loading…", `EmptyCanvas` (`screens/Operate.tsx:735, 797`), error `Notice` with no retry. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Interaction friction | Approve always opens a prompt, an extra dialog for the common no-comment case (3 interactions, 1 dialog). | `screens/Operate.tsx:635-643` | P2-8 (undo toast), P3-3 |
| Interaction friction | After deciding, the row disappears with no toast and no link to the run that continued. | `screens/Operate.tsx:652-653` | P2-8 |
| Interaction friction | The buttons sit inside a `<tr onClick>` and their handlers do not stop propagation, so pressing Approve also selects the row and opens the inspector behind the prompt. | `screens/Operate.tsx:782-787`, `kit/CollectionView.tsx:109` (effect Inferred) | P2-2 |
| Discoverability | The decided list links to the run only through the "When" cell. | `screens/Operate.tsx:726` | P1-10 |
| Discoverability | "Open the run's graph" is a quiet button at the bottom of the inspector, and the flow run's input is not shown beside the decision. | `screens/Operate.tsx:841` | P1-2, P1-10 |
| Inconsistent patterns | The detail is raw JSON in the inspector while the mail page renders the same detail with `ResultView`. | `screens/Operate.tsx:839`, `screens/ApproveLink.tsx:134` | P2-12 |
| Inconsistent patterns | Waiting / Decided and the selection are not in the URL. | `screens/Operate.tsx:621, 629` | P2-6 |
| Accessibility | Row semantics as for other `CollectionView` lists; the inspector takes no focus. | `kit/CollectionView.tsx:105-124`, `kit/layout.tsx:85-140` | P0-3 |
| Missing states | The timeout is visible only in the inspector, so an approval about to expire looks like any other. | `screens/Operate.tsx:822-834` | P1-7 |
| Keyboard limitations | No shortcut to approve, reject or move to the next waiting item. | `screens/Operate.tsx:620-850` | P3-1, P3-3 |

### PB-APPROVE · Approval link page — 78/100 (good but visibly improvable)

`/approve/:token` (no sign-in, no shell) · `ApproveLink` `screens/ApproveLink.tsx:33` (resolved at `App.tsx:102`) · density: low by design; fits.

**User objective.** An approver arriving from an e-mail, possibly on a phone and not signed in, wants to read what is asked and approve or reject it.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.5 | 4 | 4 | 3.5 | 4 | 3.5 | 3.5 | 4 | 4 | 4 | **78** |

**What the eye sees first.** Verified from classes: the brand row, then the title at 18 px inside a card with tenant · workspace · environment tag above it. This is the correct order.

**Strongest existing decisions (keep).** Opening the link decides nothing; the environment tag and "a test run" marker (`screens/ApproveLink.tsx:122-124`); inline validation of the reject reason (`:56-58`); terminal states with a way onward (`:85-115`); the expiry sentence (`:153-156`); an `h1` per state and one live region.

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | Reject is a filled red button beside the primary Approve, two heavy buttons of equal weight. | `screens/ApproveLink.tsx:146-151` | P2-7 (screen-local) |
| Spacing | A card holds a `ResultView` that holds a `Notice`: three nested boxes. | `screens/ApproveLink.tsx:84, 134, 144` | P4-2 |
| Typography | Dates use `toLocaleString`, unlike the console's `stamp()`. | `screens/ApproveLink.tsx:129, 155` | P4-6 |
| Interaction friction | The comment label carries the rule ("needed to reject") instead of the field becoming required when Reject is pressed. | `screens/ApproveLink.tsx:56-58` | P2-7 |
| Discoverability | The "gone" state links to `/`, not to the approvals queue. | `screens/ApproveLink.tsx:90` | P1-10 |
| Missing states | Loading is bare "Loading…" text. | `screens/ApproveLink.tsx:117` | P2-4 |
| Missing states | A production approval is decided by a single tap with no confirmation; acceptable, but it should be a deliberate choice. | `screens/ApproveLink.tsx:146-151` (Judgment) | P4-5 |

### WS-ALERTS · Alerts — 58/100 (major UX debt)

`/t/:t/workspaces/:w/alerts` · `Alerts` `screens/Alerts.tsx:32` (resolved at `screens/Tenant.tsx:583`) · density: low; the history should be a compact table.

**User objective.** A workspace admin wants failures to notify someone, and an operator wants to see which alerts were sent and whether they were delivered.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 3 | 2.5 | 3.5 | 3 | 2.5 | 3.5 | 2 | 2.5 | **58** |

**What the eye sees first.** Verified from classes: the page title, then two selects (handler script and connection). The alert history, which is what an operator wants, comes third.

**Strongest existing decisions (keep).** The test alert with worker-wait wording (`screens/Alerts.tsx:159-163`); "+N more" folding of repeats (`:216`); the notify error shown in red on the row (`:219-221`).

**Table behaviour** (the "recent alerts" history).

| Aspect | Today |
| --- | --- |
| Row height | A `<ul>` with no column structure, not a table; items are one to four stacked lines (`screens/Alerts.tsx:202-225`). |
| Columns | No columns: a line of text with a `Badge` and a relative time; no absolute time and no state of the failed run. |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | "Older alerts" loads more; no count. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | Links to the run and to the handler run. |
| Keyboard | Tab to links only. |
| Truncation | None noted. |
| Responsive | Single column capped at `max-w-2xl` (`screens/Alerts.tsx:108`). |
| Loading / empty / error | Empty and loading share one bare paragraph (`screens/Alerts.tsx:198-200`); error is a `Notice` with no retry (`:196`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | Settings come before history on a screen an operator opens to read history. | `screens/Alerts.tsx:109-195` | P2-3 (screen-local: history first) |
| Typography | Headings are `text-base font-semibold` and body text uses literal `text-[13px]` / `text-[14px]`. | `screens/Alerts.tsx:109, 134, 172, 175, 195, 218` | P2-1, P2-12 |
| Density | The history has no columns, so time, target, state and delivery cannot be scanned. | `screens/Alerts.tsx:195-225` | P2-2 |
| Interaction friction | `editable` is hard-coded true, so a permission failure shows only after Save. | `screens/Tenant.tsx:588` (Inferred) | P2-7 |
| Discoverability | Alerts sit under Configure, not Operate, although the history is an operations concern. | `nav.ts:131` | P2-3 (IA note for `01-current-product-ui-map.md`) |
| Discoverability | The overrides list is read-only text with no explanation of precedence beyond the page description. | `screens/Alerts.tsx:172-190` | P1-10 |
| Inconsistent patterns | The screen keeps the pre-redesign `Page` layout and uses `Badge` for state and for the test result instead of `StatePill`, `SectionLabel`, `Panel` and a toast. | `screens/Alerts.tsx:166, 187, 211-216` | P2-5, P2-8 |
| Missing states | The history has no filter, no absolute time and no state for the failed run it reports. | `screens/Alerts.tsx:195-225` | P2-2, P4-6 |
| Keyboard limitations | Tab order only. | `screens/Alerts.tsx` | P3-1 |

### IN-TRIGGERS · Instance triggers — 76/100 (good but visibly improvable)

`/instance/triggers` · `InstanceTriggers` `screens/InstanceTriggers.tsx:21` (resolved at `App.tsx:136`) · density: low; fits a one-control page.

**User objective.** The instance operator wants to stop or restart every trigger on the instance and understand the consequence first.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.5 | 4 | 4 | 3.5 | 3.5 | 3.5 | 3 | 4 | 4 | 4 | **76** |

**What the eye sees first.** Verified from classes: the title, then the state pill "Triggers are running" or an amber paused notice, then the single button. Correct.

**Strongest existing decisions (keep).** One control with explicit consequences in the prompt (`screens/InstanceTriggers.tsx:29-37`); the environment-variable override explained (`:78-79`); a success toast (`:44`).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The pause button is a small default button although it is the page's only action and a dangerous one; acceptable under "quiet chrome", but the paused state deserves more than an in-page notice. | `screens/InstanceTriggers.tsx:91` (Judgment) | P4-5 |
| Discoverability | The paused state is an amber notice on this page only; there is no shell-level banner, so a tenant's Triggers screen does not show the instance stop. | `screens/Operate.tsx:207` (Inferred) | P1-7 |
| Missing states | No count of affected tenants or triggers and no record of who paused. | `screens/InstanceTriggers.tsx:55-95` | P0-9 (list what is affected) |
| Inconsistent patterns | `StatePill state="running"` is reused for "Triggers are running". | `screens/InstanceTriggers.tsx:85` | P2-5 |
| Responsive | The page caps itself at 60 rem while neighbouring pages use other caps. | `screens/InstanceTriggers.tsx:55` | P2-1, P3-8 |

## Operate: release, promotion and git

### WS-RELEASE · Release: review, deploy and version ledger — 69/100 (functional / inconsistent)

`/t/:t/workspaces/:w/release`, `changes` (step = review), `deployments` (step = deploy) · `Release` `screens/Release.tsx:102` with `ReviewStep` `:230-378`, `DraftHistory` `:411`, `LedgerStep` `:459` and `Deployments` `screens/Execution.tsx:430` (resolved at `screens/Tenant.tsx:543`) · density: standard; fits.

**User objective.** A developer in a dev workspace wants to review the drafts that will ship, deploy them as one version, and later see or roll back versions; in production the same screen is the read-only "Versions" ledger.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3.5 | 3 | 3.5 | 3.5 | 2.5 | 3.5 | 3.5 | 4 | **69** |

**What the eye sees first.** Verified from classes: the eyebrow and "Release" at 26 px, the description and the environment tag, then the Stepper panel (`screens/Release.tsx:155`). In Review the right-hand deploy panel with the filled primary button is the visual anchor. This matches the priority: what will ship, then ship it.

**Strongest existing decisions (keep).**
- Deploy and promote are separate acts with different colours (`screens/Release.tsx:98-100`).
- A preview before deploy with a refusal list and unbound-connection warnings (`screens/Release.tsx:303-341`).
- The line "Production is untouched" under the deploy button (`screens/Release.tsx:375-377`).
- Draft history with "Bring back" (`screens/Release.tsx:411`).

**Table behaviour** (draft groups in Review, versions list and "Bundles and rollback" in the ledger).

| Aspect | Today |
| --- | --- |
| Row height | Drafts: a control line (path, change tag, saved time, Earlier, Set aside) plus one `about` bullet per change (`screens/Release.tsx:241-292`). Versions: about 45 px (`px-4 py-3`, `screens/Release.tsx:474`). Bundles: `Table` rows at about 45 px. |
| Columns | Drafts: path (link to the editor), change tag, "saved …", actions, `about` lines. Versions: version (mono), message, author · relative time, "Running in" tags (`screens/Release.tsx:475-489`). Bundles: Version (with a `Badge` "Running") · Digest · Resources · Uploaded, the same history again (`screens/Execution.tsx:439-449`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None; the whole history is rendered. |
| Selection | None; version rows are not expandable. |
| Batch actions | One act: "Deploy N changes" deploys every draft; drafts cannot be chosen individually for a deploy. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None; version numbers are not copyable. |
| Row actions | Drafts: Earlier, Set aside (red), open editor. Bundles: Activate with a generic confirm (`screens/Execution.tsx:460-465`). |
| Keyboard | Tab order only. |
| Truncation | Version message truncates with no `title` (`screens/Release.tsx:476`). |
| Responsive | Rows wrap (`flex-wrap`). |
| Loading / empty / error | "Loading…" paragraphs (`screens/Release.tsx:206, 420, 468`), `EmptyCanvas` "Nothing deployed here yet" (`:470`), error `Notice` with no retry (`:466`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | "Set aside" is a red danger button on every draft row, loud for a reversible action, and three controls per row crowd the line. | `screens/Release.tsx:260-278` | P0-9 (tone), P3-3 |
| Spacing | The deploy panel nests three notices inside one panel. | `screens/Release.tsx:300, 302, 304, 324` | P4-2 |
| Interaction friction | The step is component state: only `deployments` → deploy is addressable and `setStep` never updates the address, so a reload returns to Review (earlier finding, still open). | `screens/Release.tsx:117-119`, `screens/Tenant.tsx:549` | P2-6 |
| Interaction friction | Review shows an `about` sentence per draft but no code or definition diff, although `kit/diff.ts` exists and Drift uses it. | `screens/Release.tsx:281-292` | P1-5, P3-7 |
| Interaction friction | Success after deploy is an inline notice listing paths, with no link to the new version, to run it, or onward to Promote; the stepper moves to Deploy, not Promote. | `screens/Release.tsx:158, 170, 362-364` | P1-5, P2-8 |
| Interaction friction | Rollback is "Activate" with a generic confirm and no preview or diff. | `screens/Execution.tsx:460-465` | P0-9, P3-7 |
| Discoverability | Version rows cannot be expanded to show what changed in a version, and "Promoted" names no source workspace. | `screens/Release.tsx:463-497` | P1-3 |
| Inconsistent patterns | The ledger shows the same history twice: a versions list and a "Bundles and rollback" `ListScreen` with its own title, description and `Badge`. | `screens/Release.tsx:463-497`, `screens/Execution.tsx:430-479` | P2-2, P4-2 |
| Inconsistent patterns | "Running" is a success `Badge` here and a `StatePill` everywhere else; change kinds use a local `CHANGE_TAG` map. | `screens/Execution.tsx:443`, `screens/Release.tsx:251` | P2-5 |
| Accessibility | `Table` has no accessible name. | `packages/ui/src/Table.tsx:22` | P2-2 |
| Missing states | No toast for deploy; loading is bare text in three places. | `screens/Release.tsx:206, 420, 468` | P2-4, P2-8 |
| Keyboard limitations | No shortcut for deploy; the palette offers no deploy action for the current drafts. | `screens/Release.tsx:102-378` | P3-2 |
| Simplification | Merge the two history lists into one table whose rows expand to "what changed" and carry Activate. | Judgment | P2-2 |

### WS-RELEASE-PROMOTE · Promotion and promotion requests — 70.5/100 (good but visibly improvable)

Promote step of `/t/:t/workspaces/:w/release` (no URL of its own); requests on `/t/:t` · `PromoteStep` `screens/Release.tsx:502-618`, `RequestPromotion` `screens/Promotion.tsx:34`, `PromotionRequests` and `ReviewRequest` sheet `screens/Promotion.tsx:172, 229` (resolved at `screens/TenantOverview.tsx:152`) · density: standard; fits.

**User objective.** A developer wants to move a deployed version from dev to production, or ask someone who may; a decider wants to review a request and promote or decline it.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3.5 | 3.5 | 3.5 | 3.5 | 2.5 | 3.5 | 4 | 4 | **70.5** |

**What the eye sees first.** Verified from classes: the amber `promote` button (`screens/Release.tsx:586`) and the amber-bordered "To" panel (`:539`). This matches: the one act that changes production is the one coloured thing.

**Strongest existing decisions (keep).**
- The promote confirm states the version and what happens to in-flight runs (`screens/Release.tsx:589-594`).
- "Tried here: N runs, M failed" as a gate with a nudge (`screens/Release.tsx:689-709`).
- Request, withdraw and decline all carry reasons (`screens/Promotion.tsx`).
- From / To panels with `PreviewPanels` before the act (`screens/Release.tsx:502-618`).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The drift evidence sits below the Promote button: evidence after the action. | `screens/Release.tsx:616` | P1-5 |
| Spacing | The "Tried here" panel holds two further notices. | `screens/Release.tsx:688` | P4-2 |
| Interaction friction | Promote has no URL; the step is reachable only by clicking the stepper (4 interactions, 1 dialog). | `screens/Release.tsx:117-119` | P2-6 |
| Interaction friction | Promote success is an inline sentence with no link to the production workspace, its runs or the new version: the journey ends on the dev side. | `screens/Release.tsx:557-565` | P1-5, P1-3 |
| Interaction friction | "Some of its runs here failed. See them" links to all failed runs, not this version's, because the runs list has no version filter. | `screens/Release.tsx:705` | P1-1 |
| Interaction friction | A decider reviews a request on the tenant overview in a wide sheet, away from the release screen that holds the evidence. | `screens/Promotion.tsx:229, 285` | P1-5, P1-10 |
| Inconsistent patterns | The confirm always says "Promote to production", even for a non-production target, and is styled `danger` although the button is the amber `promote` variant. | `screens/Release.tsx:592` | P4-5, P0-9 |
| Inconsistent patterns | Workspace settings carries a second "Review and promote" whose final button is `variant="primary"`, not `promote`. | `screens/Environments.tsx:481-482`, `packages/ui/src/Button.tsx:9-10` | P4-5 |
| Inconsistent patterns | The tenant ID is derived by `root.split("/")[2]`. | `screens/Release.tsx:569` | screen-local (code) |
| Accessibility | The amber `attention` text is 4.43:1 on canvas in light, under the 4.5:1 threshold. | `kit/status.tsx:46-58` | P0-2 |
| Missing states | No toast after promote, request, withdraw or decline (earlier finding X7, partly open). | `screens/Release.tsx:557-565` | P2-8 |
| Keyboard limitations | No shortcut or palette action for promote. | `screens/Release.tsx:502-618` | P3-2 |

### WS-DRIFT · Drift between dev and production — 67.5/100 (functional / inconsistent)

Inside the Promote step · `DriftView` `screens/Drift.tsx:41` and `DriftSheet` (wide side sheet) `screens/Drift.tsx:123` · density: standard; fits.

**User objective.** Before promoting, a developer wants to see exactly what differs between the two workspaces.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 3.5 | 3.5 | 3 | 3 | 3 | 3.5 | 4 | 3.5 | **67.5** |

**What the eye sees first.** Verified from classes: a filter chip row defaulting to "All that differ" with counts, then a list of differing objects with a state pill each; the diff opens in a sheet.

**Strongest existing decisions (keep).** The default filter with counts; plain-language `about` lines above the diff; folded unchanged lines; `+` / `−` glyphs so colour is not the only cue (`screens/Drift.tsx:190`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | One-line list rows from `md` up (`py-2`), stacked below (`screens/Drift.tsx:86-104`). |
| Columns | Path (mono) and kind · state pill for the kind of difference · first `about` line, truncated (`screens/Drift.tsx:91-102`). |
| Sort | None. |
| Filter | Chips by kind of difference with counts; component state, not in the URL. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | Single; opens `DriftSheet`; not in the URL. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None; the diff cannot be copied as a patch. |
| Row actions | None; no link from an item to its editor. |
| Keyboard | Rows are buttons; Tab and Enter. |
| Truncation | The `about` line truncates with no `title` (`screens/Drift.tsx:97`). |
| Responsive | The sheet is `min(…, 100vw − 2rem)` wide. |
| Loading / empty / error | "Comparing…" text for the list (`screens/Drift.tsx:59`) and "Loading…" in the sheet (`:197`); error `Notice` with no retry (`:57`); empty is the text "Nothing here." (`:82`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The view sits below the Promote button. | `screens/Release.tsx:616` | P1-5 |
| Typography | The diff is 12 px mono in a one-off `<pre>` on `bg-sunken`. | `screens/Drift.tsx:168-171` | P2-1, P2-12 |
| Data readability | The diff compares sorted JSON, not source code; unified view only; no word-level highlight. | `screens/Drift.tsx:168-171` | P3-7 |
| Interaction friction | A drift item has no link to its editor. | `screens/Drift.tsx:41-120` | P1-3, P1-10 |
| Inconsistent patterns | `StatePill` states "warning", "info" and "paused" are borrowed for drift meanings, so "Only in prod" shows a pause icon. | `screens/Drift.tsx:26-31, 96` | P2-5 |
| Inconsistent patterns | List rows use `hover:bg-selected` rather than the list hover token used elsewhere. | `screens/Drift.tsx:89` | P2-2 |
| Missing states | Filter and selection are not in the URL; the empty text is "Nothing here." | `screens/Drift.tsx:82` | P2-6, P2-4 |

### WS-GIT · Git sync and repository settings — 60.5/100 (functional / inconsistent); repository settings about 66 (not sub-scored)

`/t/:t/workspaces/:w/git` · `GitSync` `screens/GitSync.tsx:42` embedding `GitPanel` `screens/Git.tsx:185` (resolved at `screens/Tenant.tsx:552`); `/t/:t/repository` · `RepositorySettings` `screens/Git.tsx:24` (resolved at `screens/Tenant.tsx:248`) · density: standard; fits.

**User objective.** A developer wants to see how the workspace and its Git branch differ, push or pull safely and resolve conflicts file by file; a tenant admin wants to connect the repository once.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 2.5 | 3 | 3 | 3.5 | 3.5 | 2.5 | 3.5 | 2.5 | 3 | **60.5** |

The notes scored repository settings at about 66 overall (a clear single form on the pre-redesign `Page` layout, with no test of the connection separate from Save) and gave no sub-scores.

**What the eye sees first.** Verified from classes: two summary panels (workspace and branch) with ahead / behind counts and the head commit, then Push / Pull / "Push with drafts". Further down a second panel repeats Push and Pull with different behaviour, so the page has no single place to act.

**Strongest existing decisions (keep).**
- The two-sided summary with ahead / behind counts and the head commit (`screens/GitSync.tsx:103-145`).
- Nothing is overwritten without a per-file choice; versions are shown side by side with a "Kept" tag (`screens/GitSync.tsx:233-253`).
- A refused push says "Pull first".

**Table behaviour** (conflict list and "Files that differ").

| Aspect | Today |
| --- | --- |
| Row height | Free-height panels per conflicting file; a plain list for differing files. |
| Columns | File stem, the two versions side by side, a choice per side (`screens/GitSync.tsx:198-257`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | One choice per file; the choice toggles the button `variant` because `Button` has no pressed style (`screens/GitSync.tsx:211`). |
| Batch actions | None; no "keep all mine" / "keep all theirs". |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | Per-file keep-this-side. |
| Keyboard | Tab order only. |
| Truncation | Whole files are shown, not a diff (`screens/GitSync.tsx:243-249`). |
| Responsive | Side-by-side panes stack on narrow widths. |
| Loading / empty / error | "Loading…" in `RepositorySettings` (`screens/Git.tsx:43`); the differing-files list is hidden entirely while any conflict exists (`screens/GitSync.tsx:259`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | Two sets of Push / Pull on one page behave differently: the top buttons push with no message prompt, the `GitPanel` below prompts for a commit message. | `screens/GitSync.tsx:148-160`, `screens/Git.tsx:323-331` | screen-local (remove `GitPanel` actions), P2-3 |
| Visual hierarchy | "Push with drafts" is a quiet button whose consequence is explained only after success. | `screens/GitSync.tsx:179-194` | P0-9 |
| Typography | `GitPanel` uses `text-base font-semibold`, literal sizes and its own frame; conflict panes are a one-off `<pre>` on `bg-code-bg` at 13 px. | `screens/Git.tsx:206, 302-311`, `screens/GitSync.tsx:243` | P2-1, P2-12 |
| Interaction friction | Two conflict choosers exist: the side-by-side one and a second, select-based one inside `GitPanel`. | `screens/GitSync.tsx:198`, `screens/Git.tsx:345-377` | screen-local |
| Interaction friction | Conflict panes show whole files rather than a diff, and choices are lost on any action. | `screens/GitSync.tsx:67, 243-249` | P3-7, P0-4 |
| Discoverability | The empty state tells the user to connect the repository but the link is inside `GitPanel` at the bottom of the page. | `screens/Git.tsx:214` | P2-13 |
| Inconsistent patterns | Two state vocabularies: `Badge` in the panel (sync state mapped at `screens/Git.tsx:151`, `:306`) and counts above. | `screens/Git.tsx:151, 306` | P2-5 |
| Inconsistent patterns | The eyebrow says "Operate" while other pages use the area or page name inconsistently. | `screens/GitSync.tsx:42-100` | P2-3 |
| Inconsistent patterns | Repository settings is capped at `max-w-xl` on the old `Page` frame. | `screens/Git.tsx:57` | P2-3, P3-8 |
| Missing states | "Files that differ" is hidden whenever a conflict exists, so the full picture is unavailable exactly when it matters. | `screens/GitSync.tsx:259` | P2-4 |
| Missing states | Repository settings has no "Test connection" apart from Save. | `screens/Git.tsx:24-180` | P2-7 |
| Accessibility | A form problem is shown as a page-level danger notice without `aria-invalid` on the field. | `screens/Git.tsx:24-180` | P2-7 |
| Keyboard limitations | Tab order only. | — | P3-1 |
| Simplification | One Push / Pull bar with an optional commit message, one conflict chooser that shows a diff, and the repository link at the top of the empty state. | Judgment | screen-local |

## Data

Four table implementations serve the screens in this and the following groups: the kit `Table` behind `ListScreen` (`packages/ui/src/Table.tsx:18`, `ListScreen.tsx:210`; about 37 px text rows, about 45 px whenever a row holds a 28 px small button; header not sticky; no sort, filter, search, paging, selection or keyboard; no accessible name, `packages/ui/src/Table.tsx:22`), `Grid` (`packages/ui/src/Grid.tsx:199`), `CollectionView` (`kit/CollectionView.tsx:24`) and hand-rolled `<table>`s. Earlier finding V3 (four list implementations) is not fixed. The "Table behaviour" sets below say "kit `Table` defaults" where a list adds nothing to that baseline. No screen in these groups has an unsaved-changes guard: there is no `beforeunload` or route blocker anywhere in `apps/console/src`.

### WS-TABLES · Tables list — 66/100 (functional / inconsistent)

`/t/:t/workspaces/:w/tables` · `Tables` `screens/Data.tsx:490` on `ListScreen` `ListScreen.tsx:210` · density: standard (37 px rows); fits and could be compact.

**User objective.** A developer or data owner wants to find a table, see who can read it and how big it is, and create a console-managed one.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3 | 3.5 | 3 | 3.5 | 2 | 3.5 | 3.5 | 3.5 | **66** |

**What the eye sees first.** Verified from classes: the 26 px title, then a three-sentence description (`screens/Data.tsx:494`), then the solid primary "Create table"; the table of names comes third. For a returning user the names should win; the description is longer than it needs to be on every visit.

**Strongest existing decisions (keep).** The "Who sees rows" column in plain words from `policyText` (`screens/RowRules.tsx:30-37`); "Managed in" as a column; retired tables stay visible with a badge (`screens/Data.tsx:505`); right-aligned numerics (`:518-519`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 37 px. |
| Columns | Table · What it holds · Managed in · Who sees rows · Columns · Rows (`screens/Data.tsx:497-519`): a good priority order, though Rows is the most-scanned number and sits last. |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None; no cap. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | The name link only (`screens/Data.tsx:502`). |
| Keyboard | Tab to each link; no row focus. |
| Truncation | None; the description wraps. |
| Responsive | Horizontal scroll wrapper only, no column priority (`packages/ui/src/Table.tsx:21`). |
| Loading / empty / error | "Loading…" text (`ListScreen.tsx:254`), error with "Try again" (`ListScreen.tsx:238-241`), empty state with an action (`screens/Data.tsx:521-524`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | A three-sentence description, 70 characters wide, sits permanently above the data. | `screens/Data.tsx:494` | P4-1 |
| Typography | The table name is `font-medium text-action` sans while every other identifier in Configure is mono through `code()`. | `screens/Data.tsx:502`, `screens/Execution.tsx:598` | P2-1, P4-6 |
| Inconsistent patterns | "Managed in" is plain text here; Scripts and Published apps show the same fact as a `Tag`. | `screens/Data.tsx:515`, `screens/Execution.tsx:191-199`, `screens/Apps.tsx:449-455` | P2-5 |
| Discoverability | No search, sort or filter, and no column for which apps or scripts read the table although the API reports `reads` for apps. | `screens/Apps.tsx:23-24` | P2-2, P1-10 |
| Interaction friction | Create asks for exactly one column and then opens the Rows view, where adding more columns is behind the Definition toggle. | `screens/Data.tsx:525-552` | P0-9 (`CreateDialog`), P2-13 |
| Missing states | No skeleton, no paging and no cap. | `ListScreen.tsx:254` | P2-4, P2-2 |
| Keyboard limitations | Tab to each link only; no row focus and no shortcuts. | `packages/ui/src/Table.tsx:18-40` | P3-1 |
| Accessibility | The `<table>` has no accessible name. | `packages/ui/src/Table.tsx:22` | P2-2 |
| Responsive | Horizontal scroll only. | `packages/ui/src/Table.tsx:21` | P2-2 |

### WS-TABLE-ROWS · Table rows browser and Grid — 61/100 (functional / inconsistent)

`/t/:t/workspaces/:w/tables/:name` (Rows view) · `TableView` `screens/Data.tsx:584` → `RowsBrowser` `:89` on `Grid` `packages/ui/src/Grid.tsx:199`; row sheet `screens/Data.tsx:281-312`; `AddRow` `:328-476` · density: standard with a "compact" toggle that is barely denser; does not fit: a row browser should be compact by default (28–32 px rows).

**User objective.** A developer or operator fixing or inspecting data wants to find rows, read them, change a value, and add or delete a row.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 3 | 3 | 3 | 3 | 2 | 3 | 3.5 | 3 | **61** |

**What the eye sees first.** Verified from classes: the table name at 26 px, a description line packing row count, policy and managed-in into one sentence (`screens/Data.tsx:606`), two pill toggles (Rows / Definition), then a muted instruction paragraph on the left with the solid "Add row" on the right (`:146-180`). The grid is the fifth thing. For a data browser the grid and its filter state should come first; the instructions are permanent chrome.

**Strongest existing decisions (keep).**
- In-place edit with the error under the input (`packages/ui/src/Grid.tsx:171-196`); Enter commits and Escape cancels.
- Tri-state sort with `aria-sort` on a real button (`packages/ui/src/Grid.tsx:219-233`).
- Server-side filter, sort and cursor; "Rows 51 to 100 of 1,234 that match" from the aggregate route (`screens/Data.tsx:126-131, 254-260`).
- Right-aligned tabular numerics (`packages/ui/src/Grid.tsx:319`) and a muted "empty" for null (`:311`).
- Keyless source tables degrade to read and add (`screens/Data.tsx:147, 1215-1216`); system columns are marked read-only.
- Column filters, hide columns, the compact toggle and totals all arrived since `docs/evolution/04-ux-audit.md` (`screens/Data.tsx:151-176, 207-212`); CSV export did not.

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 41 px when rows can change (`py-1.5` + 24 px cell button, widened by a 28 px Delete button), about 37 px "compact" (`screens/Data.tsx:188`); two header rows, about 71 px together, not sticky (`packages/ui/src/Grid.tsx:208`). |
| Columns | The table's own columns, then `id`, `created_at`, `updated_at` appended last (`screens/Data.tsx:578-582, 646`); a radio column first and a Delete column last. The row's identity is the right-most column and scrolls off first; no pinned column. |
| Sort | Single column, tri-state, server-side (`screens/Data.tsx:197-204`); the arrow is `opacity-0` on unsorted columns (`packages/ui/src/Grid.tsx:230`), so sortability has no affordance. |
| Filter | One input per column, server-side, on every keystroke with no debounce (`screens/Data.tsx:208-212`, `packages/ui/src/Grid.tsx:253`); grammar (`contains`, `> 100`, `empty`) described only in the paragraph (`screens/Data.tsx:148`); no OR / NOT (`:77-87`), no "clear filters". |
| Search | No global search. |
| Paging / virtualisation | 50 per page, fixed (`screens/Data.tsx:33`); hand-rolled Previous / Next (`:262-279`) instead of the kit `Pagination` (`packages/ui/src/Pagination.tsx:16`); no virtualisation; count from the aggregate route; source tables have no total (`:127-129`). |
| Selection | A radio per row whose only effect is to open a modal sheet (`packages/ui/src/Grid.tsx:293-303`, `screens/Data.tsx:195, 281`). |
| Batch actions | None: no multi-select, batch delete or bulk edit. |
| Saved views | None; sort, filters, page, hidden columns and density are component state (`screens/Data.tsx:91-99`) and `key={columns}` drops them when a column changes (`:632`). |
| Column customisation | Hide only, through an action menu that closes after each pick (Inferred from Base UI defaults; `packages/ui/src/Menu.tsx:47-56`); no resize or reorder. |
| Copy | None: no copy cell, row, ID or JSON; no CSV export. |
| Row actions | A red "Delete" text button on every row (`screens/Data.tsx:219-226`), repeated in the sheet footer (`:288-296`); the confirm names nothing ("Delete this row?", `:222`). |
| Keyboard | Every editable cell is its own tab stop (`packages/ui/src/Grid.tsx:148`): 50 rows × 8 columns = 400 stops plus radios and Delete buttons; no arrow-key cell movement, no Tab to the next cell while editing. |
| Truncation | Cells truncate at `max-w-80` with no tooltip or expand (`packages/ui/src/Grid.tsx:318`); the sheet is the only way to read a long value. |
| Responsive | Horizontal scroll; the toolbar wraps. |
| Loading / empty / error | "Loading…" in the grid's empty slot only when there is no data yet (`screens/Data.tsx:244-245`); filtered-empty versus empty (`:246-248`); error with "Try again" (`:183-187`); filter parse error (`:182`); the table-load error has no retry (`:587`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The instruction sentence permanently fills the toolbar's left, where filter state and the result count belong; the count is in the footer only. | `screens/Data.tsx:146-149, 253-261` | P4-1, P2-9 |
| Alignment | The toolbar mixes a custom `h-7` menu trigger, an `h-7` small button and an `h-9` primary. | `screens/Data.tsx:153, 174, 177` | P2-1 |
| Density | "Compact" only sets cell padding to `py-1`, a 10 % gain (41 → 37 px) because every row still holds a 28 px button; filter inputs stay `h-7`. | `screens/Data.tsx:188` | P2-9, P3-4 |
| Density | Identity columns are last and nothing is pinned or sticky, so on a wide table the user cannot tell which row a cell belongs to after scrolling. | `screens/Data.tsx:578-582, 646`, `packages/ui/src/Grid.tsx:208` | P2-9 |
| Interaction friction | Filters refetch rows and count on every keystroke, and the Enter handler only blurs, implying a commit-on-Enter that does not exist. | `screens/Data.tsx:208-212`, `packages/ui/src/Grid.tsx:253-256` | P2-9 |
| Interaction friction | "Next" is not disabled while the next page loads and appends the cursor of the still-shown page, so a double click pushes the same cursor twice and the "Rows N to M" label then disagrees with the rows. | `screens/Data.tsx:270-275`, `api.ts:149` (Inferred) | P2-9, P2-4 |
| Interaction friction | The row sheet is modal (the grid is blocked behind a backdrop), read-only, prints JSON on one line, has no copy and no previous / next row, and is titled "Row". | `screens/Data.tsx:281-312`, `packages/ui/src/SideSheet.tsx:44`, `packages/ui/src/Grid.tsx:51` | P2-9, P3-5 |
| Interaction friction | Editing commits on blur, so clicking away saves; there is no undo. | `packages/ui/src/Grid.tsx:180` | P2-9, P2-8 |
| Interaction friction | A null boolean renders as unchecked, identical to false, and saves on click; timestamps and dates are edited as raw strings; reference columns show and take raw UUIDs in the grid and in Add row. | `packages/ui/src/Grid.tsx:63-67, 132`, `screens/Data.tsx:459-469` | P2-9, P2-7 |
| Discoverability | Sort, filters, page, hidden columns and density are not in the URL or storage, so a filtered view cannot be shared or reloaded. | `screens/Data.tsx:91-99, 632` | P2-6, P3-4 |
| Discoverability | Hiding five columns takes five open-and-pick cycles; menu items show a check mark but are not `menuitemcheckbox`. | `screens/Data.tsx:151-173`, `packages/ui/src/Menu.tsx:47-56` | P3-4 |
| Inconsistent patterns | Rows / Definition are hand-made `aria-pressed` pills, not kit `Tabs`, and the view is not in the URL. | `screens/Data.tsx:592-601` | P2-6, P2-12 |
| Inconsistent patterns | The "All tables" back link sits in the header's action slot on the right, while Dashboards and the builder put it top-left with an arrow. | `screens/Data.tsx:607-611`, `screens/Dashboards.tsx:138-142`, `screens/Interfaces.tsx:1718-1720` | P2-3 |
| Inconsistent patterns | The toggle label shows the other state ("Comfortable" when compact) while also setting `aria-pressed`, and `Button` gives a pressed toggle no visual on-state. | `screens/Data.tsx:174-176` | P2-12, P3-4 |
| Accessibility | A radio is the wrong control for "open details", and its column header is empty; `aria-selected` sits on a `<tr>` outside a `grid` role. | `packages/ui/src/Grid.tsx:212, 279, 293-303` | P2-9 |
| Accessibility | The edit button's accessible name is the cell value; the action is only in `title="Change this value"`. | `packages/ui/src/Grid.tsx:150` | P2-9 |
| Accessibility | The word "empty" in null cells and the filter placeholder are `ink-muted` at 60 % (2.52:1 in light); the filter row uses `<th>` cells that should be `<td>`. | `packages/ui/src/Grid.tsx:244-261, 252, 311` | P0-2, P2-9 |
| Accessibility | After a commit the input unmounts and focus is not returned to the cell. | `packages/ui/src/Grid.tsx:171-196` | P2-9 |
| Missing states | A page change shows the old rows with no loading sign because `page.loading` is unused; the filter parse error is set during render. | `screens/Data.tsx:108-110, 262-279` | P2-4 |
| Keyboard limitations | This is a table of buttons, not a grid: no arrow keys, no Enter-to-edit beyond button activation, no Esc to clear a filter. | `packages/ui/src/Grid.tsx:146-158` | P2-9, P3-1 |
| Responsive | Horizontal scroll only, with the header scrolling away with the page. | `packages/ui/src/Grid.tsx:208` | P2-9 |
| Simplification | Move the filter grammar into an operator menu per column, replace the per-row Delete with multi-select plus a batch bar, and make the row sheet a docked, editable inspector. | Judgment | P2-9, P3-3 |

### WS-TABLE-DEFINITION · Table definition and row rules — 63/100 (functional / inconsistent)

`/t/:t/workspaces/:w/tables/:name` (Definition view) · `Definition` `screens/Data.tsx:685`, `RowRulesEditor` `screens/RowRules.tsx:58`, `SeeItAs` `screens/RowRules.tsx:272`, `PurgeButton` `screens/Data.tsx:656`, Add column dialog `:935-981` · density: standard; fits.

**User objective.** A developer or workspace admin wants to shape a console-managed table and decide who sees which rows.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 3 | 3.5 | 3 | 3 | 2.5 | 3.5 | 3 | 3 | **63** |

**What the eye sees first.** Verified from classes: an attention notice when the table is repository-managed (`screens/Data.tsx:729-734`), otherwise the "Columns" heading and its table. This is reasonable, but the most consequential control, "Who sees rows", is the third section and visually equal to the others.

**Strongest existing decisions (keep).**
- Retire-not-drop with "Still holds N values" (`screens/Data.tsx:846-849`) and a separate "Delete for good".
- Rule fieldsets whose legend is the rule as a sentence (`screens/RowRules.tsx:148`), and "Nothing is saved until Save".
- "See it as" (`screens/RowRules.tsx:272-342`) as a verification step, with "would see no rows" (`:309`).
- Plain-language type names (`screens/Data.tsx:35-46`) and the "Where it is stored" disclosure (`:912-918`).

**Table behaviour** (columns table, and the hand-rolled "See it as" preview).

| Aspect | Today |
| --- | --- |
| Row height | Columns: about 45 px (rows hold buttons). See it as: about 32 px (`screens/RowRules.tsx:312`). |
| Columns | Columns: Column · Holds · Rules · When not given · actions (`screens/Data.tsx:745-768`); retired: Column · Held · Still holds · actions (`:842-851`). See it as: the table's columns for the first 20 rows (`screens/RowRules.tsx:284`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None; "See it as" lists the first 200 end users (`screens/Data.tsx:908`). |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None; columns cannot be reordered. |
| Copy | None. |
| Row actions | Rename and Retire as text buttons, Retire in red (`screens/Data.tsx:801-817`); retired columns: Bring back and Delete for good. |
| Keyboard | Tab order; rule remove buttons are labelled (`screens/RowRules.tsx:215`). |
| Truncation | None noted. |
| Responsive | Kit `Table` defaults (horizontal scroll). |
| Loading / empty / error | Empty "No columns."; saved confirmation for rules (`screens/RowRules.tsx:263-265`); failure notice at the top of the view (`screens/Data.tsx:735`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | "Who sees rows" has the same weight as "Columns" and "Where it is stored". | `screens/Data.tsx:738, 833, 883, 913, 922` | P2-3 |
| Typography | Section headings are `text-base font-semibold` here, an uppercase `SectionLabel` in Workspace settings, `text-lg` in Connection groups and `text-title` in `ListFrame`: four h2 styles. | `screens/Data.tsx:738, 833, 883, 913, 922`, `screens/Environments.tsx:67`, `screens/Execution.tsx:1134`, `ListScreen.tsx:297` | P2-1 |
| Interaction friction | A column's type, required flag and default cannot be changed after creation, and columns cannot be reordered; only Rename and Retire exist. | `screens/Data.tsx:772-817` | screen-local, P2-7 |
| Interaction friction | Add column is a centred dialog, and "Value when none is given" is free text for every type. | `screens/Data.tsx:964-969` | P2-7 |
| Interaction friction | "See it as" offers end users only and cannot preview a member group, though the App Builder can. | `screens/RowRules.tsx:272-342`, `screens/Interfaces.tsx:1356-1359` | screen-local |
| Discoverability | Neither Retire column nor Retire table says which apps, dashboards or scripts read the table, though `reads` and `/references` hold the data. | `screens/Data.tsx:801-817` | P0-9, P1-10 |
| Inconsistent patterns | "Delete for good", by its own text the one action that destroys data, uses a simple confirm while workspace delete uses type-to-confirm. | `screens/Data.tsx:668-674`, `screens/Environments.tsx:128` | P0-9 |
| Inconsistent patterns | The "See it as" preview is a hand-rolled, unnamed table capped at `max-w-3xl`. | `screens/RowRules.tsx:291, 311-333` | P2-2 |
| Missing states | The failure notice renders at the top of the view, so a failed rename at row 20 or a failed policy save is reported off-screen; `RowRulesEditor` swallows the error ("The screen around this shows why"). | `screens/Data.tsx:735`, `screens/RowRules.tsx:254-256` | P2-7, P2-8 |
| Missing states | The rules editor has no dirty indicator, and Save is disabled with no reason when a rule is incomplete. | `screens/RowRules.tsx:247` | P2-7, P0-4 |
| Keyboard limitations | Forms work by Tab; there are no shortcuts. | — | P3-1 |

### WS-SOURCES · Data sources list — 58/100 (major UX debt)

`/t/:t/workspaces/:w/sources` · `Sources` `screens/Data.tsx:1009` on `ListScreen` · density: standard; fits.

**User objective.** A developer or workspace admin wants to point a declared data source at a database and check that it answers.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3 | 2.5 | 3.5 | 2.5 | 2.5 | 2 | 3 | 3 | 3.5 | **58** |

**What the eye sees first.** Verified from classes: the title, a long description, the primary "Connect database"; in rows the linked source name. When a source is broken, the red "No: problem" text is the most vivid cell, which is right.

**Strongest existing decisions (keep).** Address and password are set per workspace and never stored in the repository (`screens/Data.tsx:1013`); Test is a row action (`:1060-1080`); the disconnect confirm says "Nothing in that database changes" (`:1083`); the password shows only as Set / None (`:1038`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 45 px. |
| Columns | Source · For · Points to · Password (Set / None) · Reached · actions (`screens/Data.tsx:1016-1040`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None; no "Test all". |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | "Test connection" and "Disconnect" inline; unbound rows are not links and carry no "Connect" action (`screens/Data.tsx:1020-1026`), so the next step is back at the page header. |
| Keyboard | Tab order only. |
| Truncation | The failure problem renders unbounded in the cell (`screens/Data.tsx:1051-1053`). |
| Responsive | Kit `Table` defaults. |
| Loading / empty / error | `ListScreen` loading text, error with retry, empty state; "Not connected" and "Not checked yet" badges. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Feedback | A failed test is announced with `notify.success`: "x did not answer: …" appears as a success toast. | `screens/Data.tsx:1068-1072` | P0-6 |
| Inconsistent patterns | Same concept as Connections, different everything: "Test connection" versus "Test", "Disconnect" versus "Unbind", coloured "Reached: Yes, 12 ms" text versus a `StatePill`, a centred dialog versus a wizard sheet that tests after save, a Password column here and no credential column there. | `screens/Data.tsx:1046-1054, 1094-1145`, `screens/Execution.tsx:549-558` | P2-5, P2-7 |
| Interaction friction | There is no Change action: editing means "Connect database" again, re-picking the source and retyping host, database and user with no prefill; there is no test before save and no automatic test after it. | `screens/Data.tsx:1097` | P2-7 |
| Interaction friction | "Encrypt the connection" defaults to No, because the first option is the default. | `screens/Data.tsx:1127-1130`, `ListScreen.tsx:147-151` | P0-9 (no silent defaults) |
| Discoverability | Disconnect says "Scripts that use it will fail" but lists none; sources have no "Used by" column at all. | `screens/Data.tsx:1081-1086` | P0-9, P1-10 |
| Data readability | The checked-at time is only a `title`, so a stale "Yes" looks current. | `screens/Data.tsx:1047` | P1-7, P4-6 |
| Accessibility | Health relies on colour plus the words Yes / No, and the detail is tooltip-only, unreachable by keyboard or touch. | `screens/Data.tsx:1046-1054` | P2-5, P3-1 (Tooltip) |
| Keyboard limitations | Tab order only. | — | P3-1 |

### WS-SOURCE-VIEW · Data source view (external tables) — 61/100 (functional / inconsistent)

`/t/:t/workspaces/:w/sources/:path` · `SourceView` `screens/Data.tsx:1156` (192 px table rail + `RowsBrowser`, `:1183`) · density: standard; the same compact target as WS-TABLE-ROWS applies.

**User objective.** A developer wants to browse the tables of an external database through the platform.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3 | 3 | 3 | 3 | 3.5 | 2 | 3 | 3.5 | 3 | **61** |

**What the eye sees first.** Verified from classes: the source path as the title, the description, then the rail of table names and the grid.

**Strongest existing decisions (keep).** A master list of tables beside the rows; retry on error (`screens/Data.tsx:1172-1175`); the explicit sentence "The platform does not change its structure, and its own access rules apply" (`:1165`); a "No tables found" empty state (`:1179-1181`).

**Table behaviour.** As WS-TABLE-ROWS, with two differences: source tables have no total, so the footer says only "Rows 1 to 50" (`screens/Data.tsx:127-129`), and keyless tables are read and add only.

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Interaction friction | The chosen table is state, not URL, so a link cannot name a table. | `screens/Data.tsx:1158` | P2-6 |
| Discoverability | The rail has no search and no counts, which fails for schemas with hundreds of tables. | `screens/Data.tsx:1185-1199` | P2-2 |
| Density | The rail is not sticky and scrolls away with the page. | `screens/Data.tsx:1183-1199` | P3-5 |
| Keyboard limitations | Rail items are buttons with `aria-current` inside a `nav` (acceptable) but have no arrow-key movement. | `screens/Data.tsx:1185-1199` | P3-1 |
| Missing states | No total row count. | `screens/Data.tsx:127-129` | P2-9 |
| Inherited | Every finding of WS-TABLE-ROWS applies. | — | P2-9 |

### WS-DASHBOARDS · Dashboards list — 65/100 (functional / inconsistent)

`/t/:t/workspaces/:w/dashboards` · `Dashboards` `screens/Dashboards.tsx:37` (hand-assembled `Page` + `Table`, `:59-105`) · density: standard; fits.

**User objective.** A member wants to open one of their dashboards or start a new one.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 2.5 | 3.5 | 3 | 3.5 | 2 | 3.5 | 3.5 | 3.5 | **65** |

**What the eye sees first.** Verified from classes: title, description, primary button, then names.

**Strongest existing decisions (keep).** The "Whose" and "Seen by" columns; a one-field create that opens the editor (`screens/Dashboards.tsx:39-53`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 37 px. |
| Columns | Dashboard · Whose · Seen by · Changed (`screens/Dashboards.tsx:78-101`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | The name link only; no delete or duplicate. |
| Keyboard | Tab to links. |
| Truncation | "Seen by" joins every group name into one badge that grows without bound (`screens/Dashboards.tsx:94-97`). |
| Responsive | Kit `Table` defaults. |
| Loading / empty / error | Error with retry (`screens/Dashboards.tsx:66`); `EmptyState` with the create action (`:73-76`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Feedback | The description says "A dashboard is saved as you make it", but the editor has a manual Save and a "Changes not saved." state: the copy is false. | `screens/Dashboards.tsx:62, 202, 225-235` | P0-6 |
| Interaction friction | A dashboard cannot be deleted or duplicated from the list. | `screens/Dashboards.tsx:59-105` | P2-2, P3-3 |
| Data readability | "Seen by" is one unbounded badge. | `screens/Dashboards.tsx:94-97` | P2-5 |
| Discoverability | No search. | `screens/Dashboards.tsx:59-105` | P2-2 |
| Inconsistent patterns | The list does not use `ListScreen` although it has the same shape. | `screens/Dashboards.tsx:59-105` | P2-2 |
| Keyboard limitations | Tab to links only. | — | P3-1 |

### WS-DASHBOARD · Dashboard editor and viewer — 54/100 (major UX debt)

`/t/:t/workspaces/:w/dashboards/:id` · `DashboardView` `screens/Dashboards.tsx:110`, reusing `PageEditor` `screens/Interfaces.tsx:1225` for owners and `PageView` `:1210` for others · density: low in the header area, standard in the canvas; the header does not fit an editor.

**User objective.** An owner wants to compose a page of widgets over the workspace's tables and share it; a viewer wants to read it.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 2.5 | 3 | 3 | 2 | 2 | 2.5 | 3 | 3 | **54** |

**What the eye sees first.** Verified from classes: a back link, then a labelled text input acting as the title, with Delete (red) and Save (solid) side by side on the right (`screens/Dashboards.tsx:204-235`). Sharing controls come before the canvas, and the dashboard itself starts about 300 px down.

**Strongest existing decisions (keep).** The viewer note "You see the rows you may read, which may not be the rows they see" (`screens/Dashboards.tsx:149-152`); optimistic concurrency through `revision` (`:163`); a delete confirm that says what is and is not touched (`:210`).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | Delete sits immediately left of Save at the same size. | `screens/Dashboards.tsx:204-235` | P0-9, P2-7 |
| Visual hierarchy | Name field, sharing checkbox and group picker stand between the user and the canvas. | `screens/Dashboards.tsx:188-264` | P2-10, P4-1 |
| Typography | The owner view has no `h1` (the name is a `TextField`); the viewer view uses `text-xl` instead of the `display` role. | `screens/Dashboards.tsx:148, 188-199` | P2-3, P0-7 |
| Interaction friction | Three save behaviours for one editor: page edits need Save, sharing toggles save at once, and the App Builder autosaves the same component. | `screens/Dashboards.tsx:204-235, 244-264`, `screens/Interfaces.tsx:1654` | P2-7, P2-10 |
| Interaction friction | There is no navigation guard while dirty, and the back link is one click away. | `screens/Dashboards.tsx:138` | P0-4 |
| Inconsistent patterns | The route is not in the editor list, so the section panel stays and the page is capped at 1440 px with `py-6`, while the identical editor for apps gets the full width. | `nav.ts:216-222`, `Shell.tsx:909` | P2-10, P3-5 |
| Missing states | The problems notice disappears whenever the page is dirty, so a problem cannot be read while it is being fixed. | `screens/Dashboards.tsx:266-277` | P2-10 |
| Inherited | Everything said of `PageEditor` under WS-APP-BUILDER applies: no undo, widget removal without confirm, inspector below the canvas under 1280 px. | `screens/Interfaces.tsx:1225-1454` | P2-10, P0-9 |
| Keyboard limitations | No ⌘S; Tab order only. | — | P3-1 |

## Apps

### WS-APP-LIST · App Builder list — 66/100 (functional / inconsistent)

`/t/:t/workspaces/:w/screens` · `Interfaces` `screens/Interfaces.tsx:1911` · density: standard (two-line first cell, about 54 px rows); fits a short list.

**User objective.** A developer wants to open an app definition to edit it, see whether its edits are published, or make a new app.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3 | 3.5 | 3.5 | 3 | 2 | 3.5 | 3.5 | 3.5 | **66** |

**What the eye sees first.** Verified from classes: title, description, the primary "Make an app"; in rows the app title link, then the green and amber state tags.

**Strongest existing decisions (keep).** Publish state as tags with version and "edited 3h ago" (`screens/Interfaces.tsx:1989-2007`); "reads orders, customers" under the page count (`:1981-1983`); the address derived from the name and editable (`:1928, 2073-2080`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 54 px (two-line first cell). |
| Columns | App · Pages (with the tables it reads) · State · Address (`screens/Interfaces.tsx:1962-2010`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | None at all: an app cannot be deleted, duplicated or unpublished from here; `removing` exists as a state but nothing in the file triggers it. |
| Keyboard | Tab to links. |
| Truncation | None noted. |
| Responsive | Kit `Table` defaults. |
| Loading / empty / error | Nothing is rendered while loading (`screens/Interfaces.tsx:1951-2026`); error with retry (`:1948`); empty state; a notice in non-dev workspaces (`:1942-1946`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Interaction friction | There are no row actions, so an app cannot be removed, duplicated or unpublished from its own list. | `screens/Interfaces.tsx:1951-2026` | P2-2, P3-3 |
| Discoverability | In a non-dev workspace the title is plain text, so there is no read-only view of the definition. | `screens/Interfaces.tsx:1970` | P1-3 |
| Discoverability | "Tables are under Data." in the empty state is text, not a link; Published apps is a separate nav entry and the two lists are cross-linked only by the address. | `screens/Interfaces.tsx:1957` | P2-13, P1-10 |
| Inconsistent patterns | The production-toned `Tag` is reused for "Edits not published", borrowing the colour that means production elsewhere. | `screens/Interfaces.tsx:1999`, `kit/status.tsx:127-130` | P4-5, P2-5 |
| Missing states | No loading indicator at all. | `screens/Interfaces.tsx:1951-2026` | P2-4 |
| Keyboard limitations | Tab to links only. | — | P3-1 |

### WS-APP-BUILDER · App Builder workspace — 56/100 (major UX debt)

`/t/:t/workspaces/:w/screens/:path` (an editor route: the section panel is hidden, `nav.ts:220`) · `InterfaceBuilder` `screens/Interfaces.tsx:1590`, `PageEditor` `:1225`, `WidgetSettings` `:400`, `FormatSettings` `:317`, `PageFilterSettings` `:1462`, `ActionSettings` `screens/ActionSettings.tsx:79`, `RowActionsSettings` `:259`; canvas is `PageRenderer` in editing mode (`packages/screens/src/Renderer.tsx:542-552, 779-836`) · density: canvas standard, inspector low, chrome heavy; does not fit: a builder needs a compact inspector and a maximal canvas.

**User objective.** A developer or technical operator in a dev workspace wants to compose pages of widgets over tables, wire actions to scripts and flows, and publish.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 2.5 | 3 | 3.5 | 2 | 2 | 3 | 3 | 3 | **56** |

**What the eye sees first.** Verified from classes: the solid Publish button and the solid current-page tab compete (the current page is rendered as `variant="primary"`, `screens/Interfaces.tsx:1811`), then the name field. About 200 px of chrome (back link, name row, notices, page tabs, viewport row) sits above the canvas. The priority for a builder is canvas → selected widget's settings → save state → publish; today it is publish → page tab → name → canvas.

Layout, from the code: a back link; a row with the app name as an input, the status text, "Open the app" and Publish; notices; page tabs with "+ Page", "Rename" and "Remove page"; then the canvas column (viewport switch and "See it as", a 12-column grid of 40 px rows with a 12 px gap, the page-filter fieldset and the eight-button "Add a widget" palette) beside a fixed 320 px settings `aside` (`screens/Interfaces.tsx:1414`). The two sit side by side only from 1280 px (`:1312`); below that the inspector is a full-width block under the canvas, the filters and the palette. Nothing is resizable or collapsible, and there is no left panel (no layers, outline or page tree).

**Strongest existing decisions (keep).**
- A live preview from real rows, and autosave with clear draft-versus-published wording in a `role="status"` line (`screens/Interfaces.tsx:1654-1662, 1737-1745`).
- "See it as" by audience, with an honest caveat about owner rules (`screens/Interfaces.tsx:128-158, 1344-1369`).
- The action audience warning "X cannot start Y, so they will not see this action" (`screens/ActionSettings.tsx:158-163`) and the dry run outside dev (`screens/Interfaces.tsx:1384`).
- `settle`, so a moved widget pushes others (`screens/Interfaces.tsx:1393, 1431`), and the x / y / w / h number fields as a real non-drag path (`:1154-1181`).
- Sentence-form link choices ("Rows whose customer is the row chosen in Orders", `screens/Interfaces.tsx:292-294`), the security note under Shows (`:928-931`), problems listed as "Page > Widget: message" (`:1709-1714`), the format example "Shown as $1,234.57" (`:395`).
- The action widget, row actions and input mapping are new since `docs/evolution/04-ux-audit.md` (`screens/ActionSettings.tsx:79-341`, `screens/Interfaces.tsx:460-473, 1182-1198`).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | Two solid primaries compete: Publish and the current page tab. | `screens/Interfaces.tsx:1752, 1811` | P2-10 |
| Visual hierarchy | "Rename" and "Remove page" are quiet text buttons in the same row as the page tabs and read as more pages. | `screens/Interfaces.tsx:1846-1884` | P2-10 |
| Visual hierarchy | The save line is 13 px muted grey even when it says "Not saved". | `screens/Interfaces.tsx:1737` | P2-8, P2-7 |
| Spacing | The canvas wrapper adds a border, `p-3` and `bg-canvas` on a `bg-canvas` page: a frame with no contrast. | `screens/Interfaces.tsx:1371` | P4-2 |
| Spacing | The inspector is fixed at 320 px on every screen width. | `screens/Interfaces.tsx:1414` | P3-5, P2-10 |
| Typography | The app name is a form field, not a heading; the screen has no `h1`. | `screens/Interfaces.tsx:1716-1745` | P2-3, P0-7 |
| Density | The inspector is one scroll of up to nine sections for a table widget, every control a full-height labelled field, with no collapse, tabs or search; ten shown fields make the Shows section about 1,500 px tall. | `screens/Interfaces.tsx:444, 772-901` | P2-10 |
| Density | Labels carry the column name in brackets to stay unique ("Called (status)"). | `screens/Interfaces.tsx:826, 842, 874, 888` | P2-10 |
| Interaction friction | The palette is below the canvas, so on a tall page adding a widget means scrolling past the whole page, and the new widget is appended at the bottom. | `screens/Interfaces.tsx:1290, 1399-1410` | P2-10 |
| Interaction friction | A widget can be selected only through the small "Edit" button in its header; there is no Esc or click-on-empty to deselect and no multi-select. | `packages/screens/src/Renderer.tsx:889-897` | P2-10 |
| Interaction friction | No arrow-key nudge, duplicate, copy / paste, change-type or page reorder. | `screens/Interfaces.tsx:1225-1454` | P2-10 |
| Interaction friction | The name cannot be emptied while retyping: an empty value is ignored, so the last character snaps back. | `screens/Interfaces.tsx:1730-1732` | P2-7 |
| Interaction friction | The action widget's "Button" label field is inert until a target is chosen, yet sits above the target. | `screens/ActionSettings.tsx:137-138` | P2-10 |
| Interaction friction | "Add" a field is a select that resets itself; filter values refetch the preview on every keystroke; every keystroke `structuredClone`s the whole body. | `screens/Interfaces.tsx:904-926, 1664-1672`, `packages/screens/src/Renderer.tsx:165-202` | P2-10 |
| Discoverability | Drag and stretch are announced only by `title` tooltips and one sentence deep in the inspector; palette descriptions are `title` tooltips. | `screens/Interfaces.tsx:1150-1153, 1404` | P3-1 (Tooltip), P2-10 |
| Discoverability | Preview writes are real: in a dev workspace, edits, deletes and action buttons in the canvas change real rows and start real runs, and nothing on the canvas says so. | `screens/Interfaces.tsx:159-175, 1384` | P0-6, P2-10 |
| Discoverability | The Tablet and Phone buttons only set `max-width` on the wrapper, while the renderer's layout switches on viewport breakpoints, so "Phone 390" shows the twelve-column grid squeezed to 390 px, not the single column a phone gets. | `screens/Interfaces.tsx:1370-1375`, `packages/screens/src/Renderer.tsx:854, 869` (Inferred from CSS semantics) | P0-6, P2-10 |
| Discoverability | The builder has no Share entry; sharing lives on a different nav entry. | `screens/Interfaces.tsx:1590-1910` | P1-5, P2-10 |
| Inconsistent patterns | Page tabs are buttons with `aria-pressed` while the runtime uses kit `Tabs` for the same pages; the viewport switch is a `radiogroup`; Rows / Definition elsewhere are pressed pills: three tab idioms. | `screens/Interfaces.tsx:1315-1343, 1809-1819`, `packages/screens/src/Renderer.tsx:990-1003` | P2-12 |
| Inconsistent patterns | The Dashboards editor is the same component with a manual Save. | `screens/Dashboards.tsx:204-235` | P2-10 |
| Accessibility | The drag header has no keyboard semantics and the 16 px resize handle is `aria-hidden` and hidden below `md`; the number fields are the alternative. | `packages/screens/src/Renderer.tsx:878-884, 900-907` | P2-10 |
| Accessibility | Problems-list entries are not links to the widget they name. | `screens/Interfaces.tsx:1794-1805` | P2-10 |
| Missing states | No undo or redo, although `kit/history.ts` exists and the flow editor uses it. | `screens/FlowEditor.tsx:36` | P2-10 |
| Missing states | "Remove this widget" is a red button at the bottom of the inspector with no confirm and no undo, autosaved 700 ms later; row-action removal is the same. | `screens/Interfaces.tsx:1200-1204, 1434-1445`, `screens/ActionSettings.tsx:298-300` | P0-9 |
| Missing states | Publish deploys at once with no confirm, diff or summary, shows no progress beyond a disabled button, and never shows "published vN at time". | `screens/Interfaces.tsx:1683-1706, 1753` | P2-10, P1-5 |
| Missing states | A revision conflict leaves `revision.current` stale, so every later save fails with no reload or merge affordance. | `screens/Interfaces.tsx:1640-1648` (Inferred) | P0-4 |
| Missing states | Any error reading the draft silently falls back to the deployed version; there is no "discard draft / revert to published". | `screens/Interfaces.tsx:1621-1625` | P0-4, P2-10 |
| Missing states | No navigation guard in the 700 ms autosave window or after a failed save. | `screens/Interfaces.tsx:1654-1662` | P0-4 |
| Missing states | Current page, selected widget, viewport and as-group are component state, so a reload returns to page 1 with nothing selected. | `screens/Interfaces.tsx:1242-1243, 1601-1602` | P2-6 |
| Keyboard limitations | Tab order only: no shortcut for publish, add, delete, deselect, next widget or undo. | `screens/Interfaces.tsx:1590-1910` | P3-1, P2-10 |
| Responsive | Under 1280 px the inspector drops below the canvas, the filters and the palette, so every settings change is a scroll. | `screens/Interfaces.tsx:1312, 1414` | P2-10 |
| Simplification | Put Place and size in one compact four-up row at the top, collapse inspector sections, move the palette to a left rail or a toolbar "+", and make page tabs real tabs with a menu for rename and remove. | Judgment | P2-10 |

### RT-APP · App runtime (Renderer) — 63/100 (functional / inconsistent)

Served at each app's address and previewed inside the builder · `PageRenderer` `packages/screens/src/Renderer.tsx:941`, `InterfaceRenderer` `:964`, `PageBody` `:733`, `WidgetView` `:106`, `PageFilters` `:664`; `useActions` `packages/screens/src/actions.tsx:103`, `ActionButton` `:253`; widgets in `packages/ui/src/widgets.tsx` (table `:198`, form `:272`, chart `:350`, card `:389`, cards `:421`) · density: standard; fits (widget chrome of a header plus `p-3` is appropriate).

**User objective.** An end user or staff member wants to read rows, choose one and act on it.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 3 | 3 | 3 | 3 | 2.5 | 3.5 | 3.5 | 3 | **63** |

**What the eye sees first.** Verified from classes: page filters, then the action outcome notice if there is one, then widget cards in grid order. Appropriate.

**Strongest existing decisions (keep).**
- Specific, humane degraded states per widget: table gone, may not read, column gone, waiting for a choice (`packages/screens/src/Renderer.tsx:266-300`).
- End users get "Quote run X if you ask for help" while members get the reason and an "Open run" link (`packages/screens/src/actions.tsx:170-178, 202-211`).
- `enabledWhen` with "Choose a row first." (`packages/screens/src/actions.tsx:272`); a 30 s wait and then "still running" (`:142-186`).
- Reference lookups are batched (`packages/screens/src/Renderer.tsx:204-242`); charts have `role="img"` and a name (`packages/ui/src/Chart.tsx:80-83`).

**Table behaviour** (the table widget).

| Aspect | Today |
| --- | --- |
| Row height | 37–41 px. |
| Columns | The fields the builder chose, plus a radio column and a row-actions column. |
| Sort | None for the reader. |
| Filter | Page filters only; typed value filters refetch on every keystroke (`packages/screens/src/Renderer.tsx:627-637`). |
| Search | None. |
| Paging / virtualisation | "Show more" appends 50 (`packages/ui/src/widgets.tsx:187-196`, `packages/screens/src/Renderer.tsx:163, 348-371`); no count and no end marker; a failed next page is unhandled (`:354-367`). |
| Selection | Single, by radio (`packages/ui/src/Grid.tsx:293-303`). |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | Up to five quiet text buttons plus Open plus Delete inline per row, with no overflow menu; Delete is `quiet`, not `danger` (`packages/ui/src/widgets.tsx:239-262`). |
| Keyboard | As `Grid`: every editable cell is a tab stop. |
| Truncation | 320 px with no expand. |
| Responsive | Each widget has a fixed grid height and its own `overflow-auto` (`packages/screens/src/Renderer.tsx:908`), so pages are nested scroll areas and table headers inside are not sticky. |
| Loading / empty / error | "Loading…" only when empty; per-widget error (`packages/screens/src/Renderer.tsx:339`); empty text. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Feedback | The action outcome notice renders once at the top of the page, so a row action pressed at the bottom of a long page reports off-screen; it cannot be dismissed and focus does not move to it. | `packages/screens/src/Renderer.tsx:853` | P2-8 |
| Feedback | Only the action widget's button shows "Label…" and disables; row action buttons are never disabled or marked busy, inviting double starts. | `packages/screens/src/actions.tsx:265-271`, `packages/ui/src/widgets.tsx:241-249` | P2-8 |
| Density | Up to seven inline text buttons per row. | `packages/ui/src/widgets.tsx:239-262` | P2-2 |
| Inconsistent patterns | Delete is `quiet` here and red in the console's own grid. | `packages/ui/src/widgets.tsx:256-259` | P2-12 |
| Data readability | The chart is fixed at 220 px regardless of the widget's height, and redraws on the OS colour scheme only, not the console's `data-theme` switch. | `packages/screens/src/Renderer.tsx:450`, `packages/ui/src/Chart.tsx:33-39` (theme point Inferred) | P2-10 |
| Accessibility | The radio-column idiom and the 2.52:1 "empty" text are inherited from `Grid`; the filter placeholder is 3.04:1; filter labels are hand-rolled 13 px muted text. | `packages/ui/src/widgets.tsx:182`, `packages/screens/src/Renderer.tsx:629, 641, 688` | P0-2, P2-9 |
| Missing states | A failed "Show more" page has no rejection handler. | `packages/screens/src/Renderer.tsx:354-367` | P2-4 |
| Missing states | "This page has nothing on it yet." is the only empty-page state. | `packages/screens/src/Renderer.tsx:838-840` | P2-13 |
| Keyboard limitations | Same as `Grid`; the cards widget uses `aria-pressed` buttons and works by Tab. | `packages/ui/src/widgets.tsx:469-476` | P2-9 |
| Responsive | Layout switches on viewport breakpoints (`md:grid-cols-12`), so the builder's narrow previews do not show it. | `packages/screens/src/Renderer.tsx:854, 869` | P2-10 |

### WS-APPS · Published apps and sharing — 69/100 (functional / inconsistent)

`/t/:t/workspaces/:w/apps` (a workbench, `nav.ts:231`) · `Apps` `screens/Apps.tsx:370` → `AppList` `:389` (`CollectionView` + `Inspector`), `ShareDialog` `:89` (wide `SideSheet` with `Tabs`) · density: standard (59 px two-line rows); acceptable for a short list.

**User objective.** A workspace admin wants to see what is served, to whom, and change who may open it.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 4 | 3.5 | 3.5 | 3 | 2.5 | 3 | 3.5 | 4 | 4 | **69** |

**What the eye sees first.** Verified from classes: title and description, then rows led by the app title; "Open to" turns amber when it includes "anyone" (`screens/Apps.tsx:441`). The inspector footer leads with the solid Share. This matches the priority.

**Strongest existing decisions (keep).**
- The list-plus-inspector workbench with column priorities, and "Open to" in words.
- Sharing gives the app and its tables in one step, with the sentence that says so (`screens/Apps.tsx:268-275`).
- The "What they can read" tab, with the policy per table and "Someone in Support sees 42 rows" (`screens/Apps.tsx:291-338`).
- Anonymous-access warnings in three places (`screens/Apps.tsx:275-280, 339-343, 493-497`); repository-managed bindings are shown but not removable (`:192-193`); a notice for unserved apps (`:399-408`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 59 px for two-line rows, about 41 px for one-line rows. |
| Columns | App · Address · Open to · Built (`screens/Apps.tsx:414-449`); no audience count, last-published time or health. |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | Single; opens the inspector; lost when the share sheet closes (`screens/Apps.tsx:375, 379-382`). |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | None in the row; Share and "Open the live app" are in the inspector footer. |
| Keyboard | Row focusable, Enter / Space selects (`kit/CollectionView.tsx:110-121`). |
| Truncation | None noted. |
| Responsive | Sticky header; priority columns hide at `sm` / `lg`. |
| Loading / empty / error | "Loading…", `EmptyCanvas`, error `Notice` with no retry. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Error recovery | "Stop sharing" has no confirm and removes that principal's bindings on the app and on every table the app reads; if another app shared with the same group reads the same table, that group loses the table there too, and nothing warns of it. | `screens/Apps.tsx:195-216` (cross-app effect Inferred from the filter at `:201-213`) | P0-9 |
| Error recovery | Sharing posts one binding per target in a loop; a failure midway leaves the app shared without some tables, reported only as a generic problem line. | `screens/Apps.tsx:229-246, 281` | P2-8 |
| Interaction friction | Closing the sheet bumps `version`, which re-keys `AppList`, so the selected row and open inspector are thrown away. | `screens/Apps.tsx:375, 379-382` | P2-6 |
| Interaction friction | "Share with" is one flat native select mixing every end-user group, every member group and two special audiences, with no search or grouping and a cap at the first 200 of each. | `screens/Apps.tsx:106-110, 137-148` | P2-11, P2-7 |
| Interaction friction | Links inside cells do not stop the row click, so opening an address also selects the row. | `screens/Apps.tsx:427-432` | P2-2 |
| Feedback | There is no success confirmation after Share other than the list growing, and the form does not reset. | `screens/Apps.tsx:229-246` | P2-8 |
| Discoverability | Share is only in the inspector footer; the list shows no share affordance and no audience count per row. | `screens/Apps.tsx:389-510` | P2-2 |
| Discoverability | Builder-made apps do not link back to their builder: the interface path is text. | `screens/Apps.tsx:508-510` | P1-10 |
| Density | Audiences are bordered cards, fine under ten and noisy beyond. | `screens/Apps.tsx:176-220` | P4-2 |
| Missing states | No search or filter on the list, no last-published time, no health or last-opened. | `screens/Apps.tsx:389-510` | P2-2 |
| Accessibility | Row semantics and inspector focus as for every `CollectionView` list. | `kit/CollectionView.tsx:105-124`, `kit/layout.tsx:85-140` | P0-3 |
| Keyboard limitations | No row movement; the palette's app results land on the list, not the app. | `kit/CommandPalette.tsx:142-147` | P3-1, P3-2 |

## Configure

### WS-CONNECTIONS · Connections and the connection wizard — 70/100 (good but visibly improvable)

`/t/:t/workspaces/:w/connections` (`?oauth=` on return from a provider) · `Connections` `screens/Execution.tsx:563`, `ConnectionHealth` `:522`, `TestConnection` `:486`, `ConnectionWizard` `screens/ConnectionWizard.tsx:152` (wide `SideSheet`) · density: standard (45 px rows); fits, though an operations view of 50 or more connections would want compact rows with an overflow menu.

**User objective.** A developer or workspace admin wants to make an external system reachable from this workspace and prove that it is.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3.5 | 3.5 | 4 | 3.5 | 2.5 | 3.5 | 3.5 | 3.5 | **70** |

**What the eye sees first.** Verified from classes: in each row the mono path, then the health pill, placed second by design (comment at `screens/Execution.tsx:599`), with a solid "Connect" button inline when OAuth needs it (`:532-538`). Health as the second thing is exactly right. Observed (mocked API) for the empty list only: an explanation plus "New connection", which names the next action.

**Strongest existing decisions (keep).**
- Testing is first-class: a row-level Test (`screens/Execution.tsx:627`), an automatic test after Save for non-OAuth connections (`screens/ConnectionWizard.tsx:295`) and on OAuth return (`:239-244`), run from a workspace worker "from where scripts run" (`:463`), with a slow state (`:500`).
- One wizard declares, binds and tests; this largely fixes earlier finding IA4 (`screens/ConnectionWizard.tsx:152-532`).
- OAuth presets with the redirect address and Copy (`screens/ConnectionWizard.tsx:409-421`); "Change the token" after a failed test (`:517-527`).
- Secrets are write-only: "Leave it empty to keep the one stored", "Stored encrypted and never shown again" (`screens/ConnectionWizard.tsx:442-454`); the OAuth client secret note "workers never receive it" (`:64`).
- "Used by" as a column (`screens/Execution.tsx:601`), and per-workspace framing in the sheet description (`screens/ConnectionWizard.tsx:312`).

How the five concerns of a connection are told apart today:

| Concern | Today | Assessment |
| --- | --- | --- |
| Identity | Mono path in column 1 (`screens/Execution.tsx:598`); Kind in column 4 (`:602`). | Clear; the description appears only in the wizard header (`screens/ConnectionWizard.tsx:326-332`). |
| Health | `StatePill` in column 2 (`screens/Execution.tsx:600`) with latency; failure text truncated to 18 rem with the rest and the test time in a `title` (`:543-559`). | Good vocabulary; the age of the result is tooltip-only, so a two-week-old "Reached" looks fresh; unbound rows show nothing in Health (`:523`) and a badge in column 5 (`:614`). |
| Usage | "Used by": first three paths in mono, "and N more", full list in a `title` (`kit/references.tsx:19-30`). | Present, which is the main gain; not links, not expandable, tooltip-only. |
| Secret | Write-only password fields. | Never exposed; but the list has no "credential set" column (`hasCredential` is unused), unlike Sources and group members. |
| Destruction | "Unbind" as a red text button in every row (`screens/Execution.tsx:633-638`). | The confirm does not name the scripts although `connectionUses(row.path)` is in scope two lines above (`:635`). |

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 45 px. |
| Columns | Connection · Health · Used by · Kind · Points to (`screens/Execution.tsx:598-604`): a good order. |
| Sort | None. |
| Filter | None; no filter by health, kind or unbound. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None; no "Test all". |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | Test, Change (or Set up) and Unbind as three right-aligned buttons that wrap (`screens/Execution.tsx:625`); with the inline Connect button a row can hold four. |
| Keyboard | Tab order only; no per-connection URL, and the palette opens the list (`kit/CommandPalette.tsx:142-143`). |
| Truncation | "Points to" truncates at 16 rem with a `title` (`screens/Execution.tsx:607-612`); failure text at 18 rem with a `title`. |
| Responsive | Kit `Table` defaults. |
| Loading / empty / error | `ListScreen` loading text, error with retry, empty state with "New connection"; health states Not bound, Not tested, Reached, Failed, Testing…, Waiting for a worker…, and the OAuth states. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Feedback | A new connection is "declared in a draft, deployed with your next change": after Save it tests green, but no script can use it until a deploy, the sheet has no link to Releases, and the list never renders `defined: false`. | `screens/ConnectionWizard.tsx:257-264, 464-466`, `screens/Execution.tsx:597-617` | P1-5 |
| Feedback | Save is in the sticky footer while the Saved / Connected / Tested list and any error are in section 4 at the bottom of the scroll, with nothing scrolling them into view. | `screens/ConnectionWizard.tsx:457-516` | P2-8, P2-7 |
| Visual hierarchy | "1 · 2 · 3 · 4" are section labels, not a stepper: the kit `Stepper` is unused and nothing marks which steps are complete. | `screens/ConnectionWizard.tsx:324, 427, 441, 458`, `kit/layout.tsx:166` | P2-7 |
| Interaction friction | Esc or a backdrop click closes the sheet and discards typed settings without asking. | `packages/ui/src/SideSheet.tsx:42` | P0-4 |
| Interaction friction | Three or four buttons per row, right-aligned and wrapping. | `screens/Execution.tsx:625` | P2-2 |
| Discoverability | There is no per-connection URL; the detail is a list row plus a sheet, not a page with definition, binding, used-by and health (the second half of earlier finding IA4, not done). | `screens/Execution.tsx:591-658` | P1-10 |
| Discoverability | The sheet never shows who uses the connection being changed. | `screens/ConnectionWizard.tsx:152-532` | P0-9, P1-10 |
| Discoverability | "Used by" paths are not links, and the full list is pointer-only. | `kit/references.tsx:19-30` | P1-10 |
| Inconsistent patterns | The title is "Set up x" even for an already-bound connection opened through "Change", and the button reads "Save again". | `screens/ConnectionWizard.tsx:311, 317` | P2-7 |
| Inconsistent patterns | "Not bound" is an attention `Badge` here and a production-toned `Tag` on the run page. | `screens/Execution.tsx:614`, `screens/RunPage.tsx:330` | P2-5 |
| Missing states | No search, no filter, no test history. | `screens/Execution.tsx:563-660` | P2-2 |
| Accessibility | Failure detail and the usage list are tooltip-only. | `screens/Execution.tsx:543-559`, `kit/references.tsx:23-29` | P3-1 (Tooltip), P1-10 |
| Keyboard limitations | Tab order only; the name is validated on Save only. | `screens/ConnectionWizard.tsx:249-254` | P3-1, P2-7 |

### WS-CONNECTION-GROUPS · Connection groups — 55/100 (major UX debt)

Rendered under the Connections list (`screens/Tenant.tsx:577-580`) · `ConnectionGroups` `screens/Execution.tsx:1125` · density: standard (45 px rows); fits.

**User objective.** A workspace admin wants to maintain the members of a connection group, a set of keyed connections that a script picks from at run time.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3 | 2.5 | 3.5 | 2 | 2.5 | 2 | 3 | 2.5 | 3 | **55** |

**What the eye sees first.** Verified from classes: a second page-like heading under the Connections table, then one bordered panel per group with a solid "Add a member" in each header (`screens/Execution.tsx:1156`). With several groups there are several solid primaries on one screen.

**Strongest existing decisions (keep).** "Used from the next run, with no deploy" (`screens/Execution.tsx:1136-1138`); the consequence-first empty text "A script that asks this group for a key will fail until one is added"; the dashed empty note, which fixes earlier finding V5 (`:1141-1146`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 45 px. |
| Columns | Key · Name · Points to · Credential (Set or None) · Remove (`screens/Execution.tsx:1165-1195`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | Remove only; no Test and no Change. |
| Keyboard | Tab order only. |
| Truncation | None noted. |
| Responsive | Hand-rolled table with no scroll wrapper. |
| Loading / empty / error | Loading renders nothing, so the section pops in (`screens/Execution.tsx:1129`); error with no retry (`:1128`); no-groups and no-members notes (`:1141-1146, 1160-1163`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | One solid primary per group panel. | `screens/Execution.tsx:1156` | P4-2, P2-2 |
| Typography | The heading is `text-lg`, unlike every other section heading. | `screens/Execution.tsx:1134` | P2-1 |
| Interaction friction | Members have no Test and no health, although each is a full connection with an address and a credential. | `screens/Execution.tsx:1165-1195` | P2-5, screen-local |
| Interaction friction | There is no Change: re-adding the key replaces it, with no prefill. | `screens/Execution.tsx:1209` | P2-7 |
| Discoverability | No "used by". | `screens/Execution.tsx:1125-1250` | P1-10 |
| Inconsistent patterns | Adding a member is a centred dialog while adding a connection is a wizard sheet; the table is hand-rolled. | `screens/Execution.tsx:1165-1195, 1199-1249` | P2-2, P2-7 |
| Missing states | Remove's confirm title is just "Remove?" and its text does not say "Remove member X from group Y". | `ListScreen.tsx:325` | P0-9 |
| Missing states | Loading returns `null` and the error has no retry. | `screens/Execution.tsx:1128-1129` | P2-4 |

### WS-VARIABLES · Variables — 62/100 (functional / inconsistent)

`/t/:t/workspaces/:w/variables` · `Variables` `screens/Execution.tsx:663` on `ListScreen` · density: standard; fits.

**User objective.** A workspace admin wants to see and set this workspace's value for each declared variable.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 2.5 | 3.5 | 3 | 3 | 2 | 3.5 | 3.5 | 3.5 | **62** |

**What the eye sees first.** Verified from classes: title, description, the solid "Set variable"; then mono paths.

**Strongest existing decisions (keep).** The "Read by" column (`screens/Execution.tsx:673`); the distinction between a value and "Default: x" (`:676-683`); choosing the variable from a searchable list rather than typing a name (`:689-699`).

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | 37–45 px. |
| Columns | Variable · Read by · For · Value here (`screens/Execution.tsx:672-676`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | "Use default" only, drawn as a red destructive button (`screens/Execution.tsx:707-712`); no row-level edit. |
| Keyboard | Tab order only. |
| Truncation | Values are mono with no truncation for long values (`screens/Execution.tsx:679`). |
| Responsive | Kit `Table` defaults. |
| Loading / empty / error | `ListScreen` loading and error with retry; the empty state has a title and no text (`screens/Execution.tsx:685`). |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Interaction friction | There is no row-level edit: changing a value means the header button, re-finding the variable in the combobox and retyping, with no prefill. | `screens/Execution.tsx:686-704` | P2-7, P2-2 |
| Visual hierarchy | "Use default" is a red button with a "Use default?" confirm, over-signalling a reversible action. | `screens/Execution.tsx:705-714` | P0-9 (tone), P2-8 (undo) |
| Discoverability | A variable that does not exist yet cannot be created here; "New variable" lives under All resources (earlier finding IA3, partly open). | `screens/Execution.tsx:686-704`, `screens/Tenant.tsx:620-631` | P2-13, P1-10 |
| Discoverability | "Read by" paths are not links. | `kit/references.tsx:19-30` | P1-10 |
| Missing states | No type or validation hint for a value; the empty state has no text. | `screens/Execution.tsx:685` | P2-7, P2-13 |
| Keyboard limitations | Tab order only. | — | P3-1 |

### WS-SECRETS · Secrets — 64/100 (functional / inconsistent)

`/t/:t/workspaces/:w/secrets` · inline `ListScreen` `screens/Tenant.tsx:662-711` · density: standard (45 px rows); fits.

**User objective.** A workspace admin wants to set or replace a secret and know what uses it, without the value ever being shown.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3 | 3.5 | 3 | 2.5 | 2 | 3.5 | 3.5 | 3.5 | **64** |

**What the eye sees first.** Verified from classes: title, the reassuring description ("can be replaced but never read back here"), the solid "Set secret"; then mono names.

**Strongest existing decisions (keep).** Values are never fetched or shown: the field is `type="password"` and the row type holds only name, time and who (`screens/Tenant.tsx:662`). "Used by" (`:669`) and "Last set … by …" (`:670-679`) are columns. The write-only model is stated in the description.

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | About 45 px. |
| Columns | Name · Used by · Last set (`screens/Tenant.tsx:668-671`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None (and no value to copy, by design). |
| Row actions | Delete only (`screens/Tenant.tsx:703-710`); no "Replace value". |
| Keyboard | Tab order only. |
| Truncation | None noted. |
| Responsive | Kit `Table` defaults. |
| Loading / empty / error | `ListScreen` loading text, error with retry, empty state. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Interaction friction | Replacing a value means typing the exact name again; a typo silently creates a new secret. | `screens/Tenant.tsx:686-702` | P2-7 (SecretField), P0-9 |
| Error recovery | The delete confirm says "Anything that uses it will fail." without listing the users that `secretUses(row.name)` already holds, and is a simple confirm. | `screens/Tenant.tsx:706` | P0-9 |
| Discoverability | Secrets a script declares but nobody has set are not shown as missing; the list holds stored secrets only. | `screens/Tenant.tsx:662-711` (Inferred) | P2-13, P1-10 |
| Discoverability | Connection credentials, data-source passwords and group-member credentials are not visible here, so "all secrets" lives in four places. | `screens/Tenant.tsx:662-711` | P1-10 |
| Data readability | There is no rotation-age cue beyond a date. | `screens/Tenant.tsx:670-679` | P4-6 |
| Keyboard limitations | Tab order only. | — | P3-1 |

### TN-WORKERS · Workers: pools, credentials and queue — 63/100 (functional / inconsistent)

> Workers is assessed twice. This section looks at it as operational data (pools, credentials, the queue panel). The tenant sections below look at it as an administration screen and give 62 with different sub-scores. The matrix in 11 carries the range.

`/t/:t/workers` · `Workers` `screens/Execution.tsx:922` (resolved at `screens/Tenant.tsx:224`), `QueuePanel` `:824`, `PoolCard` `:731`, credentials `ListScreen as="section"` `:1026` · density: mixed (queue table compact at 33 px, pool cards low); the cards do not fit operational data.

**User objective.** A tenant admin wants to know whether work is waiting, which pools and workers are online, and issue or revoke worker credentials.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 3 | 3.5 | 3.5 | 3 | 2 | 3 | 3 | 3.5 | **63** |

**What the eye sees first.** Verified from classes: title, description, the solid "Add pool"; then the Queue heading and, when there is a backlog, an amber notice (`screens/Execution.tsx:845-855`). Backlog first is right.

**Strongest existing decisions (keep).** The backlog sentence with the oldest wait; queue rows that link to that workspace's queued runs (`screens/Execution.tsx:872`); the "Older version: takes no tasks" badge (`:906-908`); the pool's online pill with last seen; the long but honest "refused" explanation (`:965-972`). Queue depth, workers online and the version badge are new since `docs/evolution/04-ux-audit.md` (`:824-920`).

**Table behaviour** (queue table, pool cards, credentials list).

| Aspect | Today |
| --- | --- |
| Row height | Queue: about 33 px. Pools: cards in a 1 / 2 / 3-column grid (`screens/Execution.tsx:951-963`). Credentials: about 45 px. |
| Columns | Queue: Workspace · Pool · Waiting · Oldest · Later · Running (`screens/Execution.tsx:860-865`). Credentials: Name · Credential (prefix) · Pool · Created · Status (`:1041-1049`). |
| Sort | None. |
| Filter | None; revoked credentials stay in the list with no filter. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | The new credential token is selectable text in a notice with no Copy button (`screens/Execution.tsx:1081-1088`); the screen shows no worker start command to copy beside it. |
| Row actions | Remove pool (card), Revoke (credential). |
| Keyboard | Tab order only. |
| Truncation | None noted. |
| Responsive | Queue table has `min-w-[32rem]`; cards reflow. |
| Loading / empty / error | Queue and pools: "Loading…" text and an error `Notice` with no retry (`screens/Execution.tsx:837-840, 948-951`); credentials use `ListScreen` states. |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Density | Pools are cards holding four facts and one action each; beyond a handful they should be rows (the earlier audit said the same). | `screens/Execution.tsx:731, 951-963` | P2-2, P4-2 |
| Density | Workers online is an unlabelled inline list rather than rows. | `screens/Execution.tsx:899-916` | P2-2 |
| Interaction friction | The one-time credential has no Copy button although `CopyButton` exists (earlier finding X6, not done here). | `screens/Execution.tsx:1081-1088` | P0-10 |
| Error recovery | The managed-workers toggle is a sentence plus a small button with no confirm, and its `await api.patch` is not in a try / catch. | `screens/Execution.tsx:985-995` | P0-9, P2-8 |
| Inconsistent patterns | "Active" and "Revoked" are `Badge`s (`action` and `danger` tones) where other screens use a `StatePill` for "Active". | `screens/Execution.tsx:1052, 1054` | P2-5 |
| Accessibility | Queue `<th>` cells have no `scope` and the table has no accessible name; sizes are literal `text-[13px]` / `text-[14px]`. | `screens/Execution.tsx:857-865` | P2-2, P2-1 |
| Missing states | No connection-health sign for the queue numbers, which change continuously. | `screens/Execution.tsx:824-920` | P1-7 |
| Keyboard limitations | Tab order only. | — | P3-1 |

### WS-SETTINGS · Workspace settings — 70/100 (good but visibly improvable)

`/t/:t/workspaces/:w/settings` · `WorkspaceSettings` `screens/Environments.tsx:166` → `WorkspaceControls` `:36`, `CloneDialog` `:194`, `Promotion` `:384` with its preview dialog `:452-504` · density: low to standard; right for a settings page.

**User objective.** A workspace admin wants to pause triggers, clone the workspace, set where it promotes to, or delete it.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 3.5 | 3.5 | 3.5 | 3.5 | 3.5 | 2.5 | 3.5 | 3.5 | 4 | **70** |

**What the eye sees first.** Verified from classes: title, description, then uppercase section labels; the first vivid element is either the amber "Triggers are paused" notice or the "Triggers are running" pill (`screens/Environments.tsx:68-96`), which is right. Observed (mocked API): a label "PROMOTION TARGET" sits above a card whose own heading is "Promotion", four single-purpose cards each wrap one sentence and one button, and the content is capped near 960 px while the overview uses the full width.

**Strongest existing decisions (keep).**
- A danger zone with type-to-confirm on the slug and a server-side `?confirm=` (`screens/Environments.tsx:128-137`); production cannot be deleted (`:147-151`).
- Clone defaults to "Safety: On", with the consequence in the hint and an audit note (`screens/Environments.tsx:330-344`), and its report states whether the copy can reach real systems (`:259-266`).
- A promotion preview with Add / Change / Remove badges and "To the data" lines before anything happens (`screens/Environments.tsx:509-553`).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The Promotion panel has its own `h2` "Promotion" inside a section already labelled "Promotion target". | `screens/Environments.tsx:112, 415`; Observed (mocked API) | P4-2, P2-3 |
| Spacing | Four cards each hold one sentence and one button, and the promotion panel nests three notices. | Observed (mocked API); `screens/Environments.tsx:414, 449, 450, 467` | P4-2 |
| Spacing | The page gutter starts content at x = 320 while workbenches start at x = 312, and the page caps itself at 60 rem. | Observed (mocked API); `screens/Environments.tsx:64` | P2-1, P3-8 |
| Error recovery | "Pause triggers" on a production workspace is one click on a small secondary button with no confirm. | `screens/Environments.tsx:92` | P0-9 |
| Error recovery | Changing "Promotes to" saves on select change with no confirm or undo. | `screens/Environments.tsx:432-440` | P0-9, P2-7 |
| Inconsistent patterns | The release action "Review and promote" lives inside Settings, and its final button is `variant="primary"` although the kit reserves `promote` "for the one action that changes production". | `screens/Environments.tsx:481-482`, `packages/ui/src/Button.tsx:9-10` | P4-5, P1-5 |
| Inconsistent patterns | Success is shown as an attention-toned notice. | `screens/Environments.tsx:450` | P2-8 |
| Missing states | The name and slug cannot be changed here. | `screens/Environments.tsx:166-192` | screen-local |
| Missing states | Closing the clone dialog mid-copy leaves no way back to its progress except reopening it. | `screens/Environments.tsx:194-284` | P2-8 |
| Keyboard limitations | Tab order only. | — | P3-1 |

## Operator data tools

### TN-EXPORT · Tenant export — 69/100 (functional / inconsistent)

> Export is assessed twice: here beside the other operator data tools, and under the tenant's governance screens below, which give 67. The matrix in 11 carries the range.

`/t/:t/export` · `TenantExport` `screens/Environments.tsx:557` · density: low; fits.

**User objective.** A tenant owner wants to download an encrypted export of the tenant.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 4 | 3.5 | 3.5 | 3 | 3 | 3 | 3.5 | 3.5 | 3.5 | **69** |

**What the eye sees first.** Verified from classes: title, description, two passphrase fields and the button, in a form capped at `max-w-md` (`screens/Environments.tsx:571`).

**Strongest existing decisions (keep).** The passphrase is asked twice with a clear statement that it is not stored (`screens/Environments.tsx:608`); the follow-up "API keys and worker credentials are never in an export" (`:633-636`); large tenants are pointed to the CLI.

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Visual hierarchy | The most important caveat, that rows and files are readable by anyone holding the file, is 13 px muted text below the button. | `screens/Environments.tsx:643-647` | P0-9 (state consequences before the act) |
| Missing states | "Exporting…" has no progress, and the whole file is buffered in memory before download. | `screens/Environments.tsx:586` | P2-8 |
| Inconsistent patterns | Success uses the attention tone. | `screens/Environments.tsx:557-650` | P2-8 |
| Discoverability | There is no record of past exports. | `screens/Environments.tsx:557-650` | P2-11 (audit) |

### IN-DATABASES · Database locations — 62/100 (functional / inconsistent)

`/instance/databases` · `DatabaseLocations` `screens/Environments.tsx:665` on `ListScreen` · density: standard; fits.

**User objective.** The instance operator wants to register dedicated databases for tenants and see whether each is reachable.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.5 | 3.5 | 3 | 3.5 | 3 | 2.5 | 2 | 3 | 3.5 | 3.5 | **62** |

**What the eye sees first.** Verified from classes: title, description, the primary register action, then mono names with a status badge.

**Strongest existing decisions (keep).** The connection string is a write-only password field (`screens/Environments.tsx:705-711`); Remove is offered only when no tenant lives there (`:720`); "Nothing in that database is touched".

**Table behaviour.**

| Aspect | Today |
| --- | --- |
| Row height | 37–45 px. |
| Columns | Name · For · Database (database on host) · Tenants (count, right) · Status (`screens/Environments.tsx:673-678`). |
| Sort | None. |
| Filter | None. |
| Search | None. |
| Paging / virtualisation | None. |
| Selection | None. |
| Batch actions | None. |
| Saved views | None. |
| Column customisation | None. |
| Copy | None. |
| Row actions | Remove, only when no tenant lives there; nothing explains why it is withheld otherwise. |
| Keyboard | Tab order only. |
| Truncation | None noted. |
| Responsive | Kit `Table` defaults. |
| Loading / empty / error | `ListScreen` states; empty "No dedicated databases". |

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Feedback | The reason a location is unreachable is only a `title` on the badge, and there is no re-check action. | `screens/Environments.tsx:683-685` | P2-5, P3-1 (Tooltip) |
| Interaction friction | Re-registering is the only way to change an address, with no prefill. | `screens/Environments.tsx:696` | P2-7 |
| Discoverability | Which tenants live in a location is a count, not a link. | `screens/Environments.tsx:676` | P1-10 |
| Missing states | When Remove is withheld there is no explanation. | `screens/Environments.tsx:720` | P0-9 |
| Inconsistent patterns | Reachability is a `Badge` here, a `StatePill` on Connections and coloured text on Data sources. | `screens/Environments.tsx:678-685` | P2-5 |
| Keyboard limitations | Tab order only. | — | P3-1 |

### IN-IMPORT · Tenant import — 77/100 (good but visibly improvable)

`/instance/import` · `TenantImport` `screens/Environments.tsx:816` · density: standard; fits.

**User objective.** The instance operator wants to bring an exported tenant onto this instance and be sure of what will happen before anything is written.

| TC (12) | IA (10) | IE (12) | DR (10) | FB (12) | ER (10) | KB (10) | A11y (10) | DS (7) | VC (7) | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.5 | 4 | 3.5 | 4 | 4 | 4 | 3 | 3.5 | 4 | 4 | **77** |

**What the eye sees first.** Verified from classes: the kit `Stepper` with Upload → Check → Import (`screens/Environments.tsx:868-875`), then the current step's content. This is the best screen in Part B and the model for other multi-step acts.

**Strongest existing decisions (keep).**
- Stage, then commit: "nothing is written until you import it".
- The four checks as state pills in words (`screens/Environments.tsx:965-988`), and "Check again" without re-uploading.
- The "Not carried" list before and after, and the post-import checklist (`screens/Environments.tsx:887-907`).
- A specific message when a staged file was lost to another replica (`screens/Environments.tsx:828-836`).

| Dimension | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Feedback | "This tenant is on this instance already" shows as a failed check but is not part of `ready`, so a red check can coexist with an enabled Import. | `screens/Environments.tsx:856-861, 978-982` | P0-6 |
| Feedback | The disabled Import button does not say which check blocks it. | `screens/Environments.tsx:856-861` | P2-7 |
| Visual hierarchy | "Throw it away" is red and adjacent to the primary. | `screens/Environments.tsx:816-1000` | P0-9 |
| Inconsistent patterns | Success uses the attention tone. | `screens/Environments.tsx:878` | P2-8 |
| Inconsistent patterns | The file control is a raw `<input type="file">`, one of four bare file inputs in the console. | `screens/Environments.tsx:1103-1109` | P2-7 |
| Keyboard limitations | Tab order only; adequate for a three-step form. | — | — |

## Sign-in, tenant and instance: notes for these sections

Part C covers the 30 surfaces a member meets outside a workspace: sign-in, the personal account page, the tenant-level administration screens and the instance-level operator screens. It ends with four inventories that span the whole console (dialogs, toasts, lists, empty states). Paths are relative to `apps/console/src` unless they start with `packages/` or `apps/`. These screens were reviewed in code at HEAD `e737382`; the mocked-API rendering used for this audit (headless Chromium over fixture data) had every tenant and instance list empty, so almost every finding here is **Verified** (read in code) or **Inferred** (reasoned from code, not run), and only a few are **Observed (mocked API)**. Statements about what the eye lands on are **Judgment**.

Summary of part C scores (mean about 67; nothing reaches 90):

| ID | Screen | Score | Band |
|---|---|---|---|
| AC-SIGNIN | Sign in | 80 | strong professional |
| TN-RETENTION | Retention | 75 | good but visibly improvable |
| TN-OVERVIEW | Tenant overview | 74 | good but visibly improvable |
| TN-ENDUSERS | End users | 74 | good but visibly improvable |
| TN-MEMBER-PAGE | Member page / effective access | 73 | good but visibly improvable |
| TN-ROLES | Roles | 72 | good but visibly improvable |
| IN-TENANTS | Tenants list | 71 | good but visibly improvable |
| SH-NOTFOUND | Not found | 71 | good but visibly improvable |
| TN-DOMAINS | Domains | 71 | good but visibly improvable |
| IN-MEMBERS | Instance members | 71 | good but visibly improvable |
| TN-REPOSITORY | Repository | 70 | good but visibly improvable |
| IN-OPERATORS | Operators | 70 | good but visibly improvable |
| TN-MEMBERS | Members | 69 | functional / inconsistent |
| TN-AUDIT | Audit log (tenant and instance) | 68 | functional / inconsistent |
| SH-GATE | Operator gate and banner | 68 | functional / inconsistent |
| TN-OPERATOR-ACCESS | Operator access | 67 | functional / inconsistent |
| TN-EXPORT | Export | 67 | functional / inconsistent |
| TN-SSO | Single sign-on (tenant and instance) | 65 | functional / inconsistent |
| TN-SCIM | Provisioning | 65 | functional / inconsistent |
| TN-ENDUSER-GROUPS | End-user groups | 65 | functional / inconsistent |
| TN-AGENT-ACCESS | Agent access | 65 | functional / inconsistent |
| AC-APIKEYS | Account (API keys, recovery codes) | 64 | functional / inconsistent |
| TN-GROUPS | Groups | 64 | functional / inconsistent |
| TN-WORKSPACES | Workspaces | 63 | functional / inconsistent |
| TN-WORKERS | Workers | 62 | functional / inconsistent |
| IN-BRANDING | Instance branding | 62 | functional / inconsistent |
| IN-KIT | Kit sheet | 62 | functional / inconsistent |
| TN-BRANDING | Tenant branding | 61 | functional / inconsistent |
| TN-ACCESS | Access grants | 61 | functional / inconsistent |
| TN-SERVICE-ACCOUNTS | Service accounts | 56 | major UX debt |

What these screens share:

- The written copy is the strongest part of the admin area. Destructive confirmations, empty states and field hints say what will happen in plain words; most are quoted below so they are kept.
- The shortfall is interaction plumbing, not layout: selection, tabs and filters held in component state instead of the URL, writes that succeed silently, five list primitives with five behaviours, and keyboard support that stops at Tab.
- Two defects affect every surface in this part. **Observed (mocked API):** `document.title` is the product name on every route (`kit/brand.tsx:28-47`), so browser tabs and history cannot tell "Members" from "Audit log" (P0-7). **Observed (mocked API):** every navigation outside a workspace sends `GET /api/v1null` (`Shell.tsx:500-503`) and receives a 404 (P0-1).
- The earlier audit (`docs/evolution/04-ux-audit.md`) is superseded here. Fixed since then: a real Not found screen (IA8), reopening the last place (IA9), a visible section name in the header for tenant, instance and account routes (IA7), an effective-access view, a promotion column on Workspaces, "Try a tool" for service accounts, a queue panel on Workers, per-provider tabs in single sign-on, and "Check now" on Domains. Still open: four-plus list implementations (V3), bare "Loading…" (V4), retry on only one list primitive (V5), arbitrary text sizes (V7), three status presentations (V1), and success feedback on writes (X7).

## Sign-in and account

### AC-SIGNIN · Sign in — 80/100 (strong professional)

Route: any path while `/me` answers 401 (`App.tsx:105-114`) · component `screens/SignIn.tsx:62` · density: low; fits.

**User objective.** Get into the console by password, single sign-on or a recovery code, without having to know in advance which one applies.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4.5 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 4 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 4 |
| Error recovery (10) | 4 |
| Keyboard and expert efficiency (10) | 3.5 |
| Accessibility (10) | 4 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **80/100** |

**What the eye sees first.** The brand row, a two-step indicator, the `h1` "Sign in", then a single email field (`SignIn.tsx:88-117`). This matches the user's priority: one field, one button. The stepper is a little more ceremony than two fields need, but it explains why no password field is shown yet (**Judgment**).

**Strongest existing decisions (keep).**

- Email-first discovery: the password is asked for only when it can work (`SignIn.tsx:110-117`).
- A "Change" chip beside the chosen email on step 2 (`SignIn.tsx:136-151`).
- Thirteen single sign-on failure reasons mapped to sentences that say who must act (`SignIn.tsx:14-34`), and `sso_error` removed from the URL after it is read (`SignIn.tsx:37-44`).
- The instance host in mono under the card (`SignIn.tsx:253-256`), which matters for an agency running several instances.
- Labelled fields with `autoComplete`, no paste blocking, show/hide password with `aria-label` and `aria-pressed`, errors in `role="alert"` (`SignIn.tsx:153-207,214`). WCAG 3.3.8 is met.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | When a provider exists and passwords are allowed, the page reads provider button, password field, secondary "Sign in" button with no "or" divider, so the password field looks like part of the provider path. | Verified `SignIn.tsx:167,226` | P4-2 (group with a labelled divider) |
| Typography | The footer helper text, the only explanation of the flow, uses `text-ink-subtle` on `bg-canvas` (4.19:1, below 4.5:1); the host line is 10.5 px. | Verified `SignIn.tsx:246-256`; contrast from `05-accessibility-audit.md` | P0-2 |
| Interaction friction | Step 2 shows no busy label: "Sign in" only goes 50% opaque, while step 1 says "Checking…". | Verified `SignIn.tsx:217,224-231` | P2-8 (Button loading state) |
| Accessibility | After "Continue" the email field is replaced and focus is not moved to the password field or the provider link. | Verified `SignIn.tsx:135-197` (no ref or focus call) | P0-7 |
| Alignment | The reveal-password button is positioned over the input's right edge with no right padding on the input, so a long password runs under the icon. | Inferred from `SignIn.tsx:188` | P2-7 (SecretField) |
| Missing states | No "forgot password" path or sentence saying an administrator resets it; no caps-lock hint; no lock-out or rate-limit message distinct from the generic failure. | Verified `SignIn.tsx:128` | P2-7 |
| Missing states | If `/sso/providers` fails the screen silently assumes password. A member of a tenant that requires single sign-on then sees a password field that cannot work. | Verified `SignIn.tsx:114` | P2-4 (error with retry) |
| Missing states | A session that expires later is not detected: `/me` is checked once, and each screen then shows its own error until the user reloads. | Inferred from `api.ts:26-39`, `App.tsx:90-113` | P0-7 |

### AC-APIKEYS · Account (API keys, recovery codes) — 64/100 (functional / inconsistent)

Route: `/account/api-keys` · component `screens/Account.tsx:146` · density: low; fits.

**User objective.** Create a personal API key for the command line, and (for tenant owners) keep recovery codes that still work if single sign-on breaks.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **64/100** |

**What the eye sees first.** The `h1` "API keys" and its primary button. Recovery codes are a second panel below with a small uppercase label. For most members this order is right; for an owner who was sent here by the single sign-on screen to make recovery codes, the thing they came for is below the fold of attention and under a URL named `api-keys` (**Judgment**).

**Strongest existing decisions (keep).**

- Keys are listed as prefix…suffix with "last used" (`Account.tsx:21-22`).
- The recovery-code panel says exactly when a code matters, warns at two or fewer left (`Account.tsx:111-116`), offers `CopyButton` and an "I have kept it" acknowledgement (`Account.tsx:131-132`).
- Regenerating codes asks first and says the old ones stop working (`Account.tsx:78-84`).
- Revoke copy states the effect: `Revoke the key "{name}"? Anything using it stops working.` (`Account.tsx:173`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | A newly created key is shown once in an attention notice as select-all text with **no Copy button**, while recovery codes and provisioning tokens on neighbouring screens have one. | Verified `Account.tsx:51-56` vs `Account.tsx:131`, `Provisioning.tsx:121` | P0-10 |
| Missing states | The new-key notice never dismisses and has no "I have kept it"; it stays until the next create or navigation. | Verified `ListScreen.tsx:237` | P0-10 |
| Discoverability | The area is called "Account" but holds no profile, password change, sessions or theme; recovery codes sit under `/account/api-keys`. The single sign-on screen tells owners to "generate recovery codes in Account" without a link. | Verified `App.tsx:128`, `SingleSignOn.tsx:1101-1106` | P2-11, P1-10 |
| Missing states | No expiry choice on create although `expiresAt` exists on the row; revoked keys stay in the list with no filter. | Verified `Account.tsx:14,43` | P2-2 (filters), P2-7 |
| Simplification | The empty state says "Create a key to sign in from the command line." but nothing offers the ready-made `platform login` command once a key exists. | Verified `Account.tsx:155` | P0-10 (copyable command) |
| Inconsistent patterns | Key state (Active, Revoked) is a `Badge`; member and end-user state elsewhere is a `StatePill`. "Active" is teal here and green there. | Verified `Account.tsx:42-48`, `Members.tsx:196` | P2-5 |
| Feedback | Create, revoke and regenerate show no success message; `Account.tsx` has three writes and no success toast. | Verified: no `notify.success` call in `Account.tsx` | P2-8 |
| Keyboard limitations | The list is a `ListScreen`: rows are inert and reachable only through their buttons; no shortcut creates a key. | Verified `ListScreen.tsx:210` | P2-2, P3-1 |

### SH-NOTFOUND · Not found — 71/100 (good but visibly improvable)

Route: unknown top-level paths (`App.tsx:124`), unknown tenant sections (`screens/Tenant.tsx:265`), unknown workspaces and workspace tabs (`screens/Tenant.tsx:410,416`) · component `screens/NotFound.tsx:5` · density: low; fits.

**User objective.** Understand that the address is wrong and get back to somewhere useful in one step.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 4 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **71/100** |

**What the eye sees first.** A dashed, centred panel reading "Nothing here", the offending path in mono, and one link. That is the right content in the right order.

**Strongest existing decisions (keep).**

- The path that failed is shown, so a mistyped address is obvious (`NotFound.tsx:12`).
- The way back is specific to where the user was ("Go to the {workspace} overview").
- This screen did not exist at the earlier audit (IA8); workspace slugs in the address are now resolved to IDs (`Tenant.tsx:394-405`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Accessibility | The page has no heading: the title is a `<p>` inside `EmptyCanvas`. Screen-reader users landing here have no `h1` to orient by. | Verified `NotFound.tsx:5-24`, `kit/layout.tsx:281` | P0-7, P2-3 |
| Inconsistent patterns | The way back is a bare text link; every other empty state offers a button. | Verified `NotFound.tsx:5-24` | P2-4 |
| Discoverability | No hint that Ctrl/⌘+K searches for the thing the user wanted. | Verified `NotFound.tsx:5-24` | P3-2 |
| Missing states | A tenant ID the member cannot see does not reach this screen: the first failing load renders its own error. Tenant slugs are not resolved, only workspace slugs. | Inferred from `Tenant.tsx:154-164`; Verified `Tenant.tsx:393-405` | P2-4, P0-1 |
| Missing states | Deeper unknown paths (`flows/<anything>`) show whatever error the API returns, not this screen. | Verified `Tenant.tsx:604` | P2-4 |

## Tenant: work

### SH-GATE · Operator gate and banner — 68/100 (functional / inconsistent)

Route: any `/t/:t/*` opened by an operator who is neither a member nor holding an active grant (`screens/Tenant.tsx:165-189`); after a grant, an attention banner on every tenant screen (`screens/Tenant.tsx:195-213`) · grant form `screens/Tenant.tsx:98-136` · density: low; fits.

**User objective.** As the instance operator, enter a client's tenant with the least access that does the job, for a stated reason and a limited time, and leave cleanly.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 2.5 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **68/100** |

**What the eye sees first.** The `h1` "You have no access to this tenant", a dashed panel titled "Operators see inside a tenant only through an access grant", and the primary button "Open operator access". Clear and correctly ordered.

**Strongest existing decisions (keep).**

- The dialog description: "Access is time-limited. The tenant's admins see this grant, your reason, and everything you do under it." (`Tenant.tsx:98-136`).
- Least-privilege ordering: viewer is the first access level, labelled "viewer (read only)" (`Tenant.tsx:114`); durations are 1 h, 4 h, 24 h.
- After the grant the same URL renders, so the place the operator was heading for is not lost.
- The persistent banner states role, expiry and reason and offers "End access now" (`Tenant.tsx:195-213`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | The gate names neither the tenant nor its ID, so an operator arriving from a link cannot confirm which client they are about to enter. | Verified `Tenant.tsx:167-177` | P0-9 (say exactly what is affected) |
| Missing states | While the grants request is loading the screen is blank (`return null`); if it fails, the gate is shown with no error. | Verified `Tenant.tsx:164` | P2-4 |
| Error recovery | "End access now" has no confirmation and no error handling: `await api.delete` is not in a try/catch, so a failure is an unhandled rejection. After ending, the operator is dropped to the gate with no message. | Verified `Tenant.tsx:201-204` | P0-1, P2-8 |
| Missing states | No countdown or warning before expiry. When a grant lapses mid-task the next request fails wherever the operator is. | Inferred (no timer in `Tenant.tsx:195-213`) | P1-7 |
| Spacing | On full-width list screens the banner sits flush against the viewport edges, because the list region has no padding. | Inferred from `Tenant.tsx:194`, `Shell.tsx:902-906` | P2-3 |
| Discoverability | Access levels are raw role identifiers (`workspace_admin`, `tenant_admin`) with no description of what each allows. | Verified `Tenant.tsx:115-118` | P2-11 (role descriptions in pickers) |
| Interaction friction | An operator who has just created a tenant meets this gate on first open and must write a reason to enter it (see "Empty states and onboarding"). | Verified `apps/control-plane/src/routes/tenants.ts:168-203` | P2-13 |
| Discoverability | No link from the banner to "what I did under this grant" in the audit log. | Verified `Tenant.tsx:195-213` | P1-10, P2-11 |

### TN-OVERVIEW · Tenant overview — 74/100 (good but visibly improvable)

Route: `/t/:t`, `/t/:t/overview` · component `screens/TenantOverview.tsx:48` · density: standard; fits.

**User objective.** As a tenant admin or agency lead, see what needs a decision and how each workspace stands, then go straight to it.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4.5 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 4 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **74/100** |

**What the eye sees first.** The eyebrow "Tenant", the tenant name in the display size, then the "Needs attention" panel with toned icon tiles; second, one line per workspace with state pills; counts and recent changes in the right column. This is the best match in part C to "quiet infrastructure, vivid state": colour appears only on what needs action (**Judgment**).

**Strongest existing decisions (keep).**

- Attention items are built only from counts the API returns, each with a named next step (`TenantOverview.tsx:61-113`).
- The approvals item carries the caveat that mail is not configured (`TenantOverview.tsx:70-72`).
- Production is listed first (`TenantOverview.tsx:116-117`); each workspace line says "Running v…, promotes to …, triggers paused" (`TenantOverview.tsx:286-300`).
- The all-clear copy is specific: "Nothing needs you — No approvals or promotions waiting, every hostname works, and workers are online."
- Quiet audit actions are filtered from "Recent changes" (`TenantOverview.tsx:14,55-57`), which answers the earlier audit's D4 in part.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Feedback | "No worker is online" is raised whenever `workersOnline === 0`, even though the instance can start managed workers on demand; an idle managed tenant probably shows a false alarm. | Verified `TenantOverview.tsx:102`, `Execution.tsx:981-983`; the false alarm is Inferred | P1-7 |
| Discoverability | "Recent changes" rows are not links, show no target and truncate the action; "who changed X" still needs the audit log. Operator-access entries are not filtered. | Verified `TenantOverview.tsx:236-248` | P1-10 |
| Simplification | "At a glance" repeats counts shown in the section panel, and "Hostnames to fix" repeats an attention item; only Members is a link. | Verified `TenantOverview.tsx:194-216` | P4-2 |
| Interaction friction | The empty workspace line "No workspaces yet. Create one" links to the list page, not to the create dialog. | Verified `TenantOverview.tsx:167-169` | P2-13 |
| Missing states | One `/summary` request per workspace, capped at 12; workspaces beyond 12 are omitted with only an "All workspaces" link as a hint. | Verified `TenantOverview.tsx:172,271` | P2-2 |
| Missing states | Loading is three separate "Loading…" strings; there is no refresh control and no sign of whether the numbers are live. A summary missing `failedRuns` blanks the whole console. | Verified `TenantOverview.tsx:138,165,231`; Observed (mocked API) `Shell.tsx:132,649` | P2-4, P1-7, P0-1 |
| Keyboard limitations | Nothing beyond tab order: no key jumps to the first attention item or to a workspace. | Verified `TenantOverview.tsx:48-306` | P3-1 |
| Responsive | Content starts at x = 320 px while list screens start at 312 px; the overview stretches across a 2200 px window with no second column of detail. | Observed (mocked API) at 1440 px and 2200 px | P2-3, P3-8 |

### TN-WORKSPACES · Workspaces — 63/100 (functional / inconsistent)

Route: `/t/:t/workspaces` · component `screens/Tenant.tsx:271` · density: low to standard; under-used, because rows carry little state.

**User objective.** See the tenant's workspaces and how they promote, open one, or create a production workspace and its linked dev workspace.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 2.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **63/100** |

**What the eye sees first.** The `h1`, a description, the primary "Create workspace" button, then a bordered table whose name links in the action colour are the strongest element. Adequate, but the tenant overview is the better list of workspaces because it shows version, failures and paused triggers per workspace (**Judgment**).

**Strongest existing decisions (keep).**

- Production is always tagged; a "Promotes to" column shows the release path (`Tenant.tsx:297-300`), built since the earlier audit.
- The empty state teaches the model: "No workspaces yet — Start with a production workspace. Add a dev workspace linked to it when you want somewhere safe to make changes." (`Tenant.tsx:302-305`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | "Create workspace" asks for a choice that "cannot be changed afterwards", yet Type silently defaults to **Dev** with "Promotes to: Nothing". This contradicts the empty state's advice to start with production. | Verified `Tenant.tsx:306-340`, `ListScreen.tsx:147-151` | P0-9 (no silent defaults) |
| Interaction friction | "Promotes to" is shown and enabled when Type is Production, although the form system supports conditional fields (`FormField.when`). The slug is not derived from the name. | Verified `Tenant.tsx:306-340`, `ListScreen.tsx:33` | P2-7 |
| Simplification | The standard setup (production plus a linked dev workspace) takes the same dialog twice, about 12 fields and clicks. | Verified `Tenant.tsx:306-340`; journey counted in `04-workflow-journey-audit.md` | P2-13 |
| Feedback | After create the list reloads silently; the user is not taken into the new workspace and no message confirms it. | Verified `ListScreen.tsx:261-265` | P2-8, P1-5 |
| Density | Rows show name, type and target only. `triggersPaused` is on the row type but not shown; last deploy and failures are absent. | Verified `Tenant.tsx:79,286-300` | P2-2 |
| Alignment | A dev workspace with no target shows an empty cell rather than "Not linked". | Verified `Tenant.tsx:299` | P4-6 |
| Inconsistent patterns | Production is marked with `TypeBadge` (a filled `Badge`) here and with `EnvTag` (amber outline tag) in the header and overview. | Verified `Tenant.tsx:95-96`, `TenantOverview.tsx:284` | P2-5, P4-5 |
| Keyboard limitations | `ListScreen` rows are inert; only the name link is focusable. No search. | Verified `ListScreen.tsx:210` | P2-2, P3-1 |

## Tenant: people and access

Members, Groups, Roles and Access grants are four URL-addressed tabs of one screen, "Members & access" (`screens/Members.tsx:56`, tabs at `Members.tsx:14-19,31-48`). They share one header and one tab strip, so two findings apply to all four and are stated once here:

- The tab strip, which is the screen's primary navigation, is rendered **below** the Members tab's search field (`Members.tsx:76-84` places the tab's own controls before the tabs). The search box therefore appears, moves or disappears as the user changes tab. Fix: P2-3 (one page header with tabs directly under the title).
- The tabs are a hand-made link strip (`AccessTabs`, 13 px, selected shown in ink) rather than the shared `Tabs` (14 px, selected shown in the action colour); see `02-design-system-forensics.md`. Fix: P2-12.

### TN-MEMBERS · Members — 69/100 (functional / inconsistent)

Route: `/t/:t/members` · component `screens/Members.tsx:117` · density: standard; fits.

**User objective.** Find a person, see whether they have access, and add, suspend or remove them.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 2.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **69/100** |

**What the eye sees first.** The `h1` "Members & access", a description, the primary "Add member", a search field, then the tab strip, then the table. The description states the model well, but the order puts a per-tab filter above the navigation.

**Strongest existing decisions (keep).**

- The description states the access model: belonging to the tenant grants nothing by itself.
- An "Access" column reads "Through groups only" or "N given directly", so an admin sees who has nothing yet.
- Suspend copy says what is kept (`Members.tsx:140`); remove copy says what goes: `Remove {email} from this tenant? Their access here is removed too.` (`Members.tsx:241`).
- Tabs are real links, so each tab has an address (`Members.tsx:14-19`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | Adding a member grants nothing. The role is given on another tab through a dialog that starts from scratch, where the admin finds the same email again in a flat native select. Adding a member with one role takes about 8 interactions, 2 pages and 2 dialogs. | Verified `Members.tsx:294-305,475-504` | P2-11 (principal-first "Give access") |
| Interaction friction | The Add dialog asks the admin to invent an "Initial password" for a new account, and to guess whether the account already exists ("For someone who already has an account, the email is enough. Otherwise fill in all three"). End users get an invitation link instead. | Verified `Members.tsx:294-305`, `EndUsers.tsx:47` | P2-11 |
| Missing states | Cancelling the Add dialog keeps its values; reopening it shows the previous email **and password**. | Verified `ListScreen.tsx:127,153`, `Members.tsx:300` | P0-9 |
| Feedback | Add, suspend, resume and remove are all silent on success. A failed suspend is a 5-second toast at the bottom right, away from the button. | Verified `Members.tsx:146-148` | P2-8, P0-7 |
| Discoverability | The inspector lists only roles given directly; access through groups needs "View access" on a separate page. The inspector cannot give or remove a role. | Verified `Members.tsx:262-278` | P2-11 |
| Visual hierarchy | Every row carries a green "Active" pill, so colour is spent on the normal state and a suspended member does not stand out. | Verified `Members.tsx:196` | P2-5 |
| Visual hierarchy | The inspector footer puts View access (primary), Suspend and Remove (danger) in one row with equal spacing. | Verified `Members.tsx:229-247` | P0-9 |
| Missing states | The list is capped at 200 with client-side search and no notice of the cap; no filter by status or role. The empty state "No members yet — Add the people who work in this tenant." has no button. | Verified `Members.tsx:118,125,218` | P2-2, P2-4 |
| Keyboard limitations | Every row is a tab stop (200 members means 200 stops); no arrow or `j`/`k` movement although the shortcut sheet lists `j k`; Esc does not close the docked inspector and focus is not moved into it. | Verified `kit/CollectionView.tsx:110-121`, `kit/CommandPalette.tsx:744`, `kit/layout.tsx:113` | P0-3, P0-6, P3-1 |
| Accessibility | `aria-selected` is set on a table row outside a grid; the selected row differs from the canvas by 1.03:1. | Verified `kit/CollectionView.tsx:109,122-124` | P0-3, P0-2 |

### TN-GROUPS · Groups — 64/100 (functional / inconsistent)

Route: `/t/:t/groups` · component `screens/Groups.tsx:138`; membership dialog `screens/Groups.tsx:20-135` · density: low to standard; under-used.

**User objective.** Keep sets of people who need the same access, and see or change who is in each.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **64/100** |

**What the eye sees first.** Group names with two buttons per row, "Members" and "Delete". Rows cannot be selected, unlike the three sibling tabs, so the same table in the same screen behaves differently one tab over.

**Strongest existing decisions (keep).**

- Empty copy explains when a group is worth making: "No groups yet — Create a group when several people need the same access."
- Adding people uses a searchable combobox (`Groups.tsx:20-135`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Inconsistent patterns | "Who is in {group}" is a wide blocking dialog. It is configuration, not a decision, and the sibling tabs use the inspector for the same job; a docked inspector would keep the group list in view. | Verified `Groups.tsx:20-135` | P2-11, P2-2 |
| Density | No member-count column (end-user groups have one) and no roles-held column, so the list does not show what a group is for. | Verified `Groups.tsx:138-219,246-248` | P2-2 |
| Error recovery | "Take out" removes a person with no confirmation and no undo, while deleting the group asks. | Verified `Groups.tsx:119-121` | P2-8 (undo) |
| Interaction friction | The delete confirmation is a statement under a question title: "Delete?" / "The group {name} is deleted, and access given to it is removed." It gives no count of members or roles affected. | Verified `Groups.tsx:172`, `ListScreen.tsx:325` | P0-9 |
| Missing states | No rename; candidates are capped at 200; the empty state has no button. | Verified `Groups.tsx:203` | P2-4, P2-7 |
| Keyboard limitations | Rows are not focusable; the two row buttons are the only way in. | Verified `Groups.tsx:138` (no `onSelect`) | P2-2, P3-1 |

### TN-ROLES · Roles — 72/100 (good but visibly improvable)

Route: `/t/:t/roles` · component `screens/Roles.tsx:397`; editor dialog `screens/Roles.tsx:73-255,274` · density: standard; fits.

**User objective.** Understand what each role allows, and define a custom role when the built-in ones do not fit.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **72/100** |

**What the eye sees first.** Mono role names with "Built in" and "From repository" tags. The list scans well.

**Strongest existing decisions (keep).**

- The inspector's "In short" summary turns a permission list into sentences (`Roles.tsx:371-395`).
- Wildcards are expanded and unknown permissions are never silently dropped (`Roles.tsx:90-96,230-252`).
- Built-in and repository roles open read-only with the reason stated (`Roles.tsx:303-309`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | The role editor is a 46 rem dialog holding a scrolling permission grid: the heaviest configuration in part C done in a modal, with no unsaved-changes guard. Esc discards every tick. | Verified `Roles.tsx:153,274` | P2-11 (page or drawer), P2-7 |
| Accessibility | Permission descriptions exist only as `title` tooltips, which keyboard and touch users cannot reach; each checkbox's accessible name is the raw permission string. The grid table has no accessible name. | Verified `Roles.tsx:154,199` | P3-1 (Tooltip), P2-7 |
| Discoverability | The inspector does not say who holds a role. Delete says "Whoever held it loses what it allowed." with no count. | Verified `Roles.tsx:489` | P0-9, P1-10 |
| Interaction friction | A built-in role cannot be duplicated as a starting point, although the read-only dialog tells the user to "Create a role of your own". | Verified `Roles.tsx:303-309` | P2-11 |
| Missing states | A role's name cannot be changed after creation and the form does not say so. Empty copy is just "No roles". | Verified `Roles.tsx:328-338` | P2-7, P2-4 |
| Typography | The grid is a hand-made table with its own sizes (12 px, 13 px, a hand-built uppercase label) and its own checkbox style. | Verified `Roles.tsx:124,135-197,155,174,186` | P2-1, P2-2, P2-12 |

### TN-ACCESS · Access grants — 61/100 (functional / inconsistent)

Route: `/t/:t/access`, with `?binding=<id>` to highlight one row (`screens/Members.tsx:355-365`) · component `screens/Members.tsx:339` · density: standard; fits.

**User objective.** See who holds which role where, give a role to a person, group or machine, and take one away.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 2.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 2.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **61/100** |

**What the eye sees first.** A red "Remove" button on every row (`Members.tsx:451-455`). A column of danger buttons is the loudest thing on a screen whose main job is reading (**Judgment**).

**Strongest existing decisions (keep).**

- `?binding=` lets the member page link to the exact grant and highlight it (`Members.tsx:357-365`).
- Filter chips by kind of principal.
- Empty copy names every kind of holder: "Nobody has access yet — Give a member, a group, a service account or an end user a role."

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | In "Give access", **Who** is a native select holding every member (up to 200), group, service account, end-user group and end user (up to 200) in one flat list told apart by label prefixes. A searchable picker exists in the kit and is used by Operators. | Verified `Members.tsx:370-390,475-504`, `ListScreen.tsx:31`, `Instance.tsx:144-157` | P2-11 |
| Discoverability | Role is a select of raw names with no description; workspace-scoped roles are filtered out with no explanation. | Verified `Members.tsx:483` | P2-11 |
| Error recovery | Who, Role and Where silently default to the first option; the default principal is the first member alphabetically and the default scope is the whole tenant. | Verified `ListScreen.tsx:147-151,177` | P0-9 |
| Interaction friction | The remove confirmation does not say where: `Remove the {role} role from {who}?` reads the same for a tenant-wide grant and a single workspace. | Verified `Members.tsx:451-455` | P0-9 |
| Discoverability | No search; no filter by role or workspace; the chip filter is not in the URL. Rows cannot be selected. | Verified `Members.tsx:352` | P2-2, P2-6 |
| Responsive | The "Where" column is hidden below 640 px, so two grants of one role in different workspaces look identical on a phone. | Verified `Members.tsx:441` | P2-2 (column priority) |
| Inconsistent patterns | Naming: the tab is "Access grants", the empty title is "Nobody has access yet", the API calls them bindings, and "operator access grant" elsewhere is a different thing. | Verified `nav.ts:160`, `Access.tsx:62` | P2-11 |
| Feedback | Give and remove succeed silently. | Verified: no `notify.success` call in `Members.tsx` | P2-8 |
| Keyboard limitations | Chips declare `role="radio"` but each is a tab stop and arrow keys do nothing. | Verified `kit/layout.tsx:301-322` | P3-1 |

### TN-MEMBER-PAGE · Member page / effective access — 73/100 (good but visibly improvable)

Route: `/t/:t/members/:id` · component `screens/Access.tsx:244`; `EffectiveAccess` `screens/Access.tsx:99` (reused on the service-account page) · density: standard; fits.

**User objective.** Answer "why can this person do X" (or "why not") and find the grant responsible.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **73/100** |

**What the eye sees first.** The eyebrow "Member", the name, a key-value panel, the list "What gives them access", then a field "Find or check a permission". The sources list often answers the question by itself, which is the right first read.

**Strongest existing decisions (keep).**

- Each source links to where it is managed with the row highlighted (`Access.tsx:61-65`).
- The check gives a yes/no verdict and says where it holds (`Access.tsx:177-199`).
- Suspended members are shown "as they will be" (`Access.tsx:144-149`); each permission is explained in words.
- This is the strongest journey in part C: about 5 interactions over 2 pages. It did not exist at the earlier audit.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | The check runs only for an exact permission string such as `promotion:write`. There is no list of permissions or actions to pick from and no workspace selector, although the answer says "only in: X workspace". | Verified `Access.tsx:125` | P2-11 |
| Simplification | The page is read-only. Fixing what was found (suspend, give or remove a role) means leaving it. | Verified `Access.tsx:244-279` | P2-11 |
| Discoverability | The way back is a `text-meta` link "All members" in the header's meta row, not a breadcrumb. The page is reached by row, inspector, "View access": one hop more than needed. | Verified `Access.tsx:253-257` | P2-3, P2-6 |
| Discoverability | A group source links to the Groups tab in general, not to the group. | Verified `Access.tsx:77` | P1-10 |
| Density | A `*:*` holder gets every permission listed with its source and no collapse. | Verified `Access.tsx:99-199` | P4-2 |
| Typography | The operator-grant expiry uses `toLocaleString()` while the rest of the console uses the shared `when()` format. | Verified `Access.tsx:85` | P4-6 |
| Inconsistent patterns | A "No" verdict reuses the `failed` run-state pill. | Verified `Access.tsx:192` | P2-5 |

### TN-ENDUSERS · End users — 74/100 (good but visibly improvable)

Route: `/t/:t/end-users` · component `screens/EndUsers.tsx:88` · density: standard; fits.

**User objective.** Invite the client's own users to the apps, and disable, re-invite or remove them.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **74/100** |

**What the eye sees first.** A list with Invited / Active / Disabled pills, a server-side search and paging controls at the top right.

**Strongest existing decisions (keep).**

- The one-time link dialog has Copy and honest copy: "This instance sends no mail, so pass the link on yourself." (`EndUsers.tsx:71-75`).
- Delete says what stays: "They can no longer sign in, and access given to them is removed. Their rows in tables are kept." (`EndUsers.tsx:148`).
- Failures appear as an inline notice in the toolbar, next to the list they concern (`EndUsers.tsx:209`), not as a toast.
- Server-side search and cursor paging (50 per page), the only list in part C that scales past 200.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | Search sends a request on every keystroke; there is no debounce. | Verified `EndUsers.tsx:98-104` | P2-2 |
| Alignment | Previous / Next sit in the toolbar at the top right, not at the end of the list where the user is when they need them. | Verified `EndUsers.tsx:159-180` | P2-2 (paging in the list primitive) |
| Visual hierarchy | Four to five equal-weight buttons (Attributes, link, Enable/Disable, Delete) wrap in a 22 rem inspector footer. | Verified `EndUsers.tsx:271-281` | P0-9, P2-2 |
| Error recovery | Disable has no confirmation; Delete has one. | Verified `EndUsers.tsx:271-281` | P2-8 (undo) |
| Interaction friction | Group membership cannot be changed from the user, only from the group's dialog; attributes are edited in a dialog rather than in the inspector. | Verified `Groups.tsx:314` | P2-11 |
| Discoverability | The invite dialog says access is given "under Access or in the repository" with no link. The empty state has no button. | Verified `EndUsers.tsx:47-87` | P1-10, P2-4 |
| Missing states | No bulk invite (open since the earlier audit). | Verified `EndUsers.tsx:88` | P3-3 |

### TN-ENDUSER-GROUPS · End-user groups — 65/100 (functional / inconsistent)

Route: `/t/:t/end-user-groups` · component `screens/Groups.tsx:220` · density: low to standard; under-used.

**User objective.** Group end users so that apps and row rules can show different things to different people.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **65/100** |

**What the eye sees first.** The same table as Groups with a description and a count column; the name is in mono.

**Strongest existing decisions (keep).**

- Delete copy names the row-rule consequence: "Its people lose what it was given, and rows ruled by it are shown to nobody in it." (`Groups.tsx:260`).
- The create dialog warns that the name cannot be changed.
- A member-count column (`Groups.tsx:246-248`), which member groups lack.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Inconsistent patterns | Membership is edited in the same wide blocking dialog as Groups; rows cannot be selected. | Verified `Groups.tsx:20-135,220` | P2-11, P2-2 |
| Typography | The name is set in mono, which signals an identifier, while the hint says "Any name on one line, such as Front desk". | Verified `Groups.tsx:239,288` | P2-1 |
| Missing states | The description cannot be edited after creation. The empty state has no button. | Verified `Groups.tsx:220-313` | P2-7, P2-4 |
| Discoverability | The list does not say which apps or row rules use a group, so the delete warning cannot be checked before acting. | Verified `Groups.tsx:260` | P0-9, P1-10 |

### TN-SERVICE-ACCOUNTS · Service accounts — 56/100 (major UX debt)

Route: `/t/:t/service-accounts` (list and inspector, `screens/Tenant.tsx:777`) and `/t/:t/service-accounts/:id` (keys, agent access, access; `screens/Tenant.tsx:717-766`) · density: low; the detail page is long and poorly structured.

**User objective.** Give a system (CI, an integration, an AI agent) its own identity, a key, and only the access it needs.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3 |
| Information architecture (10) | 2.5 |
| Interaction efficiency (12) | 2.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 2.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3 |
| Design-system consistency (7) | 2.5 |
| Visual craft and polish (7) | 3 |
| **Weighted total** | **56/100** |

**What the eye sees first.** On the list: the `h1`, a description and the primary "Create service account". On the detail page: the `h1` "Service account keys". **The account's name appears nowhere on its own page** (`Tenant.tsx:723-764`), so a user who opened two accounts in two tabs cannot tell them apart.

**Strongest existing decisions (keep).**

- The description field is framed by its purpose: "What it is for … so whoever finds its key later knows what breaks if it is revoked" (`Tenant.tsx:930`).
- Delete copy: "Delete {name}? Its keys stop working." (`Tenant.tsx:846`).
- `EffectiveAccess` is reused, so machines get the same "why can it do X" view as people.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | The object is split between an inspector (description, delete) and a separate page (keys, agent, access) reached by a small text link "Keys and agent access" in the inspector footer; the row itself does not navigate. Creating an account with a key and a role takes about 12 interactions, 3 pages and 3 dialogs. | Verified `Tenant.tsx:837-842` | P2-11 (service account as one page) |
| Visual hierarchy | The detail page stacks three page components, each with its own `h1`, and has no name, no description and no back link. | Verified `Tenant.tsx:723,747,753`, `kit/layout.tsx:47` | P2-3 |
| Simplification | The page reports "the access the account has been given" but offers no way to give it; granting is on Members & access › Access grants. A key with no grants works and can do nothing, and nothing warns of that when the key is made. | Verified `Tenant.tsx:753-764` | P2-11 |
| Interaction friction | A new key is shown without a Copy button and cannot be given an expiry. | Verified `Account.tsx:51-56` (shared `showNewKey`) | P0-10 |
| Feedback | Saving the description shows no confirmation; create is silent and does not open the new account. | Verified `Tenant.tsx:917-918` | P2-8, P1-5 |
| Spacing | The list uses the full-width list primitive inside a padded, width-capped page (the route is missing from the full-width list in `nav.ts:235-239`), so its header draws a second set of gutters and a bottom border inside the page, and the inspector is only as tall as the list. | Verified `nav.ts:235-239`, `kit/CollectionView.tsx:60`, `Shell.tsx:907-911`; the visual result is Inferred | P2-2, P2-3 |
| Interaction friction | Revoke copy for these keys gives no consequence: `Revoke the key "{name}"?` | Verified `Tenant.tsx:740` | P0-9 |
| Missing states | The empty state "No service accounts yet — Create one for each system that calls this tenant, so each can be given only what it needs." has no button. | Verified `Tenant.tsx:824` | P2-4 |

### TN-AGENT-ACCESS · Agent access — 65/100 (functional / inconsistent)

Route: a section of `/t/:t/service-accounts/:id` · component `screens/AgentAccess.tsx:19`; "Try" dialog `screens/AgentAccess.tsx:156` · density: standard; fits.

**User objective.** Connect an AI agent to a workspace with this account's key, see which tools it would get, and try one.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **65/100** |

**What the eye sees first.** A workspace select, then the address and a settings snippet with Copy, then the tools table.

**Strongest existing decisions (keep).**

- "An agent would be refused here…" states the cause and the remedy (`AgentAccess.tsx:91-96`).
- The Try dialog says the call is real and attributed to the account (`AgentAccess.tsx:186-190`); the result is framed as "What the agent is told".

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | The settings snippet contains the placeholder `Bearer <one of this account's API keys>` even immediately after a key was created in the section above. | Verified `AgentAccess.tsx:42` | P0-10 |
| Error recovery | The Try dialog for a tool that changes data carries no production warning when the chosen workspace is production; the environment is shown only in the select's label. | Verified `AgentAccess.tsx:65,156-229` | P4-5, P0-9 |
| Discoverability | The remedy names "Access" with no link. | Verified `AgentAccess.tsx:91-96` | P1-10 |
| Missing states | The chosen workspace is component state, so the view cannot be linked or kept across a reload. | Verified `AgentAccess.tsx:19-155` | P2-6 |
| Inconsistent patterns | The tools table is the bordered `Table` with inert rows; "Try" is a dialog where a drawer would keep the tool list visible. | Verified `AgentAccess.tsx:156` | P2-2 |

### TN-OPERATOR-ACCESS · Operator access — 67/100 (functional / inconsistent)

Route: `/t/:t/operator-access` · component `screens/Tenant.tsx:944` · density: low to standard; under-used.

**User objective.** As a tenant admin, see every time the instance operator entered the tenant, why, and end an active grant.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **67/100** |

**What the eye sees first.** A plain table of grants with an "Active until …" badge. The section panel's attention count ("N active") does more to draw the eye than the page does.

**Strongest existing decisions (keep).**

- The description: "Every time the people who run this instance opened access to your tenant, and why."
- The empty state reassures rather than instructs: "No operator has accessed this tenant — If one ever does, the grant and its reason appear here."
- One click to end, with a confirmation.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Discoverability | No link from a grant to the audit entries made under it. The audit log marks those entries "Operator" but cannot filter by grant. | Verified `Audit.tsx:202` | P2-11, P1-10 |
| Density | Active and ended grants are interleaved with no filter, sort or search; there is no duration column. | Verified `Tenant.tsx:944-982` | P2-2 |
| Typography | "Access level" is a raw role identifier in mono. | Verified `Tenant.tsx:954` | P2-11 |
| Inconsistent patterns | Expiry is a sentence inside a `Badge` ("Active until …"), which makes the badge long and wraps on narrow screens; state elsewhere is a `StatePill` with the time beside it. | Verified `Tenant.tsx:960` | P2-5, P4-6 |
| Interaction friction | The confirmation `End {email}'s access now?` does not say what happens to work in progress. | Verified `Tenant.tsx:974` | P0-9 |

## Tenant: sign-in, delivery and governance

### TN-SSO · Single sign-on (tenant and instance) — 65/100 (functional / inconsistent)

Route: `/t/:t/single-sign-on` and `/instance/single-sign-on` (same component, `base="/instance"`) · component `screens/SingleSignOn.tsx:1167`; provider detail `screens/SingleSignOn.tsx:935` · density: standard, but the Settings tab is a highly dense form in a low-density frame; poor fit there.

**User objective.** Connect an identity provider, prove it works without locking anyone out, then turn it on and, when ready, require it.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 2.5 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **65/100** |

**What the eye sees first.** In a provider: a back link, the provider name, state badges, and on the right three buttons in the order **Remove (danger) · Require it · Turn on (primary)**; then a four-step indicator (Connect · Prove domains · Map groups · Switch on); then six tabs (Set up · Domains · Groups · Settings · People · Provisioning). The step indicator is the right organising idea and its details are live ("A try passed", "Needed for members"), but it is followed by a second row of navigation that divides the same content differently (**Judgment**).

**Strongest existing decisions (keep).**

- A provider is created **off**, with a non-destructive "Try signing in" that shows exactly what the provider sent and what would happen (`SingleSignOn.tsx:333-416`); raw claims are behind a disclosure (`SingleSignOn.tsx:405-414`).
- "Require it" states the lock-out consequence and the operator escape route (`SingleSignOn.tsx:1056-1062`); a notice reminds owners to make recovery codes first (`SingleSignOn.tsx:1101-1106`).
- Remove uses type-to-confirm with exact copy: "Its domains, group mapping and ties to people go with it. The people it signed in stay, and need another way in." (`SingleSignOn.tsx:1027-1032`).
- Addresses to paste into the provider are copyable; weak options (SHA-1, provider-initiated sign-in) say they are audited.
- Connecting a provider lands on its detail view, and four actions here confirm with a success toast.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Missing states | Neither the open provider nor its tab is in the URL. A reload mid-setup returns to the list, the view is lost when the admin leaves to make recovery codes, and "the Domains tab of Okta" cannot be sent to a colleague. | Verified `SingleSignOn.tsx:952,1171-1190` | P2-11, P2-6 |
| Interaction friction | The result of "Try signing in" arrives in another browser tab; the admin must come back and press **Show the result**. | Verified `SingleSignOn.tsx:357-369` | P1-7 |
| Inconsistent patterns | Step 4 "Switch on" opens the Set up tab, whose text says "Use Turn on, above". The control for the final step is in the page header, not in the step. | Verified `SingleSignOn.tsx:422-423,1098` | P2-11 |
| Error recovery | "Turn on" has no precondition check and no confirmation, even with no passed try and no proved domain; a failure arrives as a toast. | Verified `SingleSignOn.tsx:1078-1091` | P0-9, P2-8 |
| Visual hierarchy | The danger button is the first of three in the header. Its type-to-confirm dialog omits `danger: true`, so the final "Remove" button is drawn as a primary action, not a destructive one. | Verified `SingleSignOn.tsx:1023-1043`, `packages/ui/src/Dialogs.tsx:153` | P0-9 |
| Density | Settings is one long form (for SAML: 8 controls, 4 claims, provisioning and a default role) mixing identity basics, cryptographic options and new-member policy. Rare options are not behind a disclosure. | Verified `SingleSignOn.tsx:715-878` | P2-7, P4-2 |
| Error recovery | Save on the Settings tab is at the bottom right, always enabled, with no dirty indication and no leave guard. Whether edits survive a tab switch depends on whether the tab panel unmounts. | Verified `SingleSignOn.tsx:715-878`; loss on tab switch is Inferred | P2-7 |
| Inconsistent patterns | Attribute mapping is a free-text `name = claim` textarea while group mapping, two tabs away, is a row editor. Inside one provider, domains are cards and providers, people and tokens are tables. | Verified `SingleSignOn.tsx:557-584,831-839` | P2-7, P2-2 |
| Typography | The provider title is 20 px (`text-xl`), a size used by one other screen; other page titles are 26 px. | Verified `SingleSignOn.tsx:1017` | P2-1, P2-3 |
| Missing states | The provider list renders nothing while loading. The connect dialog does not mark which fields are required: the OIDC secret is optional and SAML needs a URL or XML, and both rules are only in hints. | Verified `SingleSignOn.tsx:1238,267-282` | P2-4, P2-7 |
| Keyboard limitations | The provider name in the list and the back control are buttons styled as links, so they cannot be opened in a new tab; rows are inert. | Verified `SingleSignOn.tsx:1008-1013,1224-1230` | P2-6, P2-2 |

### TN-SCIM · Provisioning — 65/100 (functional / inconsistent)

Route: the sixth tab of a provider in TN-SSO; no URL of its own · component `screens/Provisioning.tsx:36` · density: standard; fits.

**User objective.** Let the identity provider create and disable accounts automatically, and see what it pushed and what was refused.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **65/100** |

**What the eye sees first.** The address to give the provider, then a tokens table, then a form "How pushes are taken", counts, pushed people and refusals. The order follows the setup order.

**Strongest existing decisions (keep).**

- A new token is shown once **with** Copy (`Provisioning.tsx:114-123`): the pattern API keys and worker credentials lack.
- Save is disabled until something changed (`Provisioning.tsx:58,215`), and saving confirms with a toast.
- Refused pushes are listed with the reason, next to the settings that caused them; "A push never deletes an account."

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Missing states | The one-time token notice has no dismiss and is held in component state, so switching tabs before copying loses the token for good. | Verified `Provisioning.tsx:114-123` | P0-10 |
| Discoverability | The tab is three levels from any URL (section, provider in state, tab in state). | Verified `SingleSignOn.tsx:952,1171` | P2-11, P2-6 |
| Typography | Section headings are 15 px `h3` for the first three sections and the uppercase label style as `h2` for the last two: two heading styles in one tab, and a level inversion (h3 before h2). | Verified `Provisioning.tsx:109,171,222,273,313` | P2-1, P0-7 |
| Density | The pushed-people table has no paging or search. | Verified `Provisioning.tsx:261` | P2-2 |
| Inconsistent patterns | Tokens, pushed people and refusals use the bordered `Table` with inert rows, while people lists elsewhere open an inspector. | Verified `Provisioning.tsx:36-348` | P2-2 |

### TN-BRANDING · Tenant branding — 61/100 (functional / inconsistent)

Route: `/t/:t/branding` · component `screens/Branding.tsx:401`; theme editor `screens/Branding.tsx:227` · density: highly dense form in a low-density frame; poor fit.

**User objective.** Set the client's portal address and sign-up rule, and make the portal and apps carry the client's colours and logo.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3 |
| Information architecture (10) | 3 |
| Interaction efficiency (12) | 2.5 |
| Data readability and density (10) | 3 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3 |
| **Weighted total** | **61/100** |

**What the eye sees first.** Four equal bordered panels; the first is the portal URL. The theme panel is 26 tokens in light and dark (52 text inputs) before the Save button, and the preview is a separate panel **below** Save (`Branding.tsx:321-330`). On a laptop the user edits a colour value and scrolls about 1,000 px to see its effect.

**Strongest existing decisions (keep).**

- A live swatch per token; placeholders "kit default" and "same as light".
- Server errors are mapped to the token row they concern (`Branding.tsx:152-154`).
- The reset confirmation says exactly what is removed: "Every value set here is removed, for light and for dark. The portal and apps go back to the kit's values." (`Branding.tsx:302-303`).
- The page error offers "Try again" (`Branding.tsx:409`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Inconsistent patterns | Three save models on one page: the sign-up checkbox saves on change, the theme needs "Save theme", the logo uploads as soon as a file is chosen. No dirty indicator and no leave guard. | Verified `Branding.tsx:388-392,448-457` | P2-7 (one save model) |
| Feedback | The autosaving checkbox gives no success signal. "Saved." for the theme is muted text beside the button. | Verified `Branding.tsx:313-317,448-457` | P2-8 |
| Accessibility | Nothing checks contrast. Any valid colour is accepted, so a tenant can ship a portal with unreadable text. | Verified (no contrast check in `apps`, `packages`, `e2e`; `Portal.test.tsx:310` only rejects non-colours) | P0-2 |
| Visual hierarchy | The frequent settings (portal URL, sign-up on or off) and the rare one (a full theme) share one page at equal weight. | Verified `Branding.tsx:401-464` | P2-11, P4-2 |
| Density | Tokens are a flat list of raw token names with no grouping (surface, text, state, shape, type) and no colour picker. | Verified `Branding.tsx:22-49` | P2-7 |
| Spacing | The preview is below Save in another panel; the logo is not part of the preview. | Verified `Branding.tsx:321-330` | P3-5 (editor and preview side by side) |
| Responsive | Token rows use a fixed 7.5 rem label column. | Verified `Branding.tsx:158` | P2-1 |
| Missing states | The page renders nothing while loading; the file input is the unstyled native control. | Verified `Branding.tsx:384-393,415` | P2-4, P2-7 |

### TN-DOMAINS · Domains — 71/100 (good but visibly improvable)

Route: `/t/:t/domains` · component `screens/Domains.tsx:359`; details sheet `screens/Domains.tsx:200` · density: standard; fits.

**User objective.** Serve an app at the client's own hostname: add it, publish the DNS records, and see it verified.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 4 |
| Error recovery (10) | 4 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **71/100** |

**What the eye sees first.** Two paragraphs of explanation, then a table with a small "Details" button per row. The explanation repeats the three numbered steps the details sheet shows.

**Strongest existing decisions (keep).**

- The side sheet is the right container: configuration with copyable values, not a blocking decision. It shows three numbered steps with state and timestamps.
- Adding a hostname opens the sheet on it (`Domains.tsx:460-464`): the only create in part C that lands the user on the result.
- `domain_not_verified` is rewritten into a full remedy (`Domains.tsx:43-45`); errors are shown inside the sheet, next to "Check now".
- Remove copy is exact: "The app is no longer served there, and sign-ins made at that hostname end."

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Simplification | Two always-visible paragraphs above the table repeat the sheet's steps. | Verified `Domains.tsx:375-386` | P4-1 |
| Interaction friction | No automatic re-check while waiting for DNS; the admin presses "Check now" until it passes. | Verified `Domains.tsx:303-313` | P1-7 |
| Missing states | The open sheet is not in the URL, so a hostname's setup cannot be linked or survive a reload. | Verified `Domains.tsx:359-481` | P2-11, P2-6 |
| Inconsistent patterns | State is two `Badge`s in the table and a `StatePill` in the sheet. | Verified `Domains.tsx:49-60` | P2-5 |
| Density | The "Last check" column prints the raw error in red inline, which can be long. | Verified `Domains.tsx:425-426` | P4-6 |
| Keyboard limitations | A row has no target except the small "Details" button; the row is inert. | Verified `Domains.tsx:359-481` | P2-2, P0-3 |
| Feedback | Add, enable and remove show no success message (`Domains.tsx` has four writes and no success toast). | Verified: no `notify.success` call in `Domains.tsx` | P2-8 |

### TN-REPOSITORY · Repository — 70/100 (good but visibly improvable)

Route: `/t/:t/repository` · component `screens/Git.tsx:24` · density: low; fits.

**User objective.** Connect the tenant's Git repository so workspaces can follow branches, and know that the connection works.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **70/100** |

**What the eye sees first.** One form: address, default branch, folder, token, then Save or Connect with Disconnect on the same row.

**Strongest existing decisions (keep).**

- The button reads "Reaching the repository…" while it verifies (`Git.tsx:121`), one of five buttons in the console that say what they are doing.
- Success is an inline notice at the form: "Connected. The repository was reached with the token." (`Git.tsx:116-118`).
- The token placeholder "Leave empty to keep the stored one"; the disconnect confirmation "Workspaces stop following their branches. Nothing in the repository is changed." (`Git.tsx:129-130`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Missing states | No lasting "verified at" line and no "check again": the only evidence the connection works is the notice shown once after saving. | Verified `Git.tsx:116-118` | P1-7 |
| Visual hierarchy | Disconnect (danger) sits on the same row as Save, right-aligned beside it. | Verified `Git.tsx:119-144` | P0-9 |
| Error recovery | Save is always enabled and nothing guards unsaved edits. Before connecting, `main` and `platform` appear as real values rather than placeholders. | Verified `Git.tsx:27-28` | P2-7 |
| Discoverability | After connecting there is no link to a workspace's Git sync, the next step. | Verified `Git.tsx:24-184` | P1-10 |
| Missing states | Loading and error are rendered outside the page frame, so the title disappears while they show. | Verified `Git.tsx:42-43` | P2-4 |

### TN-WORKERS · Workers — 62/100 (functional / inconsistent)

Route: `/t/:t/workers` · component `screens/Execution.tsx:922`; queue panel `screens/Execution.tsx:824`; pool card `screens/Execution.tsx:731` · density: standard with mixed idioms; the order suits monitoring and is wrong for setup. Part B of this document covers the queue panel as an operating surface; this section covers the page as a tenant admin sets it up.

**User objective.** Make sure something can run the tenant's scripts: check the pools, and connect a worker inside the client's own network when one is needed.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3 |
| Design-system consistency (7) | 2.5 |
| Visual craft and polish (7) | 3 |
| **Weighted total** | **62/100** |

A second, independent pass over this page, made with the workspace configuration screens, scored it 63 with slightly different sub-scores. The two agree within the stated tolerance; the lower score is kept here.

**What the eye sees first.** The primary "Add pool" and the Queue heading (with an amber backlog notice when runs are waiting). The task most admins come for, starting a worker, is the last section, and its how-to is that section's **description**: "Start a worker with: platform-worker --url <this instance> --token <credential>" (`Execution.tsx:1037`), not copyable and with both placeholders unfilled.

**Strongest existing decisions (keep).**

- The backlog sentence: "Runs are waiting in X, the oldest for 3m." (`Execution.tsx:845-855`); queue rows link to that workspace's queued runs (`Execution.tsx:872`).
- An outdated worker is badged "Older version: takes no tasks" (`Execution.tsx:906-908`).
- A pool card warns when workspaces depend on a pool with nobody online (`Execution.tsx:759-764`).
- Exact confirmations: `Remove the pool "{name}"? Scripts that name it wait until it is made again.` (`Execution.tsx:783`) and `Revoke "{name}"? A worker using it stops.` (`Execution.tsx:1094`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Interaction friction | After "Create credential" the token appears in an attention notice as selectable text with no Copy button and no ready-to-paste command. The instance URL is known to the browser but is not substituted. Registering a worker takes about 8 interactions plus assembling the command by hand. | Verified `Execution.tsx:1037,1081-1088` | P0-10 |
| Feedback | Nothing says "waiting for the worker to connect"; the admin watches a pool card for "1 online". The page refreshes on run and task events, and a worker connecting is not one of those. | Verified `stream.ts:67-77,103-105`; the need to reload is Inferred | P1-7 |
| Error recovery | The managed-workers switch, which changes where client code executes, is an unlabelled sentence with a small button, no confirmation and no error handling (`await api.patch` outside a try/catch). | Verified `Execution.tsx:985-995` | P0-9, P0-1 |
| Visual hierarchy | Setup is below monitoring: queue, pool cards, managed-workers notices, then credentials. | Verified `Execution.tsx:922-1124` | P2-11, P2-13 |
| Inconsistent patterns | Three list idioms on one page: a hand-made table for the queue, cards for pools, a bordered `ListScreen` section for credentials; headings are 16 px `h2`, an `h3` under the `h1`, and an 18 px `h2`. | Verified `Execution.tsx:745,836,857,951-963,1026` | P2-2, P2-1 |
| Density | Pools are cards in a one-to-three-column grid, each holding four facts and one action; they should be rows once there are more than a handful. Workers online are an unlabelled inline list with no link from a running script to its run. | Verified `Execution.tsx:899-916,951-963` | P2-2, P1-10 |
| Accessibility | The queue table has no accessible name and its headers lack `scope`. | Verified `Execution.tsx:857` | P2-2 |
| Discoverability | The one documentation reference ("see 'Workers the instance starts' in the self-hosting guide") is plain text, not a link; nothing says where to get `platform-worker`. | Verified `Execution.tsx:970-971` | P2-13 |
| Missing states | Revoked credentials stay in the list with no filter; credential state is a `Badge` ("Active" in teal). | Verified `Execution.tsx:1052-1054` | P2-5, P2-2 |

### TN-AUDIT · Audit log (tenant and instance) — 68/100 (functional / inconsistent)

Route: `/t/:t/audit` and `/instance/audit` (`screens/Instance.tsx:173`) · component `screens/Audit.tsx:103` · density: compact; fits, and is the best data-dense screen in part C.

**User objective.** Find out who changed a given thing, when, and what exactly changed.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **68/100** |

**What the eye sees first.** The coloured verb badges (Create green, Update amber, Delete red, Execute teal) dominate each row; the timestamp and the raw action code come second. For an investigation "who" and "to what" matter more, and those are the muted, truncated columns (`Audit.tsx:189,211`) (**Judgment**).

**Strongest existing decisions (keep).**

- Human words for each action beside the raw code; an "Operator" badge on entries made under an operator grant (`Audit.tsx:202`).
- Timestamps to the second in mono; request ID and IP in the inspector (`Audit.tsx:315`).
- On a wide screen the newest entry is open beside the list (`Audit.tsx:160-162`).
- Area and Since are applied on the server (`Audit.tsx:124-158`), a partial answer to the earlier audit's request for facets.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Missing states | Search and the Kind chips filter only the **loaded** entries (50 per page), and the chip counts are counts of loaded rows. Searching for a resource finds nothing until "Show older entries" has been pressed enough times, and nothing says the search is partial. | Verified `Audit.tsx:147-158,163` | P2-11 (server-side search), P0-6 |
| Data readability | "To" shows the target's ID, usually a UUID, never its name or path, and is not a link. Details are raw JSON with no before/after comparison. | Verified `Audit.tsx:211-213,323` | P2-11, P1-10 |
| Discoverability | No filter by actor, by target or by custom date range; Area is a 29-item native select. The request ID cannot be clicked or copied to see the other entries of one request. | Verified `Audit.tsx:25-55,315` | P2-11 |
| Missing states | Filters, the open entry and paging are component state. An entry cannot be linked from a ticket. | Verified `Audit.tsx:116-120` | P2-6 |
| Alignment | "Show older entries" is in the toolbar at the top, not at the end of the list where the user is when they need it. | Verified `Audit.tsx:279-283` | P2-2 |
| Inconsistent patterns | The toolbar mixes bare 32 px selects and a bare search input with chips, while other screens use the 36 px labelled field; the filter label is muted grey. | Verified `Audit.tsx:228-262` | P2-1, P2-7, P4-1 |
| Accessibility | The When cell wraps the timestamp in a button inside a row that is itself clickable and focusable: two tab stops per row and nested interactive elements. | Verified `Audit.tsx:173-183` | P0-3, P2-2 |
| Feedback | The verb badge is inferred by pattern-matching the action name; "access" matches Read, so operator-access actions may be badged wrongly. | Verified `Audit.tsx:66-81`; the mis-badging is Inferred | P2-5 |
| Missing states | A load error has no retry; there is no export. | Verified `kit/CollectionView.tsx:73-76` | P2-4, P2-11 |
| Responsive | On a phone the toolbar stacks to about five rows before the first entry. | Inferred from `Audit.tsx:228-283` | P4-1 |

### TN-RETENTION · Retention — 75/100 (good but visibly improvable)

Route: `/t/:t/retention` · component `screens/Retention.tsx:36` · density: low; fits.

**User objective.** Decide how long the tenant's history is kept, knowing what the instance default is.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 4 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3.5 |
| Error recovery (10) | 4 |
| Keyboard and expert efficiency (10) | 3.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **75/100** |

**What the eye sees first.** Four number fields, each with the instance default as its placeholder and "Now N days" in its hint, and one Save button.

**Strongest existing decisions (keep).**

- The cleanest save model in part C: explicit Save, disabled until something changed and is valid (`Retention.tsx:105`), with a toast on success.
- Bounds are validated inline (`Retention.tsx:45-53`); the effective value is always visible.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Error recovery | Lowering a period deletes history "within minutes" (the page description says so), yet Save asks for no confirmation and shows no estimate of how much goes. | Verified `Retention.tsx:60-66` | P0-9 |
| Interaction friction | The fields are text inputs, not number inputs. | Verified `Retention.tsx:89` | P2-7 |
| Typography | Each hint joins the description and the current value into one long line. | Verified `Retention.tsx:96` | P2-7 |
| Missing states | Loading and error render without the page title; no leave guard. | Verified `Retention.tsx:40-41` | P2-4, P2-7 |

### TN-EXPORT · Export — 67/100 (functional / inconsistent)

Route: `/t/:t/export` · component `screens/Tenant.tsx:345` rendering `TenantExport` at `screens/Environments.tsx:557` · density: low; fits.

**User objective.** Download the whole tenant as one protected file, to keep or to move to another instance.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3.5 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **67/100** |

**What the eye sees first.** A page description of about 40 words, two passphrase fields, a history select and the submit button. The sentence that matters most, that the part of the file not covered by the passphrase "can be read by anyone who has the file", is the last and smallest paragraph, under the button (`Environments.tsx:643-647`).

**Strongest existing decisions (keep).**

- Honest security copy; the passphrase mismatch is shown inline.
- A pointer to the command line for large tenants.
- The button label changes to "Exporting…".

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | The key warning comes after the action instead of before it. | Verified `Environments.tsx:643-647` | P4-1 |
| Feedback | Success is an attention-toned notice, although it is a success with a caveat. No progress is shown for a long export beyond the button label. | Verified `Environments.tsx:633` | P2-8, P2-5 |
| Missing states | The whole file is buffered in memory with `response.blob()` before it is saved, so a large tenant gives no partial progress and may fail late. | Verified `Environments.tsx:586` | P2-8 |
| Missing states | No list of past exports (open since the earlier audit). | Verified `Environments.tsx:557-664` | P2-11 |
| Interaction friction | The mismatch message appears only once the second field has text; the minimum length relies on the browser's own validation bubble. Required fields are unmarked. | Verified `Environments.tsx:557-664` | P2-7 |
| Missing states | The section renders nothing while its data loads. | Verified `Tenant.tsx:348` | P2-4 |

## Instance

The instance area also contains single sign-on for operators and the instance audit log. Both reuse the tenant components and are covered by TN-SSO and TN-AUDIT. `/instance/databases`, `/instance/import` and `/instance/triggers` are covered in part B and in `01-current-product-ui-map.md`. Instance routes are not hidden from non-operators in the client; the API refuses them (**Inferred**).

### IN-TENANTS · Tenants list — 71/100 (good but visibly improvable)

Route: `/` · component `screens/Tenants.tsx:19` · density: standard; fits, though an operator with many clients would be better served by compact rows.

**User objective.** As an operator, pick the client that needs attention; as a member, open the tenant you belong to.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **71/100** |

**What the eye sees first.** The `h1` "Tenants" and a description, a labelled search field, then the table; the first tenant name is about 200 px down. The list answers "which tenants exist", not "which need me": there is no health signal per tenant.

**Strongest existing decisions (keep).**

- The name is a real link, and the row also opens an inspector with ID and slug.
- A "You" column reads "Member" or "Through a grant" (`Tenants.tsx:53-60`), which sets expectations before the operator gate.
- On phones the slug folds under the name (`Tenants.tsx:41`).
- Delete uses type-to-confirm with exact copy: "This deletes the tenant from this instance: every workspace, secret, table and file. Export it first if anything should be kept. It cannot be undone." (`Environments.tsx:1150-1156`).
- On first open the console goes back to the last workspace or tenant instead of this list (`App.tsx:63-87`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Density | No health columns (failed runs, approvals waiting, workers online) although the tenant overview already computes them. | Verified `Tenants.tsx:30-60`, `TenantOverview.tsx:50` | P2-2, P1-7 |
| Interaction friction | One row has two targets with different results: the name navigates, the rest of the row opens the inspector. Only the link colour tells them apart. | Verified `Tenants.tsx:38`, `kit/CollectionView.tsx:111` | P2-2, P2-6 |
| Feedback | After "Create tenant" the dialog closes and the list reloads: no message, no selection of the new row, no navigation into it. The operator then finds it, opens it and meets SH-GATE. | Verified `kit/ListCollection.tsx:131-141` | P2-13, P1-5 |
| Error recovery | The type-to-confirm dialog asks for the slug while its title shows the name, and does not print the slug. Delete sits directly beside the primary "Open" in the inspector footer. | Verified `Environments.tsx:1151-1153`, `packages/ui/src/Dialogs.tsx:143`, `Tenants.tsx:104-116` | P0-9 |
| Missing states | The list is capped at 200 with no paging and no "showing 200" note; a load error has no retry. | Verified `Tenants.tsx:30`, `kit/CollectionView.tsx:73-76` | P2-2, P2-4 |
| Keyboard limitations | No `/` to focus search; each row is a tab stop; no arrow or `j`/`k` movement. | Verified `kit/CollectionView.tsx:110-121` | P3-1, P0-6 |

### IN-MEMBERS · Instance members — 71/100 (good but visibly improvable)

Route: `/instance/members` · component `screens/Instance.tsx:46` · density: standard; fits.

**User objective.** See every account on the instance and which tenants it belongs to; create or disable an account.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 4 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **71/100** |

**What the eye sees first.** A "Disable" button in the danger colour on every row (`Instance.tsx:25`), ahead of the names (**Judgment**).

**Strongest existing decisions (keep).**

- Disable copy is exact: "They can sign in nowhere, in any tenant: their sessions end now and their API keys stop working. The account and what it holds are kept." (`Instance.tsx:30`).
- Search and an inspector, from the shared `ListCollection`.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Visual hierarchy | A danger-coloured button repeats on every row; the destructive action is the loudest element of a reading screen. | Verified `Instance.tsx:21-31` | P0-9, P2-2 (row actions in a menu) |
| Inconsistent patterns | The State column mixes a `Tag` (Disabled) and a `StatePill` (Active) in one column. | Verified `Instance.tsx:78-82` | P2-5 |
| Interaction friction | The operator creates an account by typing an initial password, then passes it on out of band. | Verified `Instance.tsx:93-98` | P2-11 |
| Discoverability | A member's tenants are plain text, not links. | Verified `Instance.tsx:46-127` | P1-10 |
| Missing states | Capped at 200 with client-side search; no retry on error; create and disable are silent. | Verified `Instance.tsx:51` | P2-2, P2-4, P2-8 |

### IN-OPERATORS · Operators — 70/100 (good but visibly improvable)

Route: `/instance/operators` · component `screens/Instance.tsx:128` · density: standard; fits.

**User objective.** Decide who may run the instance.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 4 |
| Information architecture (10) | 4 |
| Interaction efficiency (12) | 3.5 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 4 |
| Visual craft and polish (7) | 3.5 |
| **Weighted total** | **70/100** |

**What the eye sees first.** A short list of emails with a "Role" column that is the same on every row.

**Strongest existing decisions (keep).**

- "Add operator" uses a searchable member picker (`Instance.tsx:144-157`). This is the pattern "Give access" in TN-ACCESS should use.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Error recovery | Removing the last operator, or yourself, has no special warning in the interface. The confirmation `Remove {email} as an operator?` states no consequence. | Verified `Instance.tsx:164` | P0-9 |
| Simplification | The "Role" column always holds the same value. | Verified `Instance.tsx:128-172` | P2-2 |
| Inconsistent patterns | No inspector, unlike the Instance members list one item above in the navigation. | Verified `Instance.tsx:128-172` | P2-2 |
| Feedback | Add and remove are silent. | Verified: no `notify.success` call in `Instance.tsx` | P2-8 |

### IN-BRANDING · Instance branding — 62/100 (functional / inconsistent)

Route: `/instance/branding` · component `screens/InstanceBranding.tsx:19` · density: highly dense form in a low-density frame; poor fit.

**User objective.** Give the console the agency's product name, mark and colours.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3 |
| Information architecture (10) | 3 |
| Interaction efficiency (12) | 2.5 |
| Data readability and density (10) | 3 |
| Feedback and system state (12) | 3 |
| Error recovery (10) | 3.5 |
| Keyboard and expert efficiency (10) | 3 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 3 |
| **Weighted total** | **62/100** |

**What the eye sees first.** A product-name form, then the same token editor as TN-BRANDING. Here the preview at least sits in the same panel as the tokens.

**Strongest existing decisions (keep).**

- The guidance on the attention colour: "Production is always marked in the attention color, so keep it clearly amber." (`InstanceBranding.tsx:158`).
- The load error offers "Try again" (`InstanceBranding.tsx:23`).

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Feedback | One `saved` message serves both the name form and the theme form but is rendered only beside the theme buttons, so "Save name" appears to do nothing unless the user scrolls down. | Verified `InstanceBranding.tsx:38,208-212` | P2-8, P2-7 |
| Accessibility | No contrast check: an operator can set an accent or ink colour that makes the whole console unreadable for every tenant. | Verified (no contrast check anywhere in the repo) | P0-2 |
| Inconsistent patterns | This page uses `PageHeader`, `Panel` and `SectionLabel`; tenant branding uses `Page` and a local panel class with 16 px headings. Two shells for one editor. | Verified `Branding.tsx:116,257`, `InstanceBranding.tsx:19-222` | P2-3, P2-12 |
| Density | The token list is the same flat, ungrouped set of raw names with no colour picker. | Verified `Branding.tsx:22-49` | P2-7 |
| Missing states | Renders nothing while loading; unstyled native file input for the mark. | Verified `InstanceBranding.tsx:28,136` | P2-4, P2-7 |

### IN-KIT · Kit sheet — 62/100 (functional / inconsistent)

Route: `/instance/kit` ("Component kit" in the instance navigation, `nav.ts:200`) · component `screens/KitSheet.tsx:39` · density: standard; fits.

**User objective.** As a developer of the console, see the kit's tokens and components in the running theme.

| Category (weight) | Score (0–5) |
|---|---|
| Task clarity and hierarchy (12) | 3.5 |
| Information architecture (10) | 3 |
| Interaction efficiency (12) | 3 |
| Data readability and density (10) | 3.5 |
| Feedback and system state (12) | 2.5 |
| Error recovery (10) | 2.5 |
| Keyboard and expert efficiency (10) | 2.5 |
| Accessibility (10) | 3.5 |
| Design-system consistency (7) | 3.5 |
| Visual craft and polish (7) | 4 |
| **Weighted total** | **62/100** |

**What the eye sees first.** Token swatches, then type roles, motifs, state and environment tags, actions, filters and steps, status with a next step, and the empty canvas. It is tidy and reads as a reference.

**Strongest existing decisions (keep).**

- A live reference rendered with the instance's own theme, so branding changes can be checked against real components.

| Dimension | Finding | Evidence | Fix |
|---|---|---|---|
| Missing states | The sheet documents only the console kit. It imports just `Button` and `Notice` from `packages/ui`, so fields, tables, dialogs, side sheets, menus, tabs, badges, toasts, the list primitives and loading/error states (the parts that actually diverge) are not on it. | Verified `KitSheet.tsx:39-213` | P2-12 |
| Discoverability | A developer reference sits in the operator's production navigation. | Verified `nav.ts:200` | P2-12 |
| Spacing | The page uses its own section gap (`gap-9`) where other pages use `gap-5`. | Verified `KitSheet.tsx:43`, `ListScreen.tsx:109` | P2-1 |
| Simplification | Three motif components (`SignalPath`, `PortBrackets`, `JunctionList`) exist only to be shown here. | Verified `kit/motifs.tsx` (used only by `KitSheet.tsx`) | P2-12 |

## Dialogs, sheets and confirmations

This inventory covers the whole console, not only part C. Four containers exist:

- **Dialog** (`packages/ui/src/Dialog.tsx`): centred, modal, three widths (30 rem, 46 rem, palette), 15 uses. It has no close button; Esc, the backdrop or the caller's Cancel are the only exits (`Dialog.tsx:27-48`).
- **Side sheet** (`packages/ui/src/SideSheet.tsx`): modal panel from the right with a close button, 11 uses. Esc or a backdrop click closes it and discards what was typed without asking (`SideSheet.tsx:42`).
- **Inspector** (`kit/layout.tsx:85-140`): 13 uses. From 1280 px it is a non-modal panel docked beside the list; below that it becomes a side sheet. The docked form does not take focus, does not close on Esc and does not return focus (P0-3); the sheet form does all three.
- **Questions** (`ask.confirm`, `ask.prompt`, `ask.typeToConfirm`; `ask.tsx:49-53`, `packages/ui/src/Dialogs.tsx`): 45 call sites (30 confirm, 12 prompt, 3 type-to-confirm). No native `confirm()`, `alert()` or `prompt()` exists; a lint rule forbids them. Asking a second question silently cancels the first (`Dialogs.tsx:68-71`).

Shared defects that every row below inherits (all **Verified**):

- `CreateDialog` clears its values only on success, so Cancel keeps them: reopening "Add member" shows the previous email and password (`ListScreen.tsx:127,153`). Option fields default silently to their first option (`ListScreen.tsx:147-151`). Submit has no busy label (`ListScreen.tsx:200`). Fix: P0-9.
- Required fields carry no mark (`packages/ui/src/Fields.tsx:15-29`). Fix: P2-7.
- The type-to-confirm label reads "Type {expected} to confirm" with the expected text not shown in a copyable or mono form (`Dialogs.tsx:143`). Fix: P0-9.
- Dialog titles are 16 px and side-sheet titles 18 px; scrims are 40% and 30%; the two close buttons differ in size and icon (`02-design-system-forensics.md`). Fix: P2-1, P4-3.

### Dialogs and sheets

"Blocking decision" means the user must answer before anything else can sensibly happen. "Configuration" means the user is editing an object and would benefit from still seeing the list or page behind it.

| Dialog or sheet | What it is for | Blocking decision or configuration | Would a drawer or inline keep context |
|---|---|---|---|
| `CreateDialog` family (`ListScreen.tsx:116`): Create tenant, workspace, group, end-user group, service account, pool, credential, API key; Add member, Add operator; Invite end user; Give access; Open operator access; Create table (`Data.tsx:525-552`); Connect database, 8 fields (`Data.tsx:1094-1145`); Set variable (`Execution.tsx:686-704`); Add a group member (`Execution.tsx:1199-1249`) | Create one object from a few fields | Short creates are legitimately modal. Create workspace and Give access carry irreversible or wide-reaching choices | No change of container needed; they need a better form (conditional fields, searchable pickers, no silent defaults). Connect database should use the connection wizard sheet, as connections do |
| Role create / change (`Roles.tsx:274`), 46 rem with a scrolling grid | Tick permissions for a role | Configuration | Yes: a page or drawer with a save bar; Esc currently discards every tick |
| Who is in {group} (`Groups.tsx:20`), wide | Add and take out members | Configuration | Yes: the inspector, as sibling tabs use |
| End-user attributes (`Groups.tsx:314`) | Edit attributes of one end user | Configuration | Yes: inline in the end-user inspector |
| Connect identity provider (`SingleSignOn.tsx:141`) | First fields of a provider | Configuration, but it leads straight into the provider page | Acceptable as a dialog |
| Add hostname (`Domains.tsx:62`), then the details side sheet (`Domains.tsx:200`) | Add a hostname, then follow three DNS steps | The add is a short create; the details are configuration | Already right: the sheet keeps the table in view. It should be in the URL |
| Invitation / reset link (`EndUsers.tsx:47`) | Show a link once, with Copy | Blocking: shown once | No; this is a true modal moment |
| Try a tool (`AgentAccess.tsx:156`) | Call an agent tool with input | Configuration and result | Yes: a drawer would keep the tool list visible |
| Input dialog "Run {script}", "Start {flow}", "Run X again" (`InputDialog.tsx:23`; used at `Flows.tsx:394`, `Execution.tsx:319`, `RunPage.tsx:424,581`) | Fill the input schema and start a run | Blocking for a one-off start | Acceptable; when re-running a failed run the failed input should stay visible beside the form |
| Offer to agent (`OfferToAgent.tsx:26`) | Expose a script or flow as an agent tool | Short configuration | Acceptable as a dialog |
| Add column (`Data.tsx:935-981`) | Add a column to a table | Configuration | Yes: inline row in the columns table |
| Make an app (`Interfaces.tsx:2027-2089`) | Name and address of a new app | Short create | Acceptable |
| Clone workspace (`Environments.tsx:194`) | Copy a workspace with a safety switch | Blocking decision with consequences stated | Acceptable |
| Promotion preview (`Environments.tsx:452-504`) | Show what a promotion adds, changes and removes | Read-only evidence before a decision | Yes: inline on the Releases promote step, where the same preview already exists |
| New schedule sheet (`ScheduleForm.tsx:256`) | Create a schedule trigger | Configuration | Already a sheet; the target must be re-picked because it is not opened from the script or flow (P1-9) |
| Connection wizard, wide sheet (`ConnectionWizard.tsx:152`) | Define, bind and test a connection | Configuration | Already a sheet; needs an unsaved-changes guard, since Esc discards typed settings |
| Row sheet (`Data.tsx:281-312`) and Add row sheet (`Data.tsx:328-476`) | Read one row; add a row | Configuration | The row sheet is modal and read-only: it blocks the grid it describes. A non-modal, editable inspector would keep context (P2-9) |
| Share app, wide sheet with two tabs (`Apps.tsx:89`) | Choose who can open an app and what they read | Configuration | Already a sheet, but closing it remounts the list and drops the selection (`Apps.tsx:375-382`) |
| Draft history sheet (`Release.tsx:411`), drift sheet (`Drift.tsx:123`), review promotion request sheet (`Promotion.tsx:229`) | Earlier drafts; what differs between workspaces; decide a request | Evidence for a decision | Already sheets; drift evidence sits below the Promote button |
| Inspectors (13 uses): the chosen run, script, flow, trigger, event, approval, app, member, role, end user, service account, audit entry, and the shared one for tenants and instance members | Peek at one object from a list | Configuration and reading | Already docked from 1280 px; selection is not in the URL (P2-6) |
| Command palette and shortcut sheet (`kit/CommandPalette.tsx:601,749`) | Go to, run, find | Transient | The palette is full-screen with no close button on phones |
| Prompts (12): pause a trigger with a reason (`Operate.tsx:276`), approve / reject with a note (`Operate.tsx:636`, `Flows.tsx:644`), commit message (`Git.tsx:325`), provisioning token name (`Provisioning.tsx:62-67`), add / rename a page and make an app (`Interfaces.tsx:1767,1825,1850`), new dashboard (`Dashboards.tsx:41`), rename a column (`Data.tsx:777`), decline a promotion request (`Promotion.tsx:251`) | One line of text before an action | Blocking, briefly | Approve should not open a prompt when no note is given: it adds a dialog to the commonest case |

### Destructive and consequential confirmations

Copy is quoted from the code. "Names the object" means the confirmation says which thing; "says what is affected" means it also says what else stops working, ideally with the list or a count.

| Action | Confirmation copy | Says exactly what is affected | Type-to-confirm |
|---|---|---|---|
| Delete tenant (`Environments.tsx:1150-1156`) | "Delete {name}?" / "This deletes the tenant from this instance: every workspace, secret, table and file. Export it first if anything should be kept. It cannot be undone." | Yes, by category | Yes, the slug (not shown in the dialog) |
| Delete workspace (`Environments.tsx:128-131`) | "Delete {name}?" / "This deletes the workspace with its resources, secrets, run history, tables and files. It cannot be undone." | Yes, by category | Yes, the slug |
| Remove identity provider (`SingleSignOn.tsx:1027-1032`) | "Remove {name}?" / "Its domains, group mapping and ties to people go with it. The people it signed in stay, and need another way in." | Yes | Yes, the name; the final button is not drawn as destructive |
| Delete a table for good (`Data.tsx:671`) | "Delete {what} and everything in it? This is the one action that destroys data, and it cannot be undone." | Names the object; no row count | **No**, although it is by its own words the one action that destroys data |
| Delete a row (`Data.tsx:222,290`) | "Delete this row? This cannot be undone." / "Delete this row? It is removed for everyone. This cannot be undone." | No: the row is not identified | No |
| Retire a table / column (`Data.tsx:807-808,928`) | "Retire "{name}"? Its rows are kept, and nothing can read or write them until it is brought back." | Yes; reversible | No |
| Disconnect a data source (`Data.tsx:1083`) | "Disconnect "{path}"? Scripts that use it will fail until it is connected again. Nothing in that database changes." | Effect stated; the scripts are not listed | No |
| Unbind a connection (`Execution.tsx:635`) | "Unbind {path}? Scripts that use it will fail until it is bound again." | No: the scripts are not named although the usage list is loaded two lines above | No |
| Delete a secret (`Tenant.tsx:706`) | "Delete the secret {name}? Anything that uses it will fail." | No: the users are known and not listed | No |
| Clear a variable's value (`Execution.tsx:709`) | "Clear the value of {path} in this workspace?" | Yes; reversible, yet drawn as a red destructive button | No |
| Remove a connection-group member (`Execution.tsx:1185`) | Title "Remove?" / "Scripts that ask {group} for "{key}" will fail until it is added again." | Partly: the title names nothing | No |
| Remove a pool (`Execution.tsx:783`) | "Remove the pool "{name}"? Scripts that name it wait until it is made again." | Yes, without a list | No |
| Revoke a worker credential (`Execution.tsx:1094`) | "Revoke "{name}"? A worker using it stops." | Yes | No |
| Activate an earlier version, the rollback (`Execution.tsx:461-462`) | "Activate version {n}?" / "This replaces what the workspace is running." | No preview or comparison of what changes | No |
| Promote (`Release.tsx:590-593`) | "Promote to {target}?" / "{target} starts running version {n} at once. Runs in progress there finish on the version they started with." | Yes; the button always reads "Promote to production", even for another target | No |
| Decide a promotion request (`Promotion.tsx:261-262`) | "Promote v{n} to {target}?" / "{target} starts running it at once. Runs in progress there finish on the version they started with." | Yes | No |
| Set aside a draft (`Release.tsx:265-266`) | "Set aside the draft of {path}?" / "It goes back to how it was last deployed. The draft stays in its history, and can be brought back." | Yes; reversible | No |
| Discard a draft (`Authoring.tsx:645-646`, `ResourceEditor.tsx:356`) | "Discard this draft?" / "The {noun} goes back to how it was last deployed. One that was never deployed is gone." | Yes | No |
| Remove a flow step (`FlowEditor.tsx:1332-1333`) | "Remove {id}?" / "The edges into and out of it go too." | Yes; but removal is undoable, and Backspace removes with no confirmation | No |
| Remove an app page (`Interfaces.tsx:1869-1870`) | "Remove the page {title}?" / "Its widgets go with it. Nothing in any table is touched." | Yes | No |
| Delete a dashboard (`Dashboards.tsx:209-210`) | "Delete {title}?" / "The dashboard is removed for you and for anyone it is shared with. No table and no row is touched." | Yes | No |
| Cancel queued runs (`Runs.tsx:167-168`) | "Cancel every queued run?" / "Every run in this workspace that has not started yet is cancelled. Runs already going carry on." | Yes, but no count, and it ignores the list's filters | No |
| Cancel a flow run (`RunPage.tsx:536-537`) | "Cancel this flow run?" / "Steps in progress are canceled too." | Yes | No |
| Retry from the failed step (`RunPage.tsx:484-492`) | "Retry from the failed step?" / "Runs again: … Kept as it was: … Approvals kept, not asked again: … On version {n}, with the same input." | Yes: the best confirmation in the console | No |
| Pause a trigger (`Operate.tsx:276-280`) | Prompt "Pause {path}?" with "Why (shown to everyone here)" | Yes | No |
| Remove a member (`Members.tsx:241`) | "Remove {email} from this tenant? Their access here is removed too." | Yes | No |
| Remove a role from a principal (`Members.tsx:452`) | "Remove the {role} role from {who}?" | No: not where (tenant or workspace) | No |
| Delete a group (`Groups.tsx:172`) | Title "Delete?" / "The group {name} is deleted, and access given to it is removed." | A statement, not a question; no counts | No |
| Delete an end-user group (`Groups.tsx:260`) | "Its people lose what it was given, and rows ruled by it are shown to nobody in it." | Yes, without counts | No |
| Delete a role (`Roles.tsx:489`) | "The role {name} is deleted. Whoever held it loses what it allowed." | No count of holders | No |
| Delete an end user (`EndUsers.tsx:148`) | "They can no longer sign in, and access given to them is removed. Their rows in tables are kept." | Yes | No |
| Delete a service account (`Tenant.tsx:846`) | "Delete {name}? Its keys stop working." | Yes | No |
| Revoke a key (`Account.tsx:173`; `Tenant.tsx:740`) | "Revoke the key "{name}"? Anything using it stops working." / for service accounts only "Revoke the key "{name}"?" | First yes; second gives no consequence | No |
| Make new recovery codes (`Account.tsx:78-84`) | "Make new recovery codes?" / "The codes you have now stop working. Keep the new ones somewhere safe that does not depend on your organization's sign-in." | Yes | No |
| End an operator's access, tenant side (`Tenant.tsx:974`) | "End {email}'s access now?" | No consequence stated | No |
| Remove an operator (`Instance.tsx:164`) | "Remove {email} as an operator?" | No; no warning for the last operator or yourself | No |
| Disable an instance member (`Instance.tsx:25-31`) | "Disable {email}?" / "They can sign in nowhere, in any tenant: their sessions end now and their API keys stop working. The account and what it holds are kept." | Yes | No |
| Require single sign-on (`SingleSignOn.tsx:1056-1062`) | "Require single sign-on?" / "Members with an email in this provider's proved domains can no longer sign in with a password. The operators of this instance keep theirs, so that a broken provider locks nobody out for good." | Yes, without a count of members | No |
| Disconnect the repository (`Git.tsx:129-130`) | "Disconnect the repository?" / "Workspaces stop following their branches. Nothing in the repository is changed." | Yes | No |
| Remove a hostname (`Domains.tsx:275`) | "The app is no longer served there, and sign-ins made at that hostname end." | Yes | No |
| Reset the theme (`Branding.tsx:302-303`); remove the logo (`Branding.tsx:374`) | "Reset to the kit's values?" / "Every value set here is removed, for light and for dark. The portal and apps go back to the kit's values." ; "Remove the logo? The sign-in pages show the tenant's name alone." | Yes | No |

Actions with consequences and **no confirmation at all** (all **Verified**):

| Action | Where | Why it matters | Fix |
|---|---|---|---|
| "Remove this widget" in the App Builder | `Interfaces.tsx:1202`, `ActionSettings.tsx:298-300` | No confirmation and no undo | P0-9, P2-10 |
| "Stop sharing" an app | `Apps.tsx:195-216` | Removes that principal's access to the app and to every table it reads | P0-9 |
| "End access now" in the operator banner | `Tenant.tsx:201-204` | No confirmation, no error handling | P0-9, P0-1 |
| Managed-workers switch | `Execution.tsx:985-995` | Changes where client code executes | P0-9 |
| "Turn on" a sign-in provider | `SingleSignOn.tsx:1078-1091` | No precondition check | P0-9 |
| "Pause triggers" on a production workspace; change "Promotes to" | `Environments.tsx:92,432-440` | One click stops production schedules; the target saves on select change | P0-9 |
| Lowering retention | `Retention.tsx:60-66` | Deletes history within minutes | P0-9 |
| "Take out" of a group; Disable an end user | `Groups.tsx:119-121`, `EndUsers.tsx:271-281` | Reversible; an undo toast would serve better than a confirmation | P2-8 |
| Backspace on a selected flow step | `FlowEditor.tsx:1051` | The button for the same action confirms; both are undoable | P1-8 |

Conclusions. The words are good: most confirmations say what stops working. Three things are missing across the set. First, none lists or counts what is affected, even where the screen already holds the usage list (connections, secrets). Second, type-to-confirm is used for three deletions and not for the fourth of the same weight (delete a table for good). Third, several reversible actions are confirmed while several irreversible or wide-reaching ones are not. Roadmap P0-9 covers all three; reversible actions should move to "do it, then offer undo" under P2-8.

## Toasts, notices and success feedback

Three channels exist (all **Verified**):

- **Toast** (`packages/ui/src/Toast.tsx`, called through `notify.success` and `notify.error`, `ask.tsx:65-68`). Text only: no action, no link, no undo (`Toast.tsx:14-20`). Fixed at the bottom right. Every toast, errors included, disappears after 5 seconds with no pause on hover or focus (`Toast.tsx:35,56-59`) and is announced politely with `role="status"` (`Toast.tsx:84`).
- **Inline notice** (`packages/ui/src/Notice.tsx`): four tones and an optional action; the danger tone is `role="alert"` (`Notice.tsx:22`). 112 danger notices in the console; 9 of them offer "Try again".
- **Nothing**: the dialog closes or the list reloads.

### What uses which

| Feedback | Used by |
|---|---|
| Success toast: 19 calls in 12 of the 40 files that write | Command palette (2), App Builder (2), instance triggers (1), dashboards (1), alerts (1), retention (1), single sign-on (4), runs (1), promotion requests (2), new schedule sheet (1), `Execution.tsx` (1), provisioning (1), data sources (1) |
| Success shown inline | Tenant and instance branding: muted "Saved." text beside the button (`Branding.tsx:313-317`, `InstanceBranding.tsx:208-212`). Repository: success notice at the form (`Git.tsx:116-118`). App Builder: a status line "Saving…", "Saved. Not published yet.", "Published.", "Not saved: reason" (`Interfaces.tsx:1737-1745`). Releases: an inline sentence after promoting (`Release.tsx:557-565`). Row rules: a saved confirmation (`RowRules.tsx:263-265`). Flow layout: saving / saved message (`Flows.tsx:436-443`). One-time secrets: an attention notice above the list that is never dismissed (`ListScreen.tsx:237`) |
| Success shown by navigating to the result | Connect identity provider (lands on the provider); Add hostname (opens its sheet, `Domains.tsx:460-464`); re-run (lands on the new run, `RunPage.tsx:166-180`); first save of a script, flow or resource (address replaced with the saved object) |
| No success feedback | Every write in `Tenant.tsx` (11 writes: workspaces, service accounts, keys, secrets, operator access), `Environments.tsx` (9), `Groups.tsx` (7), `EndUsers.tsx` (5), `Domains.tsx` (4), `ConnectionWizard.tsx` (4), `Members.tsx` (4), `RunPage.tsx` (4), `Operate.tsx` (4: pause, resume, approve, reject), `Release.tsx` (3: deploy among them), `Roles.tsx` (3), `Flows.tsx` (3), `Account.tsx` (3). Script and resource saves confirm only by a badge changing |
| Error toast: 54 calls, in 27 of the 40 files that write | Row and inspector actions: `RemoveButton` failures (`ListScreen.tsx:332`), suspend member (`Members.tsx:146-148`), save service-account description (`Tenant.tsx:920`), single sign-on domain, try and turn-on actions, token revoke, palette picker load failures (`kit/CommandPalette.tsx:357`) |
| Error shown inline | Forms: `CreateDialog` (one notice plus per-field messages matched by field name, `ListScreen.tsx:130-131,197`), input dialog (`InputDialog.tsx:77`), single sign-on Settings, repository, branding (per token), export, end users (toolbar notice, `EndUsers.tsx:209`), domains (inside the sheet), provisioning refusals, run failures ("Why it failed") |
| Error not handled at all | "End access now" (`Tenant.tsx:201-204`) and the managed-workers switch (`Execution.tsx:985-995`): the request is awaited outside a try/catch |

A user therefore meets three success idioms (toast, inline text, silence) and three error placements (toast, notice at the form, notice replacing the page). Roughly 30% of the files that write ever confirm success with a toast. The earlier audit's X7 is partly fixed: 5 files then, 12 now.

### Failures that need action but are shown away from their context

| Failure | Where it is shown | Why this is a problem | Fix |
|---|---|---|---|
| Suspend, remove, revoke, delete or unbind fails from a row or an inspector | 5-second toast at the bottom right | The control is elsewhere on screen; the message is gone before it can be read or copied; a screen reader hears it politely or not at all | P2-8, P0-7 |
| "Turn on" a sign-in provider fails | Toast | The reason (no proved domain, no passed try) belongs beside the step that is incomplete | P2-8, P2-11 |
| A data-source test fails | A **success** toast reading "{x} did not answer: …" (`Data.tsx:1068-1072`) | The failure is announced with the success tone and vanishes; the row keeps the only lasting trace | P0-6 |
| A palette search fails | "Nothing matches" (`kit/CommandPalette.tsx:249,645-648`) | An error is presented as an empty result | P3-2 |
| A list fails to load (every `CollectionView` list: 19 of them) | Inline notice with no retry (`kit/CollectionView.tsx:73-76`) | The user must reload the page; no request ID is shown anywhere, although the server sends one (`api.ts:5-24`) | P2-4 |
| A detail page fails to load | The notice replaces the whole page and its header (`Flows.tsx:368,631`; `Git.tsx:42-43`; `Retention.tsx:40-41`) | The title and the way back disappear with it | P2-4 |
| The session expires | Each screen shows its own error; no sign-in prompt | The user sees unrelated failures and must reload, losing unsaved work | P0-7, P0-4 |
| A one-time key, credential or token is shown | Attention notice with no Copy (keys, credentials) and no acknowledgement | Losing it means revoking and starting again | P0-10 |
| A background save fails in the App Builder | A 13 px muted status line that reads "Not saved: reason" | A failure is drawn with the same weight as "Saved." | P2-8, P2-10 |

## List behaviour by screen

Six list implementations are in use (`02-design-system-forensics.md` has the component-level comparison). The table below says what a user notices on each screen. Row heights are computed from classes; the Runs figure is **Observed (mocked API)**.

| Primitive | Screens | Opening a row | Search and filter | Paging | Keyboard | Loading, error, empty |
|---|---|---|---|---|---|---|
| `ListScreen` over the bordered `Table` (`ListScreen.tsx:210`), about 37 px rows in a white card | Workspaces, Operator access, Secrets, All resources, service-account keys (`Tenant.tsx`); Account API keys; Tables, Data sources (`Data.tsx`); Deployments, Connections, Variables, worker credentials (`Execution.tsx`); Database locations (`Environments.tsx`) | Rows are inert; the first cell may be a link; actions are buttons in the last cell | None | None: the whole list | Tab to links and buttons only | "Loading…" text; error notice with **Try again**; left-aligned dashed empty state with the create button |
| `Table` used directly (`packages/ui/src/Table.tsx:18`) | Sign-in providers, people and provisioning tables; Domains; agent tools; Extensions; Dashboards; table columns; data-source tables; a flow's runs; apps made in the App Builder | Inert rows; Domains has a "Details" button that opens a side sheet; a provider's name is a button that swaps the whole page | None | None | None | Each screen writes its own; some render nothing while loading (`SingleSignOn.tsx:1238`) |
| `CollectionView` (`kit/CollectionView.tsx:24`), about 41 px rows edge to edge on the canvas with a sticky header | Members, Groups, Roles, Access grants, End users, End-user groups, Service accounts, Audit; Scripts, Flows, Apps; Triggers, Events, Approvals (two lists) | Clicking a row opens the inspector where the screen supplies one. Groups, End-user groups and Access grants do not, so the same-looking row does nothing there | Each screen brings its own: a labelled field (Members), a bare search input (Audit), an icon-in-box field (Flows), none (Groups, Roles). Filter chips on some | None built in. End users add Previous / Next in the toolbar; Audit adds "Show older entries" in the toolbar | Every row is a tab stop; Enter or Space selects. No arrow or `j`/`k` movement, although the shortcut sheet advertises `j k` | "Loading…" text; error notice with **no retry**; centred empty state with a diagram, and a button only if the screen passes one (most do not) |
| `ListCollection`, a wrapper over `CollectionView` (`kit/ListCollection.tsx:13`) | Tenants, Instance members, Operators | Row opens the inspector; the tenant name is also a link that navigates | Built-in labelled search over loaded rows; "Nothing matches / Try fewer or other words." | None; hard cap of 200 | As `CollectionView` | As `CollectionView`, but the empty state carries the create button |
| `Grid` (`packages/ui/src/Grid.tsx:199`) | Table rows; rows of a data-source table | A radio in each row opens a modal, read-only sheet; cells are edited in place | Per-column filter row on the server, sent on every keystroke; sortable headers (the only sortable list) | Previous / Next, 50 per page, with "Rows 51 to 100 of 1,234 that match" | Tab stops only; Enter and Esc inside an edited cell | Busy flag; error with Try again; a line of text when empty |
| Hand-made tables | Runs (`Runs.tsx:316`); queue (`Execution.tsx:857`); connection-group members (`Execution.tsx:1165`); role permission grid (`Roles.tsx:154`); "See it as" in row rules (`RowRules.tsx:312`) | Runs: clicking a row opens the inspector, and a link inside opens the run page; **the row cannot be opened by keyboard** (`Runs.tsx:392-396`). The others are inert | Runs: status chips, Kind and When selects, tag click and search, all in the URL (the only list whose filters are) | Runs: "Load more" at the end of the list | Runs: Tab to the path link only | Paragraph text for loading and empty; Runs rows are 57 px, or 82 px with a tag |

Differences a user meets in practice:

- **Four meanings of clicking a row in four clicks.** Tenant › Workspaces (bordered card, rows inert, the name is a link), Members (edge to edge, the row opens an inspector), Domains (bordered card, a "Details" button opens a sheet), Single sign-on (bordered card, the name is a button that replaces the page). Nothing on screen says which a row will do.
- **Two looks for a list.** A white bordered card on the page and an edge-to-edge table on the canvas. Which one a screen has depends on when it was written, not on what it shows; `Tenant.tsx`, `Execution.tsx` and `Flows.tsx` each use both.
- **Selection is lost on reload everywhere.** The chosen member, role, end user, service account, tenant or audit entry is component state (`Members.tsx:122`, `Roles.tsx:401`, `EndUsers.tsx:96`, `Tenant.tsx:780`, `kit/ListCollection.tsx:48`, `Audit.tsx:120`). Back does not close the inspector and "this member" cannot be linked.
- **Search covers different things.** On Tenants, Members and Instance members it filters at most 200 loaded rows. On End users it is a server search. On Audit it filters only the 50 to n rows loaded so far and says nothing about the rest.
- **Paging is done four ways** ("Load more" at the end in Runs, "Show older entries" at the top in Audit, Previous / Next at the top right in End users, Previous / Next with a row count on table rows) and the shared `Pagination` component is used by none of them.
- **Retry depends on the primitive.** A failed `ListScreen` offers "Try again"; a failed `CollectionView` (19 lists) does not.
- **Empty states carry the first action only on some primitives** (see the next section).
- **No list sorts, except the data grid. No list has multi-select or batch actions, except "Cancel queued runs".**

Fix: one DataTable (P2-2) with selection, filters, sort and paging in the URL (P2-6), loading, error and empty states from one wrapper (P2-4), and one keyboard model that makes the advertised `j k` true (P0-3, P0-6, P3-1). The reason is the workflow, not tidiness: an admin who learns on Members that Enter opens a row and Esc closes it should find the same on Service accounts, Runs and Audit.

## Empty states and onboarding

Three looks exist for "nothing here": the kit's `EmptyState` (left-aligned, dashed border, 17 uses), the console's `EmptyCanvas` (centred, with a small junction diagram; 7 direct uses plus every `CollectionView`), and bare paragraphs (Runs, connection groups, alert history). Copy is quoted from the code.

### Tenant, instance and account

| Where | Copy | Enables a real first action |
|---|---|---|
| Tenants, operator | "No tenants yet — A tenant is one client organization. Create the first one to start adding workspaces and members." | Yes: Create tenant |
| Tenants, member | "Nobody has added you to a tenant yet. Ask your administrator." | No; nothing the member can do |
| Tenant overview | "Nothing needs you — No approvals or promotions waiting, every hostname works, and workers are online." ; "No workspaces yet. Create one" ; "Nothing has changed yet." | A link to the Workspaces list, not to the create dialog |
| Workspaces | "No workspaces yet — Start with a production workspace. Add a dev workspace linked to it when you want somewhere safe to make changes." | Yes: Create workspace, but the dialog defaults to Dev, against this advice |
| Members | "No members yet — Add the people who work in this tenant." | No button in the empty state; "Add member" is only in the header |
| Groups | "No groups yet — Create a group when several people need the same access." | No button |
| Roles | "No roles" | No |
| Access grants | "Nobody has access yet — Give a member, a group, a service account or an end user a role." | No button |
| End users | "No end users yet — Invite someone by email. They get a link to choose a password, and can then open the apps that are open to them." | No button |
| End-user groups | "No groups of end users yet — Create one when some of your apps' users should see or do what others should not." | No button |
| Service accounts | "No service accounts yet — Create one for each system that calls this tenant, so each can be given only what it needs." | No button |
| Service-account keys | "No keys yet" | Yes: Create API key |
| Operator access | "No operator has accessed this tenant — If one ever does, the grant and its reason appear here." | Not applicable; reassurance |
| Single sign-on | "No identity providers — People sign in with a password until a provider is connected and turned on." | Yes: Connect a provider |
| Provider tabs | "No domains yet — Add the domain of the people's email addresses." ; "Nobody yet — People appear here the first time they sign in through this provider." ; "No tokens yet — Nothing can be pushed until the provider has a token." ; "Nobody pushed yet" | Inline forms nearby |
| Domains | "No hostnames yet — Every app already has an address on this instance. Add a hostname when the client wants one of their own for an app." | Yes: Add a hostname |
| Worker credentials | "No standalone workers — You only need one to run scripts inside your own network." | Yes: Create credential |
| API keys | "No API keys — Create a key to sign in from the command line." | Yes: Create API key |
| Audit | "Nothing recorded yet" ; filtered: "Nothing of that kind — Change the filters above to see more." | Not applicable; no "clear filters" button |
| Operator gate | "Operators see inside a tenant only through an access grant — A grant is time-limited and needs a reason. The tenant's admins can see it and end it." | Yes: Open operator access |
| Not found | "Nothing here", the path, and a link back | A link, not a button |

### Inside a workspace

| Where | Copy | Enables a real first action |
|---|---|---|
| Scripts (`Execution.tsx:207-232`) | Dev: "No scripts yet — Write one here, or deploy them from the tenant's repository with `platform deploy`." Production: "Scripts reach production when a dev workspace is promoted here, or with `platform deploy` from the tenant's repository." | Dev: New script. Both the console path and the command-line path are named (the earlier audit's V6, fixed) |
| Flows (`Flows.tsx:225-242`) | Dev: "No flows yet — Draw one here, or define one in the tenant's repository with defineFlow." Production: "Flows reach a production workspace by promotion from its dev workspace." | Dev: New flow |
| Runs (`Runs.tsx:311-313`) | "Nothing ran in this time." ; filtered: "No runs like that in this time." | No: a bare paragraph with no "clear filters" and no "run something" |
| Triggers (`Operate.tsx:238-240`) and the workspace overview (`Overview.tsx:461-463`) | "Nothing starts by itself yet — A schedule, a webhook, a form or an event in a flow or a script starts work here once it is deployed." | No button in the empty state |
| Events (`Operate.tsx:506-508`) | "No events yet — Declare an event with defineEvent, and publish it from a script with ctx.events.publish." | No; code-only path |
| Approvals (`Operate.tsx:797-799`) | "Nothing is waiting for you — When a flow pauses for a decision you may make, it appears here." | Not applicable |
| Releases (`Release.tsx:210-212,470`) | "Nothing waiting to be deployed — Save a flow, a script or an app in this workspace and it appears here, with what it changes." ; "Nothing deployed here yet" | No link to Scripts or Flows |
| Deployments (`Execution.tsx:451-453`) | "Nothing has been deployed — Deploy what was saved here from Release, promote a dev workspace into this one, or deploy from the tenant's repository with platform deploy." | No button; three paths named |
| Tables (`Data.tsx:521-523`) | "No tables yet — Define a table in the tenant's repository with defineTable and deploy it, or create one here to try things out." | Yes: Create table |
| Data sources (`Data.tsx:1090-1092`) | "No data sources yet — Connect a Postgres database you already have. Its tables can then be browsed here and used by scripts." | Yes: Connect database |
| Connections (`Execution.tsx:618-620`) | "No connections yet — A connection is an external system a script talks to: an API, a mail server, an account at an OAuth provider. Set one up here before deploying the bundle that uses it." | Yes: New connection (**Observed (mocked API)**) |
| Variables (`Execution.tsx:685`); Secrets (`Tenant.tsx:683`) | "No variables yet" ; "No secrets yet" | Title only, no explanation |
| Apps (`Apps.tsx:463-465`) | "No apps yet — An app is defined in the tenant's repository with defineApp, or made in the App Builder. It is served once it is deployed here." | No button; App Builder is named but not linked |
| App Builder list (`Interfaces.tsx:1956-1958`) | "No apps made here yet — Make one over a table of this workspace. Tables are under Data." | Yes: Make an app |
| Dashboards (`Dashboards.tsx:74-76`) | "No dashboards yet — Make one to keep an eye on the tables you care about." | Yes |
| A flow with no runs (`Flows.tsx:476`) | "This flow has not run yet" | No "Start" in the empty state |

Patterns:

- The copy explains the concept well nearly everywhere, and inside a workspace it usually names both the console path and the repository path.
- Whether the empty state carries the first action depends on the list primitive, not on the screen's needs: `ListScreen` and `ListCollection` empties have the create button; hand-wired `CollectionView` empties (Members, Groups, Access grants, End users, End-user groups, Service accounts, Triggers, Apps) leave it in the header only.
- No empty state offers a sample, a template or a guided pair (for example "production and a linked dev workspace", or "new script from a sample that runs").
- Filtered-empty states never offer "clear filters".
- Fix: P2-4 (one empty state with a primary action) and P2-13 (templates, first-run checklist, both console and command-line paths).

### First run on a fresh instance

There is no tour, checklist or welcome screen; the empty states above carry the whole first-run experience. The shortest path from a new instance to a first script run, counted in code (**Verified** per step; the totals are counts of clicks and filled fields):

| # | Step | What the user meets |
|---|---|---|
| 1 | Sign in as the bootstrap administrator from `.env` (`README.md:24`) | AC-SIGNIN |
| 2 | `/` shows "No tenants yet" → Create tenant → name, slug | Silent success; the operator stays on the list (IN-TENANTS) |
| 3 | Click the new tenant | **The operator gate.** Creating a tenant adds no membership for its creator (`apps/control-plane/src/routes/tenants.ts:168-203`) |
| 4 | Open operator access → reason, access level, duration | The default level is viewer, which cannot create anything; the operator must choose `tenant_admin` and write a reason for entering a tenant made a minute ago. Access lasts 24 hours at most |
| 5 | Tenant overview | "No workspaces yet. Create one", and probably a red "No worker is online" (**Inferred**) |
| 6 | Workspaces → Create workspace (Production) → Create workspace again (Dev, promotes to the first) | The same dialog twice; its default type is Dev (TN-WORKSPACES) |
| 7 | Open the dev workspace → Build › Scripts → "No scripts yet" → New script | The first guided action on the whole path appears here |
| 8 | Write the script → Save and run | Needs a worker: the managed default pool or a standalone one (TN-WORKERS). If none is online the run queues, and the tenant overview is the only hint. The starter script shows an error marker on its first line before the user types (**Observed (mocked API)**; see part A) |
| 9 | To keep access after the grant ends: Members → add yourself → Access grants → Give access → `tenant_admin` | Otherwise access ends with the grant |

Total: about **30 interactions, 4 dialogs and 5 pages** before a first run. No surface ties the steps together, and three of them (the grant, production first, the worker) are learned by running into them.

What would shorten it, and why (roadmap P2-13): creating a tenant offers "add me as tenant admin" and opens the tenant, which removes steps 3, 4 and 9; an empty tenant shows a four-step first-run panel (create production and a linked dev workspace in one action; workers: managed on, or connect one; first script from a template; invite the client's admin), each step performing the real action; the dev workspace overview offers a sample script that runs. That would bring the path to roughly ten interactions on two pages (an estimate, to be measured in `10-validation-plan.md`), and every step is visible before the user reaches it instead of after it fails.
