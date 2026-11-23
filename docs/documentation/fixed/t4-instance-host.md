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
