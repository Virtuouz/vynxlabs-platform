# Fly.io

Fly.io hosts the Vynxlabs-run instances. Nothing in the image is specific to Fly: it reads the same environment variables as every other deployment mode.

The same steps, kept up to date, are in the documentation at `/docs/self-host/how-to/running/install-on-fly` on an instance. The control plane was run this way in November 2026, with `MANAGED_WORKERS=process`, a Fly Postgres app and a Tigris bucket (phase 35). The `workers` group below has not been run.

## One-time setup

1. Sign in: `fly auth login`.
2. Choose an app name and region, and set `app` and `primary_region` in `fly.toml`.
3. Create the app: `fly apps create <app>`.
4. Create a Managed Postgres cluster in the same region and note its connection string. Postgres 16 or newer.
5. Create a bucket: `fly storage create`. Note the bucket name, endpoint and credentials it prints.
6. Set the secrets under the names the platform reads:

   ```sh
   fly secrets set --app <app> \
     DATABASE_URL='postgres://...' \
     S3_ENDPOINT='https://...' \
     S3_REGION='auto' \
     S3_BUCKET='...' \
     S3_ACCESS_KEY_ID='...' \
     S3_SECRET_ACCESS_KEY='...' \
     PUBLIC_URL='https://<app>.fly.dev' \
     AUTH_SECRET="$(openssl rand -hex 32)" \
     MASTER_KEY="$(openssl rand -base64 32)" \
     BOOTSTRAP_ADMIN_EMAIL='you@example.com' \
     BOOTSTRAP_ADMIN_PASSWORD='...'
   ```

Keep a copy of `MASTER_KEY` somewhere safe. Without it, no stored secret can be read again. Remove the two bootstrap secrets after the first sign-in.

## Deploy

From the repository root:

```sh
fly deploy . --config deploy/fly/fly.toml --dockerfile Dockerfile
```

Managed workers run in a second process group, `workers`, on machines of their own, started by the worker host. Fly gives every machine of an app the same private network, so set the machines' firewall rules (the worker host adds them at start when it has `NET_ADMIN`, which Fly machines have) and keep the database outside the app's network: a Managed Postgres cluster is. Set the shared secret once:

```sh
fly secrets set --app <app> WORKER_HOST_TOKEN="$(openssl rand -hex 32)" MANAGED_WORKERS=host \
  APPS_URL='https://apps.<your domain>'
```

and add the group to `fly.toml`:

```toml
[processes]
  app = "volvel-start dist/main.js"
  workers = "volvel-worker-host --url http://<app>.internal:8080"
```

`fly.toml` sets `HOST = "::"`, because `<app>.internal` is an IPv6 address and the control plane would otherwise listen on IPv4 only, and names the `app` group for its service (`processes = ["app"]`), so the `workers` group has none. The worker host's rules let a worker reach the control plane at that address and the machine's name servers (IPv6 too), and nothing private else. `WORKER_EGRESS_ALLOW` lists, comma separated, networks and names that workers may also reach, such as an internal API. It is empty unless set, and it is not `EGRESS_ALLOW`, which is what the instance itself may reach for a tenant.

The `workers` group must run as root. If its log says "not running as root" or "a worker could not be started", it does not, and no worker will start: the log names the error. The control plane's `kill_timeout` is in `fly.toml`; give the `workers` machines the same.

Size the `workers` machines for the scripts they will run. The worker host runs as root, to start each worker as a user of its own. Set `MANAGED_WORKERS=false` instead if every tenant is served by standalone workers.

`APPS_URL` gives apps written as code an address of their own: `fly certs add apps.<your domain>`. Without it they are not served.

Migrations run when the new machine starts, before it listens. The health check holds traffic until `/api/v1/healthz` returns 200, which it does once the machine listens. The check is on liveness and not on `/api/v1/readyz`: readiness answers 503 while the object store cannot be reached, and with one machine a failing check makes the whole instance unreachable, though the console, the API and scripts still work. Watch `/api/v1/readyz` from your own monitor.

Fly does not restart a machine whose health check fails: the check only decides where traffic goes. The instance protects its machine instead:
- Scripts are held to the machine's run slots (`RUN_SLOTS`).
- No worker takes more work below the memory floor (`RUN_MEMORY_FLOOR_MB`).
- If memory still runs low, the largest script is stopped.

`swap_size_mb` in `fly.toml` gives the machine room to slow down rather than stall. Size the machine with [Sizing and scaling](/docs/self-host/explanation/running/sizing-and-scaling) in the documentation, served at `/docs` on the instance.

The database matters as much as the app. A `shared-cpu-1x` Postgres has burst credit for a while, then a fraction of a core, and every tenant's queries slow down together. Give it a `performance` CPU, or use Fly Managed Postgres, for anything past a trial.

## Verify

```sh
curl https://<app>.fly.dev/api/v1/readyz
curl https://<app>.fly.dev/api/v1/instance
```
