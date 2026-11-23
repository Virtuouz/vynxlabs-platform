# Inventory: instance

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

Paths: C = apps/console/src, A = apps/control-plane/src, D = packages/docs/content. I read code and tests and ran nothing. "Bug" items are from reading the code.

## A. Proposed pages

**Existing stubs, `D/instance/` (topic in brackets):**
- `index`: role and first-day checklist; add the new pages to its `pages:`
- `tenants` [instance-tenants]
- `members` [instance-members]
- `operators` [instance-operators]
- `single-sign-on` [instance-single-sign-on]
- `databases` [instance-databases]
- `import` [instance-import]
- `triggers` [instance-triggers]
- `audit-log` [instance-audit]
- `branding` [instance-branding]
- `component-kit` [instance-kit]

**New (no topic; `docs:check` fails a page with no topic user and no link, so link them from `index`):**
- `first-run`: bootstrap admin, first tenant
- `operator-access`: the operator's side of grants (pairs with D/tenant/operator-access)
- `moving-a-tenant`: runbook
- `health-and-metrics`
- `read-only`: database takes no writes
- `master-key`
- `workers-and-capacity`: modes, slots, pools
- `upgrading`
- `retention-and-backups`: instance defaults, audit archive

Nav order and labels: C/nav.ts:211-275. Topic routing: nav.ts:393. Routes: C/App.tsx:130-143.

## B. Per page

**tenants.** C/screens/Tenants.tsx; API A/routes/tenants.ts:112-346. Screen title is "Tenants" (nav says "All tenants").
- Columns: Name, Slug, Workspaces, You (tags `Member` / `Through a grant`), Tables kept in (location name or "The instance's database"), Created.
- Inspector: Slug, Workspaces, Your access, Tables kept in, Created, ID. Buttons **Open**, **Rename**, **Delete** (operators).
- **Create tenant** fields: Name (API 1-200), Slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, max 63, permanent), Database location (optional, "It is chosen once"), "Make me a member, as tenant admin" (default on; API `addCreator`). It opens the tenant afterwards. A duplicate slug gives 409 "That already exists."
- Rename: C/screens/Environments.tsx:1335. The slug stays.
- Delete: :1369. Type the slug to confirm. `POST /tenants/:t/deletion {confirm}` (A/routes/environments.ts). Refused 409 while runs are queued/running or flow runs running (A/kernel/tenancy/remove.ts:9). Audit entries and member accounts stay; files are removed after commit.
- Isolation is only `data_location` shared or dedicated, and covers custom tables only.
- Operator via API without a grant: `PATCH /tenants/:t {name, managedWorkers}`, `GET/PUT /tenants/:t/retention`.
- **Does not exist:** tenant suspend, quotas, storage limits or usage, sharing between tenants, moving in place. Do not document these. "Suspend" exists for a member in a tenant only.

**members.** C/screens/Instance.tsx:47-127; A/routes/identity.ts:890-1011.
- Columns: Name, Email, Tenants, State (`Disabled` / active), Created; paged, searched by name or email.
- **Create member**: Name, Email, Initial password (12-128). Joins no tenant.
- **Disable** (confirm "They can sign in nowhere…") and **Enable**. Cannot disable yourself. Disabling ends sessions and API keys stop; a disabled account is also refused at sign-in.
- No edit, delete or password reset.

**operators.** Instance.tsx:129-173; identity.ts:1013-1139.
- Columns: Member, Role, Since. **Add operator** (Member picker, searches members). Remove confirm: "Remove {email} as an operator?"
- Role `operator_admin` = `instance:*, tenant:*, member:*, binding:*, access_grant:*, audit:read` (packages/db/migrations/0005_permissions.sql:18); no access inside a tenant.
- Last operator: 409 "The instance must keep at least one operator admin." (kernel.test.ts:433).
- The console shows Instance only if `instancePermissions` literally includes `tenant:*` (C/api.ts:284).
- The API can bind any built-in role at instance scope; the console offers only this one.

**first-run.** A/kernel/bootstrap.ts.
- The admin ("Operator admin") is made only when the instance has zero members. With neither variable set it warns and starts. Both variables must be set together; password at least 12 (A/config.ts:212-218).
- Later starts ignore them, so they are not a recovery path.
- `addCreator` behaviour: first-run.test.ts. An operator without it gets 404 inside the tenant.

**operator-access.** C/screens/Tenant.tsx:120-228; C/kit/OperatorStrip.tsx; A/routes/permissions.ts:605-736.
- Empty screen "You have no access to this tenant", button **Open operator access**. Fields: Reason (API 3-500), Access level (console: viewer, developer, workspace_admin, tenant_admin; API: any built-in but operator_admin, default viewer), Duration 1/4/24 hours (API 1-1440 min, default 60).
- Strip "Operator access as {role} until …": **End now**, **Hide**. Hidden leaves an "Operator" mark: "Show the notice", "End access now". The grant can be ended by its owner or a holder of `access_grant:write` in the tenant.
- Every request that relies on a grant, reads included, writes `operator.access` to the tenant's log (A/kernel/http.ts:139-160). Standing membership takes precedence and is not logged so (authorize.ts:189).

**single-sign-on.** C/screens/SingleSignOn.tsx with `base="/instance"`; A/routes/sso.ts:180ff; provisioning A/routes/scim.ts:103.
- List columns: Name, For, Protocol, State (on/off/paused, tag `Required`). **Connect a provider** (:143-297): Protocol, Name (max 80), Issuer / Client ID / Client secret, or Metadata address / Metadata.
- Detail tabs: Set up, Domains, Settings, People, Provisioning. No Groups tab, default-role field or audience choice for the instance. Buttons: Remove (type the name), Require it / Stop requiring it, Turn on / Turn off.
- Domains need no DNS proof (providers.ts:683). A members domain belongs to one provider on the whole instance (:706). Turning on needs a domain (`domain_needed`) and, for OIDC, a secret (`secret_needed`).
- Instance SSO signs in any member of the domain and makes nobody an operator. SCIM deactivation disables the account everywhere (A/kernel/sso/scim.ts:547-569). Holders of any instance binding keep passwords when SSO is required (people.ts:509).

**databases.** Environments.tsx:867-930; A/routes/locations.ts.
- Columns: Name, For, Database ("{db} on {host}"), Tenants, Status (reachable/unreachable + problem). **Register database**: Name (slug, max 63), What it is for (API max 500), Connection string (`postgres://`, max 2000). The remove button is hidden while tenants > 0; API 409.
- Registering connects and prepares the database (the user must own it and may create roles). The credential is never returned. Re-registering a name changes its address. There is no separate Test button: opening the list tests each one.
- A down location gives 503 `data_location_unavailable`. One location can hold several tenants.

**import.** Environments.tsx:1016-1332; A/routes/portability.ts; A/kernel/tenancy/import.ts.
- Stepper: Upload, Check, Import. Upload: Export file (.tar), Its passphrase (optional), **Upload and check**.
- Check rows: Exported, From version, Workspaces, Rows, Members, Run history, Unfinished runs. Checks: version, passphrase, tenant present, slug free. "Not carried" list: export.ts:13-20.
- Then: Its passphrase, Slug on this instance, Where its custom tables go. Buttons **Check again**, **Import tenant**, **Throw it away**. Result: **Open the tenant**, **Import another**.
- Limits: 50 GB, kept 1 hour, API passphrase header `x-export-passphrase`. Errors: `import_refused`, `staged_elsewhere`, 413, `import_incomplete`. Permission is `tenant:write`. CLI: `volvel tenant import <file> [--slug] [--location]`.
- Arrives with: all workspace triggers paused, git sync paused, identity providers paused, domains unproved, unfinished runs cancelled. Members are matched by email and keep their account here; unmatched ones are created with their exported password hash. IDs are kept; all or nothing.

**triggers.** C/screens/InstanceTriggers.tsx; A/routes/instance-control.ts; control.ts.
- Title "Triggers", section "Emergency stop". **Pause every trigger** (dialog field "Why", optional, API max 500), **Resume triggers**. `TRIGGERS_PAUSED` shows a notice without Resume.
- Schedules fire once on resuming. Webhooks 503, recorded as refusal `paused`. Events are kept but start nothing, and I saw no replay (events.ts:78). Queued and running work continues. Cached 2 s per replica. No drain exists: cancel per workspace.

**audit-log.** Instance.tsx:175; C/screens/Audit.tsx; `GET /audit`.
- Columns: When, Who, What was done, To. Filters: area, since, search (action, ID or kind), Columns. Inspector "Entry details". "Show older entries" (50 a page). Retention `RETENTION_AUDIT_DAYS` (400).
- Unlike a tenant's log: no Who/Action/Done-to filters, CSV, saved views, or links to entries (tenantLog gates, :184).

**branding.** C/screens/InstanceBranding.tsx; A/routes/branding.ts; A/routes/icons.ts; tokens packages/manifest/src/kinds.ts:1233.
- Product name (max 60, empty = "Volvel"), logo (PNG/JPEG/WebP/SVG, 512 KB, saved at once and icons drawn from it), **Remove logo**.
- Light/Dark token rows, "Clear back to the console's values", previews, save bar. Name and colors save together. Branding, logo and theme.css are public. Tenant branding never reaches the console.

**component-kit.** C/screens/KitSheet.tsx (reference only).

**health-and-metrics.** No console page.
- `/api/v1/healthz`, `/api/v1/readyz` (3 s limit; readOnly, latencyMs; 503 if Postgres or store is down), `/api/v1/instance` (public: coreVersion, migrationLevel, appsAddress, mail, publicUrl). A/routes/health.ts, instance.ts.
- `/api/v1/metrics` with `METRICS_TOKEN` or `instance:read` (A/routes/execution.ts:3380-3589).

**read-only.** A/main.ts:88-176; problem.ts:103. Checked every 10 s; background work, queue and managed workers stop; changes answer 503 `read_only`. No console banner (no `read_only` handling in C).

**master-key.** API and CLI only: `GET /instance/master-key` (routes/master-key.ts), `node dist/main.js rekey` (exit 1 if unopened). Pass at start and every 10 min (kernel/rekey.ts, background.ts:59). Audit `instance.rekeyed`. Five places sealed directly. `MASTER_KEY_SECONDARY` equal to `MASTER_KEY` is refused.

**workers-and-capacity.** A/kernel/execution/{supervisor,isolation}.ts, routes/{pools,worker-host}.ts.
- State `off|host|isolated|shared|refused` (pools.ts:29-79). At most one managed worker per tenant. Credentials last 24 h; idle exit 60 s; worker stale after 90 s.
- Slots shared fairly across tenants, tasks included (machine-slots.test.ts). Default slots and memory floor: config-vars.ts:194-203; `MANAGED_WORKERS_MAX` applies in `process` mode.
- Console side is the tenant Workers page (C/screens/Execution.tsx:1028-1287).

**upgrading.** Any earlier level straight to newest (upgrade.test.ts:236). Forward only. Advisory lock, so one replica migrates and the rest wait. Newer database with older code: refuses to start. Import/export needs an equal migration level.

## C. Gotchas

1. `tenant.created`, `tenant.updated`, `tenant.imported`, grants and `operator.access` are in the **tenant's** log; the instance log has `tenant.deleted`, `tenant_import.staged/discarded` and instance changes. After deletion, the tenant's log has no API route; entries go to the object store with their month.
2. Moving a tenant to another location on the same instance means export, **delete**, import; an import while present is refused.
3. Deleting a tenant in an unreachable dedicated database fails, since its tables must be dropped (inferred).
4. `addCreator` is ignored for a non-member caller.
5. After typing a passphrase or new slug you must press **Check again** before Import enables.
6. Staged uploads sit on one replica's temp disk; a request reaching another gets `staged_elsewhere`. Use sticky routing or the CLI.
7. An instance binding of any role counts as "operator" for worker isolation and for password exemption.
8. A grant as `viewer` lacks `export:write`, so it cannot export.

## D. Docs wrong, stale or missing

- D/instance/audit-log stub: "What operators did" is wrong (see C1).
- docs/self-hosting.md:60 says the data-role password derives from the master key; :97 and instance-secrets.ts say a stored sealed secret.
- :161 "export it and import it" omits deletion (C2). :259 "a dedicated database's connections to itself" is false when locations are shared.
- :264 writes `/readyz`; the route is `/api/v1/readyz`. :505 says Instance → Branding; the label is Console branding.
- Metrics tables (:535-563) omit `platform_database_read_only` and `platform_memory_total_bytes`.
- packages/manifest/src/permissions.ts:43 (generated permissions page) says `instance:write` imports tenants; it is `tenant:write`.
- No docs on operator recovery or lockout, or on the API-only operator powers.

## E. Likely bugs and questions

1. Import Check always shows Members 0: import.ts:193 reads `counts.members`, the export writes `counts.member` (export.ts:185-188). No test asserts it.
2. `ready` (Environments.tsx:1056) ignores `tenantPresent`: Import is enabled, then 409.
3. Create-member hint says "They can change it after signing in", but I found no change-password screen in C; only the auth library's API. There is no reset by operator or email for members.
4. Last-operator guard ignores disabled members; SCIM can disable the only operator (scim.ts:547). No CLI recovery: what is the supported path?
5. Location caches are per replica (stores.ts:85, 183). Changing an address or moving a tenant leaves other replicas on the old database until restart. Re-registering also does not check the new database holds the tenants' tables.
6. Listing locations is sequential and prepares databases on a GET; one unsealable value fails the whole page (locations.ts:214-237).
7. Adding an instance SSO domain toasts "Prove it is yours with the record shown" though none is needed (SingleSignOn.tsx:460).
8. Instance provider PATCH accepts `defaultRoleId`, any built-in including operator_admin (providers.ts:442, people.ts:338). Hidden in the console; intended?
9. Rename shows for non-operators, who may get 403. `/instance/*` screens are not gated in App.tsx: a member who types the address sees errors; branding and kit render.
10. Audit areas lack `instance`, `identity_provider`, `database_location`, `tenant_import` (Audit.tsx:35).
11. Tracing skips routes ending `/health`, which match none of `healthz`/`readyz` (app.ts:170).

## F. Screenshots and runbooks

**Screenshots:** All tenants with inspector; Create tenant; delete confirm; no-access screen and grant form; operator strip and hidden mark; Operators; Database locations (one unreachable); Import Check (pass and fail) and result; Triggers on, paused, paused by environment; instance audit entry; branding light/dark; SSO detail.

**Runbooks:**
- First hour: bootstrap, second operator, remove variables.
- Onboard a tenant.
- Offboard: pause, drain, export, delete.
- Move instance to instance, and shared to dedicated.
- Rotate the master key (one replica and several).
- Emergency stop, drain by cancelling, resume.
- Disk full / read-only.
- Operator leaves, or is locked out.
- Upgrade and restore.
- Import follow-up: resume triggers, unpause git and SSO, new API keys, worker credentials and hostnames.
- Restore an archived audit month.
