# Fixed by lane t4-instance-host (tier 4)

Items: INS-10, 15, 22, 25, 27, 28; HOST-16, 19, 28, 30.

## INS-22 (already fixed, host2)
- `traced: false` on the health, ready and metrics routes; `app.ts:182` reads it. Test that shows it: `telemetry.test.ts` "health probes are not spans (HOST-29, INS-22)". Nothing changed.

## HOST-16
- `apps/control-plane/src/config.ts` (before `otlpInterval`): the headers are read inside `loadConfig`'s own problem list; a bad percent-encoding is "OTEL_EXPORTER_OTLP_HEADERS must be pairs like name=value, with a value percent-encoded (write a literal % as %25)." listed with the other problems. The reader (`readHeaders`) is unchanged, still strict.
- Test: `config.test.ts` "a malformed OTEL_EXPORTER_OTLP_HEADERS is a problem, listed with the others (HOST-16)" (threw URIError before).
- Siblings: `telemetryFromEnv` (`kernel/telemetry.ts`) calls the same reader on an env already checked by `loadConfig`; the worker's reader is lenient (HOST-17).
