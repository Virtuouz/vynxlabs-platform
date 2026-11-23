# Fact-check: self-host/how-to/running/monitor-an-instance.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Probes `healthz`, `readyz` (3 s checks, `readOnly`, `latencyMs`), `instance`; not traced. | `routes/health.ts:24-93`; run | writer, 2026-11-23 | holds |
| `/api/v1/metrics` takes a bearer `METRICS_TOKEN` or `instance:read`. | `routes/execution.ts:3983-4010`; openapi | writer, 2026-11-23 | holds; the token path was not exercised |
| The series names. | run: `# TYPE` list of `/metrics`; generated metrics reference | writer, 2026-11-23 | holds |
| `METRICS_WORKSPACE_LABELS=false` drops per-workspace series. | generated settings (Telemetry) | writer, 2026-11-23 | holds |
| Prometheus config and the alerts. | not code | writer, 2026-11-23 | examples; not run |

## Second check (2026-11-23)

Run: no token 401, with METRICS_TOKEN 200; healthz `{"status":"ok"}`; series named on the page exist (`volvel_db_pool{pool,state}` with state total/idle/waiting, `volvel_workers{kind}`). Prometheus itself not run.
