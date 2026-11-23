---
title: Run on a database that takes no writes
description: "What the instance serves while its database is read-only, how it starts and recovers, and what to watch."
subjects: [emergency, database]
---

## Run on a database that takes no writes

By the end you know what works while the database takes no writes, and the instance is writing again when you have freed the disk. This was run on a Compose stack by making the database read-only.

## Before you start

A managed Postgres turns itself read-only when its disk is nearly full. You can alert on it: `volvel_database_read_only` is 1 while the database takes no writes, and `volvel_database_size_bytes` tracks its size.

## What the instance does

The instance keeps serving what reads alone can:

- `/api/v1/readyz` stays 200 and reports `"readOnly": true`, so the load balancer keeps sending traffic.
- Tables, runs and the console can be read by members who are already signed in, and by API keys. An operator who reads inside a tenant under an access grant is answered 503 too, because each request under a grant is written to the tenant's audit log.
- Changes, new sign-ins and new runs are answered 503 `read_only`, with `Retry-After`. A sign-in says "The database is taking no changes for now: its disk may be full, or it ...".
- The queue, schedules and managed workers stop.

It starts in this state as well: migrations are checked by reading alone when there are none to apply. An upgrade that brings migrations still needs a database that takes writes. The log says "the database takes no writes: its disk may be full. Serving reads only; the queue and background work start when writes come back".

## Recover

:::steps
1. Free the disk, or extend it. On Fly, `fly volumes extend`.
2. Wait. The instance checks every 10 seconds, and starts the queue and background work on its own once the database takes writes ("the database takes writes again: starting the queue and background work"). A connection opened while it took none keeps refusing writes until it is renewed: connections are renewed each minute.
3. Check `GET /api/v1/readyz` shows `"readOnly": false`, and add a row to a table.
:::

## The result

In the run, `readyz` showed `"readOnly": true` after the database was set read-only and a restart, a sign-in answered 503 `read_only`, and after the setting was reset `readOnly` was false within 10 seconds and writes worked within the minute.

## If it does not work

- **Writes still fail after `readOnly` is false.** The connection has not been renewed yet. Wait a minute.
- **The instance does not start after an upgrade.** The upgrade has migrations to apply: the database must take writes.

Related: [Stop every trigger](stop-triggers-and-clear-a-backlog), [Monitor an instance](monitor-an-instance).
