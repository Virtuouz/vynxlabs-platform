---
title: Sizing and scaling an instance
description: "How run slots, the memory floor and the connection budget decide what one machine runs, and what to add when it is not enough."
subjects: [workers, database, monitoring]
---

Every attempt of a script is a process of its own. How many run at once on a machine is a number you can read and change, and the database has a connection budget you can add up.

## Run slots and the memory floor

A machine that runs scripts, the control plane's in `process` mode or a worker host's, shares **run slots** between all its workers and tenants:

- The scripts running there never go past its slots.
- While other tenants are waiting, no tenant takes more than its share.
- Work past that waits in the queue. Nothing fails for it.

On top of the slots:

- No worker takes more work while the machine's free memory is below its **memory floor**.
- If free memory still falls under 5% of the machine's memory (at least 64 MB), the largest script is stopped and its run fails with "The script was stopped: the machine ran low on memory." Its retries apply.
- A script is held to its `memoryMb`: all the memory it holds, Buffers and native memory included, plus 64 MB for Node itself. Past that its run fails with "The script ran out of memory".
- Scripts run at a lower CPU priority than the control plane and the workers, so the console stays quick under heavy scripts.

| Setting | Default | Meaning |
| --- | --- | --- |
| `RUN_SLOTS` | One for each 160 MB past the first 512 MB of memory, at least 2 | Scripts running at once on this machine. |
| `RUN_MEMORY_FLOOR_MB` | A tenth of memory, at least 128 | Free memory below which no worker here takes more work. 0 turns the check off. |
| `MANAGED_WORKERS_MAX` | Twice the run slots | In `process` mode, managed workers alive at once. |

The worker host takes the same settings, as `--run-slots`, `--memory-floor` and `--max-workers`, or from the same variables.

Memory is the smaller of what `/proc/meminfo` reports and the container's own limit (cgroup v2, then v1), less what the container already holds. A container held to 1 GB on a 16 GB machine has 1 GB. Under that rule a 1 GB container gets 3 slots and a 2 GB one gets 9.

A standalone worker has no slots, no floor and no memory guard. It runs as many scripts at once as its `--concurrency` says (4 by default).

Plan on 2 GB for a machine that runs the control plane and scripts together. Give the database a dedicated CPU for anything past a trial. On a shared CPU it runs at full speed only until its burst credit is spent, and then every tenant's queries slow down together.

## The database's connection budget

Every tenant's table requests share one pool of connections per replica, on the instance's database and on each dedicated database. Each tenant has a share of it:

- A tenant's requests past its share wait their turn, so one tenant's slow searches leave the others room.
- After 5 seconds of waiting, a request is answered 503 with `Retry-After`, never 500. Nothing was done, so it is safe to try again. `@volvel/app` and scripts try again by themselves, twice.
- Every data request has a time limit. Past it, the statement is stopped and the request is answered 422 `too_slow`, which says to narrow the filter or add an index. Totals keep their own limit of 5 seconds.

| Setting | Default | Meaning |
| --- | --- | --- |
| `DATABASE_POOL_SIZE` | 10 | Connections for the instance's own work, per replica. |
| `DATA_POOL_SIZE` | 10 | Connections for every tenant's table requests, per replica. |
| `DATA_TENANT_CONNECTIONS` | A third of `DATA_POOL_SIZE`, at least 2 | Table requests one tenant may have open at once, per replica. |
| `DATA_STATEMENT_TIMEOUT_MS` | 15000 | How long one request for rows may take. |
| `SQL_STATEMENT_TIMEOUT_MS` | 15000 | How long one query written in SQL may run. |

Each replica opens up to `DATABASE_POOL_SIZE + DATA_POOL_SIZE + 3` connections: 2 more for the queue and 1 to listen for changes to runs. A dedicated database adds 5 and 5 for each replica, and a data source adds 4. Keep the total across replicas under the database's `max_connections`.

`volvel_db_pool{pool,state}` shows each pool's total, idle and waiting connections. A `waiting` above 0 that does not go away means a pool too small or a database too slow.

## Replicas

Run more than one control plane when you need it. Every replica runs the background loop, counts its own requests and holds its own pools. What must agree between them is in the database: the queue, the rate limits, which replica does a retention pass.

When there are several replicas:

- change the master key in two steps. See [Rotate the master key](../../how-to/running/rotate-the-master-key);
- set `AUTH_SECRET` to the same value on all of them;
- add up each replica's counted metrics, as Prometheus does with `sum`.

## What to watch

Alert on a queue that keeps growing (`volvel_queue_oldest_seconds`) rather than on full slots: full slots are the limit doing its work. See [Monitor an instance](../../how-to/running/monitor-an-instance).

Related: [Settings](../../reference/settings), [Workers, users and what a script can reach](managed-workers-and-isolation).
