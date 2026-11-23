---
title: Requirements for an instance
description: "The versions, memory, rights and network an instance needs: Postgres, the object store, the machine and the container."
subjects: [install, database]
---

What an instance needs from the machine and the services around it.

## The machine and the image

| Need | Value |
| --- | --- |
| Memory to start | 2 GB for a machine that runs the control plane and scripts together. |
| Disk for the control plane | None. It keeps no state on disk. |
| Image | Built on `node:24-slim`. No image is published yet: build it ([Build the image from source](../../how-to/running/build-the-image)). |
| Docker | Docker with Compose, for the Compose file. |
| Capabilities, control plane | `CAP_SETUID` and `CAP_SETGID` (Docker gives them by default), so that workers it starts can run as a user of their own. Without them it starts on plain Node and says so. |
| Capabilities, worker host | `SETUID`, `SETGID`, `CHOWN`, `DAC_OVERRIDE`, `KILL`, `NET_ADMIN`, running as root (`user: "0:0"`) with `cap_drop: [ALL]`. The Compose file gives them. An older Compose file without `CHOWN`, `DAC_OVERRIDE` and `KILL` starts no worker. |
| Port | 8080 inside the container. `VOLVEL_BIND` (default `127.0.0.1:8080`) says where it is published. |

## Postgres

| Need | Value |
| --- | --- |
| Version | 16 or later. CI runs 16 and 18, and the release rehearsal runs 18. The bundled service is `postgres:18`. |
| The user | Owns the database and has `CREATEROLE`. It need not be a superuser. |
| Extensions | `pg_trgm` is optional: where it is not available, error search of runs works without its index. |
| Connections | `DATABASE_POOL_SIZE + DATA_POOL_SIZE + 3` for each replica, and more for each dedicated database and data source. Under the server's `max_connections`. |
| Not supported | A transaction pooler between the instance and Postgres. |

## The object store

An S3-compatible store with one bucket (`S3_BUCKET`).

| Request | When |
| --- | --- |
| `HeadBucket` | At start, and in every readiness check. Any answer other than success or 404 stops the instance at start. |
| `CreateBucket` | Only when `HeadBucket` answers 404. |
| `GetObject`, `PutObject`, `DeleteObject` | For files, bundles, payloads and archived audit months. |

The instance lists nothing, and needs no bucket policy, versioning or lifecycle rule. Requests time out after 60 seconds, and connecting after 5.

## What it does not need

An internet connection, once the images are on the machine. An instance asks for no license, makes no update check and sends no telemetry. See [What an instance reaches](../../explanation/running/egress-and-offline).

Related: [Install an instance with Compose](../../how-to/running/install-with-compose), [Settings](../settings).
