---
title: How an instance is configured
description: "Where the settings are read from, which groups there are, which variables the Compose file passes, and the ones that belong to Compose or to workers alone."
subjects: [install]
---

An instance is set by environment variables and nothing else. It reads them once, when it starts, and lists every problem at once, then exits with 1. The full list of variables, with defaults, is the generated [Settings reference](../settings): it is written from the same table the instance reads its settings by, so it cannot drift.

## Required

`PUBLIC_URL`, `DATABASE_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AUTH_SECRET` (at least 32 characters) and `MASTER_KEY` (32 bytes, base64). With `MANAGED_WORKERS=host`, `WORKER_HOST_TOKEN` (at least 32 characters) too. The Compose file requires it, because Compose defaults to `host`.

## Groups

The Settings reference has a section for each group.

| Group | What is in it |
| --- | --- |
| Address | `PUBLIC_URL`, `HOST` (0.0.0.0), `PORT` (8080), `LOG_LEVEL` (`info`), `DOCS_URL`. |
| Database | The connection and pool sizes, and the statement timeouts. |
| Files | The object store's address, bucket, keys, region and path style. |
| Secrets | `MASTER_KEY_SECONDARY` and `METRICS_TOKEN`. |
| First start | `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, set together; the password is at least 12 characters. |
| Apps | `APPS_URL`, optional (a different host from `PUBLIC_URL`). |
| Workers | `MANAGED_WORKERS`, `WORKER_HOST_TOKEN`, `MANAGED_WORKER_USER`, `MANAGED_WORKER_UID`, `MANAGED_WORKER_GID`, `MANAGED_WORKER_USERS`, `MANAGED_WORKERS_MAX`, `RUN_SLOTS`, `RUN_MEMORY_FLOOR_MB`. |
| Limits | `SCHEDULE_BACKLOG_LIMIT` (200), `TRIGGERS_PAUSED`, and the limits on tenant exports: `EXPORTS_AT_ONCE` (3), `EXPORTS_PER_TENANT` (1), `EXPORT_STALL_SECONDS` (60) and `EXPORT_MAX_MINUTES` (30; 0 is no limit). See [Move a tenant](../../how-to/instance/moving-a-tenant). |
| Mail | `SMTP_URL` and `MAIL_FROM` together, and `MAIL_CAPTURE_DIR`. |
| Retention | The four `RETENTION_` settings: [Retention](retention). |
| Telemetry | The `OTEL_` settings and `METRICS_WORKSPACE_LABELS`. |
| Network | `TRUSTED_PROXIES` (default `1`) and `EGRESS_ALLOW`. |
| Files of the image | `CONSOLE_DIR` and `SCREENS_DIR`. The image sets both. |
| Worker host | `VOLVEL_URL`, `VOLVEL_WORKER_TOKEN` and `WORKER_EGRESS_ALLOW`. |

## What the Compose file passes

`deploy/compose/compose.yaml` passes every variable of the table to the control plane except `HOST`, `PORT`, `MAIL_CAPTURE_DIR`, `CONSOLE_DIR` and `SCREENS_DIR`. A variable you leave out of `.env` is passed as an empty string, which the control plane reads as not set. The worker host reads an empty value as not set too, and Compose gives `MANAGED_WORKER_UID`, `MANAGED_WORKER_GID` and `MANAGED_WORKER_USERS` their defaults, `10001`, `10001` and `256`.

`deploy/fly/fly.toml` sets `HOST = "::"`.

## Settings of the Compose files alone

These are read by Compose, not by the instance.

| Variable | What it does |
| --- | --- |
| `COMPOSE_PROFILES` | `postgres,objectstore` in `.env.example`. Without it neither bundled service starts. Take one out when you give your own. |
| `POSTGRES_PASSWORD` | The bundled Postgres's password. |
| `OBJECTSTORE_SECRET` | The bundled object store's secret. |
| `VOLVEL_BIND` | Where the control plane is published on the host. Default `127.0.0.1:8080`. |
| `VOLVEL_IMAGE` | The image to run. Without it, Compose builds `volvel/volvel:local`. |

`deploy/worker/compose.yaml` reads `VOLVEL_IMAGE` (required), `VOLVEL_URL` (required), `VOLVEL_WORKER_CONCURRENCY`, `VOLVEL_WORKER_IDLE_EXIT`, and the token from the file `./worker-token`.

## The standalone worker and the worker host

The standalone worker (`node node_modules/@volvel/worker/dist/bin.js`) takes `--url`, `--token`, `--token-stdin`, `--token-file <path>`, `--concurrency` (4, or `VOLVEL_WORKER_CONCURRENCY`) and `--idle-exit` (`VOLVEL_WORKER_IDLE_EXIT`).

The worker host (`volvel-worker-host`) takes `--url`, `--run-slots`, `--memory-floor` and `--max-workers`, each also a variable, and reads `WORKER_HOST_TOKEN`, `MANAGED_WORKER_UID`, `MANAGED_WORKER_GID`, `MANAGED_WORKER_USERS`, `MANAGED_WORKERS_MAX` and `WORKER_EGRESS_ALLOW`.

## Where the settings are checked

`node dist/main.js check-config` reads the settings and says what is wrong with them, and opens nothing. See [Commands](commands).

Related: [Settings](../settings), [Metrics](../metrics).
