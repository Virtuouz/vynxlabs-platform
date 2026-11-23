# Inventory: tutorials and style

Read from the code at `270e509` on 2026-11-22. Refreshed against the code at `4992c9da` on 2026-11-23.

**Refreshed 2026-11-23.** What changed in this brief:
- Section 1 keeps its markers (the pages in `packages/docs/content` have not changed since phase 28) and gains **1b, what phase 29 added with no page**. Access releases are "access changes", the deploy screen is Deploy (dev) and Versions (production), "Activate" is "Deploy this version" or "Roll back to this version".
- Section 2 checks each of the eleven tutorials against the current screens, commands and Fernhill's seed. Each now has **Checked** (what still works as written, what does not) and **Needs** (what a throwaway Fernhill instance must have). Two tutorials need rework before they are written: 7 (the seeded failed run is a script run, so "retry from the failed step" does not apply to it) and 3 (the README's "brings up its own tenant" is not true). Tutorials are typed: a tutorial teaches by one path, so the how-to list at the end of section 2 is where the rest go.
- Section 3: the Flow/Workflow, Release/Activate and "Published apps" conflicts are settled in the product; the rows say what is left in `packages/docs/content`.
- Section 4 is marked: fixed, decided, or still true. Section 5 is checked against the decisions.
- Not verified: nothing was run, so no step was walked in a browser or a shell. "Checked" means read against the code and the e2e specs. Whether Fernhill's stand-ins can be reached from a Compose worker host (`WORKER_EGRESS_ALLOW`) was not tried. Whether `@volvel/*` is installable from npm was not checked (no internet; `release.yml` still publishes only when `RELEASE_ENABLED` is `true`, `.github/workflows/release.yml:76`).

Everything else here comes from reading; nothing was run on an instance. `docs/evolution/02` and `05` describe state before phase 9, so do not write from their limitations. Use `CHANGELOG.md` phases 9–28. `content/` is about 15,600 words, and roughly 10,000 of those are five pages (App Builder editor 4,024, App Builder 2,374, writing-a-widget 1,726, dashboard-builder 854, documentation 771). Most other pages are one sentence repeating their description.

# 1. Feature checklist

**Markers (describe `packages/docs/content`, unchanged since phase 28):** ✔ covered. ◐ partial. ✘ missing from `packages/docs/content`. Coverage was checked by keyword, so confirm before writing. Bracketed numbers are shipping phases. Section labels come from `apps/console/src/nav.ts`.

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
- ✘ Keys and service accounts; two-person approval of access changes; tenant access changes and `volvel tenant plan/release/pull` [17]; the Access changes tab with Go back [23]; superseded changes (REL-16). Rollback listing is ◐ [23].
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

## 1b. What phase 29 added, with no page yet

Every item below was built or corrected in phase 29 and is in no page of `content/`. Row ids are in `docs/documentation/fixed/`. A writer covers them in the page of their area; the area inventories hold the detail.

- **Account and sign-in:** Account with Profile (name; SCIM-owned names read only), Password, Sessions, key expiry; "What I may do here"; recovery codes; "Your session ended"; the 7-day console session (SECURITY.md); sign-in limited to 20 attempts a minute (t3-account, ins2, shl; see shell-and-start).
- **Instance:** Health screen; read-only strip and mode; operator's switches on a tenant (managed workers, history kept, code in the console); database locations (Edit, inspector, tenants by location); staged import after a reload; `volvel instance triggers`; `recover-operator <email>`, `check-config`, `migrate`, `rekey --data-role`, `--help` on the server binary; `WORKER_EGRESS_ALLOW`; metrics named `volvel_…`; a user of its own for each worker (t3-instance, host, host2, t4-instance-host).
- **Access and governance:** Access changes (was access releases), superseded status, Go back says when it waits (D54, REL-12, REL-16); a role given straight to a member or to every end user applies at once even with approval on (D63); SAML name ID format, metadata re-read, sign-in address; SCIM token expiry; a hostname can serve another app; a worker credential for one workspace; audit filters (dates, workspace, who, action, done to) and CSV (t3-account, t3-access).
- **Build:** flow inspector fields (how many at once, what a script may reach, approval time limit and approvers, event filter, tags, manual input schema, webhook timestamp signing, error path of Branch and Set, expressions in choices, changing a step's script); retry on another version; cancel runs by age; fire now for a flow's schedule; publish an event by hand; run later with a priority; runs between two times; platform events in the picker (t3-flow-editor, t3-flow-ops-sdk); script and extension Settings; extension Problems; Unbind a connection; set a variable where it is; remove a stored credential; run limit in Workspace settings; Apps list sort, filter, search, Delete (t3-config).
- **Data:** Files screen; query parameters, "What it is for", "Rows to return"; Declare source; dashboards kept by the workspace open by path with drafts; descriptions; a source's table as where a list reads from; D22 rules for files and rows (t3-data, t3-tables, files).
- **Apps:** widget options Starts as, "When it is done, say", table number as bar or change, pivot "Then by", Compare across, conditions on "this record's" values, the current user and money; `core/goal` (was `labs/goal`); numbers in the reader's locale; visual joins (t3-widgets, wid, bldwid).
- **Release and Git:** Deploy (dev) and Versions (production); "Review draft", "Deploy to dev", "Promote" steps; Request promotion; drift; change or stop following a branch; "Delete them anyway" after a suspected rename; production's release branch and retry; history of Git operations; `volvel.yaml` `resources` wins over the Repository page (D65) (rel, clirel, t3-config).
- **CLI and SDK:** `deploy --preview`, `--message`, `rollback <version>`, `--json`, `logout`, `profiles`, `--profile`, `--entry`, `--resources`, `dev --no-strict`, `--version`, `<command> --help`, exit code 4 of `promote --preview`, `init`'s five next steps, `local.json` `groups`, `@volvel/sdk/testing`; `volvel dev` for interface and docs apps (D64, phase 30 M1b) (t3-cli-docs, clirel).
- **Documentation:** `since:`; section hits in the help panel's search; phase 30 adds `/docs`, types and subjects.

# 2. Examples, tutorials, how-tos

**What the examples are good for**

| Example | Strength | Cost for a reader |
|---|---|---|
| `examples/fernhill` | Broadest: production (`clinics`) and dev (`sandbox`), members, end users, failures, approvals, MCP, both no-code apps, `docs-feedback` | Needs repo checkout, `pnpm build`, stand-ins on loopback :4020, operator password. Refuses to run if the tenant exists without `--reset`, which deletes it. Its README ("What phase 23 walks here") still says "Activate this version" and "Release" for the deploy screen: read Deploy and Versions |
| `examples/higher-ed-devices` | Small, no outside systems, YAML/TypeScript split, `tenant/` access, flow with approval, MCP | Setup makes neither tenant nor workspaces (the README's "brings up its own tenant" is not true: `setup.mjs` looks the workspace up and stops if it is not there, `setup/setup.mjs:65`); review flow needs triggers resumed in dev |
| `examples/acme` | Simplest code read | Its shop, ERP and chat webhook have no stand-ins, so a first deploy only reports missing bindings |

**Recommendation (unchanged):** make **Fernhill the running example** for vocabulary, screenshots, operate and App Builder pages. Use its seeded names (Maya Brooks, Rowan Ellis, Devi Shah, Jess Morgan, Sam Reyes; password `fernhill-demo-2026` for all) consistently. Use **higher-ed-devices for the code-first tutorial**. Use an **empty tenant** for the quickstart. Do not make acme a tutorial; it can supply short reference snippets.

**Two blockers (both still stand)**
- Fernhill's default stand-in URL is `127.0.0.1:4020` (`setup/setup.mjs:23`) and the server listens only on loopback. Under Compose, workers run in a separate worker-host container whose firewall refuses loopback and private addresses unless `WORKER_EGRESS_ALLOW` lists them (`deploy/compose/.env.example:66`; docs/self-hosting.md:237, 350). Setup through `node` against `pnpm dev` is the working path. Whether `STAND_INS` plus `WORKER_EGRESS_ALLOW` makes Fernhill run under Compose is **unverified**; test before promising it.
- `@volvel/*` is not on npm: `release.yml` publishes only when `RELEASE_ENABLED=true`, and the first publish date is not set (D62). `volvel init` writes `"@volvel/sdk": "^0.5.0"` and ends with five numbered steps that begin with installing dependencies (`fixed/clirel.md`, CLI-14), so a reader following it cannot install. Tell readers to run inside this checkout, or wait for the owner.

**Typing.** A tutorial leads one learner along one path to something that works. Tutorials 1 to 4 and 11 are tutorials. Tutorials 5 to 10 are closer to guided how-tos: write them as tutorials only if each ends in something the reader built (5, 6, 9, 10 do; 7 and 8 are better as how-tos with a short walk-through).

**Tutorials** (verify on a fresh instance before publishing). "Needs" is what the throwaway instance must have, seeded by `examples/fernhill/setup/setup.mjs` unless said.

1. **Your first script** (Get started, tutorial, builder, 15 min). Empty tenant: Create tenant, dev workspace, starter "Total some numbers", ⌘↵, deploy, run. Verify: run Succeeded, First steps tick. Mirrors `e2e/first-run.spec.ts`.
   - Checked: works as written. The tenant is made from `/` (**Create tenant**, "Make me a member, as tenant admin" on). The workspace is made at Tenant > Workspaces (Create: Name, Slug, Type, Promotes to). First steps' **New script** opens `scripts/new`; the starter is a button; **Path** is a field; ⌘↵ saves the draft and runs it in the "Test pane" and the starter now needs no input (it has a default). After the run, First steps reads "2 of 4 done" (3 with a worker counted); the script is "Draft, never deployed". The deploy is on **Deploy** (Review draft → Deploy to dev), which the e2e spec does not walk: walk it.
   - Needs: an instance with a worker the tenant can use. On a local instance that means managed workers (`MANAGED_WORKER_USER=same`) or a credential and `volvel` worker; without one the run waits and First steps' first step shows its **Workers** button. Operator sign-in. Nothing from Fernhill; any instance seeded or not.
2. **An approval flow** (Get started or Console, tutorial, builder). Flow starter "Decide, then answer", plus an approval step, test panel, deploy, decide. Verify: run waits, then succeeds. Mirrors `flow-editor.spec.ts`.
   - Checked: the starter "Decide, then answer" is a **Branch** on `trigger.amount > 100` with two **Set** steps; it has no approval, so the tutorial adds one: the step list offers **Approval** (default title "Approve", FlowEditor.tsx:233). New in phase 29: approvers (groups, roles; "anyone who holds the approval permission" if none), "Give up after (optional)", and the test panel is **Test** > "Run a test". The decision is on Operate > **Approvals** (Approve/Reject; a rejection needs a comment, D30) or by the mail link. Rejecting says "Rejecting fails the step: the flow takes its error path, or fails if it has none." Say "flow", never "workflow".
   - Needs: a dev workspace with triggers resumed (they start paused, so a deployed schedule or webhook does nothing); a second person or group as approver if the tutorial shows who may decide (Fernhill: Rowan Ellis, practice manager). Mail only if the instance has SMTP or `MAIL_CAPTURE_DIR`; otherwise the approver is told on screen only ("Mail is not set up on this instance, so approvers are not told"). Whether the person who starts a run may decide their own approval was not checked.
3. **Deploy a repository** (Develop, tutorial, developer). higher-ed: make tenant and two linked workspaces, `volvel tenant plan/release`, `deploy`, resume triggers, `setup.mjs`, request a laptop, approve as Tech Desk, `promote`. Verify: `volvel runs`, loans appear. Needs repo checkout.
   - Checked: every command exists with these names (`packages/cli/src/commands.ts`: `tenant plan`, `tenant release`, `deploy`, `promote`, `runs`; `tenant release` keeps its name, its output says "access change"). New and useful: `deploy --preview` says what would change before uploading; `promote --preview` exits 4 on breaking changes without `--confirm-breaking`; `--message`; `rollback <version>`; `--json`. The README lists `devices-dev` and `devices`; nothing makes them. `setup.mjs` needs `VOLVEL_URL` (and `VOLVEL_EMAIL`, `VOLVEL_PASSWORD`). Say "Deploy" and "Versions"; production is changed only by `promote`.
   - Needs: operator and a key for the CLI (`volvel login --url … --token …`, or `VOLVEL_URL`/`VOLVEL_TOKEN`); a tenant `higher-ed` with a dev workspace `devices-dev` linked to a production `devices` (made by hand or by a short script first; not by Fernhill); triggers resumed in dev; a Node and pnpm checkout built (`pnpm build`) because `@volvel/*` is not on npm. Not Fernhill; a second repository on the same instance. Students sign in with password `lakeshore-demo-2026`.
4. **Build an invoices app without code** (Console, tutorial, App Builder). Fernhill sandbox: table, filter, record sheet, New invoice modal, Mark paid limited to Billing, publish check. Verify: Rowan can press it; an outsider is greyed out and refused by the API. Mirrors Acceptance tests in `phase-28.spec.ts` ("Acceptance, invoices", line 2282).
   - Checked: the labels hold: **Add to page** (search finds widgets by the words people use), **Publish** (the button stays Publish; "Deploys to W. The live app keeps working until then."), "Who can run it" picks groups, a row limited to a group is greyed with "Only X can do this", **View as**, **Undo**/**Redo**, the screen-size switch. The sandbox has the `invoices` table (src/model.ts:129, defined in TypeScript, so a console draft of it would become a file: check what the builder offers before writing) and the groups Practice managers and Billing (Rowan Ellis and Devi Shah). The app is listed under **Apps**. Fernhill already ships "Clinic operations" with Mark paid; the tutorial's app needs another name.
   - Needs: sandbox workspace; Maya (tenant admin) or Devi to build; Rowan to try; an outsider who is a member but not in Billing (Sam Reyes has doc-writer rights only; whether he can open an app was not checked). Operator access ended, as setup leaves it.
5. **A portal where each person sees their own rows** (Administer, tutorial, developer/admin). `students` or Fernhill clients: row policies, end-user group, invite link, sign in on a phone. Verify: Omar sees none of Northside's visits.
   - Checked: the console has a **Row rules** screen (C/screens/RowRules.tsx) as well as the `policy` in code (higher-ed `students`: `when: { column: "student_number", equals: { attribute: "student_id" } }`). End users: **Invite an end user**, then **New invitation link** and **Password reset link** (C/screens/EndUsers.tsx); with no mail the link is shown to copy (Branding.tsx:553). The tutorial must pick one table: Omar and Northside are Fernhill's (`appointments`, narrowed by the front desk's end-user groups; the exact rule was not read), not `students`.
   - Needs: Fernhill's end-user groups and the hostname `fernhill.localhost:8080` (registered by setup; a phone needs the machine's address, so use a 390 px browser window); no mail needed.
6. **Give an agent tools** (Develop, tutorial, developer). Service account, bind scripts, key, `claude mcp add` or `setup/agent.mjs list`, Try. Verify: an unbound tool is absent.
   - Checked: **Offer to an agent…** (OfferToAgent.tsx) exists on a script; the service account's page has the AgentAccess screen with "Tools offered", **Copy the address**, **Copy the settings**, and a **Try {tool}** dialog ("What the agent is told"). A service account's key is made with an expiry field now. `mcp.name` is checked at build (bundle-check.ts:180). `setup/agent.mjs list` reads `.platform/demo.json`.
   - Needs: Fernhill's `phone-assistant` (already bound) to show the end state, or a new service account to build it; Claude Code is optional (`claude mcp add --transport http …`).
7. **Debug and fix a failed run** (Console, how-to or tutorial, operator). Fernhill: the TextLine outage run; diagnosis, rerun, retry from failed step, compare with last success. Verify: rerun succeeds.
   - Checked, and **needs rework**: the seeded failed run is `reminders/send`, a **script** run (setup.mjs:383-385), and the other is PayFern's wrong amount, also a script. "Retry from the failed step" is for **flow** runs only (RunPage.tsx:754-761, Runs.tsx:583). A script run offers "Run again with the same input", "Run again on the version deployed now" and "Compare with the last success" (RunPage.tsx:322-341). Phase 29 added "On another version…" and, on the Runs header, "Cancel by age…". To teach retry from the failed step, the tutorial must make a flow run fail: switch the outage on (`POST http://127.0.0.1:4020/control/outage` with `{"on":true}`), finish a visit so the thank-you flow texts, then switch it off. Not tried.
   - Needs: Fernhill production workspace `clinics`; Maya; the stand-ins running for the outage switch.
8. **Ship through review** (Console, how-to, developer and promoter). Request promotion, drift, promote, roll back to an earlier version. Mirrors `release.spec.ts`.
   - Checked: the dev workspace's **Deploy** screen has the steps Review draft, Deploy to dev, Promote; **Request promotion of v…** (Promotion.tsx:114) for someone who may not promote; the tenant overview's "Promotion requests" has **Promote** and **Decline**; Drift is a view in the promote step; production's screen is **Versions** ("What runs here", "Versions and roll back") with **Deploy this version** / **Roll back to this version**. The old word "Activate" is gone from the console; Fernhill's README still says it. Devi deploys with the CLI and a key from Account (README step 9).
   - Needs: Fernhill `sandbox` linked to `clinics`; Devi's API key; Maya to review and promote.
9. **A dashboard with filters** (Console, tutorial, analyst). Fernhill sandbox `reports/visits-by-clinic` or higher-ed Lending: figure, chart, date filter, rows behind. Verify: filter changes the figure and a link keeps it.
   - Checked: sandbox has the query `reports/visits-by-clinic` and the dashboard `boards/clinic-visits` (setup). Dashboards the workspace keeps now open by path, with drafts, description and Name and path (QSD-MP2, MP9); a member's own dashboard is the simpler start. Queries show "What it is for", a parameters panel and "Rows to return". Filters are in the address.
   - Needs: sandbox, Maya, the seeded visits.
10. **A docs site with feedback** (Console, tutorial, doc writer). Sam in Fernhill. Verify: `docs-feedback` drafted once, second site reuses it.
   - Checked: setup already makes two sites, `rota` and `supplies`, with feedback **off**, and Sam. The first site to turn feedback on drafts `docs-feedback`; a table of another kind is refused. Phase 30 M8 adds a page's type and subjects in Page details and templates for a new page: write after it. A page drafted for removal is read only with "Keep this page" (WLK-17d).
   - Needs: sandbox, Sam Reyes (doc writer, sandbox only).
11. **Install on one machine** (Self-host, tutorial, operator). Compose, first operator, backup, `MASTER_KEY` copy.
   - Checked: docs/self-hosting.md:20-60 is the source. New since: `.env` must name `COMPOSE_PROFILES=postgres,objectstore` (`.env.example`; without it no database starts), `WORKER_HOST_TOKEN`, the worker host's healthcheck, `check-config`, `migrate`, `rekey`, and `recover-operator <email>` (D3; not yet in self-hosting.md). The Health screen and `volvel status` say whether it is ready. Backup: `pg_dump` is a backup (D59); keep each master key as long as the backups it sealed.
   - Needs: not Fernhill; a machine with Docker and 2 GB. Do it on a throwaway, then point the next tutorials at it.

**How-tos (unchanged list, each one page):** signed webhook (PayFern); OAuth2 connection; connection Test; schedule with overlap skip; public form; pause triggers (workspace/instance); rename with `key`; enum migration; import data source; retention; SSO (OIDC); SCIM; domains; export/import a tenant; dedicated database; master-key rotation; standalone worker; alerts; two-person access approval; document a table; Git sync; phone layout; group rows; limit an action by group. Add: end a session; change your password; make an API key with an expiry; keep recovery codes; deploy with `--preview`; roll back; follow, change or stop following a branch; use the read-only mode; recover a locked-out operator.

# 3. Style and terminology

**Voice observed** (`app-builder.md`, `writing-a-widget.md`): plain declarative English, present tense, short sentences; name the screen or button in bold exactly as drawn, then say what it does and who may; state limits in the same paragraph ("This changes what is drawn. It is not security"); concrete examples with real labels (Mark paid, Invoices) in quotation marks; tables for settings; `:::alert`, `::steps`, `:kbd[]`, `:term[]`, `:product[]` for the name. No marketing.

**Rules** (POLISH-009 in `docs/polish/polish-prevention-rules.md` plus observed): every refusal names what is missing and who grants it; no sentence a later phase falsifies; avoid "cannot/never/always/only from the CLI" unless the code enforces it; no raw codes where a word exists; say what is not built, as the widget alert does. American spelling ("color", "canceled", "gray"): `enforce.test.ts` fails British spelling in any string a person reads. Stored values keep their spelling (`cancelled` status and field).

**Avoid:** easily, simply, just, powerful, seamless, "platform" for the product (use Volvel or the instance), the company name, names from before phase 20 (`platform deploy`, the old yaml file and npm scope), "screens" for apps, "job", "sandboxed" for scripts. These are my proposals, apart from names removed in phase 20. New product terms and topics start `volvel-` (decisions.md preamble; phase 30 M4).

| Term | Use | Status after phase 29 |
|---|---|---|
| Instance / tenant / workspace | As spec; workspace is dev or production | "environment" still appears in self-hosting; say workspace |
| Resource, key, path, title | Key never changes; path can | "Name and path" dialog stays |
| Draft → deploy → version | **Deploy** in a dev workspace, **Versions** in production; the number on screen is the version; "Deploy this version" and "Roll back to this version" | Settled (D54, voc-state). The address `/changes` and `/deployments` open Deploy. "Release" now means only an access change's old name, Git's release branch and the API's `release` field. Content pages `operate/releases.md`, `operate/index.md` still say "Releases" and "Activate" |
| Publish | App Builder and docs wording only; it deploys *chosen drafts* in dev | The button stays Publish ("Deploys to W." says so). Promotion still needed for production |
| Promote / roll back | Promote sends the same version to the linked workspace; roll back puts an earlier version back | Settled: "Roll back to this version" |
| Flow | Navigation, scripts, SDK, API, runs, App Builder | Settled (voc-flow; a lint fails "workflow" in console strings). Content: `index.md:15`, `build/app-builder.md`, `app-builder-editor.md` still say workflow |
| Run | One execution | "Flow run" in the API |
| App / interface / screen | App = served thing; interface = kind it renders; avoid screen | Nav "App Builder" slug `screens`; folder `platform/screens/`; nav item and page are **Apps** (not "Published apps") |
| Page, widget, Section, Tabs | Capitalize as UI names | "Search and filter" replaced page filters |
| Table | Workspace table | "custom table" in spec and database screens |
| Dashboard / query / Data source | As nav; query = saved SQL; "visual query" = menus | SQL source on dashboards only |
| Member / end user / guest / service account | Distinct pools | UI "End-user groups" |
| Role / binding / **access change** | Role = permissions; binding = grant; an access change is a change to a tenant's access made from files or by approval | Settled (D54): tab **Access changes**; commands `volvel tenant release` etc. keep their names. Content `tenant/members.md:13-15` still says "access release" |
| Connector / connection / data source / secret | Connection = connector + settings; states **Set up here** / **Not set up here**, **Reached** / **Failed**, **Not tested** | Settled (voc-state) |
| Trigger / event | Any starter / a bus fact | Instance Triggers is the stop switch |
| Approval | Flow step awaiting a person | An access change also waits for approval |
| Operator | Organization; its people are operator admins | `concepts.md` still lacks it |

UI label capitalization: sentence case ("App Builder" and "Git sync" as drawn). Take button words from the code.

# 4. Inconsistencies that make documenting awkward

1. **Flow vs workflow.** Fixed in the product (voc-flow); `content/` still has it (VOC-17, VOC-18, phase 31).
2. **Deploy / Publish / Release / Changes / Versions / Activate.** Decided (D54) and built (voc-state): Deploy, Versions, Deploy this version, Roll back to this version. Publish stays in App Builder and docs. Overview's panel is "Deploy"; the Overview button is **Review changes**.
3. **App Builder vs interface vs screens** in nav, address, kind and repository folder. Still true. `docs/self-hosting.md` still describes "Apps made here" (no such string in the console).
4. **Page rules differ by channel:** tablet layout is served, sheets/modals are not laid out for tablet; a widget hidden by a rule leaves its gap (owner's decision); page filters such as "Today" count in UTC while grouped rows use the reader's zone. D21 decides the reader's zone everywhere with UTC on hover: check each page when writing.
5. **Action permission vs visibility:** `runBy` is enforced, `seenBy` is not security; a button with no named group can be run by anyone who opens the app. Say it up front. Still true.
6. **Sharing with `viewer` exposes every row**; use `portal_reader`/`portal_user`. Still true.
7. **Repository-owned is read-only in the console,** while a console draft of a file-owned resource is fine; "Move to a file" can be refused on the next deploy. Git sync cannot see TypeScript, and reads `resources` from `volvel.yaml` (D65) but not `entry`.
8. **Fernhill README** duplicates step 8, says "Activate this version" and "Release"; `README.md` (root) says "phase 6", `alias platform`, "Tabs" that no longer exist, "Changes screen". Still true; correct or ignore.
9. **Code apps** vanish without `APPS_URL`; interfaces do not. Approvals widget decides in the app only where no code app can run. Still true.
10. **Dev triggers start paused,** so tutorials silently do nothing until resumed. Still true (Overview says why: "Dev workspaces start this way…").
11. **`docs/master-spec.md` lists "Visual editing of flows" and the automation node pack as deferred**, yet a flow editor and core nodes exist. Do not cite it.
12. Mixed spelling: fixed (voc-spell), American everywhere a person reads. `packages/docs/content` was not part of it (VOC-31).
13. **Two-person access approval:** turning it off needs no approval. A role given straight to a member or to every end user applies at once even when it is on (D63); the screen says so. Waiting changes superseded by another change are finished, not withdrawable (REL-16).

# 5. Not shipped: do not describe (checked against decisions and fixed/)

Still not built, as before:
- Developer-written widgets (contract only; the contract page is published and marked for contributors, D60); expressions, custom CSS or code in App Builder; a form wizard with steps; a file upload in a form (WID-10: "A file cannot be added in a form. Add it to the row in the table.").
- Changing an app's address (deferred by the owner, unverified); a help page per error code (the toast's "What does this mean?" opens the errors reference); search-as-you-type on Events.
- Languages other than TypeScript; a container for each worker (a user of its own is built, D1); customer-managed keys; data masking when cloning; a spreadsheet-style editor.
- Data sources beyond external Postgres; sharing tables between workspaces; references across workspaces; external Postgres enums; SQL against a data source; CSV import (later).
- Bulk end-user CSV invite; personal scopes per API key beyond bindings.
- Single logout, step-up authentication, MFA, passkeys; live Entra ID/Okta verification (only Keycloak and replayed shapes); a SCIM bulk/ETag claim.
- Dashboards by mail, PDF export, dashboard inside an app page, calculated columns, alert thresholds, opening another dashboard with filters, `EXPLAIN` before a query.
- Saved query `visual` form, query page of its own, live-drag edge snapping/Align in flow editor, "select all N matching"; a not-contains filter in tables; a table's description when brought back.
- Schedule backfill; a bulk "rerun by filter" page (cancel by age is built); AI assistant; hosted Volvel or a public website; npm or Docker publication (release switched off, D62); trademark and legal review of the licence.
- Any `identity_mapping` kind or attribute resources; access kinds for providers (providers are configured in the console). Tenant access is YAML only, with a schema; the SDK has no `define` for it (D53).
- `SLO`/uptime commitments, performance promises beyond the phase 11 measurements.
- A member's password reset link (D4 names one; not found in the code, see shell-and-start E14); an instance audit log CSV; unpublishing a console-made app (needs a new field); `volvel dev` for file apps (interface and docs apps are D64, phase 30 M1b); a `danger` flag on an action's `confirm` (WLK-10, asked of the owner).

**Now built: describe them.** End-user file access through a row they may read (D22); a reader's password change, sessions, profile and key expiry; vulnerability reports and supported versions are decided (D61, D62: GitHub private reports, answered within 3 working days, the newest minor and the one before; no email address; first publish date not set); the flow editor's missing fields; the Files screen; `volvel rollback`, `deploy --preview`; session lifetime (7 days, D51).

Verify the app-file, form-file and enum/data-source exclusions against code when writing those pages: they come from phase notes and decisions, not from a code check here.
