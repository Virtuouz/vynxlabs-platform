# Run log: self-host/how-to/running/send-opentelemetry.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
Not run: no collector. `check-config` was not run with an endpoint.

## What the page got wrong
Not known.

## Not run
Everything on this page.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run with a node OTLP/HTTP receiver: `/v1/metrics` and `/v1/traces` posted as JSON, header `x-api-key=k%25ey` arrived decoded (`k%ey`), a request with a traceparent joined that trace (x-trace-id equal), metrics every 2 s with OTEL_METRIC_EXPORT_INTERVAL=2000, series names as the Prometheus ones; a collector that is down logged `telemetry could not be sent` once (`telemetry.ts:259-337`). Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
