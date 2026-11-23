---
title: Monitor an instance
description: "Check that an instance is alive and ready, scrape its Prometheus series with a token, and the series to alert on."
subjects: [monitoring]
---

## Monitor an instance

By the end your monitoring checks the instance's probes and scrapes its `volvel_` series, and alerts on the ones that say it is falling behind.

## Before you start

- A scraper such as Prometheus that reaches the instance.
- To read the series without a person or an API key, `METRICS_TOKEN` set in the instance's environment, 32 characters or more. Without it only a member or an API key that holds `instance:read` reads them.

## Set it up

:::steps
1. Probe the instance. All three are public and are not traced.

   | Address | Answers |
   | --- | --- |
   | `/api/v1/healthz` | 200 `{"status":"ok"}` while the process serves requests. |
   | `/api/v1/readyz` | 200 `ready` when Postgres and the object store each answer within 3 seconds, 503 `not_ready` otherwise. A database that takes no writes is still ready, and says `"readOnly": true`; each check carries its `latencyMs`. |
   | `/api/v1/instance` | The version and migration level. |

2. Set `METRICS_TOKEN` in `.env` and restart. Make the scraper send it as `Authorization: Bearer <token>` to `/api/v1/metrics`:

   ```yaml
   scrape_configs:
     - job_name: volvel
       metrics_path: /api/v1/metrics
       authorization: { credentials_file: /etc/prometheus/volvel-token }
       static_configs: [{ targets: ["volvel.example.com"] }]
   ```

3. Scrape every replica. Each answers for what it saw: add counted series up across replicas, as Prometheus does with `sum`. What must agree across replicas, such as how many runs wait, is read from the database at each scrape.
4. Alert. Start with these series, whose names and labels are in [the metrics reference](../../reference/metrics):

   | Alert on | Series |
   | --- | --- |
   | A queue that keeps growing | `volvel_queue_oldest_seconds` |
   | The database taking no writes | `volvel_database_read_only` is 1 |
   | The database's disk | `volvel_database_size_bytes` |
   | A pool that waits | `volvel_db_pool{state="waiting"}` above 0 and staying there |
   | Low memory on a machine that runs scripts | `volvel_memory_available_bytes` against `volvel_memory_total_bytes` |
   | No worker heard from | `volvel_workers` |
   | Failing runs | `volvel_runs_finished_total{state="failed"}` |

   Alert on a queue that keeps growing rather than on full slots: full slots are the limit doing its work.
:::

## The result

The scraper gets the series. Each tenant's **Workers** page shows the same queue: what waits where, the oldest wait, and what each worker holds. The label for a canceled run reads `cancelled`, as stored.

On an instance with very many tenants, set `METRICS_WORKSPACE_LABELS=false`: the per-workspace queue series are left out, and the counted ones carry no tenant or workspace.

## If it does not work

- **The scrape answers 401.** The token differs from `METRICS_TOKEN`, or `METRICS_TOKEN` is not set and the scraper sent none. With no token set, only a member or key that holds `instance:read` reads the address.
- **A scrape fails with "METRICS_TOKEN must be at least 32 characters."** at start. Use a longer one.
- **A series counts twice.** You send the same series by OpenTelemetry as well. Use one or the other: [Send traces and metrics with OpenTelemetry](send-opentelemetry).

Related: [Instance Health screen](../../reference/console/health), [Sizing and scaling](../../explanation/running/sizing-and-scaling).
