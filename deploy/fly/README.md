# Fly.io

Fly.io hosts the Vynxlabs-run instances. Nothing in the image is specific to Fly: it reads the same environment variables as every other deployment mode.

This setup has not been run yet. Treat the commands as a starting point and check them against the current Fly documentation.

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
  app = "platform-start dist/main.js"
  workers = "platform-worker-host --url http://<app>.internal:8080"
```

Size the `workers` machines for the scripts they will run. The worker host runs as root, to start each worker as `vxrun`. Set `MANAGED_WORKERS=false` instead if every tenant is served by standalone workers.

`APPS_URL` gives apps written as code an address of their own: `fly certs add apps.<your domain>`. Without it they are not served.

Migrations run when the new machine starts, before it accepts traffic. The health check holds traffic until `/api/v1/readyz` returns 200.

## Verify

```sh
curl https://<app>.fly.dev/api/v1/readyz
curl https://<app>.fly.dev/api/v1/instance
```
