# Fixed by lane t4-instance-host (tier 4)

Items: INS-10, 15, 22, 25, 27, 28; HOST-16, 19, 28, 30.

## INS-22 (already fixed, host2)
- `traced: false` on the health, ready and metrics routes; `app.ts:182` reads it. Test that shows it: `telemetry.test.ts` "health probes are not spans (HOST-29, INS-22)". Nothing changed.

## HOST-16
- `apps/control-plane/src/config.ts` (before `otlpInterval`): the headers are read inside `loadConfig`'s own problem list; a bad percent-encoding is "OTEL_EXPORTER_OTLP_HEADERS must be pairs like name=value, with a value percent-encoded (write a literal % as %25)." listed with the other problems. The reader (`readHeaders`) is unchanged, still strict.
- Test: `config.test.ts` "a malformed OTEL_EXPORTER_OTLP_HEADERS is a problem, listed with the others (HOST-16)" (threw URIError before).
- Siblings: `telemetryFromEnv` (`kernel/telemetry.ts`) calls the same reader on an env already checked by `loadConfig`; the worker's reader is lenient (HOST-17).

## INS-10
- `kernel/tenancy/staging.ts` `removeExpiredImports`: after forgetting expired rows it sweeps this replica's folder; a `.tar` with no live `import_staging` row and not written to for 15 minutes is removed (the background sweep in `kernel/execution/background.ts` already calls it). `routes/portability.ts` upload: a failed inspection or a failed insert removes the file.
- Test: `portability.test.ts` "a file no upload row holds is swept, and one that is held or still arriving is kept (INS-10)" (orphan stayed before).
- Left out: the failure wrap has no test of its own: a bad file does not make `inspectImport` throw (it answers a verdict, and the upload is kept with its row), and nothing else in that path can be made to throw from outside. The sweep covers any leak from it within the quarter hour plus the sweep period.
- Siblings: `DELETE .../staged/:id` through another replica leaves the file on the replica that holds it: now swept there. Import removes its own file.

## INS-15
- `routes/locations.ts` `PUT /instance/database-locations/:name` (before `connect`): the address is identified (`kernel/data/stores.ts` `identify`: `pg_control_system()` identifier plus `current_database()`, on a connection that writes nothing) and compared with the platform's own database and with every other registered name. 400: "That is this instance's own database, ..." or "That is the database "x" already reaches. ...". The same name's address may change to the same database. An address that cannot be identified falls through to the existing "could not be prepared" error.
- Test: `environments.test.ts` "the platform's own database is not a dedicated location, nor is one database under two names (INS-15)" (204 before).
- Siblings: `POST /tenants` and import take a name, not an address; no other route registers an address. Console Databases page shows the 400's text through its existing toast.
- Person sees: a refusal naming the cause where there was a silent 204.

## INS-25
- `kernel/data/rows.ts` `withData`: the tenant gate runs for every store, not only the platform database's (a limit per tenant on each location it uses; several tenants may name one). Comments in `kernel/data/stores.ts` and `docs/self-hosting.md` ("Sizing: the database", and the connection count line) say so.
- Test: `data-load.test.ts` "tenants that share a dedicated database each have a share of it ... (INS-25)" (second request of the same tenant did not wait before).
- Siblings: every row, query and action path goes through `withData`; the platform's own-tenant paths (`kernel/data/stores.ts:296` shared transaction) do not hold a gate and are unchanged. A lone tenant on a dedicated database now has at most `DATA_TENANT_CONNECTIONS` requests open at once (default 3 of 5 connections).
- Line for CHANGELOG: tenants on a dedicated database have the same per-tenant share of connections as on the platform database.

## Found
- `guide.test.ts` "every series ... (INS-29)" fails on the phase branch: the series are `volvel_*` now and the test looks for `platform_*`. Not this lane's.
- `kernel/data/query/visual.test.ts` "a joined column of a table it follows ..." fails here (date-bound parameters); not touched by this lane.

## INS-27
- `routes/identity.ts` `PATCH /members/:id`: a member already as asked (disabled again, enabled again) answers 200 with no write and no audit entry (`ctx.mutated = true`, as other routes that change nothing). `routes/permissions.ts` `DELETE /tenants/:t/access-grants/:id`: a grant already ended answers 204 with no second `access_grant.revoked`. `CO/screens/Instance.tsx`: `ToggleMember` shows "You cannot disable your own account." in place of Disable on your own row; Operators' remove button on your own row reads "Remove yourself" and confirms "Remove yourself as an operator? You lose the Instance area at once, and another operator has to add you back."
- Tests: `access-guards.test.ts` "disabling a disabled account, or enabling an enabled one ... (INS-27)", "ending an access grant that has ended writes no second entry (INS-27)"; `Account.test.tsx` "your own row on All members offers no Disable ... (INS-27)", "removing yourself as an operator says it is you (INS-27)". All failed before.
- Siblings: SCIM already skips a no-change (`kernel/sso/scim.ts:552`); `ToggleMember` is used only by All members; the tenant's own members list (`Members.tsx`) removes through another route, not changed. Removing yourself is not refused by the server (it keeps one operator).
- Walk: Instance > All members (own row text, at 390 px the row action cell wraps), Instance > Operators (own row button, confirm sheet). States: `/me` still loading shows Disable until it answers (the server refuses it with its message). Keyboard: unchanged. Reload: fine.

## INS-28
- `routes/identity.ts` `auditSelect` (shared by the page, the facets and the export): the instance's log (`tenantId` null) is now the instance's own entries and those whose tenant no longer exists, so a deleted tenant's log is read at `GET /audit` and `/audit-facets`, as D47 says. `tenantId` on each entry says whose it was. Route description says so. Retention is the instance's (`auditDays`). `CO/screens/Audit.tsx`: an entry with a `tenantId` in the instance's log carries a "Deleted tenant" tag (tooltip names the ID).
- Tests: `environments.test.ts` "is read at the instance, with the tenant it was of (INS-28)" (0 of 5 entries found before); `Audit.test.tsx` "an entry the instance's log keeps for a deleted tenant says whose it was (INS-28)".
- Siblings: tenant-scoped `GET /tenants/:t/audit` stays 404 for a deleted tenant; the CSV export of the instance's log does not exist. `docs/self-hosting.md:122` already says entries stay and now is true to read them.
- Left out: the Area filter of the instance log offers instance areas only; a deleted tenant's entries are reached by "Everything" or search.
- Walk: Instance > Audit with a tenant deleted (Tenants > Delete; then the log): its entries with the tag, at 390 px the tag wraps in the "What was done" cell, light and dark, reload.

## HOST-19
- `packages/worker/src/host.ts`: a 404 from the worker host route (what the control plane answers when `MANAGED_WORKERS` is not `host`) is `HostRouteOff`; `run()` says once "The control plane's MANAGED_WORKERS is not set to host, ... Asking again every 30 seconds." and asks again after `routeOffPauseMs` (default 30 s; `stop()` cuts the pause short), no longer "could not be reached" every 2 s. `deploy/compose/.env.example` says the host still starts in those modes and how to stop it.
- Test: `host.test.ts` "a control plane whose managed workers are not set to host is said once, and asked again only after a long pause (HOST-19)" (no such message before).
- Siblings: the control plane's route answer is unchanged (`kernel/http.ts:349`); the standalone worker (`worker.ts`) is another route. Left out: the compose profile the row proposes: the default is `host`, so the service must start without one; the line in `.env.example` covers it.

## HOST-30 (already fixed)
- `kernel/execution/supervisor.ts`: an `error` after `spawn` is logged as a refused signal and leaves the worker and its credential (it is still running); `stop()` gives up on a worker it cannot signal. Test that shows it: `supervisor-stop.test.ts` "a worker that cannot be signalled is left, and stopping does not throw or wait for ever" (passes; emits EPERM on each `kill`). Nothing changed.

## HOST-28
- `docs/self-hosting.md`: new "Restoring an instance", "Changing `AUTH_SECRET`", "Upgrading Postgres to a newer major version" (under Backups), "Installing where there is no internet" (under Using your own Postgres or object store), and the object store's needs (`HeadBucket`, Put, Get, Delete; `CreateBucket` only on a 404; any other answer stops boot; no listing) in that section.
- Test: `guide.test.ts` "the guide says how to restore, upgrade Postgres, change AUTH_SECRET, install with no internet ... (HOST-28)" (headings absent before).
- Left out, for the owner: the row asks for each page "from a drill that ran". I could run none (no image built, nothing pulled, no second database server), so the steps are written from the code and the compose file and have not been drilled: a drill of restore, a Postgres major upgrade and an offline install should be run before the guide is called checked. The support policy is the owner's to state; no line invents one.

## Lines for docs and changelog
- Setting: a malformed `OTEL_EXPORTER_OTLP_HEADERS` is listed with the other settings problems instead of a stack trace.
- API: `GET /audit` also returns entries of deleted tenants (each has its `tenantId`); `PUT /instance/database-locations/:name` is 400 for the platform's own database or one already registered under another name; `PATCH /members/:id` and `DELETE /tenants/:t/access-grants/:id` write no audit entry when nothing changes.
- Worker host: says once that `MANAGED_WORKERS` is not `host` and asks again every 30 seconds.
