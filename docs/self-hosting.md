# Running the platform yourself

Last updated: 2026-11-12

This guide is for whoever operates an instance: Vynxlabs, a client, or another agency. The same image runs everywhere. What differs between a shared instance, a dedicated one and an on-prem site is configuration, never the software.

## What an instance is

| Part | What it does | State it keeps |
| --- | --- | --- |
| Control plane | The API, the console, the scheduler, the queue and the flow engine. One image | None |
| Postgres 16 or later | Platform records, the queue, and tenants' custom tables | Everything except files |
| An S3-compatible object store | Bundles, uploaded files, large payloads | Files |
| Workers | Run tenants' scripts. The control plane starts them, or you run your own | None |

Back up Postgres and the object store, and keep the master key. That is the whole instance.

## Installing on one machine

You need Docker with Compose, and a machine with 2 GB of memory to start.

```sh
git clone <this repository> platform && cd platform
cp deploy/compose/.env.example deploy/compose/.env
```

Fill in `deploy/compose/.env`:

| Setting | What to put |
| --- | --- |
| `POSTGRES_PASSWORD`, `OBJECTSTORE_SECRET` | Long random values: `openssl rand -hex 24` |
| `AUTH_SECRET` | `openssl rand -hex 32`. Signs session cookies |
| `MASTER_KEY` | `openssl rand -base64 32`. Wraps every tenant's encryption key. **Keep a copy somewhere safe.** Without it no stored secret can be read again |
| `PUBLIC_URL` | The address people will type, for example `https://platform.example.com` |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | The first operator. At least 12 characters. Remove both after the first start |
| `PLATFORM_BIND` | Where it listens on the host. Default `127.0.0.1:8080` |

```sh
docker compose -f deploy/compose/compose.yaml up -d --wait
```

The database is created and migrated on the first start. Open the address, sign in as the first operator, and create a tenant.

### Before anyone else can reach it

- Put a reverse proxy that terminates TLS in front of it. The control plane speaks plain HTTP and listens on localhost by default for that reason.
- Set `PUBLIC_URL` to the address behind the proxy. Sign-in checks requests against it.
- Remove the two `BOOTSTRAP_ADMIN_` lines and restart.

### Using your own Postgres or object store

Leave the bundled services out and point the control plane at yours with `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_FORCE_PATH_STYLE`.

The Postgres user must own its database and be allowed to create roles (`CREATEROLE`). It does not need to be a superuser. The platform makes one extra role per database, which it signs in as for every request for a tenant's rows. That role owns nothing, so row policies apply to it, and nothing run under it can become the owner. Its password is derived from the master key and is never stored.

A managed Postgres with point-in-time recovery is the better choice for anything that matters.

## It never calls home

The platform makes no network call you did not configure: no telemetry, no update check, no license check. The connections it opens are to your Postgres, your object store, the systems a tenant has bound as connections or data sources, and nothing else. It runs with no route to the internet.

## Backups

- **Postgres**: everything. Use your provider's point-in-time recovery, or `pg_dump` on a schedule.
- **The object store**: bundles and files.
- **`MASTER_KEY`**: once, somewhere that is not the same disk.

Take the Postgres and object store backups close together. A database that names a file the store does not have will say so when the file is asked for, and not before.

A tenant can also be backed up by itself, as an export. See below.

## Upgrading

```sh
git pull
docker compose -f deploy/compose/compose.yaml up -d --build --wait
```

- Migrations run on start and move forward only. You can upgrade from any earlier version straight to the newest: the tests do exactly that from every earlier database level.
- There is no downgrade. Take a backup first, and go back by restoring it.
- Bundles that tenants deployed before the upgrade keep running, and can still be redeployed, promoted and rolled back to. Each version states the oldest bundles it still runs, and refuses older ones with a message that says to rebuild.
- Standalone workers should run the same version as the instance. Upgrade the instance first.

## A database of a tenant's own

A tenant's custom tables can live in a database other than the instance's. Its platform records, the queue and sign-in stay where they are.

1. Create an empty database, with a user that owns it and may create roles.
2. In the console, under Instance, Database locations, register it under a name with its connection string. The platform connects, prepares it, and stores the address encrypted with the master key.
3. Give the name when you create a tenant, or when you import one.

A tenant's location is chosen once. To move an existing tenant, export it and import it into the location you want.

If a dedicated database is down, the tenants in it get an error for their tables. Everything else, and every other tenant, keeps working. The Database locations page shows whether each one answers.

A deploy that changes tables in a dedicated database commits there first and in the instance database second. If the instance fails between the two, the workspace shows the earlier bundle while its tables are already changed. Nothing is lost. Deploy the bundle again and it completes.

## Workers in another network

To run a tenant's scripts next to systems the instance cannot reach, run a worker there. A worker only makes outbound HTTPS requests to the instance, so nothing has to be opened towards it.

1. In the console, on the tenant's Workers page, create a credential. Give it a pool, for example `plant`, if only some scripts should run there.
2. In the tenant's repository, give those scripts `worker: "plant"`.
3. On the machine in that network:

```sh
cp deploy/worker/.env.example deploy/worker/.env    # the image, the instance's address, the credential
docker compose -f deploy/worker/compose.yaml up -d
```

A script that names a pool runs only on a worker of that pool. A script that names none runs on the workers the instance starts. To have a tenant run nothing on the instance at all, choose "Run only on our own workers" on its Workers page.

A run that is waiting with no worker connected that could take it says so on its page.

## Moving a tenant

A tenant can be taken out of an instance at any time, and brought into another. This is also how a tenant moves between a shared instance and a dedicated one, and between the cloud and a site.

### Export

A tenant's own admin can do this. An operator cannot, without an access grant the tenant can see.

```sh
export PLATFORM_EXPORT_PASSPHRASE='a long passphrase'
platform tenant export --tenant acme --out acme.tar --history
```

Or in the console, under the tenant's Export page.

The file holds everything the tenant has. Its secrets stay encrypted, and the key travels wrapped with the passphrase, which is not stored anywhere. Pass the passphrase on separately from the file. The format is described in [contracts/tenant-export.md](contracts/tenant-export.md).

### Import

An operator of the instance it is going to does this. Both instances must be at the same version.

```sh
platform login --url https://new.example.com --token <an operator's API key>
platform tenant import acme.tar --location acme-db    # or leave --location out for the instance's own database
```

The whole file is checked before anything is written, and the tenant arrives entirely or not at all.

Then, on the new instance:

1. Sign in as one of the tenant's members. They have the passwords they had. Someone who already had an account there keeps that account and its password.
2. Create new API keys and worker credentials. They are never exported.
3. Point whatever calls the tenant's webhooks at the new address. The part after the host is unchanged.
4. Stop the tenant on the old instance: pause its workspaces' triggers there.
5. Resume the triggers of each workspace on the new instance. They arrive paused so that the two instances never both act.
6. When you are satisfied, delete the tenant on the old instance, from the tenant list. Its audit entries stay there.

### Promotion between modes

Every move between deployment modes is this same export and import. There is no other path, and none is needed.

## Environments inside a tenant

- A dev workspace is linked to the workspace it promotes to. Promoting activates there the same bundle that runs here, without rebuilding it. `platform promote --preview` shows what would change first.
- A workspace can be cloned into a new dev workspace, with or without its rows and files. By default the clone gets no connection, data source or secret value and its triggers are paused, so it cannot act on a real system. Turning that safety off is recorded in the audit log.
- A workspace's triggers can be paused at any time.

## When something is wrong

| What you see | What to look at |
| --- | --- |
| The container restarts on start | Its log. A missing or malformed setting is named there |
| `/api/v1/readyz` answers 503 | The body says whether Postgres or the object store is unreachable |
| "The database is newer than this version" | An older image was started on a newer database. Start the newer image |
| A tenant's tables answer 503 | Its dedicated database. See the Database locations page |
| Runs stay queued | The run's page says what it is waiting for. Otherwise the instance log, for the worker it tried to start |
| An import is refused | The message names the reason: the passphrase, the version, a damaged file, or a slug already taken |
