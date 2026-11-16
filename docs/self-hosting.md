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
| `MASTER_KEY` | `openssl rand -base64 32`. Wraps every tenant's encryption key. **Keep a copy somewhere safe.** Without it no stored secret can be read again. It can be rotated: see "Rotating the master key" |
| `PUBLIC_URL` | The address people will type, for example `https://platform.example.com` |
| `WORKER_HOST_TOKEN` | `openssl rand -hex 32`. Lets the worker host, which starts tenants' workers, ask for work |
| `APPS_URL` | A second hostname for apps written as code, for example `https://apps.example.com`. Optional, but without it they are not served |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | The first operator. At least 12 characters. Remove both after the first start |
| `PLATFORM_BIND` | Where it listens on the host. Default `127.0.0.1:8080` |

```sh
docker compose -f deploy/compose/compose.yaml up -d --wait
```

The database is created and migrated on the first start. Open the address, sign in as the first operator, and create a tenant.

### Before anyone else can reach it

- Put a reverse proxy that terminates TLS in front of it. The control plane speaks plain HTTP and listens on localhost by default for that reason.
- Set `PUBLIC_URL` to the address behind the proxy. Sign-in checks requests against it.
- Let the proxy pass the run event stream through as it comes. The console keeps one long request open per tab, `GET /api/v1/tenants/<id>/stream`, answered as `text/event-stream`. The response says `X-Accel-Buffering: no`, which nginx honors; elsewhere, turn response buffering off for that path, and allow an idle time of at least 30 seconds (a heartbeat is sent every 20). A stream that a proxy cuts or holds back costs nothing but freshness: the console falls back to asking every few seconds. Apps open the same stream on the apps' address, for the runs their users started, so the same applies there.
- Each replica holds one more database connection than its pool, to listen for changes to runs.
- Give apps written as code their own address with `APPS_URL`. See [Apps, and the addresses they are served at](#apps-and-the-addresses-they-are-served-at).
- If the instance runs in a cloud, check that the worker host started with its firewall rules: its log says so. See [Workers the instance starts](#workers-the-instance-starts).
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
- **`MASTER_KEY`**: once, somewhere that is not the same disk, and again after each rotation, with the old one kept for older backups.

Take the Postgres and object store backups close together. A database that names a file the store does not have will say so when the file is asked for, and not before.

A tenant can also be backed up by itself, as an export. See below.

## Rotating the master key

`MASTER_KEY` wraps one key per tenant, and seals a few things of the instance's own: database locations' addresses, the instance's identity providers' secrets, sign-ins in progress, and the seed of the data role's password. Tenants' secrets and credentials are sealed with their tenant's key, so rotating the master key rewraps only those few values, in seconds even on a large instance.

The instance can hold a second key, `MASTER_KEY_SECONDARY`. It opens what either key sealed, and seals only with `MASTER_KEY`. While the second key is set, the instance seals again with `MASTER_KEY` whatever the second key sealed: at start, every ten minutes, and when asked with `docker compose exec control-plane node dist/main.js rekey` (from a source checkout, `node apps/control-plane/dist/main.js rekey`), which prints what it did and exits 1 if a value opened with neither key.

With one replica:

1. Generate the new key: `openssl rand -base64 32`. Keep it with the old one.
2. Restart with the new key as `MASTER_KEY` and the old one as `MASTER_KEY_SECONDARY`. The values move at start.
3. `GET /api/v1/instance/master-key`, as an operator, says `secondaryRemovable: true` when nothing is left under the old key.
4. Restart without `MASTER_KEY_SECONDARY`.

With several replicas, a replica that knows only the old key cannot open what a replica with the new one has sealed. Add the new key before using it:

1. Restart every replica with the old key as `MASTER_KEY` and the **new** one as `MASTER_KEY_SECONDARY`. Nothing moves yet; every replica can now open both.
2. Restart every replica with the two swapped. Values move to the new key as replicas start, and the ten-minute pass catches any sealed meanwhile by a replica not yet restarted.
3. When the status says `secondaryRemovable`, restart without the second key.

The data role's password does not change in a rotation: it is made from a secret kept in the database, which was the master key the instance had when it upgraded to this version, and is sealed with whichever key is current.

**Backups taken before a rotation need the old key.** Keep each key for as long as the backups it sealed. A value no key opens is reported by the status and the `rekey` command, by place and row, and never changed.

## Retention

History is removed once it is older than its period. A pass runs every ten minutes, on one replica at a time, and removes a little at a time so that nothing waits on it.

| Kind | Default | Variable | Shortest | Longest |
| --- | --- | --- | --- | --- |
| Runs: script runs and flow runs, after they end, with their logs, steps and stored inputs and outputs | 30 days | `RETENTION_RUNS_DAYS` | 1 | 3650 |
| Events | 30 days | `RETENTION_EVENTS_DAYS` | 1 | 3650 |
| Refused webhook requests and SCIM pushes | 7 days | `RETENTION_REFUSALS_DAYS` | 1 | 3650 |
| The audit log | 400 days | `RETENTION_AUDIT_DAYS` | 90 | 3650 |

A tenant's admins can set the tenant's own periods under Retention, within the same bounds. A flow run is removed whole, with everything it started, once all of it has ended and its top run is past the period. A run still going is never removed.

### The audit log

The audit log is kept a month to a partition (`audit_entry_y2026m11`), made three months ahead. A month is removed only when it is older than every tenant's period, and only after it is exported to the object store:

```
audit/2025-07/manifest.json          rows, parts, and the sha256 of each part
audit/2025-07/part-0001.jsonl.gz     up to 50,000 entries, one JSON object a line
```

A tenant with a shorter period sees no further back in its log or its export, though the month is kept for others. Deleting a tenant does not delete its entries: they leave with their months.

To read an exported month back into the database, as a table of its own beside the log:

```sh
aws s3 cp --recursive s3://<bucket>/audit/2025-07/ ./audit-2025-07/
gunzip -c ./audit-2025-07/part-*.jsonl.gz > audit-2025-07.jsonl
psql "$DATABASE_URL" <<'SQL'
create table audit_restored_2025_07 (like audit_entry);
create temporary table lines (line jsonb);
-- CSV with characters no line holds as quote and delimiter: each line is read as it is.
\copy lines from 'audit-2025-07.jsonl' with (format csv, quote e'\x01', delimiter e'\x02')
insert into audit_restored_2025_07 select (jsonb_populate_record(null::audit_entry, line)).* from lines;
SQL
```

Compare the row count with `manifest.json`. A restored table is not part of the log, and is not removed by the next pass: drop it when done.

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

To run a tenant's scripts next to systems the instance cannot reach, run a worker there. A worker only makes outbound HTTPS requests to the instance, so nothing has to be opened toward it.

1. In the console, on the tenant's Workers page, create a credential. Give it a pool, for example `plant`, if only some scripts should run there.
2. In the tenant's repository, give those scripts `worker: "plant"`.
3. On the machine in that network:

```sh
cp deploy/worker/.env.example deploy/worker/.env    # the image, the instance's address, the credential
docker compose -f deploy/worker/compose.yaml up -d
```

A script that names a pool runs only on a worker of that pool. A script that names none runs on the workers the instance starts. To have a tenant run nothing on the instance at all, choose "Run only on our own workers" on its Workers page.

A run that is waiting with no worker connected that could take it says so on its page.

A worker's credential is best handed to it on its standard input, `platform-worker --url … --token-stdin < credential`, rather than in `PLATFORM_WORKER_TOKEN` or `--token`. A script's process runs as the worker's own user, and that user can read a process's environment and command line. Whatever way it arrives, the credential is never given to the process a script runs in.

## Workers the instance starts

For a tenant with work and no worker of its own, the instance starts one. Each attempt of a script runs in a process of its own, ended at its time limit or when canceled, and limited to the script's `memoryMb` (512 by default). How much one machine runs at once is under "Sizing" below.

Where those workers run is set by `MANAGED_WORKERS`.

### `host`: in a worker host (the default in `deploy/compose`)

A worker host is the same image, started as `platform-worker-host`, in a container of its own. It asks the control plane for a tenant with work, gets a credential for it, and starts a worker with it, as `vxrun` (uid and gid 10001). The compose file puts it on a network, `execution`, with the control plane and nothing else of the instance's: the database and the object store are on another network, `data`, which it is not on. A tenant's script can reach the control plane and the internet, and not the database, the object store, or the control plane's environment.

The host runs as root in its container, holding only `CAP_SETUID` and `CAP_SETGID`, to start workers as `vxrun`, and `CAP_NET_ADMIN`. With `NET_ADMIN` it adds firewall rules at start that refuse `vxrun` loopback, private and link-local addresses, cloud metadata among them, other than the control plane and the container's name servers. Without it, it says so in its log, and only the network keeps workers from the instance's services: block `169.254.169.254` at the machine if the instance runs in a cloud. The rules are made once, at start, for the control plane's address then; restart the worker host if the control plane's container is recreated with another address.

The control plane and the host share a secret, `WORKER_HOST_TOKEN` (`openssl rand -hex 32`, at least 32 characters). The host never gives it to a worker.

### `process`: beside the control plane

Without a worker host, the control plane starts workers itself, on its own machine and its own network. They can reach whatever the control plane reaches, so it starts them only for tenants whose code only the operators write. A tenant whose code is written by anyone else, a member or a group with `code:write` who holds no instance-wide role, or any service account, gets none, and its Workers page says it runs on standalone workers only. `true`, from before there was a worker host, means `process`.

These workers run as `vxrun` too, where the container may switch users, so that a script can neither read the control plane's environment nor signal it. The control plane runs on a copy of node, `node-cp`, that may switch users, and workers run on plain node, which may not. Switching users needs the container's `CAP_SETUID` and `CAP_SETGID`, which Docker gives by default. Without them the image starts the control plane on plain node, says so, and workers run as the control plane's own user.

This is the mode for development, and for a single site where only the operator writes code.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MANAGED_WORKERS` | `process` (`host` in `deploy/compose`) | `host`, `process`, or `false` to start none |
| `WORKER_HOST_TOKEN` | | What the worker host presents. Required with `host` |
| `MANAGED_WORKER_USER` | `own` | In `process` mode: `own` runs workers as their own user; `same` as the control plane's, for every tenant, by which you say everyone who writes code works for you. Only for development, or a site where that is so |
| `MANAGED_WORKER_UID`, `MANAGED_WORKER_GID` | `10001` | The user and group workers run as. The worker host reads them too |

Rate limits on webhooks, sign-ins and guests are counted in the database, so they hold across every replica. Each tenant has at most one managed worker at a time, however many replicas or worker hosts run.

### Sizing: what one machine runs at once

Every attempt of a script is a process of its own. A machine that runs scripts, whether the control plane's in `process` mode or a worker host's, shares **run slots** between all its workers and tenants:
- The scripts running there never go past its slots.
- While other tenants are waiting, no tenant takes more than its share.
- Work past that waits in the queue, and nothing fails for it.

On top of the slots:
- No worker takes more work while the machine's free memory is below its **memory floor**.
- If free memory still falls under a twentieth of it, the largest script is stopped and its run fails with "The script was stopped: the machine ran low on memory." Its retries apply.
- A script is held to its `memoryMb`: all the memory it holds, Buffers and native memory included, plus 64 MB for Node itself. Past that its run fails with "The script ran out of memory".
- Scripts run at a lower CPU priority than the control plane and the workers, so the console stays quick under heavy scripts.

| Variable | Default | Meaning |
| --- | --- | --- |
| `RUN_SLOTS` | From memory: one per 160 MB past the first 512 MB, at least 2 | Scripts running at once on this machine. 1 GB gives 3, 2 GB gives 9, 4 GB gives 22 |
| `RUN_MEMORY_FLOOR_MB` | A tenth of memory, at least 128 | Free memory below which no worker here takes more work. 0 turns the check off |
| `MANAGED_WORKERS_MAX` | Twice the run slots | In `process` mode, managed workers alive at once. A worker waiting for a slot costs little; one per tenant with work is what lets tenants take turns |

The worker host takes the same settings, as `--run-slots`, `--memory-floor` and `--max-workers` or from the same variables.

Plan on 2 GB for a machine that runs the control plane and scripts together. Give the database a dedicated CPU for anything past a trial: on a shared CPU it runs at full speed only until its burst credit is spent, and then every tenant's queries slow down together.

`/api/v1/metrics` reports `platform_machine_running`, the scripts running on each machine, and `platform_memory_available_bytes`, this replica's free memory. Alert on a queue that keeps growing (`platform_queue_oldest_seconds`) rather than on full slots: full slots are the limit doing its work.

### Sizing: the database

Every tenant's table requests on the platform database share one pool of connections per replica. Each tenant has a share of it:
- A tenant's requests past its share wait their turn, so one tenant's slow searches leave the others room.
- After 5 seconds of waiting, a request is answered 503 with `Retry-After`, never 500. Nothing was done, so it is safe to try again.
- `@vynxlabs/app` and scripts try again by themselves, twice.

Every data request has a time limit. Past it, the statement is stopped and the request is answered 422 `too_slow`, saying to narrow the filter or add an index. Totals keep their own limit of 5 seconds.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_POOL_SIZE` | 10 | Connections for the platform's own work, per replica |
| `DATA_POOL_SIZE` | 10 | Connections for every tenant's table requests, per replica |
| `DATA_TENANT_CONNECTIONS` | A third of `DATA_POOL_SIZE`, at least 2 | Table requests one tenant may have open at once, per replica |
| `DATA_STATEMENT_TIMEOUT_MS` | 15000 | How long one data request may take |

Each replica opens up to `DATABASE_POOL_SIZE + DATA_POOL_SIZE + 2` connections; keep their total across replicas under the database's `max_connections`. A tenant on a dedicated database has that database's connections to itself and no share. `platform_db_pool{pool,state}` in the metrics shows each pool's open, idle and waiting connections: a `waiting` above 0 that does not go away means a pool too small, or a database too slow.

### When the database takes no writes

A managed Postgres turns itself read-only when its disk is nearly full. The instance keeps serving what reads alone can:
- `/readyz` stays 200 and reports `"readOnly": true`, so the load balancer keeps sending traffic.
- Tables, runs and the console can be read by members who are already signed in and by API keys.
- Changes, new sign-ins and new runs are answered 503 `read_only`, with `Retry-After`.
- The queue, schedules and managed workers stop.

The instance checks every 10 seconds, and starts them again on its own once the database takes writes. A connection opened while it took none keeps refusing writes until it is renewed: connections are renewed each minute, so writes come back within about a minute.

It also starts in this state: migrations are checked by reading alone when there are none to apply. An upgrade that brings migrations still needs a database that takes writes.

Watch the database's disk, and alert well before it is full. `platform_database_size_bytes` in the metrics tracks the platform database's size. On Fly, extend the volume with `fly volumes extend`.

## What the instance reaches for a tenant

The control plane reaches a few addresses a tenant chooses: an identity provider's settings and endpoints, a Git remote, a data source, the token address of an OAuth connection, and a hostname the tenant registers, to check it. It refuses any whose address is loopback, private, link-local (cloud metadata included), shared or reserved, and says so. Everything else a tenant's systems are asked, such as posting a failure alert or trying a connection, a worker does.

To let it reach an internal Git server, an identity provider or a database on your network, list them in `EGRESS_ALLOW`, comma-separated, as networks or host names:

```sh
EGRESS_ALLOW=10.20.0.0/16,git.internal,192.168.1.40
```

A name in the list is allowed whatever it resolves to. A network is allowed for any name that resolves into it.

### OAuth connections

An OAuth 2.0 connection is authorized once by a member in the console, and the instance keeps its tokens and refreshes them. Two things follow for the operator:
- **The provider sends members back to one address,** `<PUBLIC_URL>/api/v1/oauth/connections/callback`. Each app a tenant registers with Google, Microsoft or another provider must list it, so `PUBLIC_URL` must be the address members' browsers use. The connection wizard shows it.
- **The control plane calls the provider's token address,** to exchange the code and to refresh. It goes through the guard above: a provider inside your network must be listed in `EGRESS_ALLOW`.

Workers are handed the current access token, never the refresh token or the client's secret.

## Moving a tenant

A tenant can be taken out of an instance at any time, and brought into another. This is also how a tenant moves between a shared instance and a dedicated one, and between the cloud and a site.

### Export

A tenant's own admin can do this. An operator cannot, without an access grant the tenant can see.

```sh
export PLATFORM_EXPORT_PASSPHRASE='a long passphrase'
platform tenant export --tenant acme --out acme.tar --history
```

Or in the console, under the tenant's Export page.

The file holds everything the tenant has. Its secrets stay encrypted, and the key travels wrapped with the passphrase, which is not stored anywhere. Pass the passphrase on separately from the file.

The passphrase protects the secrets, not the whole file. The tenant's rows, files, audit log and, with `--history`, every run's input and output are in it as plain JSON. Treat the file like a database backup: keep it where access is controlled, and encrypt it yourself if it has to travel. The format is described in [contracts/tenant-export.md](contracts/tenant-export.md).

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

## Apps, and the addresses they are served at

An app is a tenant's own interface, built from its repository and served by the instance. There are three kinds of address, and an instance can use all of them at once.

### By path, on the instance's address

With nothing configured, a tenant's sign-in pages are at `PUBLIC_URL/portal/<tenant>/`, and an app made in the App Builder at `PUBLIC_URL/apps/<tenant>/<workspace>/<app>/`. An app written as code is not served there: its page says the instance has no address for apps. Its code would otherwise run at the same address as the console, where a member who opens it is already signed in.

Set `APPS_URL`, below. Or, where everyone who writes code works for you, as on a single machine on a plant network, set `APPS_ON_CONSOLE_ADDRESS=true` to serve apps written as code at `PUBLIC_URL` too, knowingly.

### A second address for every app

Set `APPS_URL` to another hostname that reaches the same instance, for example `https://apps.example.com` beside `https://platform.example.com`. Then:

- apps and sign-in pages are served only there, at the same paths. The instance's own address sends anyone who asks for one over;
- the console is not served there, and members cannot sign in there;
- a member's console session is never sent there. Staff who open an app are carried over by a code that works once, and get a sign-in for that tenant's apps only.

This is the setting to use for an instance with more than one tenant. Point the second name at the same proxy, and give the proxy a certificate for it.

### A hostname of the tenant's own

A tenant's admin can register a hostname for one app under **Domains**, such as `portal.acme.com` or `orders.acme.internal`. The app is then at that name's root.

1. **Point the name at the instance.** A CNAME to the instance's hostname, or an address record. For a name that exists only inside a network, an entry in that network's DNS.
2. **Give the proxy a certificate for it.** The platform issues none and never sees one.
   - On Fly.io: `fly certs add portal.acme.com --config deploy/fly/fly.toml`, then create the records it asks for.
   - Behind Caddy: add the name to the site's addresses and Caddy gets the certificate itself.
     ```
     platform.example.com, apps.example.com, portal.acme.com {
       reverse_proxy 127.0.0.1:8080
     }
     ```
   - Behind any other proxy: add the name and its certificate there. For an internal name, a certificate from the network's own authority.
3. **Show that the name's owner agrees.** The Domains page gives a TXT record to create, `_vx-challenge.<hostname>`. Create it and press Check. This stops one tenant on a shared instance from claiming a name that belongs to another.
4. **Enable it.**

An operator can enable a name without the TXT record. That is for a name with no public DNS, where the operator knows whose it is. It is recorded in the audit log.

The proxy must pass the `Host` header through unchanged, and say whether the request came over HTTPS (`X-Forwarded-Proto`), which Caddy and Fly.io both do. Cookies are marked secure when it did.

### What reaches what

| At | The console | The API | A member's console session | Apps |
| --- | --- | --- | --- | --- |
| `PUBLIC_URL` | Yes | All of it | Counts | By path, unless `APPS_URL` is set. Apps written as code only with `APPS_ON_CONSOLE_ADDRESS=true` |
| `APPS_URL` | No | All of it, by API key or app sign-in | Ignored | By path |
| A registered hostname | No | That tenant only | Ignored | The one app, at the root |

## End users

A tenant's end users are its customers and portal users. They are a pool of the tenant's own, apart from members, and the same email in two tenants is two people. Staff add them under **End users**, which makes a link that works once: whoever opens it chooses the password.

- **Mail is optional.** Set `SMTP_URL` and `MAIL_FROM` and the instance sends invitations and reset links itself. Without them it sends nothing, the person who made the link is shown it to pass on, and "Forgot your password" tells people to ask.
- **Sign-up** is off. A tenant's admin can turn it on under **Branding**.
- **What they can reach** is decided by bindings, like everything else: bind the built-in `portal_user` role to `end_users`, or to one end user, at an app and at the tables it shows. A table's owner rule then keeps each person to their own rows. An end user never holds more than what apps use, whatever they are bound to.
- **Files have no owner.** Whoever may read files in a workspace may read all of them, so `portal_user` does not include them.

Someone who is not signed in reaches only what is bound to `anonymous`, and is limited in how often they may ask. The limit is counted by address, in each replica.

## Approval mail

When a flow waits for an approval and the instance sends mail (`SMTP_URL` and `MAIL_FROM`), each member who may decide it is sent a mail with a link of their own: the members of the tenant who hold `approval:write` in the workspace and, when the step names groups or roles, are among them. Suspended and disabled members are not mailed, nor is an operator inside the tenant on an access grant. At most fifty are mailed for one step; the rest see it in the console.

What a link is:
- **The approver's own, and enough by itself.** It opens a page with what is asked and Approve and Reject, with no sign-in. Opening it decides nothing, so a mail scanner that fetches links does no harm. A forwarded link can be used, once, by whoever holds it: it decides as the approver it was sent to.
- **Used once,** and only until 48 hours have passed, the step's own timeout comes, or anyone decides the approval, by link or in the console. Then every link to it stops working.
- **Checked again when used.** A member suspended, or no longer allowed to decide, since the mail went out is refused.

The decision is recorded as that member's, with the comment, `via: "email"` in the audit log, and "decided from the mail" in the console's Approvals.

### Trying mail without a mail server

`MAIL_CAPTURE_DIR=/some/folder` writes each message the instance would send to a file there instead, readable, and sends nothing. The instance says so in its log when it starts. It is for development and tests, never for an instance people use: the files hold one-time links.

## Groups, attributes and row rules for end users

End users have groups of their own, under **End-user groups**. Bind a role to a group once instead of to each person. An end user also has attributes, such as `customer_id`, edited from their row under **End users**.

A table's rows can be ruled by both. Under a table's **Row rules**, say who may read or change a row: everyone, the person a column names, people in the group a column names, or people whose attribute equals a column. **See it as** shows the rows as one end user sees them.

## Apps made in the console

A member can build an app over a workspace's tables with no code, under **Apps made here** in a dev workspace: tables, cards, charts, totals and forms, where choosing a row in one decides what another shows. It is published by deploying, promoted to production like anything else, and then shared from **Apps** with a group or with every end user.

- **Who may build.** Give the built-in role `app_maintainer`. Its holder builds and deploys these apps and nothing else: no script and no flow.
- **Who sees what.** Sharing gives the app and its tables. Which rows each person sees is decided by each table's row rules, so one app can show two groups different rows. Leaving a value off a screen does not keep it from someone who may read the row.
- **Dashboards** are a member's own pages, under **Dashboards** in any workspace: saved without a deploy, private unless shared read-only with the workspace.
- **The image carries the app that draws them.** `SCREENS_DIR` says where it is, and is set in the image. An instance run from source finds it after `pnpm build`. Without it, such an app says it cannot be shown.

## Mail, forms and webhooks that tenants run

A tenant sends mail through its own mail server. It sets up an `smtp` connection in a workspace, with the server's name, port, security and the address mail is sent from, and the password as the connection's secret. A worker makes the connection, so the mail server must be reachable from where workers run. The instance's own `SMTP_URL` is not used for this.

A flow or a script can be started by a form. The platform serves the form at `/portal/<tenant>/forms/<token>`, or under `/_/forms/` at a hostname of the tenant's own. Anyone with the address can send it unless the form asks for a sign-in, so it is limited like the portal's other forms: twenty a minute for each visitor and tenant. The address is shown with the workspace's triggers to whoever holds `trigger:write`.

A flow can answer the webhook that started it. Such a request is held open for up to 25 seconds, so a proxy in front of the instance must not cut requests to `/api/v1/hooks/` shorter than that. If the flow has said nothing by then the caller is answered 202, and the flow carries on.

Code that tenants write, connectors and trigger sources included, runs on workers and never in the control plane.

## Single sign-on

A tenant's admin connects an identity provider under **Single sign-on**, for members or for end users, over OIDC or SAML. Operators connect one for themselves under **Instance**. The instance needs nothing new to run, and makes outbound requests to the provider: to read an OIDC provider's settings and keys, and to read SAML metadata when given an address for it.

1. **Connect.** Give the OIDC issuer, client ID and client secret, or the SAML metadata as an address or pasted. The provider is created off.
2. **Enter the addresses at the provider.** The console shows them with a button to copy each: the redirect address for OIDC; the reply address, entity ID and metadata address for SAML. They never change for a provider.
3. **Try it.** A try-out opens the provider, signs nobody in, and shows what the provider sent and what would happen.
4. **Prove a domain.** A provider of members signs in only people whose email is in a domain proved with a DNS TXT record, the same record a hostname uses. A provider of end users needs none.
5. **Turn it on.** The console's sign-in asks for the email first and offers the provider by the email's domain. A tenant's sign-in page shows a button for each provider of end users.

Worth knowing:

- **People are found by the provider's own identifier,** never by email after the first sign-in. Send a name ID or subject that lasts.
- **Creating people is off** until turned on for a provider. A new member can be given a default role. Without one they sign in and see nothing.
- **Groups follow the provider.** Map a group the provider sends to a group here, and membership of mapped groups is set on every sign-in. Groups that are not mapped are left alone.
- **Requiring single sign-on** refuses passwords for the people a provider covers. Members bound at the instance, the operators, keep their passwords, so that a broken provider locks nobody out for good. Keep one such account.
- **SAML requests are signed** with a key made for each provider, unless that is turned off. SHA-1 signatures and sign-ins begun at the provider are refused unless turned on for a provider.
- **Encrypted assertions** are opened when the provider wraps the key with RSA-OAEP and MGF1 (`rsa-oaep-mgf1p`) and the SHA-1 digest. Keycloak's defaults differ: set the client's key transport algorithm and digest. The certificate to encrypt to is in the metadata only when **Ask the provider to encrypt assertions** is on.
- **An imported tenant's providers are paused.** Give the provider's administrator this instance's addresses, prove the domains again, and save the provider.
- **Not built:** single logout, and one provider shared by several tenants.

### Provisioning (SCIM)

A provider can also push the people and groups it holds, and say when someone has left, without waiting for them to sign in. Under a provider's **Provisioning** tab, copy the address, make a token, and give both to the provider as its SCIM 2.0 base address and bearer token. The address is `/api/v1/scim/v2/<provider>` on the instance's own address, so the provider must be able to reach the instance.

- **What a push does.** A pushed person is found by email or made: a member of the tenant with the provider's default role, or an end user. A member's email must be in a domain the provider has proved. An end user who already exists is taken over only on a proved domain, or when the provider's word on emails is taken.
- **When someone leaves.** The provider turns them off, or deletes them. An end user is disabled. A member is suspended in that tenant: they keep their account and whatever they hold in other tenants, and what they held here is kept for if they come back. For the instance's own provider the account is disabled everywhere, its sessions end at once and its API keys stop working. An account is never deleted by a push.
- **Tying a pushed person to their sign-in.** Say which pushed field holds the name the provider signs the person in by: `externalId` or `userName`. For Entra with OIDC that is usually `externalId` mapped to the object ID. With none chosen, a person's first sign-in ties them, under the rules for any first sign-in.
- **Groups.** By default groups come from what a sign-in says. A provider can instead be told that pushed groups decide, and to make a group here for each pushed group that nothing maps yet. The group map still says which pushed group is which group here, by name.
- **By hand.** A tenant admin can suspend and resume a member under **Members**, and an operator can disable and enable an account under **Instance**.
- **Limits.** Users and groups, with `userName`, `externalId`, `displayName` and `members` filters, and PATCH. No bulk, no password sync, no sorting, and no attributes for end users from a push. A member's email here does not change when the provider changes it.
- **Tested against** the request shapes Entra ID and Okta send, as recorded. It has not been run against a live tenant of either.

To try it locally, the development stack has Keycloak behind a profile, with a realm of two people, `ada` and `ben`, and an OIDC client `vynxlabs-platform` whose secret is `dev-only-oidc-secret`:

```
docker compose -f deploy/compose/compose.dev.yaml --profile sso up -d keycloak
```

The issuer is `http://localhost:8180/realms/acme`. For SAML, give `http://localhost:8180/realms/acme/protocol/saml/descriptor` as the metadata address, then in Keycloak import a client from the provider's metadata address shown in the console.

## Branding

A tenant sets its colors, corner radii, fonts and logo under **Branding**. They apply to its apps, its portal and its sign-in pages. A workspace can override them with a theme in its repository. Values are plain colors, lengths and font lists: nothing that could load a file from elsewhere.

The console keeps its own look whichever tenant is open. An operator brands it once for the instance under **Instance → Branding**, with a product name, a logo and the same tokens.

## Environments inside a tenant

- A dev workspace is linked to the workspace it promotes to. Promoting activates there the same bundle that runs here, without rebuilding it. `platform promote --preview` shows what would change first.
- A workspace can be cloned into a new dev workspace, with or without its rows and files. By default the clone gets no connection, data source or secret value and its triggers are paused, so it cannot act on a real system. Turning that safety off is recorded in the audit log.
- A workspace's triggers can be paused at any time.

## Metrics

`GET /api/v1/metrics` answers in the Prometheus text format, to an operator (`instance:read`). Scrape it with an API key of an operator's.

What waits, read from the database at each scrape, so every replica says the same:

| Series | What it is |
| --- | --- |
| `platform_runs_queued`, `platform_runs_running` | Runs waiting, and in progress, on the whole instance |
| `platform_queue_oldest_seconds` | How long the oldest due run has waited |
| `platform_workspace_runs_queued{tenant,workspace,pool}` | Due runs waiting, by workspace and pool |
| `platform_workspace_queue_oldest_seconds{tenant,workspace}` | The oldest wait, by workspace |
| `platform_flow_runs{state}` | Flow runs in progress: `running`, `waiting_approval`, `waiting_time` |
| `platform_tasks_queued{kind}` | Tasks waiting for a worker |
| `platform_workers{kind}` | Workers heard from in the last minute, `managed` or `standalone` |

What happened, counted by the replica that saw it. Each replica answers for its own; add them up across replicas, as Prometheus does with `sum`:

| Series | What it is |
| --- | --- |
| `platform_runs_finished_total{tenant,workspace,state}` | Script runs that ended: `succeeded`, `failed`, `cancelled` |
| `platform_run_duration_seconds{tenant,workspace}` | A histogram of how long runs took |
| `platform_run_queue_wait_seconds{tenant,workspace}` | A histogram of how long runs waited for a worker, from when they were due |
| `platform_flow_runs_finished_total{state}` | Flow runs that ended |
| `platform_webhook_refusals_total{reason}` | Refused webhook requests: `signature`, `body`, `paused` |
| `platform_alerts_total{outcome}` | Failure alerts `delivered`, `failed`, or `suppressed` as a repeat |

Workspaces are labeled by their slugs. On an instance with very many tenants, set `METRICS_WORKSPACE_LABELS=false`: the per-workspace queue series are left out, and the counted ones carry no tenant or workspace.

The Workers page of each tenant shows the same queue: what waits where, the oldest wait, and what each worker holds.

## When something is wrong

| What you see | What to look at |
| --- | --- |
| The container restarts on start | Its log. A missing or malformed setting is named there |
| `/api/v1/readyz` answers 503 | The body says whether Postgres or the object store is unreachable |
| "The database is newer than this version" | An older image was started on a newer database. Start the newer image |
| A tenant's tables answer 503 | Its dedicated database. See the Database locations page |
| Runs stay queued | The run's page says what it is waiting for, and the tenant's Workers page what waits where. Otherwise the instance log, for the worker it tried to start |
| An import is refused | The message names the reason: the passphrase, the version, a damaged file, or a slug already taken |
| An app's address answers "Nothing here" | Whether the workspace has a deployed bundle with that app, under the workspace's Apps tab |
| A registered hostname shows the console | It is not enabled, or the proxy rewrites the `Host` header |
| Staff sign-in from an app loops back to the console | The app's address is not `APPS_URL` or an enabled hostname of that tenant |
| Invitations are not arriving | `SMTP_URL` and `MAIL_FROM`, and the instance log, which names the address that could not be sent to |
