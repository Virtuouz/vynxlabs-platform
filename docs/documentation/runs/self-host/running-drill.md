# Run log: the self-host drill (pages of `self-host/*/running/`)

- Commit `14f7d5b9`, branch phase-31-write-the-docs. The image was built from a clean copy made with `git archive HEAD` : `docker build -t volvel/volvel:docs .` (about 5 minutes; the base image `node:24-slim` and the packages came from the internet for this step). Image size 905 MB.
- Stacks, all with names and ports of my own, none of them the dev stack or the instance on 8091:
  - `p31host`: `deploy/compose/compose.yaml` copied to a scratch folder, `.env` made from `.env.example`, `VOLVEL_IMAGE=volvel/volvel:docs`, `VOLVEL_BIND=127.0.0.1:18480`, `PUBLIC_URL=http://localhost:18480`, bootstrap admin `ops@example.com`.
  - `p31restore`: the restore target, port 18481, same `.env` (same keys) without the bootstrap lines.
  - `p31worker`: `deploy/worker/compose.yaml` with an added `networks:` block that joins the network `p31restore_execution`.
- All three were taken down with `down -v` at the end (see the last section).

## Install (page: how-to/running/install-with-compose, build-the-image)
1. `docker compose -p p31host up -d --wait`: Postgres, object store and control plane healthy; the worker host was unhealthy and restarting. Its log: "MANAGED_WORKER_USERS must be a whole number from 1 to 60000." After that was set: "MANAGED_WORKER_UID must be a positive whole number." After the three of `MANAGED_WORKER_UID`, `_GID` and `_USERS` were written into `.env`, `up -d --wait` returned with all four healthy, and the worker host logged "worker host started ... uid 10001, gid 10001, users 256" and "this machine's share ... slots 96". The first start logged "created the first operator admin". PRODUCT FAULT: the shipped Compose file passes the three as empty strings and the worker host (`packages/worker/src/host-bin.ts:49-61`) takes `""` as set (`??` does not treat it as missing), so a `.env` made from `.env.example` leaves the worker host failing. The page tells the reader to write the three defaults and says what happens without them.
2. `GET /api/v1/readyz`: `{"status":"ready","checks":{"database":{"ok":true,"readOnly":false,"latencyMs":2},"objectStore":{"ok":true}}}`. `GET /api/v1/instance`: `coreVersion 0.5.0`, `migrationLevel 99`, `mail false`.
3. Signed in as `ops@example.com` through the API (`/api/v1/auth/sign-in/email`). The console was not opened for this drill: the page's step 5 (the browser) was not followed.

## Seed for the backup
As the operator: `POST /tenants` (`restoretest`), an access grant (tenant admin, 240 minutes), a production workspace `main`, a table `pets` (`PUT .../resources/pets`), three rows, one uploaded file `hello.txt` (28 bytes).

## Backup (page: back-up-an-instance)
`docker compose stop worker-host control-plane`; `pg_dump -U platform --no-owner -Fc platform` through `exec -T postgres` (349,258 bytes); `docker compose stop objectstore`; `tar czf` of the volume `p31host_objectstore` with `docker run postgres:18` (5,405 bytes). The page's order differs a little: it stops only the object store and does not stop the control plane before the dump.

## Restore (page: restore-an-instance)
1. A fresh project `p31restore`: `up -d --wait postgres`; `create objectstore`; `tar xzf` into `p31restore_objectstore`.
2. First attempt with `pg_restore --no-owner --exit-on-error`: stopped at `CREATE POLICY rows ON ws_..t_pets TO vxd_...` ("role ... does not exist"); the database then held 1 member and tables without policies. Not used.
3. Second attempt on a fresh database (`down -v`, again from step 1) with `pg_restore -U platform -d platform --no-owner`: 5 errors, all "role vxd_... does not exist" (1 CREATE POLICY, `GRANT USAGE ON SCHEMA vx`, `GRANT USAGE ON SCHEMA ws_...`, `REVOKE ALL/GRANT ALL ON FUNCTION vx.claim()`, `GRANT SELECT,... ON TABLE ws_...t_pets`); final line "pg_restore: warning: errors ignored on restore: 5"; exit 1. 1 member, 1 tenant, 1 data table were in.
4. `up -d --wait`: control plane log "database is up to date" (migration level 99), "row policies now read the signed claim" (`tables: 1`), "control plane started".
5. As `ops@example.com` with the earlier password: `/instance` 200; `/tenants` listed `restoretest`; rows of `pets` read (3); `GET .../files` listed `hello.txt`; its content read "hello from the restore drill"; `POST` of a new row 201.
Not run: a restore under another database name (covered by `restore.test.ts`), a restore with a rotated key, a dedicated database.

## Rotate the master key (page: rotate-the-master-key)
On `p31restore`, one replica. New key made with `openssl rand -base64 32`.
1. `.env`: new as `MASTER_KEY`, old as `MASTER_KEY_SECONDARY`; `up -d --wait`. `GET /instance/master-key`: `masterKey 8474c020c234fdfd`, `secondaryKey 1735f617d0eec999`, `instance secrets` counted under current 1 and secondary 0, `unopened []`, `secondaryRemovable true`. The value had moved at start.
2. `exec control-plane node dist/main.js rekey`: printed the two fingerprints, `rewrapped` all 0, `current` instance secrets 1, `unopened []`; exit 0.
3. `MASTER_KEY_SECONDARY` emptied; `up -d --wait`: `secondaryKey null`; file content and a row insert still worked.
4. `stop worker-host control-plane`; `run --rm --no-deps -T control-plane node dist/main.js rekey --data-role`: output with `"dataRole": "changed"` and, on stderr, "The data role's seed is changed. Restart every replica now: until it is, it cannot read tenants' tables."; exit 0. `up -d --wait`; file read and row insert worked.
5. `rekey` with a random `MASTER_KEY`: listed the `data-role` instance secret under `unopened`. A start with a random `MASTER_KEY`: "boot failed", error "Unsupported state or unable to authenticate data", exit 1.
Not run: several replicas; a tenant with a secret of its own (the `tenant keys` count was 0 in this tenant, which had no secret).

## recover-operator (page: recover-an-operator)
With a session of `ops@example.com` held: the command through `run --rm --no-deps -T` printed "ops@example.com is an enabled operator admin. Its password is now: ..." (24 characters) and "Sign in with it and change it. Every earlier sign-in of that account has ended." Then the held session answered 401, the old password was refused (401), and the new password signed in (`/tenants` 200). An unknown email: "Recovery failed: No account on this instance has the email nobody@example.com.", exit 1. No email: "Say whose account: node dist/main.js recover-operator <email>". An unknown word: "frobnicate is not a command." plus usage.
Not run: recovering an account that was disabled, or that had lost its operator binding.

## Commands (page: reference/running/commands)
`check-config` with a good environment: "The settings are valid."; with `PUBLIC_URL=x` only: "Invalid configuration:" and seven lines; exit 1. `check-config` with `SMTP_URL` alone: "SMTP_URL and MAIL_FROM must be set together."; `TRUSTED_PROXIES=eleven`: "TRUSTED_PROXIES has an entry that is not a network: eleven."; `MANAGED_WORKERS=maybe`: "MANAGED_WORKERS must be host, process or false." `migrate`: "The database is up to date, at level 99."

## Standalone worker (page: run-a-standalone-worker)
`POST /tenants/<id>/worker-credentials` `{name, pool: "plant"}` answered 201 with `token`; written to `worker-token`. `docker compose -p p31worker up -d --wait` (the Compose file of `deploy/worker`, plus a `networks:` block) became healthy; log "worker started ... url http://control-plane:8080". `GET /tenants/<id>/workers` listed it with `managed:false`, `version 0.5.0`, `outdated:true` (see Findings). The reader's `VOLVEL_URL` in the page is the public address; here it was the service name on the shared network.

## Emergency stop and read-only (pages: stop-triggers-and-clear-a-backlog, run-on-a-read-only-database)
- `GET /instance/triggers`: `paused:false`. `PUT {"paused":true}` 200, then `paused:true`. `PUT {"paused":false}` 200. Not run: a webhook refused, a schedule held, `TRIGGERS_PAUSED`, `volvel runs cancel`, the **Cancel N queued** button.
- `alter database platform set default_transaction_read_only = on`, then `restart control-plane`: log "the database takes no writes: its disk may be full. Serving reads only; the queue and background work start when writes come back"; `readyz` `readOnly:true`; a sign-in answered 503 `{"code":"read_only","detail":"The database is taking no changes for now: its disk may be full, or it ..."}`. Resetting needed `PGOPTIONS="-c default_transaction_read_only=off"` for `psql`, since `psql` itself was read-only. After the reset, `readyz` showed `readOnly:false` within 10 seconds and the log read "the database takes writes again: starting the queue and background work"; reads then a write (201) worked about 15 seconds after the reset.

## Metrics
`GET /api/v1/metrics` as the operator answered 200; its `# TYPE` lines were the 16 series of the generated metrics reference. Not run: a scrape with `METRICS_TOKEN`.

## Findings (not on the pages as working)
- Compose: the three empty worker-user variables, above.
- The generated metrics reference says the series are served "at `/metrics`", and the page here says `/api/v1/metrics`, which is the path that answered.
- `SECURITY.md` says the address to write to is "to be set by the owner"; D61 decided GitHub private reports and 3 working days.
- `GET /tenants/<id>/workers` said `outdated:true` for a worker that reported the same version as the instance (0.5.0).
- `pg_restore --no-owner` of a dump taken as the page says exits 1 with 5 errors by design of the data role, which a reader will read as a failure; the page says so.

## Teardown
At the end: `docker compose -p p31worker down -v`, `-p p31restore down -v`, `-p p31host down -v`; the scratch folders hold `.env` files of throwaway keys.

## Second check (2026-11-23)

Multiple runs added by the second agent: a proxy (node), SMTP (node sink), OTLP (node receiver), Postgres 16 to 18, two-replica rotation, AUTH_SECRET change, CLI emergency stop, read-only with a member, a dedicated database, a non-superuser database owner, a standalone worker with a pool. Not run: Caddy/nginx, a real SMTP server, Fly, a second machine for the offline transfer, a Postgres 17 image, an external object store. Findings: change-auth-secret wrongly said end users sign in again; the object-store refusal does not name the store; operators under a grant get 503 on a read-only database.
