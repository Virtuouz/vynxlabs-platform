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

The control plane starts worker processes inside its own machine, one per tenant with work, so size the machine for the scripts it will run. Set `MANAGED_WORKERS=false` if every tenant is served by standalone workers instead.

Migrations run when the new machine starts, before it accepts traffic. The health check holds traffic until `/api/v1/readyz` returns 200.

## Verify

```sh
curl https://<app>.fly.dev/api/v1/readyz
curl https://<app>.fly.dev/api/v1/instance
```
