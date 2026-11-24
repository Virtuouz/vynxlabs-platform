# Run log: self-host/how-to/running/monitor-an-instance.md

- Commit `14f7d5b9`. Instance: the throwaway Compose stack described in [the drill log](../../running-drill) (project `p31host` or `p31restore`, ports 18480 and 18481, never the instance on 8091).
- Who: `ops@example.com`, the first operator, through the API, headless; no browser walk of a screen.

## What was run
The probes through `curl`; `GET /api/v1/metrics` as an operator (200, series names).

## What the page got wrong
Not known.

## Not run
A scrape with `METRICS_TOKEN`, a Prometheus server, the alert rules.

## Second check (2026-11-23)

On the checker's own stack (`-p p31chk`, port 18590, torn down after). Run: no token 401, with METRICS_TOKEN 200; healthz `{"status":"ok"}`; series named on the page exist (`volvel_db_pool{pool,state}` with state total/idle/waiting, `volvel_workers{kind}`). Prometheus itself not run. Key screens walked at 390 px and in dark on that stack (Health, Triggers, Database locations): no horizontal overflow, labels as the page says.
