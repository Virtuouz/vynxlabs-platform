# Fact-check: self-host/how-to/running/send-opentelemetry.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Endpoint, headers, protocol `http/json`, interval at least 1000, exporters `none`, service name default `volvel`. | `config.ts:273-296,391-393` | writer, 2026-11-23 | holds |
| 2,000 held, 200 batches, 2 s flush, 10 s timeout. | `kernel/telemetry.ts:259-261,323` | writer, 2026-11-23 | holds |
| `x-trace-id` on every response. | `app.ts:178` | writer, 2026-11-23 | holds |
| What is traced, `traceparent`, worker spans, managed workers get no instance settings. | `docs/self-hosting.md`; `routes/worker.ts:84` | writer, 2026-11-23 | carried; not run |
| An endpoint received spans. | none | writer, 2026-11-23 | NOT RUN: no collector |

## Second check (2026-11-23)

Run with a node OTLP/HTTP receiver: `/v1/metrics` and `/v1/traces` posted as JSON, header `x-api-key=k%25ey` arrived decoded (`k%ey`), a request with a traceparent joined that trace (x-trace-id equal), metrics every 2 s with OTEL_METRIC_EXPORT_INTERVAL=2000, series names as the Prometheus ones; a collector that is down logged `telemetry could not be sent` once (`telemetry.ts:259-337`).
