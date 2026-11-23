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
