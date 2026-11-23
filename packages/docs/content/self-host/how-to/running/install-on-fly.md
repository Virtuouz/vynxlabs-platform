---
title: Install an instance on Fly.io, as an example
description: "Deploy the image to Fly.io with a managed Postgres and a bucket, and add the workers group. An example topology; Compose is the supported one."
subjects: [install]
---

## Install an instance on Fly.io, as an example

By the end the control plane runs on Fly.io. Fly is an example, not a supported topology: Compose is the supported one. The files are `deploy/fly/fly.toml` and `deploy/fly/README.md`.

:::alert[Not run]{type=warning}
The Fly setup has never been run. Treat the commands as a starting point and check them against the current Fly documentation. The `workers` group has not run, and whether Fly runs it as root, which it must be, is not proved.
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
- `kill_timeout = 60`: give the `workers` machines the same. The health check is `/api/v1/readyz`; Fly does not restart a machine whose check fails, it decides where traffic goes. Migrations run when the new machine starts, before it accepts traffic.
- `swap_size_mb = 512`, and a machine of `shared-cpu-1x` with 1024 MB, which gives three run slots in `process` mode. Size the `workers` machines for the scripts they will run.
- The worker host runs as root, to start each worker as a user of its own. If its log says "not running as root" or "a worker could not be started", no worker will start.
- `APPS_URL` gives apps written as code an address of their own: `fly certs add apps.<your domain>`.

A `shared-cpu-1x` Postgres has burst credit for a while, then a fraction of a core, and every tenant's queries slow down together. Give it a `performance` CPU, or use Fly Managed Postgres, for anything past a trial.

## If it does not work

- **No worker starts.** Read the `workers` group's log. See above.
- **The workers cannot reach the control plane.** The control plane must listen on IPv6: `HOST = "::"`.

Related: [Sizing and scaling](../../explanation/running/sizing-and-scaling), [Put a proxy in front](put-a-proxy-in-front).
