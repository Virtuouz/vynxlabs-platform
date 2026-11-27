---
title: Install an instance on Fly.io, as an example
description: "Deploy the image to Fly.io with a managed Postgres and a bucket, and add the workers group. An example topology; Compose is the supported one."
subjects: [install]
---

## Install an instance on Fly.io, as an example

By the end the control plane runs on Fly.io. Fly is an example, not a supported topology: Compose is the supported one. The files are `deploy/fly/fly.toml` and `deploy/fly/README.md`.

:::alert[What was run]{type=info}
The control plane was run on Fly in November 2026 with `MANAGED_WORKERS=process`, a Fly Postgres app and a Tigris bucket, loaded and broken on purpose for a day. The `workers` group of step 4 has not been run, and whether Fly runs it as root, which it must be, is not proved.
:::

## Before you start

- The `fly` command, signed in with `fly auth login`.
- A Fly Managed Postgres cluster in the same region (Postgres 16 or later), and a bucket from `fly storage create`.

## Deploy

:::steps
1. Set `app` and `primary_region` in `deploy/fly/fly.toml`, then `fly apps create <app>`.
2. Set the secrets under the names the instance reads:

   ```bash
   fly secrets set --app <app> \
     DATABASE_URL='postgres://...' \
     S3_ENDPOINT='https://...' S3_REGION='auto' S3_BUCKET='...' \
     S3_ACCESS_KEY_ID='...' S3_SECRET_ACCESS_KEY='...' \
     PUBLIC_URL='https://<app>.fly.dev' \
     AUTH_SECRET="$(openssl rand -hex 32)" \
     MASTER_KEY="$(openssl rand -base64 32)" \
     BOOTSTRAP_ADMIN_EMAIL='you@example.com' BOOTSTRAP_ADMIN_PASSWORD='...'
   ```

   Keep a copy of `MASTER_KEY`. Remove the two bootstrap secrets after the first sign-in.
3. Deploy from the repository root: `fly deploy . --config deploy/fly/fly.toml --dockerfile Dockerfile`.
4. For managed workers, set the shared secret and add a `workers` group:

   ```bash
   fly secrets set --app <app> WORKER_HOST_TOKEN="$(openssl rand -hex 32)" MANAGED_WORKERS=host \
     APPS_URL='https://apps.<your domain>'
   ```

   ```toml
   [processes]
     app = "volvel-start dist/main.js"
     workers = "volvel-worker-host --url http://<app>.internal:8080"
   ```

   Or set `MANAGED_WORKERS=false` if every tenant is served by standalone workers.
5. Verify: `curl https://<app>.fly.dev/api/v1/readyz` and `/api/v1/instance`.
:::

## What the file sets

- `HOST = "::"`, because `<app>.internal` is an IPv6 address and the control plane would otherwise listen on IPv4 only.
- The service names the `app` group (`processes = ["app"]`), so the `workers` group has none.
- `kill_timeout = 60`: give the `workers` machines the same. Without it Fly gives a stopping machine five seconds, and every deploy fails the scripts in progress. With it, a deploy lets them finish for thirty seconds.
- The health check is `/api/v1/healthz`. Fly does not restart a machine whose check fails, it decides where traffic goes, and with one machine a failing check is the whole instance unreachable. `/api/v1/readyz` answers 503 while the object store cannot be reached, though the console, the API and scripts still work, so it is not the check: watch it from a monitor of your own. Migrations run when the new machine starts, before it listens.
- `swap_size_mb = 512`, and a machine of `shared-cpu-1x` with 1024 MB, which gives three run slots in `process` mode. Size the `workers` machines for the scripts they will run.
- The worker host runs as root, to start each worker as a user of its own. If its log says "not running as root" or "a worker could not be started", no worker will start.
- `APPS_URL` gives apps written as code an address of their own: `fly certs add apps.<your domain>`.

A shared CPU has burst credit for a while, then a fraction of a core. On `shared-cpu-1x` a Postgres spends its allowance when idle and every tenant's queries slow down together; on `shared-cpu-2x` the control plane served 160 requests a second on its burst and 22 to 27 after. Give both a `performance` CPU for anything past a trial: `performance-1x` with 2 GB each is what the figures in [Sizing and scaling](../../explanation/running/sizing-and-scaling) were measured on.

## What an outage looked like

Each was done on purpose, under load:

- **The app's machine killed.** Fly started it again: answering after 22 seconds, scripts running after 53. The queue was whole. Scripts in progress failed as not heard from, and one with no retries is not run again.
- **The database's machine killed.** The control plane stayed up, answered 503 for about five seconds, and went on. No script failed.
- **The database's disk full.** Fly's Postgres turns the database read-only. Reads and the console went on, changes were answered 503 `read_only`, and writes came back 11 to 17 seconds after the disk was freed, with no restart. See [Run on a read-only database](run-on-a-read-only-database).
- **The bucket unreachable.** `/api/v1/readyz` said so within three seconds. Everything that needs no file went on.

## If it does not work

- **No worker starts.** Read the `workers` group's log. See above.
- **The workers cannot reach the control plane.** The control plane must listen on IPv6: `HOST = "::"`.

Related: [Sizing and scaling](../../explanation/running/sizing-and-scaling), [Put a proxy in front](put-a-proxy-in-front).
