# Inventory: instance

Read from the code at `270e509` on 2026-11-22, then refreshed against the code as phase 29 left it (branch `phase-30-docs-system`, 2026-11-23). A brief for the writer, not checked prose. Where it calls something a bug, the outcome is cited from [fixed/](../fixed/) or [outcomes.md](../outcomes.md).

**Refreshed 2026-11-23.** What changed in this brief:
- Section A now gives each page a collection (all Self-host), a Diátaxis type, a purpose and sources. Pages added: `health`, `recover-operator`, `commands`, `deleting-a-tenant`, `metrics`, `what-is-not-there`. `health-and-metrics` is split into `health` and `metrics`.
- Section B: corrected the Tenants page (new location filter, Rename and console-code buttons, operator powers panel), Members (own row, Disabled tag, tenants left without an admin), Operators (new last-operator message), Databases (Edit, inspector), Import (staged uploads that survive a reload, signature line, automatic recheck, sealed member passwords), Audit (instance log now has CSV, facets, entry links, deleted-tenant entries), Triggers (CLI, `pausedByInstance`), the grant form (Duration choices), master key and the metric names (`volvel_*`). New: Health screen, read-only strip, `recover-operator`, `check-config`, `migrate`, `rekey --data-role`.
- Sections E and D are marked settled with their outcomes.
- I read code and tests and ran nothing; no browser walk was run by me. Not verifiable: (1) D4, a member password reset link made by an operator, is decided but I found no route or screen for it for members (only end users have a set-password link, A/routes/endusers.ts:158); (2) the restore, Postgres major upgrade and offline install steps in docs/self-hosting.md were written from code and have not been drilled (fixed/t4-instance-host.md, HOST-28); (3) whether `docs:check` still fails a page with no topic user and no link (not re-read in phase 30); (4) the `D/instance/*` stubs are unchanged since phase 21, so every title and description there is still the stub's.

Paths: C = apps/console/src, A = apps/control-plane/src, D = packages/docs/content, CLI = packages/cli/src. Vocabulary: Flow, Deploy (dev) / Versions (production), canceled, American spelling. The product is Volvel; metrics are `volvel_*`.

## A. Pages

All are in the **Self-host** collection. Type is the Diátaxis type. Every screen name below is what the console shows (nav: C/nav.ts:224-289; routes: C/App.tsx:199-210; the whole `/instance/*` area is shown only to an operator, App.tsx:199, `isOperator` = holds `tenant:write` at the instance, C/api.ts:373).

**Existing stubs, `D/instance/` (topic in brackets). Phase 30 may move them; keep the topics.**

| Page | Type | Purpose | Sources |
|---|---|---|---|
| `index` | explanation | What an operator is, what the instance holds, a first-day checklist; list every page below in `pages:` | A/kernel/bootstrap.ts:15, D/instance/index.md |
| `tenants` [instance-tenants] | reference | The All tenants screen: columns, inspector, create, rename, console code, workers and history powers | C/screens/Tenants.tsx; A/routes/tenants.ts:142-545 |
| `members` [instance-members] | reference | All members: create, disable, enable | C/screens/Instance.tsx:73-175; A/routes/identity.ts:1015-1145 |
| `operators` [instance-operators] | reference | Who runs the instance, add and remove, the last-operator rule | C/screens/Instance.tsx:177-242; A/routes/identity.ts:1147-1290; A/kernel/administer.ts:71-106 |
| `single-sign-on` [instance-single-sign-on] | how-to | Connect the instance's provider so members sign in with it | C/screens/SingleSignOn.tsx (`base="/instance"`); A/routes/sso.ts; A/kernel/sso/providers.ts |
| `databases` [instance-databases] | reference | Database locations: register, edit, inspect, remove | C/screens/Environments.tsx:888-1100; A/routes/locations.ts |
| `import` [instance-import] | how-to | Bring a tenant in from an export file | C/screens/Environments.tsx:1160-1578; A/routes/portability.ts; A/kernel/tenancy/import.ts |
| `triggers` [instance-triggers] | how-to | Pause and resume every trigger at once (console and CLI) | C/screens/InstanceTriggers.tsx; A/routes/instance-control.ts; CLI/cli.ts:1171 |
| `audit-log` [instance-audit] | reference | The instance's log, its filters and CSV; what is in it and what is in a tenant's | C/screens/Audit.tsx; A/routes/identity.ts:1291-1360 |
| `branding` [instance-branding] | how-to | Name, logo and colors of the console, light and dark | C/screens/InstanceBranding.tsx; A/routes/branding.ts |
| `component-kit` [instance-kit] | reference | The kit sheet, for checking a brand | C/screens/KitSheet.tsx |

**New (no topic yet; `docs:check` failed a page with no topic user and no link before phase 29: link each from `index`, or give it a `volvel-` topic as phase 30 M4 says).**

| Page | Type | Purpose | Sources |
|---|---|---|---|
| `health` [new `instance-health`; `nav.ts:252,273` still point Health at `instance-databases`, remaining.md) | reference | The Health screen: readiness, master key, this replica's settings, metrics | C/screens/InstanceHealth.tsx; A/routes/health.ts; A/routes/instance-settings.ts; A/routes/master-key.ts |
| `metrics` | reference | `/api/v1/metrics`, token, the `volvel_*` series, OTLP | A/routes/execution.ts:3837-4040; docs/self-hosting.md "Metrics" |
| `first-run` | how-to | The bootstrap admin, the first tenant, removing the variables | A/kernel/bootstrap.ts:15-60; A/config.ts:224-231 |
| `recover-operator` | how-to | Getting back in when no operator can sign in (D3) | A/kernel/bootstrap.ts:68-140; A/main.ts:113-135; A/commands.ts:30 |
| `commands` | reference | `check-config`, `migrate`, `rekey [--data-role]`, `recover-operator`, `--help`; an unknown word exits 2 | A/commands.ts; fixed/t3-instance.md HOST-MP5 |
| `operator-access` | explanation | The operator's side of grants (pairs with D/tenant/operator-access): why a grant, what is recorded | C/screens/Tenant.tsx:124-175, 286-300; C/kit/OperatorStrip.tsx; A/routes/permissions.ts:640-760; A/kernel/http.ts:172-190 |
| `deleting-a-tenant` | how-to | Delete, what stays, the second confirmation for an unreachable database | C/screens/Environments.tsx:1669-1716; A/routes/environments.ts:300-345; A/kernel/tenancy/remove.ts |
| `moving-a-tenant` | how-to | Export, delete, import; shared to dedicated; instance to instance | docs/self-hosting.md "Moving a tenant"; C/screens/Environments.tsx:771 |
| `read-only` | how-to | The database takes no writes: what the console and API do, what to check | A/writer.ts:10-110; A/kernel/errors.ts:57-66; C/kit/ReadOnly.tsx |
| `master-key` | how-to | Rotate `MASTER_KEY`, read the status, `rekey`, `--data-role` | A/routes/master-key.ts; A/kernel/rekey.ts; A/kernel/execution/background.ts:27,61-66 |
| `workers-and-capacity` | explanation | `MANAGED_WORKERS` modes, slots, pools, per-tenant switch and the operator's lock | A/routes/pools.ts:30-85; A/kernel/execution/{supervisor,isolation,workers}.ts; C/screens/Execution.tsx:1238 |
| `upgrading` | how-to | Upgrade, restore, Postgres major upgrade, `AUTH_SECRET`, no-internet install | docs/self-hosting.md "Upgrading", "Restoring an instance"; packages/db/src/migrate.ts |
| `retention-and-backups` | how-to | Instance retention defaults, per-tenant history, audit archive, `pg_dump` is a backup (D59) | A/config-vars.ts:245-258; docs/self-hosting.md "Backups", "Retention" |
| `what-is-not-there` | explanation | Say it is not there (list in B, last part) | outcomes below |

## B. Per page

**tenants.** Screen title "Tenants" (nav label "All tenants"). C/screens/Tenants.tsx; API A/routes/tenants.ts.
- Columns: Name (with slug under it on a phone), Slug, Workspaces, You (tag `Member` or `Through a grant`; operators only), Tables kept in (location name or "The instance's database"; operators only), Created.
- Filter "Tables kept in" (operators, when at least one location exists): Anywhere or a location; kept in the address as `?location=` (Tenants.tsx:25-52). API `GET /tenants?dataLocation=` (tenants.ts:205). Empty text names the filter.
- Inspector: Slug, Workspaces, Your access, Tables kept in (a link to the location), Created, ID; then the operator panel "Workers the instance starts" and "History kept" (below). Buttons **Open**, **Rename**, **Turn off/on code in the console**, **Delete** (Delete operators only).
- **Create tenant** fields: Name (API 1-200), Slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, max 63, permanent; routes/shared.ts:13), Database location (optional; "It is chosen once"; options from `/instance/database-locations/names`), "Make me a member, as tenant admin" (default on; API `addCreator`). It opens the tenant afterwards. A duplicate slug is 409.
- **Rename** (Environments.tsx:1581): shown only when the server says `mayRename` (INS-19, fixed/ins2.md); the slug stays.
- **Turn off/on code in the console** (`ConsoleCodeButton`, :1621): `PATCH /tenants/:t {consoleCode}`; off refuses saving and testing code in the console (`console_code_off`), drafts are kept, deployed code keeps running; a tenant admin or an operator can turn it on again (D17; remaining.md says the CLI has no switch).
- **Operator panel** (C/screens/TenantPowers.tsx, INS-MP7): "Workers the instance starts" (button "Start no workers for it" / "Start workers for it"; an operator's off locks it, a tenant admin's on is then 403 "An operator of this instance turned this off. Only an operator can turn it on again.", tenants.ts:420-440, D16) and "History kept" (runs, events, refused requests, audit log days; "Change how long" opens the retention sheet). No access grant needed. API: `PATCH /tenants/:t {name, managedWorkers, consoleCode}`, `GET/PUT /tenants/:t/retention` (instance or tenant).
- **Delete** (Environments.tsx:1669): type the slug; `POST /tenants/:t/deletion {confirm, tablesLeftBehind?}`. Refused 409 while runs are queued or running or flow runs running (A/kernel/tenancy/remove.ts:9-29). If the tenant's own database does not answer (503 `data_location_unavailable`) the console asks a second question, "Delete anyway", and sends `tablesLeftBehind: true`; the tables stay there and the instance log entry says where (`tablesLeftIn`, `schemas`) (D47, INS-17). Audit entries and member accounts stay; files are removed after commit.
- Isolation is only `data_location` shared or dedicated, and covers custom tables only.
- Not there: see `what-is-not-there`.

**members.** C/screens/Instance.tsx; A/routes/identity.ts:1015-1145.
- Columns: Name, Email, Tenants, State (`Disabled` tag or active pill), Created; paged, searched by name or email. Inspector: Email, Tenants ("Belongs to no tenant"), State, Created, ID.
- **Create member**: Name, Email, Initial password (at least 12; the hint says they change it on their Account screen). Joins no tenant.
- **Disable** (confirm "They can sign in nowhere, in any tenant: their sessions end now and their API keys stop working…") and **Enable**. On your own row the cell reads "You cannot disable your own account." (INS-27); the server answers 400. Disabling ends sessions, grants, event streams on every replica and pending sign-in codes; a disabled account is refused at sign-in. The answer and the `member.disabled` audit entry list `tenantsWithoutAdmin`; the console names those tenants in a notice (owner's correction, fixed/acc.md). Doing the same thing twice writes nothing.
- Change password: the member does it on **Account** (fixed/ins2.md INS-13). No edit, delete, or reset by an operator (see `what-is-not-there`).

**operators.** C/screens/Instance.tsx:177-242; A/routes/identity.ts:1147-1290.
- Columns: Member (with a `Disabled` tag when the account is disabled), Role, Since. **Add operator** (Member picker, searches by email). Remove confirm "Remove {email} as an operator?"; on your own row the button reads "Remove yourself" and the confirm says you lose the Instance area at once.
- Role `operator_admin` = `instance:*, tenant:*, member:*, binding:*, access_grant:*, audit:read` (packages/db/migrations/0005_permissions.sql:18); no access inside a tenant without a grant. The API binds only `operator_admin` at the instance (D7; identity.ts:1190); the console offers the same.
- Last operator: 409 "That would leave the instance with no operator who can sign in. Make someone else an operator first." A disabled operator does not count (A/kernel/administer.ts:71-106). The same guard stops a SCIM disable (kernel/sso/scim.ts:558). Removing a binding ends that person's open grants.
- Way back after a lockout: `recover-operator`.

**first-run.** A/kernel/bootstrap.ts:15-60; A/config.ts:224-231.
- The admin ("Operator admin") is made only when the instance has zero members. With neither `BOOTSTRAP_ADMIN_EMAIL` nor `BOOTSTRAP_ADMIN_PASSWORD` it warns and starts. Both must be set together; password at least 12.
- Later starts ignore them; they are not a recovery path (use `recover-operator`).
- `addCreator` behavior: first-run.test.ts. An operator who makes a tenant without it gets 404 inside the tenant until a grant.

**recover-operator.** `node dist/main.js recover-operator <email>` (A/commands.ts:30; A/main.ts:113). Run on the machine, before any network. Enables the account, binds `operator_admin` if needed, ends its sessions, sets a new random password and prints it once; audited `operator.recovered` (bootstrap.ts:68-140). Exit 2 without an email; exit 1 if the email is not on the instance. Nothing over the network can do this.

**commands.** `node dist/main.js [command]` (A/commands.ts:18-45): none starts; `check-config` reads the settings, lists every problem at once (exit 1) or "The settings are valid." and opens nothing; `migrate` migrates and exits; `rekey [--data-role]`; `recover-operator <email>`; `--help`/`-h`/`help` prints usage, exit 0; any other word exits 2 (it used to start the instance). `volvel-start dist/main.js --help` works; `volvel-start --help` does not (fixed/t3-instance.md).

**operator-access.** C/screens/Tenant.tsx:124-175, 286-300; C/kit/OperatorStrip.tsx; A/routes/permissions.ts:640-760.
- An operator not in a tenant sees "You have no access to this tenant" (title) and "Operators see inside a tenant only through an access grant", button **Open operator access**. A failed read of the grants shows "Your access to this tenant could not be read" with Try again, not the no-access page (INS-26).
- Fields: Reason (API 3-500), Access level (built-in roles: viewer "(read only)", developer, workspace_admin, tenant_admin; the API takes any built-in tenant role, 400 "An access grant takes a built-in tenant role."), Duration: 1 hour, 4 hours, 24 hours or Other (1-1440 minutes; API default 60).
- Strip: "Operator access as {role} until {time}" with the reason and "Everything you do here is recorded for the tenant"; **End now**, **Hide**. Hidden leaves an "Operator" mark with "Show the notice" and "End access now". A failed end says so and the strip stays. The grant can be ended by its owner or a holder of `access_grant:write` in the tenant; ending an ended grant writes nothing (INS-27). When the grant's time passes, the console reads the grants again.
- The tenant's own **Operator access** screen lists every grant (Operator, Reason, Access level, Opened, Status).
- Every request that relies on a grant, reads included, writes `operator.access` to the tenant's log, once per request (A/kernel/http.ts:172-190). Standing membership takes precedence and is not logged so.
- Operator grants count only while the holder is an enabled `operator_admin` (ACC-02).

**single-sign-on.** C/screens/SingleSignOn.tsx with `base="/instance"`; A/routes/sso.ts; A/routes/scim.ts; A/kernel/sso/{providers,scim,people}.ts.
- List columns: Name, For, Protocol, State (on/off/paused, tag `Required`). **Connect a provider**: Protocol (OpenID Connect (OIDC) or SAML 2.0), Name (max 80), Issuer / Client ID / Client secret, or Metadata address / Metadata. At the instance there is no "Who signs in through it" choice: it signs in members (providers.ts:500).
- Detail: a stepper Connect (a "Try it" step), Prove domains, Switch on; tabs **Set up, Domains, Settings, People, Provisioning** (no Groups tab at the instance; SingleSignOn.tsx:1333-1340, 1500-1545). Buttons: Remove (type the name), Require it / Stop requiring it, Turn on / Turn off.
- Domains need no DNS proof at the instance: they are marked proved when added (providers.ts:809-810) and the screen says "As the instance's operator you answer for them, so no proof is asked." Adding one says "It needs no proof here." (INS-18). A members domain belongs to one provider on the whole instance (providers.ts:832). Turning on needs a domain (`domain_needed`, providers.ts:485) and, for OIDC, a secret (`secret_needed`, :620).
- The instance's provider gives no role: "Give the people who run the instance their access one by one" (providers.ts:445-456; D7; GOV-P4 is not built, by decision, fixed/t3-account.md). "Create people the first time they sign in" off means only existing members sign in.
- Instance SSO signs in any member of the domain and makes nobody an operator. A tenant's provider refuses anyone who holds an instance binding (D2, GOV-08). SCIM deactivation disables the account everywhere, guarded by the last-operator rule (scim.ts:548-559). Requiring SSO ends password sessions of people in the proved domains except operators, who keep passwords and sessions (providers.ts:703-733; SingleSignOn.tsx:1425).

**databases.** C/screens/Environments.tsx:888-1100; A/routes/locations.ts.
- Title "Database locations". Columns: Name, For, Database ("{db} on {host}"), Tenants, Status (`Reached`, or failed with the problem). **Register database**: Name (lowercase, digits, hyphens, max 63), What it is for (max 500), Connection string (`postgres://`, max 2000; stored encrypted, never shown). Row buttons **Edit** (description; a new connection string optional, "leave it empty to keep it") and **Remove** (hidden while tenants > 0; API 409). Inspector: For, Database, Status or problem, Tenants, and "Tenants here" with links and "Show them in the tenant list".
- Registering connects and prepares the database (the user must own it and may create roles). `PUT /instance/database-locations/:name` with a changed address is refused unless the new database holds every table and workspace schema of the tenants there (409 with counts; INS-08). It is refused 400 if the address is the instance's own database, or one already registered under another name (INS-15). With only a description, nothing connects (`database_location.described`).
- Listing opens each address on its own: one that cannot be opened is that row's problem, not a failed page (INS-14). `GET /instance/database-locations/names` lists names and descriptions only.
- A down location gives 503 `data_location_unavailable`. One location can hold several tenants, each with its own share of connections (`DATA_TENANT_CONNECTIONS`, INS-25). Other replicas notice an address or tenant move within 2 s (INS-09, kernel/data/stores.ts:65).
- Pointing an existing tenant at another location: not offered; export, delete, import.

**import.** C/screens/Environments.tsx:1160-1578; A/routes/portability.ts; A/kernel/tenancy/import.ts; A/kernel/tenancy/export.ts.
- Stepper: Upload, Check, Import. Upload step: **Uploads that wait** list (a staged upload survives a reload: name, size, kept until; **Open**, **Throw away**; one kept by another replica offers only Throw away), then Export file (.tar), Its passphrase (optional), **Upload and check**.
- Check: Exported, From version, Workspaces, Rows, Members, Run history, Unfinished runs ("recorded as canceled"). "Can it come in" lines: same version; passphrase opens it; its list of contents is signed (format 2) or "Format 1 has no signature… import it only from a source you trust"; tenant not already here; slug free. "Not carried" list: export.ts:13-50.
- Then: Its passphrase, Slug on this instance (empty keeps the exported slug), Where its custom tables go. The check runs again by itself 600 ms after the slug or passphrase stops changing; **Check again**, **Import tenant** (enabled only for a verdict made with what is typed), **Throw it away** (INS-12). Result: counts, where the tables are, "arrived with its triggers paused", canceled runs, **Open the tenant**, **Import another**.
- Limits: 50 GB (portability.ts:24), kept 1 hour (:26), passphrase header `x-export-passphrase`. Errors: `import_refused` (400), `staged_elsewhere`, 413, `import_incomplete`. Permission `tenant:write`. CLI: `volvel tenant import <file> [--slug] [--location]` (does not stage); `volvel tenant export --tenant <slug> --out <file> [--history]`, passphrase from `VOLVEL_EXPORT_PASSPHRASE`.
- Staged files are 0600 in a 0700 folder; orphans are swept after 15 minutes (INS-06, INS-10). A changed archive is held to the tenant's own rows and files (INS-01).
- Arrives with: all workspace triggers paused, git sync paused, identity providers paused, domains unproved, unfinished runs canceled. Members are matched by ID, then email, and keep their account here; others are created with their password, which format 2 carries sealed under the passphrase, and only for members who belong to no other tenant and hold no instance binding (GOV-09, D5). A member without a password needs one set. IDs are kept; all or nothing.

**triggers.** C/screens/InstanceTriggers.tsx; A/routes/instance-control.ts; A/kernel/execution/control.ts.
- Title "Triggers", section "Emergency stop". **Pause every trigger** (dialog field "Why", optional, API max 500), **Resume triggers**. `TRIGGERS_PAUSED` shows "TRIGGERS_PAUSED is set where the instance runs. Unset it and restart to resume." with no Resume. The controls need `instance:write`; a reader sees them as read-only.
- CLI: `volvel instance triggers` shows, `volvel instance triggers pause [--reason <text>]` and `resume` change it (CLI/cli.ts:1171; INS-MP10).
- Schedules keep their times and fire once on resuming. Webhooks are refused 503 and recorded as refusal `paused`. A trigger source that is running when it happens is recorded the same way (A/kernel/execution/triggers.ts:767). Firing a schedule by hand is a 409 (:1211). Runs already queued or going continue. Cached 2 s per replica. Each workspace says "paused by the instance" (`pausedByInstance`, without the reason): Shell pill, workspace settings, Overview, Triggers list (INS-24). No drain exists: cancel per workspace.

**audit-log.** C/screens/Audit.tsx (`AuditTable`, shared with the tenant's); A/routes/identity.ts:1291-1360.
- Title "Instance audit log". Columns: When, Who, What was done (with the verb tag, action words and code; "Operator" tag; "Deleted tenant" tag), To. Toolbar: Search, Area (instance areas: Members and sign-ins, Instance access, API keys, Operator access, Operator access grants, Tenants, Tenant imports, Instance settings, Identity providers, domains, links, Single sign-on, Directory sync, tokens, Database locations; Audit.tsx:86-104), Since (Any time, 24 hours, 7 days, 30 days, Between dates), **More filters** (Who, Action, Done to, from the log's own facets), **Columns**, **CSV** (`GET /audit-export`, newest first, at most 100,000, times in UTC). An entry opens in an inspector "Entry details" and has an address (`GET /audit/:id`); 50 a page, "Show older entries". Retention `RETENTION_AUDIT_DAYS` (400, never under 90).
- It holds entries that belong to no tenant and, since INS-28/D47, the entries of deleted tenants (each carries its `tenantId`); the Area filter does not list them, reach them with Everything or search. Not in it: saved views, a Workspace filter. A tenant's log has `tenant.created`, `tenant.updated`, `tenant.imported`, grants and `operator.access`; the instance log has `tenant.deleted`, `tenant_import.staged/discarded` and instance changes.

**branding.** Screen title "Console branding". C/screens/InstanceBranding.tsx; A/routes/branding.ts; A/routes/icons.ts; tokens packages/manifest/src/kinds.ts:1264-1330.
- Product name (max 60, empty = "Volvel"), logo (PNG/JPEG/WebP/SVG, 512 KB, saved at once and icons drawn from it), **Remove logo**. Light and dark token rows, "Clear back to the console's values", previews, the save bar; name and colors save together. Needs `instance:write` (otherwise read-only with a line saying who to ask). Branding, logo and theme.css are public. Tenant branding never reaches the console. A contrast check says which pairs it could not read (gov2.md).
- The save bar and every Create dialog are disabled while the instance is read only.

**component-kit.** C/screens/KitSheet.tsx (reference only).

**health.** C/screens/InstanceHealth.tsx at `/instance/health` (INS-MP3/4, HOST-MP1/2). Sections, in order: **Health** (Ready / Not ready, database and object store, latency, "Takes no writes", Version and Migration level; asked every 15 s and by **Check again**), **Master key** (both fingerprints, what is still sealed with the second key by place, values no key opens, "can be removed"), **This replica's settings** (workers mode, run slots, memory floor, most workers alive, database pools, time limits, schedule backlog, triggers paused by the environment, retention, address, apps address, mail from-address, reachable networks, proxies trusted), **Metrics** (scraper token set or not, tenant and workspace labels, OTLP). No secret is shown. API: `/api/v1/healthz`, `/api/v1/readyz` (3 s limit, A/routes/health.ts:24; 200 even when `readOnly`; 503 if Postgres or the object store is down), `/api/v1/instance` (public: coreVersion, apiVersion, migrationLevel, appsAddress, mail, publicUrl), `GET /instance/settings` and `GET /instance/master-key` (`instance:read`). Probes are not traced (`traced: false`).

**metrics.** `GET /api/v1/metrics`: `instance:read` for a member or key, or `Authorization: Bearer <METRICS_TOKEN>` for a scraper (A/routes/execution.ts:3996-4040; series 3837-3970). Every series is `volvel_…` (D55); this includes `volvel_database_read_only` and `volvel_memory_total_bytes`. Dashboards written against `platform_` names need renaming. Source of the table: docs/self-hosting.md "Metrics" (phase 31 may draw it from the help lines, HOST-22).

**read-only.** A/main.ts:68,164; A/writer.ts:10-110; A/kernel/errors.ts:57-66.
- Checked every 10 s. While the database takes no writes: queue, background work and managed workers stop and start again when writes return; changes are answered 503 `read_only` with `retry-after: 30`; `/readyz` stays 200 with `readOnly: true`.
- The console shows a strip on every screen ("The instance is read only." with the words in C/kit/ReadOnly.tsx:11), asked of `/readyz` every 30 s; every settings Save bar and Create dialog is disabled with the reason (INS-MP5). Other inline buttons are not disabled; the server's 503 says why. `volvel status` prints "Read only: …".

**master-key.** `GET /instance/master-key` (routes/master-key.ts), the Health screen's Master key section, `node dist/main.js rekey [--data-role]` (exit 1 if a value opens with neither key). Pass at start and every 10 min (kernel/rekey.ts, background.ts:27,61-66). Audit `instance.rekeyed`; `--data-role` changes the data role's seed, audited `instance.data_role_rekeyed`, and every replica must be restarted after it (D19). Five places are sealed directly. `MASTER_KEY_SECONDARY` equal to `MASTER_KEY` is refused by `check-config` (A/config.ts:213-219). docs/self-hosting.md "Rotating the master key" is current.

**workers-and-capacity.** A/routes/pools.ts:30-85; A/kernel/execution/{supervisor,isolation,workers}.ts; C/screens/Execution.tsx:1238 (the tenant's Workers page; it says when an operator locked the switch).
- `MANAGED_WORKERS`: `host` (worker host), `process` (default; beside the control plane), `false`. Tenant state `off | unavailable | host | isolated | shared | refused` (pools.ts:30-82; `unavailable` = the tenant's switch is on and the instance starts none). `MANAGED_WORKER_USER` is `own` (default) or `same`. In `process` mode a tenant whose code others write is `refused`. In host mode each worker has its own user and a private directory (`MANAGED_WORKER_UID/GID/USERS`, D1; compose needs `CHOWN` and `DAC_OVERRIDE`).
- Credentials last 24 h (supervisor.ts:67); idle exit 60 s (:213); a worker is stale after 90 s (workers.ts:213). At most one managed worker per tenant. Slots are shared fairly across tenants (workers.ts:161). Defaults for slots and memory floor: config-vars.ts:194-206; `MANAGED_WORKERS_MAX` applies in `process` mode. Memory is the smaller of the machine's and the container's limit (HOST-24). A standalone worker takes `VOLVEL_WORKER_CONCURRENCY` and `VOLVEL_WORKER_IDLE_EXIT` (a bad value exits 2); the host says once, then every 30 s, when `MANAGED_WORKERS` is not `host`.

**upgrading.** Any earlier level straight to the newest (upgrade.test.ts:236). Forward only. An advisory lock lets one replica migrate while the rest wait (packages/db/src/migrate.ts:15,126). A database newer than the code: the instance refuses to start (migrate.test.ts:113). `migrate` runs it alone. Import and export need an equal migration level. `docker compose up` needs `COMPOSE_PROFILES=postgres,objectstore` in `.env` where the bundled database is used (HOST-10). Restore, `AUTH_SECRET` change, Postgres major upgrade and offline install are in docs/self-hosting.md and were not drilled (see the note at the top). A `pg_dump` restore works under any database name (HOST-01/02, D59). Set `TRUSTED_PROXIES` (default 1; 0 for none) so the caller's address is the one the proxy saw (HOST-05).

**deleting-a-tenant, moving-a-tenant, retention-and-backups.** As above and docs/self-hosting.md "Moving a tenant", "Retention", "Backups". Moving between locations on one instance is export, delete, import; an import while the tenant is present is refused. A deleted tenant's log is read at the instance (INS-28).

**what-is-not-there.** Say these are not there; do not document them as features:
- Tenant suspend, quotas, storage limits or usage, sharing between tenants, moving a tenant in place or pointing it at another location. "Suspend" exists for a member inside a tenant only.
- Editing or deleting a member, or resetting a member's password by an operator or by mail. D4 decided a one-time reset link; I found none for members (unverified).
- Any role but `operator_admin` at the instance; a default role on the instance's provider (D7).
- An instance audit area for deleted tenants (reach them by Everything or search); saved views in the instance log.
- A drain command for triggers (cancel per workspace); replay of events received while paused.
- `volvel dev` for interfaces and docs is built in phase 30 (D64), not part of this area.

## C. Gotchas

1. Entries by area: see `audit-log`. A deleted tenant has no log route of its own (`GET /tenants/:t/audit` is 404); its entries are at the instance.
2. Moving a tenant to another location on the same instance means export, **delete**, import.
3. Deleting a tenant whose dedicated database is unreachable needs the second confirmation; its tables are then left behind and named in the log.
4. `addCreator` is ignored for a non-member caller (a service key).
5. Typing a passphrase or slug now rechecks by itself (600 ms), but Import stays off until the verdict matches what is typed. **Check again** is still there.
6. Staged uploads sit on one replica's temp disk; another replica answers `staged_elsewhere` and lists the upload as kept elsewhere. Use sticky routing or the CLI.
7. An instance binding of any role counts as "operator" for worker isolation and for the password exemption under required SSO.
8. A grant as `viewer` lacks `export:write`, so it cannot export.
9. An operator's switch for workers is locked: a tenant admin cannot turn it on (403).
10. The tenant list "Tables kept in" column is plain text; the inspector's value links to the location.

## D. Docs wrong, stale or missing

Settled by INS-29 (fixed/ins2.md): docs/self-hosting.md now says the data role's password comes from a stored sealed seed, moving a tenant deletes first, `/api/v1/readyz`, "Console branding", the two metrics, and the generated permissions page says tenant write imports tenants. INS-25: the connection-count line is true for shared locations (t4-instance-host.md).

Still to do in phase 31:
- D/instance/audit-log stub: "What operators did" is wrong; say what operators do inside a tenant is in that tenant's log, and the instance log holds instance changes and deleted tenants.
- All D/instance stubs are one-line placeholders.
- Health needs its own help topic `instance-health`; `nav.ts:252,273` points it at `instance-databases` (remaining.md).
- docs/self-hosting.md does not mention `recover-operator`, `check-config` or `migrate` (A/commands.ts); check before writing.
- Metric tables drawn from the help lines (HOST-22) not done.
- The worker-protocol contract's "Added in 0.6.0/0.7.0" numbers (HOST-13) are the owner's to settle.

## E. Findings, settled

All rows of the first reading are settled; do not write them as open.
1. Import Check showed Members 0: fixed, `counts.member` (INS-11, ins2.md).
2. Import enabled although the tenant was present: fixed (INS-12).
3. Create-member hint without a change-password screen: Account has Change password (INS-13). Reset by an operator or mail: not there; D4 unverified (see top).
4. Last-operator guard and SCIM: guarded, disabled operators excluded; way back is `recover-operator` (D3, acc.md, INS-04).
5. Per-replica location caches and re-registering: 2 s staleness and a tables check (INS-08, INS-09; no `NOTIFY`).
6. One unsealable value failed the whole list: fixed (INS-14).
7. Wrong toast on adding an instance SSO domain: fixed (INS-18).
8. `defaultRoleId` on the instance provider: refused (D7).
9. Rename for non-operators and ungated `/instance/*`: `mayRename` (INS-19) and one gate showing "Ask an operator of this instance to give you access." (INS-20).
10. Audit area list: complete, tested against the source (INS-21).
11. `/health` tracing: fixed (INS-22, HOST-29).
Also settled: INS-01 signed exports, INS-06/10 staging, INS-15, INS-17, INS-23 latency, INS-24, INS-26, INS-27, INS-28, INS-MP3 to MP12, HOST-16, HOST-19, HOST-28 (not drilled). Left open (remaining.md): `tenant.console_code` has no CLI switch.

## F. Screenshots and runbooks

**Screenshots:** All tenants with inspector (operator panel, location filter); Create tenant; delete confirm and the second confirmation; no-access screen and grant form; operator strip and hidden mark; Operators; Database locations with inspector (one unreachable); Import Uploads that wait, Check (pass and fail) and result; Triggers on, paused, paused by environment; instance audit entry with the Deleted tenant tag; Health (ready, not ready, read only, second key); read-only strip; branding light and dark; SSO detail.

**Runbooks:** First hour (bootstrap, second operator, remove variables). Onboard a tenant. Offboard (pause, drain, export, delete). Move instance to instance, and shared to dedicated. Rotate the master key (one replica and several). Emergency stop, drain by cancelling, resume. Disk full or read-only. Operator leaves, or is locked out (`recover-operator`). Upgrade and restore. Import follow-up: resume triggers, unpause git and SSO, new API keys, worker credentials and hostnames, and a password for any member who arrived without one. Restore an archived audit month.
