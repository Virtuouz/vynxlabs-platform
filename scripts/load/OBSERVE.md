# Observing a run

`observe.mjs` watches an instance while a load test runs. It changes nothing: it reads the metrics
route, the readiness route and, when asked, the Fly machines and Postgres over `fly ssh`.

```sh
node scripts/load/observe.mjs \
  --url https://volvel-test.fly.dev \
  --metrics-token-file ~/.secrets/volvel-metrics-token \
  --out ./load-out --every 5 --label baseline \
  --fly-app volvel-test --fly-db volvel-test-db --db-name volvel
```

Stop it with Ctrl-C (or SIGTERM) when the run is over; it then writes the summary.

| Flag | Meaning |
| --- | --- |
| `--url` | Base URL of the control plane. |
| `--metrics-token-file` | File holding the instance's metrics token. Read once, never printed. |
| `--out` | Directory for the output. Created if missing. |
| `--every` | Seconds between ticks. Default 5. |
| `--fly-app` | Fly app of the control plane. Every third tick it samples load, cpu, memory, swap and node processes. |
| `--fly-db` | Fly Postgres app. Same sample plus disk use of `/data`. |
| `--db-name` | With `--fly-db`: also samples `pg_stat_activity` (connections by state, longest active query). |
| `--fly-bin` | Path to `fly`. Default `~/.fly/bin/fly`. |
| `--label` | Text for the file names. |

Each tick appends one JSON line to `<out>/observe-<label>-<start>.ndjson` and prints one line:
queued and running runs, oldest wait, workers, free memory (MB), database pool requests waiting,
readyz status and time, HTTP p95 for the interval and steal percentage when known.

On exit `<out>/observe-<label>-<start>.summary.json` holds the min, max and mean of each gauge,
the totals of each counter, the worst readyz time, how many readyz answers were not 200, the lowest
free memory, the highest queue age, the highest steal percentage and the scrape failures (with the
time and the status or error of each). A failed scrape is a finding, not a reason to stop.

Notes:

- Counters and histograms are reported as the change since the last scrape; the first tick has none.
  A counter that goes down (a restart) is read as starting again from zero.
- p50 and p95 are estimated from histogram bucket changes, so they are only as fine as the buckets.
  A value in the last bucket is shown as the top finite bound.
- `fly ssh` samples run in the background with a 20 s timeout; a failed or slow one shows as an
  `error` in its field and never delays a tick. Their numbers join the next tick after they finish.
- The metrics only carry series the instance keeps. Memory is absent where the replica cannot read it.
