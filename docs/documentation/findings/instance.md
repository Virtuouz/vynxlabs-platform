# Findings: instance administration

Slice of [the inventory](../inventory/instance.md), settled at `270e509`. Paths are under `apps/`: `CP/` = `control-plane/src/`, `CO/` = `console/src/`. Scratch tests ran in the pinned tree, each with its own instances, and were removed. Screens were opened on the throwaway instance without changing it. Security rows name the class only.

Each item of the inventory's section E is in a row: E1 INS-11, E2 INS-12, E3 INS-13, E4 INS-04, E5 INS-08 and INS-09, E6 INS-14, E7 INS-18, E8 INS-05, E9 INS-19 and INS-20, E10 INS-21, E11 INS-22. The rest came from sections B to D or from settling.

## Rows

### INS-01 A changed tenant export can bring in rows and files that are not the tenant's own
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/kernel/tenancy/import.ts:302-340` (`load` inserts every row as given), `:360-385`, `:509-515` (`objects/` put at any key), `:622-625` (a failed import removes every key it wrote). `check` at `:60-97` compares the archive with its own list only: nothing signs the list, and the passphrase covers the key alone.
- **Evidence:** class: untrusted archive, missing ownership check. Whoever prepares the file an operator imports can gain instance-wide rights, put rows in another tenant, and replace another tenant's stored object. An import that then fails deletes that object. Each answered 201, or 500 `import_incomplete` for the last, with the effect seen. Reading also says: a changed file can carry instance identity providers and proved domains, as only the tenant's own are reset (`:576-588`).
- **Fix:** hold every row to the archive's tenant and its workspaces before insert (one check in `load`, from `OWNED_TABLES`: `tenant_id`, and parents for tables with none). Refuse instance scope and unknown table prefixes. Accept only object keys that the loaded rows' `stored` columns name, and never remove or replace a key that existed. Authenticate the manifest with the passphrase-wrapped key (a format version). Siblings: member list (pre-set accounts for emails not here), `data/` catalog and schema names, clone. Test first: one altered archive per class is `import_refused` and nothing is written.
- **Size:** L. **Milestone:** M1

### INS-02 A disabled member's sign-in to a tenant's apps goes on working
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/kernel/apps/sessions.ts:137-150` (member branch does not read `disabled_at`; its comment says it does); `CP/routes/identity.ts:983` and `CP/kernel/sso/scim.ts:559` delete `member_session` only.
- **Evidence:** class: session not ended on disable. App session of a member, rows read 200; `PATCH /members/:id {disabled:true}` 200; rows still 200. Lasts up to 12 hours. Suspending in a tenant does end it (401). The console's confirm says "They can sign in nowhere… their sessions end now".
- **Fix:** check `disabled_at` in `appPrincipal`, and end `app_session` and `app_handoff` in one shared `disableMember` used by the route and SCIM. Sibling: pending single sign-on codes, open event streams. Test first: disable, then the app cookie is 401.
- **Size:** S. **Milestone:** M1

### INS-03 Someone removed as an operator keeps their open access to tenants
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/identity.ts:1103-1138`; `CP/kernel/authorize.ts:172-181` (a grant counts whatever the holder is now).
- **Evidence:** class: privilege outlives its cause. Operator opened a 24-hour `tenant_admin` grant, was removed (204); instance routes 403, tenant members 200, adding a tenant member 201. Nothing says the grant is open, and the grant lets them add a standing member.
- **Fix:** removing the binding revokes the member's open grants in the same change, with an audit entry in each tenant; `check` also requires the holder to still hold `access_grant:write` at the instance. Disabling: a disabled member is already refused, revoke too. Test first: the grant answers 404 after removal.
- **Size:** S. **Milestone:** M1

### INS-04 The instance can be left with no operator who can sign in
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/identity.ts:1119-1127` (counts bindings, not usable members; no lock), `:1058-1099` (`POST /bindings` takes a disabled member or an ID that is nobody's), `:976` and `CP/kernel/sso/scim.ts:547` (disabling looks at no bindings).
- **Evidence:** class: lockout. Four ways: (a) bind an ID that is nobody (201, not listed on the screen) or a disabled member (201), then remove the last real operator: 204, and every instance route is 403; (b) two operators remove each other at once: 204 and 204, no operator bindings left; (c) the instance's provisioning turns off the only operator (run by the governance slice, not here); (d) two operators disable each other, read from the same code, not run. No supported way back: the bootstrap variables act only on an instance with no members, and there is no command.
- **Fix:** one shared `keepAnOperator(trx)` (locks, counts enabled members bound `operator_admin`) called by binding removal, disable, and SCIM; refuse to bind a disabled or unknown member; show Disabled on Operators. SCIM answers 409 and records a refusal. Test first: each way. The way back is owner question 1.
- **Size:** M. **Milestone:** M1

### INS-05 An instance identity provider can make everyone it creates an operator, and no screen shows it
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/kernel/sso/providers.ts:442-454` (`checkRole` takes any built-in role at the instance); `CP/kernel/sso/people.ts:228` and `:338`; SCIM `CP/kernel/sso/scim.ts` `giveRole`.
- **Evidence:** class: privilege by default role. `PATCH /instance/identity-providers/:p {defaultRoleId: operator_admin}` 200; a first sign-in from the domain was listed as `operator_admin`. Only an operator can set it, but it is hidden in the console and instance domains need no proof. Any other role also counts as "operator" (INS-07).
- **Fix:** refuse `defaultRoleId` for an instance provider in `checkRole` (and clear it by migration), unless owner question 2 says otherwise. Sibling: a tenant provider accepts `operator_admin` too, which `insertBinding` refuses (`CP/routes/permissions.ts:1062`). Test first: 400 for both.
- **Size:** S. **Milestone:** M1

### INS-06 An uploaded export waits on disk readable by every user of the machine
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/kernel/tenancy/staging.ts:7`, `CP/routes/portability.ts:271-279`.
- **Evidence:** class: file permissions. Folder `755` at a fixed name in the temp folder, file `644`. The archive holds every row and password hash in the clear (secrets stay sealed). With `MANAGED_WORKERS=process` a worker's user shares that temp folder. The direct import route uses `mkdtemp` (`700`).
- **Fix:** folder `0700` and file `0600`, refuse a folder not our own. Siblings: none else writes tenant data to a fixed name (git uses `mkdtemp`). Test first: modes after an upload.
- **Size:** S. **Milestone:** M1

### INS-07 Any role bound at the instance, even viewer, counts as "the operator" for worker isolation and for keeping a password
- **Outcome:** confirmed by code
- **Severity:** security
- **Where:** `CP/kernel/execution/isolation.ts:58-66`; `CP/kernel/sso/people.ts:531-537`. Neither looks at the role, nor at `disabled_at`.
- **Evidence:** class: trust decided by the wrong test. A tenant whose code is written by someone with instance `viewer` gets a worker beside the control plane. `POST /bindings` accepted `viewer` and `tenant_admin` (201).
- **Fix:** one shared `isOperator(memberIds)`: enabled, `operator_admin`. Test first: instance viewer who writes code gives `refused`; their password is refused when single sign-on is required.
- **Size:** S. **Milestone:** M1

### INS-08 Registering a location's name again points its tenants at another database, unchecked
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/routes/locations.ts:100-141`; `CO/screens/Environments.tsx:893-920` (the same "Register database" form; nothing says the name exists).
- **Evidence:** tenant with a row in `loc`; `PUT …/loc` with an empty database 204; rows answer 404 "The table notes was not found."; the list says reachable, 1 tenant. A table made then would exist in one database only. Putting the first address back restored it.
- **Fix:** for a name with tenants, require that the new database holds each tenant's catalog (compare `data_table` IDs and workspace schemas), else 409; a separate "Change address" action. `POST` semantics for a new name (409 if taken). Test first: the empty database is refused.
- **Size:** M. **Milestone:** M2

### INS-09 Other replicas keep the old database after a tenant is moved or a location's address changes
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/kernel/data/stores.ts:84-85` ("A tenant's location never changes"), `:151-200`; `forget` and `forgetTenant` act in their own process only.
- **Evidence:** two kernels on one database: tenant deleted and imported into a dedicated location through one; the first reads its row, the second answers 404 for the table until restart. Writes there would go to the wrong database. With the stored address changed, an open store went on answering 200.
- **Fix:** cache by a version: read `data_location` and `database_location.updated_at` with a short life (as `control.ts`, 2 s), or tell replicas by `NOTIFY`, and reopen on a difference. Siblings: other per-process caches (supervisor `#writers`, hosts). Test first: the two-kernel scenario.
- **Size:** M. **Milestone:** M2

### INS-10 Uploaded exports are left on disk for good
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/kernel/tenancy/staging.ts:10-17`; `CP/routes/portability.ts:150, 229-250, 271-300`.
- **Evidence:** the row expired through another replica's sweep: the file here stayed, and nothing looks for it again. The same when "Throw it away" reaches another replica, when the inspection throws after the upload (no row is written), and after a restart. 50 GB each. `/tmp/vx-staged-imports` on this machine holds nine files from hours ago.
- **Fix:** each replica sweeps its folder: remove files with no live row or older than the hour. Wrap the inspection so a failure removes the file.
- **Size:** S. **Milestone:** M10

### INS-11 Import's Check always says 0 members
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/kernel/tenancy/import.ts:193` reads `counts.members`; the export writes `member` (`export.ts:185-188`).
- **Evidence:** two members exported, `inspection.members` 0.
- **Fix:** read `counts.member`; assert it in `portability.test.ts:884`.
- **Size:** S. **Milestone:** M10

### INS-12 Import tenant is offered for a tenant that is already here, and for a slug that was never checked
- **Outcome:** confirmed by code (the 409 is asserted in `portability.test.ts:870`)
- **Severity:** broken
- **Where:** `CO/screens/Environments.tsx:1056-1061` (`ready` without `tenantPresent`), `:1230-1285`.
- **Evidence:** `ready` is from the last check, not what is typed: a changed slug or passphrase keeps the button live with the old verdict, and a passphrase typed after the upload keeps it dead until "Check again". "Import another" keeps the last import's slug and location, "Throw it away" the passphrase too.
- **Fix:** add `!tenantPresent`; check again on change (debounced) and drop the old verdict; reset the form on both buttons.
- **Size:** S. **Milestone:** M10

### INS-13 "They can change it after signing in", but no screen changes a password
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/Instance.tsx:100`; sibling hint wherever a member is created in a tenant. `CO/screens/Account.tsx` has keys and recovery codes only.
- **Evidence:** `POST /api/v1/auth/change-password` answers 200; nothing in `CO/`, the CLI or the docs calls or names it. A forgotten password: `request-password-reset` 400 `reset_password_disabled`, and an operator cannot set one.
- **Fix:** build the account screen's password part (missing parts 1 and 2).
- **Size:** S. **Milestone:** M9

### INS-14 One location whose address cannot be opened breaks the whole Database locations page, and unreachable ones are waited for in turn
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/routes/locations.ts:45-70`.
- **Evidence:** an unsealable value: 500 for the list, so also for the selects in Create tenant and Import. Three unreachable hosts: 15.0 s. The GET also opens and prepares each database (`connect` runs the set-up).
- **Fix:** try per row (`problem: "Its address cannot be opened with this instance's master key."`), `Promise.all`, ping without set-up, and a light route for the selects (names only).
- **Size:** S. **Milestone:** M10

### INS-15 The instance's own database can be registered as a dedicated location
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/routes/locations.ts:105-124`.
- **Evidence:** `PUT …/self` with the platform's own address: 204. A tenant put there takes two connections and two transactions on one database. I did not look for what breaks.
- **Fix:** compare `system_identifier` and database name with the platform's, 400. Same check between two names of one database.
- **Size:** S. **Milestone:** M10

### INS-16 Moving a tenant back fails with "That already exists." when a member's email has changed since the export
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/kernel/tenancy/import.ts:268-295, 358-372`: members are matched by email only, and inserted by ID.
- **Evidence:** export, delete, email of one member changed, import on the same instance: 409 with no name. Nothing on a screen can undo it.
- **Fix:** match by ID first, then email; name the member in the refusal when neither fits.
- **Size:** S. **Milestone:** M10

### INS-17 A tenant whose dedicated database is gone can never be deleted, nor its location removed
- **Outcome:** owner decides (question 4); reproduced
- **Severity:** broken
- **Where:** `CP/kernel/tenancy/remove.ts:35-47, 136`; `CP/routes/locations.ts:168`.
- **Evidence:** deletion 503 `data_location_unavailable`; removing the location 409 "Move or delete the tenant first."
- **Size:** M. **Milestone:** M10

### INS-18 Adding an instance domain says to prove it with a record that is not shown
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/SingleSignOn.tsx:460`. The API answers `verified: true, record: null`.
- **Fix:** word the toast from the answer (`verified`). Test first: instance case.
- **Size:** S. **Milestone:** M9

### INS-19 Rename is offered on every tenant to people who may not rename it
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `CO/screens/Tenants.tsx:111` (Delete beside it is for operators only); `CP/routes/tenants.ts` PATCH needs `tenant:write`.
- **Evidence:** a tenant admin gets 200, so the button is right for them; a developer or viewer gets 403 after typing.
- **Fix:** the list row says what the caller may do (`canRename`), as other lists do; the button reads it.
- **Size:** S. **Milestone:** M10

### INS-20 Instance screens open for anyone who types the address
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CO/App.tsx:134-143`.
- **Evidence:** signed in as a Fernhill member: Members, Operators, Databases and Triggers draw their header and create button over a permission error; Import draws its whole form; Console branding and the kit draw in full. Nothing is leaked or changed: the API answers 403. The error's advice, "Ask a member who can give access in this tenant", is untrue here (`CO/kit/LoadState.tsx:81`).
- **Fix:** one gate in `App.tsx` for `/instance/*` by `isOperator`, showing the not-found or a "for operators" page; `LoadState` words instance permissions differently. Sibling: `isOperator` asks for the literal `tenant:*`, so an instance `tenant_admin` (`*:*`) sees no Instance area: use the shared `grants`.
- **Size:** S. **Milestone:** M10

### INS-21 The instance log's areas are a tenant's, and leave out the instance's own
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CO/screens/Audit.tsx:35-65`. Missing: `instance`, `identity_provider`, `identity_domain`, `identity_link`, `sso`, `scim`, `scim_token`, `database_location`, `tenant_import`. Offered and always empty there: Secrets, Runs, Tables and about 20 more.
- **Evidence:** the select on `/instance/audit` holds the tenant's 28 areas. `?area=tenant` gives `tenant.deleted`, never `tenant_import.*`.
- **Fix:** areas from the log (facets, missing part 6), or two lists; a test that every audit action's first word is in one. Sibling: the tenant log lacks `promotion`, `dashboard`, `git_repository`, `worker_pool`, `access`, `trigger`, `schedule`.
- **Size:** S. **Milestone:** M9

### INS-22 Every health probe is a trace
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/app.ts:170`: skips routes ending `/health`, which none does.
- **Evidence:** a collector got `GET /api/v1/healthz` and `GET /api/v1/readyz`, and not `/metrics`.
- **Fix:** skip by tag `health`, or by `healthz` and `readyz`. Test in `telemetry.test.ts`.
- **Size:** S. **Milestone:** M12

### INS-23 `readyz` reports the object store's time as the database's
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/routes/health.ts:72-92`: `latencyMs` is taken after both checks.
- **Evidence:** a store that takes 1.5 s to answer: `database.latencyMs: 1500`.
- **Fix:** time inside the database check.
- **Size:** S. **Milestone:** M12

### INS-24 With every trigger paused by the operator, a tenant's screens say its triggers are on
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CP/kernel/execution/triggers.ts:596, 700, 905, 964` and `flows/events.ts:83` stop them; no tenant route reads `instance_control` (`CP/routes/workspaces.ts:70` gives the workspace's own flag), and `GET /instance/triggers` needs `instance:read`.
- **Fix:** the workspace answer gains `pausedByInstance` (no reason text), and the trigger screens and workspace banner say it through the shared pause notice. Same shape as a trigger paused alone.
- **Size:** M. **Milestone:** M7

### INS-25 Tenants that share a dedicated database have no share of its connections
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `CP/kernel/data/rows.ts:243`: the gate runs for the platform database only; `CP/kernel/data/stores.ts:87-90` says a dedicated database is one tenant's alone. Any number of tenants may name one location (5 connections each way, `:145`).
- **Fix:** run the gate for every store (a limit per location). Docs line `docs/self-hosting.md:259` changes with it.
- **Size:** S. **Milestone:** M12

### INS-26 The operator strip goes on saying access is open after it has ended, and "End now" fails in silence
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CO/screens/Tenant.tsx:180-203` (read once, `active` as of then, no timer; the console refetches on no focus); `CO/kit/OperatorStrip.tsx:84, 115` (`void end()`, no catch). A failed read of the grants shows "You have no access to this tenant".
- **Fix:** a timer to `expiresAt` that reloads; `notify.error`; an error state for a failed read.
- **Size:** S. **Milestone:** M10

### INS-27 Disable is offered on your own row, and disabling twice writes two entries
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CO/screens/Instance.tsx:103`; `CP/routes/identity.ts:953-1000`. Removing yourself as an operator has the same words as removing another.
- **Evidence:** the operator's own row shows Disable (API 400). `PATCH` with the same state twice: two `member.disabled`. The same for ending an ended grant (`CP/routes/permissions.ts:714-732`).
- **Fix:** hide or explain on your own row; say "you" when removing yourself; no entry when nothing changes.
- **Size:** S. **Milestone:** M10

### INS-28 A deleted tenant's log is kept, and nobody can read it
- **Outcome:** owner decides (question 5); reproduced
- **Severity:** rough
- **Where:** `CP/routes/identity.ts:223-227` (the instance's log is `tenant_id is null`).
- **Evidence:** entries kept in the database; `GET /tenants/:t/audit` 404, opening access 404. The API and `docs/self-hosting.md:122` say the entries stay. They reach the object store with their month.
- **Size:** M. **Milestone:** M10

### INS-29 Words that are wrong about the instance
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `packages/manifest/src/permissions.ts:43` (`instance:write` "import tenants"; it is `tenant:write`, which says only create, rename, delete). `docs/self-hosting.md`: `:60` against `:97` (the data role's password), `:161` (an import is refused until the tenant is deleted), `:259` (INS-25), `:264` (`/api/v1/readyz`), `:505` (Console branding), `:535-563` (no `platform_database_read_only`, `platform_memory_total_bytes`). `packages/docs/content/instance/audit-log.md` ("What operators did": what operators do in a tenant is in that tenant's log). `CP/kernel/apps/sessions.ts:101` (INS-02).
- **Fix:** correct each; a test that every `platform_*` series is in the guide.
- **Size:** S. **Milestone:** M12

### INS-30 `addCreator` ignored for a caller who is not a member (C4)
- **Outcome:** not a bug: `ctx.memberId` refuses with 403 (`CP/kernel/http.ts:124-133`), and nothing but a member can hold `tenant:write` at the instance.

### INS-31 A viewer's access grant cannot export (C8)
- **Outcome:** not a bug: `export:write` is explicit to admins, and an operator can open a `tenant_admin` grant.

### INS-32 `tenant.created` and grants are in the tenant's log, not the instance's (C1)
- **Outcome:** not a bug: decided and written in the code ("The tenant's own log starts with its creation") and master-spec `:275`.

### INS-33 An upload that reaches another replica answers `staged_elsewhere` (C6)
- **Outcome:** not a bug: the console says it in words and asks for the file again. Left files are INS-10.

## Missing parts

The API has these; the console or CLI does not.

1. **Change your password.** `POST /auth/change-password` (works, audited as `member.password_changed`). Place: Account. Anyone signed in with a password. Sibling: end users' portal account. **S**
2. **Your sessions.** The sign-in library's list and revoke routes. Place: Account; ending others when the password changes. **S**
3. **Instance health.** `/readyz` (`CP/routes/health.ts:56`), `/instance` version and migration level (`CP/routes/instance.ts:20`), and what `/metrics` gives `instance:read` (`CP/routes/execution.ts:3380`). The console shows none. Place: Instance, Health. Workers on the instance, queue depth, oldest wait, database size and free state, mail and apps address. **M**
4. **Master key status.** `GET /instance/master-key` (`CP/routes/master-key.ts:12`), `instance:read`. Place: Instance, Health: fingerprints, what is left by place, values that open with neither, whether the old key can go. No control for `rekey`, which is a command on purpose. **S**
5. **Read-only state.** `readOnly` in `/readyz`, problem code `read_only` (`CP/kernel/errors.ts:51`), `Retry-After`. Place: a strip in the shell for everyone; save buttons say why; CLI `status` prints "Ready" without it (`packages/cli/src/cli.ts:862`). **M**
6. **The instance log's filters.** `GET /audit` takes `action`, `actorId`, `target`, `targetType`, `to` (`CP/routes/identity.ts:168-200`); the console shows them for a tenant only (`CO/screens/Audit.tsx:184`). Facets, one entry by link, and CSV have a tenant route only: add the instance's beside them. `audit:read`. **M**
7. **Operator powers on a tenant, without a grant.** `PATCH /tenants/:t {managedWorkers}` and `GET/PUT /tenants/:t/retention` (`CP/routes/tenants.ts:57-120, 304`), `tenantOrInstance`. Place: the tenant's inspector on All tenants. Today both are only inside the tenant. **S**
8. **Grant length and who is in.** `durationMinutes` 1 to 1440 (`CP/routes/permissions.ts:640`); the console has three values. `GET /tenants/:t/access-grants` answers an operator without standing; no operator screen lists grants. Place: the form; the tenant's inspector, with End. **S**
9. **A location's description and address.** `PUT /instance/database-locations/:name` (`CP/routes/locations.ts:81`) as Edit, and an inspector with its tenants. Goes with INS-08. **S**
10. **Emergency stop from the CLI.** `GET/PUT /instance/triggers`, for when the console is slow. `volvel instance triggers pause`. **S**
11. **Read and remove a staged import after a reload.** `GET/DELETE /instance/tenant-imports/staged/:id` exist; the console forgets the ID, so a reload loses an upload of hours. There is no list route. Place: keep the ID in the address. **S**
12. **Tenants by location.** `dataLocation` is on every tenant; no filter or link between the two lists. **S**

Not counted, as new capability (questions 1, 3): an operator's reset of a member's password, recovery of a locked-out instance, instance roles other than operator.

## Owner decides

1. **How does a locked-out operator get back in?** (a) `node dist/main.js operator <email>`, run where the instance runs: makes an existing or new member an operator with a printed one-time password, audited as the system; (b) the bootstrap variables act whenever no usable operator exists; (c) SQL in the guide. Recommend (a): it needs the machine, which is the trust an operator has already. M.
2. **May roles other than `operator_admin` be bound at the instance?** The API takes any built-in role, the console one. `viewer` there reads every member and the instance log; `tenant_admin` is a full operator the last-operator rule does not count. (a) Refuse all but `operator_admin`; (b) support `viewer` as "instance viewer" with a screen; (c) leave. Recommend (a), with INS-05 and INS-07. S.
3. **How is a member's password reset?** Today not at all. (a) An operator sets a temporary one, to be changed at sign-in; (b) a mailed link where mail is set up, with a link the operator can copy where it is not. Recommend (b), with the copyable link, so no operator knows a password. M.
4. **May a tenant be deleted when its dedicated database cannot be reached?** (a) Never; (b) yes, with a second confirmation, leaving its tables there and saying so in the audit entry. Recommend (b). M.
5. **Who reads a deleted tenant's log?** (a) Nobody, from the archive only; (b) operators, at Instance, Audit log, by a "Deleted tenants" filter. Recommend (b): the tenant's admins are gone, and the entries are kept to be read. M.
6. **Whose switch is "the instance starts workers"?** A tenant admin can turn on what the operator turned off, as both hold `tenant:write` (`CP/routes/tenants.ts:304`). (a) Keep one shared switch; (b) the operator's off wins. Recommend (b): the machine is the operator's. S.
