# Fixed by lane ins2 (tier 2)

Rows: INS-11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 26, 29; D16, D47; and from lane acc's "Not done": streams on other replicas, the Operators screen showing Disabled, an end user's pending sign-in codes. Migration: `0090_ins2_managed_workers_lock.sql` (integrator renumbers and locks). Every test below was seen failing on the code before the change, at the level a person or program meets it (route, rendered screen).

## INS-11, INS-16 (26f1e252)
- `CP/kernel/tenancy/import.ts`: `inspectImport` reads `counts.member` (was `members`). `importTenant` matches an exported member by ID first, then by email; two different accounts here for one exported person is a 409 naming the member; `known` is now by ID.
- Tests: `portability.test.ts` "the check says whether the list of contents is signed" (`members: 3`), "back again" (a member's email changed here before the import: was 409 "That already exists.").
- Siblings: clone (`clone.ts`) copies inside one instance, not changed. CLI `tenant import` uses the same function.
- Person sees: Check lists the right member count; a moved-back tenant imports.

## INS-12 (948c51d8)
- `CO/screens/Environments.tsx` `TenantImport`: `ready` needs `!tenantPresent` and a verdict made with the slug and passphrase now typed (`checkedWith`); the check is made again 600 ms after typing stops; `startOver()` clears slug, location, passphrase on Import another, Throw it away and after an import.
- Test: `Environments.test.tsx` "a verdict made for another slug or passphrase ..." (failed with the guard removed).
- Siblings: no other screen has a check-then-act form with typed inputs.
- Walk: Environments > Import a tenant (upload, type a slug, wait, Check again, Import another). States: stale verdict turns the button off while it rechecks. Keyboard: unchanged. Copy: unchanged.

## INS-13 (036d614c)
- `CO/screens/Account.tsx` `ChangePassword` (new, on the Account screen): current, new (12+), again; calls `POST /auth/change-password` with `revokeOtherSessions`; says "The current password is not right." for a wrong one; clears the fields. Hints in `Instance.tsx` and `Members.tsx` now point to the Account screen.
- Test: `Account.test.tsx` "a person changes their own password ...".
- Left out: missing part 2 (list and end sessions), end users' portal password. A person who signs in only by single sign-on has no password: the panel says so in its text, and the server's refusal is shown.
- Shared file another lane may touch: `Account.tsx` (ACC-25 is the same missing part in people-and-access).
- Walk: Account at 390 px, light and dark, keyboard (Tab through three fields, Enter submits), reload.

## INS-14 (78234900)
- `CP/routes/locations.ts` list: each row opened and probed on its own, all rows together; a value that cannot be opened is that row's `problem` ("Its address cannot be opened with this instance's master key."). `GET /instance/database-locations/names` (new, names and descriptions, opens nothing). `CP/kernel/data/stores.ts` `probe()` pings with `setUp: false` and closes (or pings the store already open).
- Console: Create tenant and Import use `/names` (`Tenants.tsx`, `Environments.tsx`).
- Test: `environments.test.ts` "one address that cannot be opened ..." (was 500).
- Left out: the Databases page does not yet show the problem text beyond what it showed for an unreachable row (it already draws `problem`).

## INS-17, D47 (798fda4b)
- `POST /tenants/:t/deletion` takes `tablesLeftBehind: true` as the second confirmation; without it an unreachable database is 503 `data_location_unavailable` as before. `CP/kernel/tenancy/remove.ts` `deleteTenant` skips only that failure, and the `tenant.deleted` entry carries `tablesLeftIn` and the schema names. Console `DeleteTenantButton` asks the second question with the server's reason; a retry after the first is not needed.
- Test: `environments.test.ts` "a tenant whose own database is gone ..." (503, then 204, then the location removes); `Environments.test.tsx` "a tenant whose database does not answer ...".
- Left out: "the log is read at the instance" is INS-28 (not in this lane's rows); the entry is kept in the database as before.

## INS-18 (56d17b75)
- `CO/screens/SingleSignOn.tsx` Domains: the toast is worded from `verified` ("It needs no proof here." at the instance). Test: `SingleSignOn.test.tsx` "adding a domain says what happened ...".

## INS-19 (already fixed, tier 1)
- `mayRename` on `GET /tenants` rows and `GET /tenants/:t`, read by `RenameTenantButton` (fixed/shl.md SHL-11). Test that shows it: `tenant-list.test.ts` (`mayRename` false for a viewer), `TenantScreens.test.tsx` SHL-11.

## INS-20 (8dca51a4)
- `CO/App.tsx`: one gate for `/instance/*`: `ForOperators` page (`screens/NotFound.tsx`) unless `isOperator`. `CO/api.ts` `isOperator` now asks `grants(instancePermissions, "tenant:write")` (the shared manifest function), so an instance role of `*:*` is an operator. `kit/LoadState.tsx` words a 403 under `/instance/` as "Ask an operator of this instance to give you access."
- Test: `App.test.tsx` "the instance's screens open for an operator ...".
- Siblings that call `isOperator`: `Shell.tsx` (Instance area), `Tenants.tsx`, `Tenant.tsx`: all follow.

## INS-21 (02819e63)
- `CO/screens/Audit.tsx`: `TENANT_AREAS` (gains promotion, dashboard, git_repository, worker_pool, access, trigger, schedule, approval, workspace_git, page_action, alert, bundle_asset, end_user_group, connection_group, group_member) and `INSTANCE_AREAS` (instance, identity_*, sso, scim, scim_token, database_location, tenant_import, operator ...); `auditAreas()`.
- Test: `Audit.test.tsx` "the instance's log offers the instance's areas ...": scans the control plane's source for `action: "word."` and requires `word` in one list.

## INS-23 (abb3f887)
- `CP/routes/health.ts`: latency timed inside the database check. Test: `app.test.ts` "the database's latency is the database's ..." (read 701 ms with a 700 ms object store).

## INS-24 (db069b9a)
- `GET /tenants/:t/workspaces`, `.../:w`, create and patch answer `pausedByInstance` (`CP/routes/workspaces.ts`, `instanceTriggersPaused`), without the operator's reason. Console: Shell pill, Workspace settings row, Overview (attention step, pill, trigger rows), Triggers list note and `TriggerState` ("Instance paused"), tenant overview line.
- Tests: `trigger-limits.test.ts` (the operator's pause), `Environments.test.tsx` "a workspace whose triggers the operator paused ...".
- Left out: the instance pause notice has no shared component; each screen's existing note/pill took a second wording.

## INS-26 (2a0ec06f)
- `CO/screens/Tenant.tsx`: a timer to the grant's `expiresAt` re-reads the grants (5 s retry when the clock says over and the server disagrees); a failed read is an error page with Try again, not "You have no access". `CO/kit/OperatorStrip.tsx`: End now and End access now go through `endNow`, which says a failure.
- Tests: `TenantScreens.test.tsx` (two), `Chrome.test.tsx` "ending operator access that fails ...".

## INS-29 (5337de29)
- `packages/manifest/src/permissions.ts` (instance write no longer "import tenants"; tenant write says import). `docs/self-hosting.md`: data role's password, moving a tenant (delete first), `/api/v1/readyz`, Console branding name, `platform_memory_total_bytes`, `platform_database_read_only`. Test: `guide.test.ts` (every series is in the guide, the permission words, the lines above).
- Left out: `:259` (INS-25, not this lane's row) still says a dedicated database's connections are the tenant's alone. `CP/kernel/apps/sessions.ts:101` already says "not disabled" (ACC-03).

## D16 (817d8d7d)
- Migration `0090_ins2_managed_workers_lock.sql` adds `tenant.managed_workers_locked`. `PATCH /tenants/:t`: an operator's `managedWorkers:false` sets the lock; a tenant admin's `true` while locked is 403 "An operator of this instance turned this off. ..."; an operator's `true` clears it. `GET /tenants/:t` answers `managedWorkersLocked`. Console Workers says it instead of offering the button.
- Tests: `environments.test.ts` "what an operator turned off ...", `TenantScreens.test.tsx` "Workers does not offer ...". The export of a tenant carries the column with its row; `portability.test.ts` passes.

## Streams on every replica, Operators shows Disabled, end users' pending codes (53ef7edb, cac8835e)
- `CP/kernel/stream.ts` `endStreamsOf(trx, principal, tenantId?)` now `pg_notify('vx_ended')` in the transaction; every hub's existing LISTEN connection (now also on `vx_ended`) closes what it holds, so a stream ends on commit, everywhere. The process-wide hub set is gone. `CP/kernel/administer.ts` `endEndUserSignIns` (app sessions, unfinished `sso_state`, streams) used by `PATCH /tenants/:t/end-users/:id` and SCIM.
- Tests: `access-guards.test.ts` "they end on every replica ..." (a second `StreamHub` and a raw LISTEN), "an end user disabled loses their pending sign-in codes ...".
- `CO/screens/Instance.tsx` Operators: a Disabled tag from `memberDisabled`. Test: `Account.test.tsx` "an operator who is disabled says so ...".

## Found
- INS-22 was looked at and left (not this lane's row): `app.ts` skips `/health` which no route ends with.
- `Members.tsx` Add member's hint said nothing of changing the password; now points to Account.

## Lines for docs and changelog
- API: `GET /instance/database-locations/names`; rows of the list carry the problem for an address that cannot be opened; `POST /tenants/:t/deletion` takes `tablesLeftBehind`; workspaces answer `pausedByInstance`; tenants answer `managedWorkersLocked`; `PATCH /tenants/:t` refuses a tenant admin turning on what an operator turned off.
- Console: Account has Change password; Import tenant checks again after typing; the Instance area is for operators only.
- `packages/docs/content/instance/audit-log.md` ("What operators did"): add that what operators do inside a tenant is in that tenant's log.
- Migration `0090_ins2_managed_workers_lock.sql`.

## Polish gate (what people see)
No browser walk has been run in this lane, so none of the answers is confirmed by a walk. Screens to walk at 1440, 768, 390, light and dark, keyboard, reload, on a Fernhill instance: Account (Change password), Environments (Import a tenant, Delete tenant on an unreachable database, Database locations), Instance > Operators, Instance > Audit (area select), Instance URL typed as a Fernhill member, a tenant's Workspace settings/Overview/Triggers with the operator pause on, Workers, the operator strip near its end.
- **States.** Stale verdict, unreachable address, wrong password, failed end of access, paused by the instance, locked workers switch each have a line saying what is true.
- **Lifecycle.** Disable now ends streams everywhere and pending codes of end users; a password can be changed, not only made.
- **Keyboard.** New fields are native; the second confirmation is the existing dialog.
- **Copy.** American spelling; no banned words.
