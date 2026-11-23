# Inventory: tutorials and style

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

Everything here comes from reading; nothing was run on an instance. `docs/evolution/02` and `05` describe state before phase 9, so do not write from their limitations. Use `CHANGELOG.md` phases 9–28. `content/` is about 15,600 words, and roughly 10,000 of those are five pages (App Builder editor 4,024, App Builder 2,374, writing-a-widget 1,726, dashboard-builder 854, documentation 771). Most other pages are one sentence repeating their description.

# 1. Feature checklist

**Markers:** ✔ covered. ◐ partial. ✘ missing from `packages/docs/content`. Coverage was checked by keyword, so confirm before writing. Bracketed numbers are shipping phases. Section labels come from `apps/console/src/nav.ts`.

**Platform and operators** (source: `docs/self-hosting.md`; `packages/docs/generated/settings.md`)
- ✘ Compose, Fly and standalone-worker install; Postgres 16+; S3; worker host; `MASTER_KEY`; TLS; SSE proxying; upgrades; backups; offline, no call-home.
- ✘ Master-key rotation [10]; sizing and `RUN_SLOTS` [11]; read-only database mode [11]; per-tenant database share [11]; schedule backlog limit [11].
- ✘ Egress guard and `EGRESS_ALLOW` [9]; `APPS_URL`, needed for code apps [9].
- ✘ Metrics and Prometheus token [9, 18]; OpenTelemetry [18].
- ◐ Instance screens: tenants, members, operators, SSO, database locations, import, emergency trigger stop [11], audit, branding and icons [18].
- ✘ Mail: instance SMTP, `MAIL_CAPTURE_DIR` [10], tenant `smtp` connections [7].

**Tenancy, access and governance** (Tenant screens; generated `permissions.md`)
- ◐ Tenants, workspaces (production/dev), copy/clone, time zone [13], first steps [14], renames [22].
- ◐ Members (paged [22]). ✘ Groups, roles, bindings, suspend/disable, effective permissions ("why can X…") [10], Give access, recovery codes.
- ✘ Keys and service accounts; two-person approval of access changes; tenant access releases and `volvel tenant plan/release/pull` [17]. Rollback listing is ◐ [23].
- ✘ SSO (OIDC, SAML, domains, require SSO), SCIM [7].
- ✘ End users, End-user groups, attributes, invitation and reset links, portal sign-in.
- ◐ Operator access grants, audit (facets, CSV [14]), retention [9, 22], export/import, dedicated databases, branding, domains.
- ✘ Doc writer role [20].

**Build: code**
- ◐ Scripts: console editor, starters, draft tests. ✘ zod schemas, `ctx` API, retries, timeout, `memoryMb`, concurrency key [10], tags, `onFailure`, custom nodes.
- ◐ Flows. ✘ Branch, foreach, join, delay, fail, subflow (`flowFrom`), respond, approval, CEL; editor test panel, expression values, undo [10], copy/paste [15].
- ✘ Triggers: schedule (preview, overlap, fire now), webhook (HMAC, verify, respond), form, event, poll/webhook sources.
- ✘ Connectors, OAuth2 [10], connection groups, Test and health, variables, secrets, alerts.
- ✘ Repository: `volvel.yaml`, keys, renames and 90-day aliases, YAML vs TypeScript ownership, `schemas`, `pull`, `run --remote`, `logs -f` [10, 17]. `docs/sdk-guide.md` is the source to fold in.
- ✘ Code apps: `@volvel/app`, `useRun`, `HelpPanel`, `volvel dev`.
- ✘ MCP: per-caller tools, `mcp.name` [17], Offer to an agent, Try [10].
- ✔ Documentation sites [20–24]. `docs-feedback` is covered.

**Operate**
- ✘ Runs: page, states, rerun, retry from failed step, compare with last success [13, 15], batch [15], logs, masking [13], result renderers [10]. The Runs page is one sentence.
- ✘ Triggers workbench and pause; events; palette ⌘K; keyboard shortcuts; saved views [15].
- ◐ Approvals (mine/others [22, 23]). ✘ Approval mail [10], `surface: tenant` [18].
- ◐ Releases (one list [23]). ✘ Request promotion, drift [10], breaking names, `--allow-delete` [17].
- ◐ Git sync.

**Data**
- ◐ Tables: paging, reference picker, files with retained history [22–24]. ✘ Row policies, enums, `onDelete`, `display`, migrations (`renamedFrom`, retire), Delete for good, CSV export.
- ◐ Data sources (external Postgres). ✔ Saved queries, SQL guards (Decision 0003), dashboards.

**Apps (25–28)**
- ✔ Widgets, page kinds, actions as steps, conditions, forms, record pages, sheets and modals, filters in the address, Sections, Tabs, Action group, Approvals, View as, History, publish check, phone layout.

**Phases 22–28 items with no or thin coverage**
1. [22] Workspace, tenant, end-user group and table rename; table undo/redo; `path_taken` (◐ in `scripts.md`); Keep removal outside scripts.
2. [23–24] How a rename drafts dashboards (◐ `queries.md`). `row_file_history` is ✔ in `tables.md`.
3. [25] Migration 0085 deletes member dashboards and refuses old interface/dashboard bodies (operator upgrade note, ✘).
4. [26] `page_action.*` audit entries; `widget-choices`. The action-as-grant model is ✔.
5. [27] Page `filters` refused: upgrade note ✘.
6. [28] ✘ Date typing ("tomorrow", "21 nov"); form field starting as today, me or fixed; help-topic picker; chart `fillGaps`; Goal `goalFrom`; `own`/`selected` sources; bulk row-action limits; tablet *serving* (the tablet switch is mentioned); Clinic operations as a worked example; group rows across time zones.
7. [28] Packages `@volvel/widgets/page`, `/action`; `widget-data`, `page-actions`, `page-approvals` need API narrative. The generated reference alone will not explain them.

The generated reference covers 27 kinds, but only 43% of kind fields are described (`packages/docs/coverage.json`). Secrets are not a kind.

# 2. Examples, tutorials, how-tos

**What the examples are good for**

| Example | Strength | Cost for a reader |
|---|---|---|
| `examples/fernhill` | Broadest: production and sandbox, members, end users, failures, approvals, MCP, both no-code apps, `docs-feedback` | Needs repo checkout, `pnpm build`, stand-ins on loopback :4020, operator password. Refuses to run if the tenant exists without `--reset`, which deletes it |
| `examples/higher-ed-devices` | Small, no outside systems, YAML/TypeScript split, `tenant/` access, flow with approval, MCP | Setup makes neither tenant nor workspaces; review flow needs triggers resumed in dev |
| `examples/acme` | Simplest code read | Its shop, ERP and chat webhook have no stand-ins, so a first deploy only reports missing bindings |

**Recommendation:** make **Fernhill the running example** for vocabulary, screenshots, operate and App Builder pages. Use its seeded names (Maya Brooks, Rowan Ellis, Devi Shah, Jess Morgan, Sam Reyes) consistently. Use **higher-ed-devices for the code-first tutorial**. Use an **empty tenant** for the quickstart. Do not make acme a tutorial; it can supply short reference snippets.

**Two blockers**
- Fernhill's default stand-in URL is `127.0.0.1:4020` and the server listens only on loopback. Under Compose, workers run in a separate worker-host container. Setup through `node` against `pnpm dev` is the documented-looking path. Whether `STAND_INS` can be made to work under Compose is **unverified**. Test before promising it.
- `@volvel/*` is not on npm: `release.yml` publishes only when `RELEASE_ENABLED=true`. `volvel init` writes `"@volvel/sdk": "^0.5.0"`, so a reader following it cannot install. Tell readers to run inside this checkout, or wait for the owner.

**Tutorials** (verify on a fresh instance before publishing)

1. **Your first script** (builder, 15 min). Empty tenant: Create tenant, dev workspace, starter "Total some numbers", ⌘↵, deploy, run. Verify: run Succeeded, First steps tick. Mirrors `e2e/first-run.spec.ts`.
2. **An approval flow** (builder). Flow starter "Decide, then answer", plus an approval step, test panel, deploy, decide. Verify: run waits, then succeeds. Mirrors `flow-editor.spec.ts`.
3. **Deploy a repository** (developer). higher-ed: make tenant and two linked workspaces, `volvel tenant plan/release`, `deploy`, resume triggers, `setup.mjs`, request a laptop, approve as Tech Desk, `promote`. Verify: `volvel runs`, loans appear. Needs repo checkout.
4. **Build an invoices app without code** (App Builder). Fernhill sandbox: table, filter, record sheet, New invoice modal, Mark paid limited to Billing, publish check. Verify: Rowan can press it; an outsider is greyed out and refused by the API. Mirrors Acceptance tests in `phase-28.spec.ts`.
5. **A portal where each person sees their own rows** (developer/admin). `students` or Fernhill clients: row policies, end-user group, invite link, sign in on a phone. Verify: Omar sees none of Northside's visits.
6. **Give an agent tools** (developer). Service account, bind scripts, key, `claude mcp add` or `setup/agent.mjs list`, Try. Verify: an unbound tool is absent.
7. **Debug and fix a failed run** (operator). Fernhill: the TextLine outage run; diagnosis, rerun, retry from failed step, compare with last success. Verify: rerun succeeds.
8. **Ship through review** (developer and promoter). Request promotion, drift, promote, Activate an earlier version. Mirrors `release.spec.ts`.
9. **A dashboard with filters** (analyst). Fernhill sandbox `reports/visits-by-clinic` or higher-ed Lending: figure, chart, date filter, rows behind. Verify: filter changes the figure and a link keeps it.
10. **A docs site with feedback** (doc writer). Sam in Fernhill. Verify: `docs-feedback` drafted once, second site reuses it.
11. **Install on one machine** (operator). Compose, first operator, backup, `MASTER_KEY` copy.

**How-tos:** signed webhook (PayFern); OAuth2 connection; connection Test; schedule with overlap skip; public form; pause triggers (workspace/instance); rename with `key`; enum migration; import data source; retention; SSO (OIDC); SCIM; domains; export/import a tenant; dedicated database; master-key rotation; standalone worker; alerts; two-person access approval; document a table; Git sync; phone layout; group rows; limit an action by group.

# 3. Style and terminology

**Voice observed** (`app-builder.md`, `writing-a-widget.md`): plain declarative English, present tense, short sentences; name the screen or button in bold exactly as drawn, then say what it does and who may; state limits in the same paragraph ("This changes what is drawn. It is not security"); concrete examples with real labels (Mark paid, Invoices) in quotation marks; tables for settings; `:::alert`, `::steps`, `:kbd[]`, `:term[]`, `:product[]` for the name. No marketing.

**Rules** (POLISH-009 in `docs/polish/polish-prevention-rules.md` plus observed): every refusal names what is missing and who grants it; no sentence a later phase falsifies; avoid "cannot/never/always/only from the CLI" unless the code enforces it; no raw codes where a word exists; say what is not built, as the widget alert does. American spelling ("color", "canceled").

**Avoid:** easily, simply, just, powerful, seamless, "platform" for the product (use Volvel or the instance), the company name, names from before phase 20 (`platform deploy`, the old yaml file and npm scope), "screens" for apps, "job", "sandboxed" for scripts. These are my proposals, apart from names removed in phase 20.

| Term | Use | Conflicts to resolve |
|---|---|---|
| Instance / tenant / workspace | As spec; workspace is dev or production | "environment" appears in self-hosting |
| Resource, key, path, title | Key never changes; path can | "Name and path" dialog |
| Draft → deploy → bundle/version | Deploy activates; version is the number on screen | UI "Releases" nav, eyebrow "Release", title "Versions" in production; API `deployments`; README "Changes" |
| Publish | App Builder/docs wording only; it deploys *chosen drafts* in dev | Same act as Deploy; promotion still needed for production |
| Promote / roll back | Activate the same bundle / an earlier version | Button "Activate this version"; production text says "Rolling back" |
| Flow | Navigation, scripts, SDK, API, runs | App Builder says **Workflow** ("Run a workflow", "Workflows"). Pick flow and add one sentence |
| Run | One execution | "Flow run" in API |
| App / interface / screen | App = served thing; interface = kind it renders; avoid screen | Nav "App Builder" slug `screens`; folder `platform/screens/` |
| Page, widget, Section, Tabs | Capitalise as UI names | "Search and filter" replaced page filters |
| Table | Workspace table | "custom table" in spec and database screens |
| Dashboard / query / Data source | As nav; query = saved SQL; "visual query" = menus | SQL source on dashboards only |
| Member / end user / guest / service account | Distinct pools | UI "End-user groups", changelog "groups of end users" |
| Role / binding / access release | Role = permissions; binding = grant | UI "Give access" / "Access" |
| Connector / connection / data source / secret | Connection = connector + settings | — |
| Trigger / event | Any starter / a bus fact | Instance Triggers is the stop switch |
| Approval | Flow step awaiting a person | Access releases also say "approve" |
| Operator | Organisation; its people are operator admins | `concepts.md` lacks it |

UI label capitalisation: sentence case ("App Builder" and "Git sync" as drawn).

# 4. Inconsistencies that make documenting awkward

1. **Flow vs workflow**, as above. Resolve in the product before writing. I found no UI string explaining they are one thing.
2. **Deploy / Publish / Release / Changes / Versions / Activate**: five-plus words for one lifecycle. Publish also says "People who open the app now see this", which is true only where it deploys.
3. **App Builder vs interface vs screens** in nav, address, kind and repository folder; `docs/self-hosting.md` still describes "Apps made here" (no such string in the console) with cards, totals and linked-choice forms.
4. **Page rules differ by channel:** tablet layout is now served, sheets/modals are not laid out for tablet; a widget hidden by a rule leaves its gap (owner's decision); page filters such as "Today" count in UTC while grouped rows use the reader's zone, so they can differ by a day.
5. **Action permission vs visibility:** `runBy` is enforced, `seenBy` is not security; a button with no named group can be run by anyone who opens the app. A reader will read this as a hole unless stated up front.
6. **Sharing with `viewer` exposes every row**; use `portal_reader`/`portal_user`.
7. **Repository-owned is read-only in the console,** while a console draft of a file-owned resource is fine; "Move to a file" can be refused on the next deploy. Git sync cannot see TypeScript.
8. **Fernhill README** duplicates step 8 and is long; `README.md` (root) says "phase 6", `alias platform`, "Tabs" that no longer exist, "Changes screen".
9. **Code apps** vanish without `APPS_URL`; interfaces do not. Approvals widget decides in the app only where no code app can run.
10. **Dev triggers start paused,** so tutorials silently do nothing until resumed.
11. **`docs/master-spec.md` lists "Visual editing of flows" and the automation node pack as deferred**, yet a flow editor and core nodes exist. Do not cite it.
12. Mixed spelling in help and UI ("colours"/"Color", "cancelled"/"Canceled").
13. **Two-person access approval:** turning it off does not wait for a second person (per the phase 22 note).

# 5. Not shipped: do not describe

- Developer-written widgets (contract only, decision 0005); expressions, custom CSS or code in App Builder; a form wizard with steps.
- Changing an app's address (deferred by the owner); a help page per error code; search-as-you-type on Events.
- Languages other than TypeScript; sandboxing for untrusted code; customer-managed keys; data masking when cloning; a spreadsheet-style editor.
- Data sources beyond external Postgres; sharing tables between workspaces; references across workspaces; external Postgres enums; SQL against a data source.
- End-user file access; file upload in forms (confirm current state first); bulk end-user CSV invite; personal scopes per API key beyond bindings.
- Single logout, step-up authentication; live Entra ID/Okta verification (only Keycloak and replayed shapes); a SCIM bulk/ETag claim.
- Dashboards by mail, PDF export, dashboard inside an app page, calculated columns, alert thresholds, opening another dashboard with filters, `EXPLAIN` before a query.
- Saved query `visual` form, query page of its own, live-drag edge snapping/Align in flow editor, "select all N matching".
- Schedule backfill; a bulk "rerun by filter" page; AI assistant; hosted Volvel or a public website; npm or Docker publication (release switched off); trademark and legal review of the licence; security contact address (`SECURITY.md` leaves it open).
- Any `identity_mapping` kind or attribute resources; access kinds for providers (providers are still configured in the console).
- `SLO`/uptime commitments, performance promises beyond the phase 11 measurements.

Verify the app-file, form-file and enum/data-source exclusions against code when writing those pages: they come from phase notes, not from a code check here.
