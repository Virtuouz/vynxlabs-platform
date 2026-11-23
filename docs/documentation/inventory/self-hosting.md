# Inventory: self hosting

**Refreshed 2026-11-23** (branch `phase-30-docs-system`, after phase 29). Read from the code as it is now, not from `270e509`. What changed in this brief:
- Section A is now a table of collection, Diátaxis type, purpose and sources. The "From SH lines" column is gone: `docs/self-hosting.md` (SH) has been edited since, so its sources are named by heading. Pages added: commands, recover an operator, restore, change `AUTH_SECRET`, upgrade Postgres, install offline, reverse proxy (with `TRUSTED_PROXIES`), standalone worker credential. `monitoring` and `opentelemetry` now say the series are `volvel_`.
- Section B is corrected to the code: `HOST`, `PORT`, `LOG_LEVEL`, `TRUSTED_PROXIES`, `CONSOLE_DIR`, `MANAGED_WORKER_USERS`, `WORKER_EGRESS_ALLOW`, `VOLVEL_WORKER_CONCURRENCY` and `--token-file` added; metric prefix `volvel_`; migration level 97; one worker host user per worker; Fly settings.
- Section D (wrong or stale) and E (bugs) are settled: each row now cites where phase 29 fixed it, or says it is still open. Section C keeps what is still true.
- Not verified: I ran nothing (no image, no container, no database) and made no request to the internet. Constants in "Workers" (20 s, 25 s, 24 h, 60 s, 30 s heartbeat, 3 s grace, nice 10, RSS +64 MB) and the 5-per-caller stream limit I did not re-read; they are carried over from the earlier reading. The restore, Postgres-upgrade and offline-install steps in SH were written from code and never drilled (HOST-28). The Fly worker group has never run. `config-vars.ts` declares 58 settings by my count (55 in `CONFIG_VARS`, 3 in `WORKER_VARS`), not 59.
- The old disclosure about a Docker Hub request is dropped: it was made in the earlier reading; this refresh made none.

Abbreviations: `cp` = `apps/control-plane/src`, SH = `docs/self-hosting.md`, W = `packages/worker/src`. "(inferred)" marks a conclusion I did not prove.

## A. Pages (collection Self-host, `packages/docs/content/self-hosting/`)

Today `packages/docs/content` has `build configure data instance operate start tenant` and no `self-hosting` folder; the settings reference is generated (`packages/docs/generators/reference.mjs:10,113,319` writes `reference/settings` from `CONFIG_VARS` and `WORKER_VARS`), so do not copy the variables into prose: link to it.

Wiring:
- Add the collection to the root `index.md` `pages`; each folder needs an `index.md` with `pages`. Every page must be opened by the console or linked from another page (`packages/docs/check.mjs:80-94`).
- Vocabulary in the pages: Volvel, canceled (the metric label still reads `cancelled`: `volvel_runs_finished_total`, SH:597), Deploy and Versions, access changes. SH:5 still says "Vynxlabs" and SH:3 "Last updated: 2026-11-12"; `deploy/fly/README.md:3` says "Vynxlabs-run instances". Fix when splitting.

| # | Page | Type | Purpose | Sources |
|---|---|---|---|---|
| 1 | index | explanation | What an instance is; what to read first | SH "What an instance is" |
| 2 | architecture | explanation | One image, three programs, two networks, the background loop | Dockerfile; compose.yaml header; SH "What an instance is", "Workers the instance starts" |
| 3 | requirements | reference | Postgres 16+ (CI tests 16 and 18, `ci.yml:20`), Node 24 image, 2 GB, object-store rights | SH "Installing on one machine"; `cp/storage.ts:42-57` |
| 4 | install-compose | tutorial | First install on one machine, first sign-in | SH "Installing on one machine"; `deploy/compose/.env.example` |
| 5 | reverse-proxy-and-addresses | how-to | TLS proxy, headers, `TRUSTED_PROXIES`, `APPS_URL`, hostnames | SH "Before anyone else can reach it", "Apps, and the addresses..."; `cp/app.ts:103-117` |
| 6 | postgres | how-to | Your own Postgres: role, `pg_trgm` optional, no transaction poolers | SH "Using your own Postgres or object store" |
| 7 | object-store | how-to | Own S3 store; rights; path style; region | same; `cp/storage.ts` |
| 8 | settings | reference | Link to generated `reference/settings`; explain the groups and the compose-only variables | `config-vars.ts`; `deploy/compose/.env.example` |
| 9 | commands | reference (new) | `check-config`, `migrate`, `rekey [--data-role]`, `recover-operator <email>`, `--help`; exit codes | `cp/commands.ts:11-37`; `cp/main.ts:19-33,64-141` |
| 10 | managed-workers | explanation + how-to | `host`, `process`, `false`; `own` and `same`; the worker host's capabilities | SH "Workers the instance starts"; `cp/kernel/execution/isolation.ts`; `compose.yaml` |
| 11 | standalone-workers | how-to | Run your own worker with `--token-file`; the compose file | SH "Workers in another network"; `deploy/worker/compose.yaml`; `W/bin.ts:23-36` |
| 12 | sizing-and-scaling | explanation | Run slots, memory floor, connection budget, replicas | SH "Sizing: what one machine runs...", "Sizing: the database"; `W/machine.ts` |
| 13 | dedicated-databases | how-to | A tenant's own database | SH "A database of a tenant's own" |
| 14 | secrets-and-keys | explanation | Master key, what is sealed, `AUTH_SECRET` | SH "Rotating the master key"; `cp/kernel/rekey.ts` |
| 15 | rotate-master-key | how-to | One replica or many; `rekey`; `rekey --data-role` | SH "Rotating the master key"; `cp/main.ts:64-99` |
| 16 | change-auth-secret | how-to (new) | What signing out everyone means | SH "Changing `AUTH_SECRET`" |
| 17 | egress-and-offline | explanation | `EGRESS_ALLOW` (the instance) against `WORKER_EGRESS_ALLOW` (scripts); never calls home | SH "It never calls home", "What the instance reaches for a tenant"; `config-vars.ts:292-297,331-336` |
| 18 | install-offline | how-to (new) | Image transfer, no internet | SH "Installing where there is no internet" |
| 19 | mail | how-to | `SMTP_URL`, `MAIL_FROM`, approval mail, capture folder | SH "Approval mail", "Trying mail without a mail server" |
| 20 | backup | how-to | What to back up; `pg_dump --no-owner` is a backup (D59) | SH "Backups"; `fixed/host.md` HOST-01 |
| 21 | restore | how-to (new) | Restore under the same or another database name; policies are rebuilt at first start | SH "Restoring an instance"; `cp/restore.test.ts` |
| 22 | upgrades | how-to | Upgrade, roll back by restore, newer-database refusal | SH "Upgrading"; `packages/db/src/migrate.ts` |
| 23 | upgrade-postgres | how-to (new) | Major version | SH "Upgrading Postgres to a newer major version" |
| 24 | retention | reference | Four settings, bounds, audit log | SH "Retention", "The audit log"; `cp/config.ts:137-141` |
| 25 | monitoring | how-to + reference | Scrape, health probes, the series table | SH "Metrics"; `cp/routes/execution.ts`, `cp/kernel/metrics.ts` |
| 26 | opentelemetry | how-to | Endpoint, headers, protocol | SH "OpenTelemetry"; `cp/config.ts:273-296` |
| 27 | load-and-emergency-stop | how-to | Backlog limit, `TRIGGERS_PAUSED`, read-only database | SH "When the database takes no writes", "When work piles up" |
| 28 | recover-operator | how-to (new) | Locked out of the instance (D3) | `cp/commands.ts:29-31`; `cp/main.ts:101-125`; `cp/kernel/bootstrap.ts` |
| 29 | security-hardening | explanation | What is and is not protected; checklist | `SECURITY.md` |
| 30 | fly | how-to | An example, not a supported topology (D59) | `deploy/fly/README.md`, `fly.toml` |
| 31 | troubleshooting | reference | Symptom to cause | SH "When something is wrong" |
| 32 | versions-support-licences | reference | Version policy, licence, publish status | D62; `SECURITY.md`; `.github/workflows/release.yml`; `scripts/check-licenses.mjs` |

Not here, link instead: moving a tenant (SH "Moving a tenant": `tenant/export`, `instance/import`); end users, single sign-on, SCIM, branding, groups, environments (SH sections of the same names) belong to the Administer and Console collections.

Removed from the earlier list: nothing is gone, but "security-hardening" no longer cites SH lines. Deliberately not built, say so: container sandboxing of scripts (D1 puts it later; no bubblewrap anywhere in the code); a Kubernetes or ECS topology (D59: Compose is supported, Fly is an example); an email address for security reports (D61: GitHub private reports, 3 working days; but `SECURITY.md` still says the owner will set the address, so it needs changing). (The instance's audit log does have a CSV export: `GET /api/v1/audit-export`, `routes/identity.ts:1343`, built for INS-28 by lane sweep-server.)

Keep an SH redirect stub, or update its references: `packages/manifest/src/name.test.ts:21`, `apps/console/src/screens/Execution.tsx:1354`, `Dockerfile:42`, `deploy/compose/.env.example:28`, `README.md:7,100,116`.

## B. What to cover

**Architecture**
- One image (`Dockerfile`): `volvel-start dist/main.js` (port 8080, user `node`; `deploy/image/volvel-start` runs it on `node-cp`, a copy of node holding `CAP_SETUID` and `CAP_SETGID`, or on plain node when the container may not switch users), `volvel-worker-host`, and the standalone worker `node node_modules/@volvel/worker/dist/bin.js` (`deploy/worker/compose.yaml`). The image sets `CONSOLE_DIR=/app/console` and `SCREENS_DIR=/app/screens`.
- Compose has two networks, `data` (database and store; only the control plane joins) and `execution` (control plane and worker host) (`compose.yaml:1-9`).
- Postgres schemas: public, `pgboss`, `vx` (signed claim), `ws_<32 hex>` (from the earlier reading).
- S3 prefixes seen: `files/`, `flow-runs/`, `branding/`, `audit/`, plus bundles, assets and payloads (earlier reading).
- Background work: each step has its own timer and "still going" flag, every 2 s, on every replica, never run twice at once; one past 60 s is logged as late (`cp/kernel/execution/background.ts:29,56-82,100-139`; HOST-07). Steps: schedules, lost runs, dead runs, tasks, flows, expired sign-ins, health, retention, master key, managed workers.

**Startup** (`cp/main.ts`, `cp/writer.ts`)
1. Command word read first: `--help`, `help`, an unknown word (exit 2) cost nothing (`main.ts:12-21`).
2. Config; every problem listed together, exit 1; `check-config` stops here (`main.ts:35-41`).
3. Migrate (`migrate` command stops here); read-only check; queue start unless read-only.
4. Build app; for `rekey` and `recover-operator`, run and exit.
5. Ensure bucket, then (writable) bootstrap admin, rekey if rotating, data-role setup, listen, then `startWriting` (`main.ts:145-171`).
6. Only then `writer.watch`, which rechecks writability every 10 s (`writer.ts:11,86-96`). Read-only databases listen and wait (`main.ts:155-161`).

**Requirements**
- Node 24 image (`node:24-slim`); CI tests Postgres 16 and 18 only (`ci.yml:20`); the release job rehearses on 18.
- Database owner + CREATEROLE. `pg_trgm` optional (`0049`, earlier reading). Migration `0012` creates a server-wide role `platform_data` (earlier reading; no current production use found).
- S3: HeadBucket, Get, Put, Delete; CreateBucket only when HeadBucket says 404; any other answer fails boot (`cp/storage.ts:41-51`). No List. Timeouts: connect 5 s, request 60 s (`storage.ts:30`).
- 2 GB to start. The control plane needs no persistent disk.

**Configuration**: the settings are `cp/config-vars.ts`; the reference page is drawn from it. Facts a page must get right (`cp/config.ts`):
- **Required:** `PUBLIC_URL`, `DATABASE_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AUTH_SECRET` (at least 32 chars), `MASTER_KEY` (32 bytes base64). In compose, `WORKER_HOST_TOKEN` is also required (`compose.yaml`), because compose defaults to `host`.
- **Address:** `HOST` 0.0.0.0, `PORT` 8080 (1-65535), `LOG_LEVEL` info (`fatal, error, warn, info, debug, trace, silent`), `DOCS_URL`. Compose does not pass `HOST`, `PORT`, `MAIL_CAPTURE_DIR`, `CONSOLE_DIR` or `SCREENS_DIR`; it passes every other `CONFIG_VARS` name (HOST-11; `compose-vars.test.ts`). `fly.toml` sets `HOST = "::"`.
- **Network:** `TRUSTED_PROXIES` default `1` (a hop count, or networks, comma separated; `0` for an instance reached directly), `EGRESS_ALLOW`.
- **Database:** `DATABASE_POOL_SIZE` 10, `DATA_POOL_SIZE` 10 (both 2-500), `DATA_TENANT_CONNECTIONS` max(2, pool/3) (1-500), `DATA_STATEMENT_TIMEOUT_MS` and `SQL_STATEMENT_TIMEOUT_MS` 15000 (1000-600000).
- **Files:** `S3_ENDPOINT`, `S3_REGION` us-east-1, `S3_FORCE_PATH_STYLE` true.
- **Secrets / first start:** `MASTER_KEY_SECONDARY`, `METRICS_TOKEN` (at least 32), `BOOTSTRAP_ADMIN_EMAIL` and `_PASSWORD` (together; password at least 12).
- **Apps:** `APPS_URL` (host must differ from `PUBLIC_URL`), `APPS_ON_CONSOLE_ADDRESS` false.
- **Workers:** `MANAGED_WORKERS` default `process` in code, `host` in compose (`true` reads as `process`); `WORKER_HOST_TOKEN` (at least 32, needed for `host`); `MANAGED_WORKER_USER` `own` or `same`; `MANAGED_WORKER_UID` and `_GID` 10001 (the first of a range); `MANAGED_WORKER_USERS` 256 (1-60000; new: a worker host runs no more workers at once); `MANAGED_WORKERS_MAX` (1-1000) twice the slots; `RUN_SLOTS` (1-1000); `RUN_MEMORY_FLOOR_MB` (0-1000000).
- **Limits:** `SCHEDULE_BACKLOG_LIMIT` 200 (0 = none), `TRIGGERS_PAUSED` false.
- **Mail:** `SMTP_URL` and `MAIL_FROM` together; `MAIL_CAPTURE_DIR`.
- **Retention days:** `RETENTION_RUNS_DAYS` 30, `_EVENTS_` 30, `_REFUSALS_` 7 (each 1-3650), `_AUDIT_` 400 (90-3650) (`config.ts:137-141`).
- **Telemetry:** `OTEL_EXPORTER_OTLP_ENDPOINT`, `_HEADERS` (a malformed value is listed with the other problems: HOST-16), `_PROTOCOL` (`http/json` only), `OTEL_SERVICE_NAME` volvel, `OTEL_TRACES_EXPORTER` and `OTEL_METRICS_EXPORTER` (`none`), `OTEL_METRIC_EXPORT_INTERVAL` 60000 (at least 1000), `METRICS_WORKSPACE_LABELS` true.
- **Image:** `CONSOLE_DIR`, `SCREENS_DIR`; the image sets both.
- **Worker host and standalone worker** (`config-vars.ts` `WORKER_VARS`; `W/bin.ts`, `W/host-bin.ts`): `VOLVEL_URL`; `VOLVEL_WORKER_TOKEN`; `WORKER_EGRESS_ALLOW` (empty by default; needs `NET_ADMIN`; not `EGRESS_ALLOW`: D20). Standalone worker flags `--url`, `--token`, `--token-stdin`, `--token-file <path>` (new: a Compose or Docker secret), `--concurrency` (4; `VOLVEL_WORKER_CONCURRENCY`), `--idle-exit` (`VOLVEL_WORKER_IDLE_EXIT`); `VOLVEL_WORKER_MACHINE` is internal. Worker host flags `--url`, `--run-slots`, `--memory-floor`, `--max-workers`, each also a variable; it reads `MANAGED_WORKER_UID`, `_GID`, `_USERS`, `MANAGED_WORKERS_MAX`.
- **Compose-only:** `COMPOSE_PROFILES` (`postgres,objectstore` in `.env.example`; without it neither bundled service starts), `POSTGRES_PASSWORD`, `OBJECTSTORE_SECRET`, `VOLVEL_BIND` (127.0.0.1:8080), `VOLVEL_IMAGE`; worker compose: `VOLVEL_URL`, `VOLVEL_WORKER_CONCURRENCY`, `VOLVEL_WORKER_IDLE_EXIT`, secret file `./worker-token`.

**Commands** (`cp/commands.ts`): `check-config` (exit 0 valid, 1 not; opens nothing), `migrate` (exit; instance does it itself at start), `rekey [--data-role]` (exit 1 if a value opened with neither key; `--data-role` changes the data role's seed, audited `instance.data_role_rekeyed`; stop every replica first and restart all after), `recover-operator <email>` (enables the account, makes it an operator admin, prints a new password once, ends its earlier sign-ins; exit 2 without an email). Run as `node dist/main.js <word>` or `volvel-start dist/main.js <word>`. Not in SH yet: `check-config`, `migrate`, `recover-operator`.

**Isolation** (`isolation.ts:5-13`)
- Modes: `host`, `isolated`, `shared`, `unable`, `off`.
- `process` + `own` starts a managed worker only for tenants whose code only the operator writes, when the container cannot switch users or `own` is set; `same` lifts that (`supervisor.ts:251-262`).
- **Worker host (D1, HOST-03, HOST-04):** each live worker has its own uid and gid (lowest free of the range from `MANAGED_WORKER_UID`) and a `0700` directory that is its `HOME`, `TMPDIR` and cwd, removed at exit. The host needs `SETUID`, `SETGID`, `CHOWN`, `DAC_OVERRIDE`, `KILL`, `NET_ADMIN` (`compose.yaml`; the Fly and compose files differ); it says at start when it lacks `CAP_KILL`. Stopping: 30 s drain, SIGKILL, give up after 10 s ("a worker could not be stopped and is left running"); compose `stop_grace_period: 60s`. Proved as root in a container (`fixed/host.md`, table): workers cannot read, write, list or signal each other or the host. An image was never built for this.
- Firewall: `deploy/image/volvel-worker-host`; IPv6 forms of private addresses (mapped, NAT64, 6to4, Teredo, site-local) are refused too (HOST-18). The control plane's address and the name servers, IPv4 and IPv6, are open.
- A host whose `MANAGED_WORKERS` is not `host` says so once and asks again every 30 s (HOST-19).
- **No sandbox exists** (bubblewrap named nowhere in the code). One process per attempt with a memory limit (earlier reading: RSS ceiling `memoryMb`+64, checked every 500 ms; nice 10; 3 s abort grace; `W/worker.ts:129`).

**Workers** (earlier reading, not re-read): leases wait 20 s (max 25), credential 24 h (`supervisor.ts:67`), idle exit 60 s (`supervisor.ts:213`), one managed worker per tenant. "Alive" is 90 s (`WORKER_STALE_SECONDS`, `cp/kernel/execution/workers.ts:213`).

**Sizing** (`W/machine.ts`)
- Memory is the smaller of `/proc/meminfo` and the container's cgroup limit (v2, then v1), "available" being the limit less what the container holds (HOST-24; `machine.ts:52-81`). This replaces the old gotcha that slots come from the host's memory.
- Slots (MB−512)/160, min 2; floor max(128, 10%) (setting descriptions in `config-vars.ts`). The SH figure "1 GB gives 3" is now reasoned from the container's limit (`machine.test.ts`, "a container held to 1 GB": slots 3).
- Connections per replica: `DATABASE_POOL_SIZE` + `DATA_POOL_SIZE` + 3 (2 queue, 1 listener) (SH "Sizing: the database"). Each tenant on a dedicated database now also holds a per-tenant share on that database (INS-25); a lone tenant has at most `DATA_TENANT_CONNECTIONS` requests open there.
- A standalone worker still has no floor and no slots.

**Keys:** the instance's own sealed values are in the places `rekey.ts` lists; tenants' secrets are sealed with tenant keys and a rotation never touches them. Status `GET /instance/master-key`. The data role's password and claim key come from a seed that was the first master key; `rekey --data-role` now changes it (D19).

**Egress:** the instance reaches, for a tenant, an identity provider's metadata, a Git remote, a data source, an OAuth token address and a hostname check, through the guard (`cp/kernel/egress.ts`); `EGRESS_ALLOW` opens networks and names for these only. Scripts are held by the worker host's firewall and `WORKER_EGRESS_ALLOW`. Timeout 10 s, 5 redirects (earlier reading).

**Health:** `/api/v1/healthz` (the process), `/api/v1/readyz` (database and store, 3 s each; `readOnly`, `latencyMs`; `routes/health.ts:24,64-93`), `/api/v1/instance` (public: version, migration level). Probes and `/metrics` are not traced (HOST-29). Compose health checks: control plane on `readyz`; worker host by `volvel-host-alive` file age under 90 s; standalone worker `volvel-worker-alive`.

**Limits:** file 25 MB (`kernel/data/files.ts:21`), bundle 20 MB (`bundles.ts:21`), import 50 GB (`routes/portability.ts:24`), streams 5 per caller (earlier). Hooks held 25 s; SSE heartbeat 20 s (earlier). Rate limits are in the database, shared by every replica: sign-in, sign-up, password and mail paths 20 a minute per address and path; guests' page renders 600 a minute per address; files with an extension other than `.html` 1200 a minute in memory per process (`fixed/host.md` HOST-05; `fixed/host2.md` HOST-21).

**Metrics** (`cp/routes/execution.ts`, `cp/kernel/metrics.ts`; D55): every series is `volvel_` now. Gauges: `runs_queued`, `runs_running`, `queue_oldest_seconds`, `workers{kind}`, `workspace_runs_queued{tenant,workspace,pool}`, `workspace_queue_oldest_seconds`, `flow_runs{state}`, `tasks_queued{kind}`, `machine_running{machine}`, `db_pool{pool,state}`, `database_size_bytes`, `database_read_only`, `memory_available_bytes`, `memory_total_bytes`. Counted per replica: `runs_finished_total`, `run_duration_seconds`, `run_queue_wait_seconds`, `flow_runs_finished_total`, `webhook_refusals_total`, `alerts_total`, `http_requests_total`, `http_request_duration_seconds`. All of these names are in SH "Metrics" now; `metric-names.test.ts` scrapes and checks every name. The label for a canceled run reads `cancelled`: say so, once.

**OTel:** 2000 spans held, batches of 200, 2 s flush, 10 s timeout (earlier, not re-read). The worker decodes OTLP headers like the control plane (HOST-17). Managed workers do not get the instance's OTEL settings (earlier; not re-checked).

**Versions (HOST-13, HOST-14):** `scripts/release-version.mjs` now writes one version into the published packages, control plane, console, worker, `SDK_VERSION`, `CORE_RANGE` and the CLI starter range, so the image reports the released version. Every package is 0.5.0 in the tree. Migration level 97 (`packages/db/migrations` ends `0097_yaml_folder_in_force.sql`); checksums and the newer-database refusal in `migrate.ts`; oldest bundle core 0.2.0 (`cp/kernel/execution/deploy.ts:161`); tenant import needs an equal migration level. `docs/contracts/worker-protocol.md` still says "Added in 0.6.0/0.7.0": numbers no version has (owner's choice at first release).

**Licences and publishing:** Apache-2.0 "pending legal review" (earlier); allowlist `scripts/check-licenses.mjs`. `release.yml`: a tag `v*` publishes `@volvel/widgets, markup, docs-engine, docs, ui, app, sdk, cli` under `latest` and the image `volvel/volvel:<version>` and `:latest`; a push to `main` publishes `<base>-next.<commit>` under `next`; nothing is published unless the variable `RELEASE_ENABLED` is `true`; it needs `NPM_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, and tells the website repository when `DOCS_SITE_REPOSITORY` is set. There are no git tags and the changelog says "Unreleased"; the first publish date is not set (D62). Say the image and packages are not published yet, and document building from source (`docker compose` builds locally when `VOLVEL_IMAGE` is not set).

**Fly** (`deploy/fly/README.md`, an example, D59): `fly.toml` sets `HOST = "::"` (`.internal` is IPv6), `processes = ["app"]`, `kill_timeout = 60`; the `workers` group is added by the reader (`volvel-worker-host --url http://<app>.internal:8080`) and must run as root. Not proved: whether Fly runs that group as root while the image says `USER node` (HOST-06 left this open); no image was built. README line 3 says "Vynxlabs-run instances".

## C. Gotchas

- `trustProxy` now follows `TRUSTED_PROXIES` (default `1`; `app.ts:103-117`). With the default and no proxy a caller can still write the last forwarded entry: set `TRUSTED_PROXIES=0` for an instance reached directly. The proxy must overwrite `X-Forwarded-For`, `-Host` and `-Proto`, and block direct access (`X-Forwarded-Host` still picks the place when the peer is trusted, `kernel/apps/hosts.ts`).
- Unrecognized hostnames act as the console address (`hosts.ts:91-96`).
- Cookies are Secure by the `PUBLIC_URL` scheme (`kernel/auth.ts:115`); app sign-ins by request protocol.
- `MAIL_CAPTURE_DIR` overrides SMTP.
- `sslmode=require` verifies certificates in this pg version; `no-verify` disables that (earlier reading).
- Transaction poolers will not work (inferred: LISTEN, session advisory locks, sign-in by swapping user and password).
- The data role's name comes from the database name; the password and claim key from the sealed seed. Rotating the master key does not change them; `rekey --data-role` does (stop all replicas first).
- A wrong `MASTER_KEY` fails boot when the seed cannot be opened.
- Firewall rules resolve names once, at the host's start.
- Standalone workers have no slots, floor or memory guard (HOST-24 left that alone).
- `rate_limit` is an unlogged table (`0046_rate_limit.sql`), and now counts sign-in, so it matters for restore and for a crash.
- A compose `.env` without `COMPOSE_PROFILES=postgres,objectstore` starts no database (HOST-10, HOST-11).
- Existing compose files need `CHOWN`, `DAC_OVERRIDE` and `KILL` on the worker host, or no worker starts.
- An existing standalone `.env` with `VOLVEL_WORKER_TOKEN` must move it into the `worker-token` file.
- Scripts reach nothing private unless `WORKER_EGRESS_ALLOW` lists it.

## D. Settled: what was wrong, stale or missing in the first reading

Source for each: `fixed/host.md`, `fixed/host2.md`, `fixed/t4-instance-host.md`; the brief's numbering is kept.
1. Compose passed only some variables: fixed (HOST-11); now every `CONFIG_VARS` name but five is passed.
2. `EGRESS_ALLOW` text: fixed (HOST-20, D20); `config-vars.ts:292-297` is right, and `WORKER_EGRESS_ALLOW` exists.
3. Host ignores `MANAGED_WORKERS_MAX`: host now reads it (`host-bin.ts`, `--max-workers`).
4. Sign-in limits: now database-counted for members and portal pages (HOST-05, HOST-21); keep the exception (static files by extension counted in memory).
5. Connections `+3`: fixed in SH:300.
6. Password from master key: SH now says the seed; `rekey --data-role` changes it (D19).
7. "Last minute" is 90 s: SH metrics say 90 seconds.
8. Metrics omissions: SH lists `database_read_only` and `memory_total_bytes`.
9. "Leave the bundled services out": profiles (HOST-12).
10. "1 GB gives 3": reasoned from the container limit (HOST-24).
11. Fly worker host: changed (HOST-06); the root question stays open.
12. SECURITY.md text: HOST-25 done in text. Open: it has no reporting contact and says the owner will set one, but D61 decided GitHub private reports and 3 working days.
13. README: HOST-26 done in text (`alias volvel=`, no "phase 6").
14. Worker compose environment credential: fixed, `--token-file` and a Compose secret (HOST-27).
15. Missing guide sections: restore, Postgres major upgrade, `AUTH_SECRET`, offline install and the object store's needs are written, not drilled (HOST-28). Support policy: D62.

## E. Findings, settled

| First reading | Outcome |
|---|---|
| 1 policies after restore | Fixed: HOST-01, HOST-02 (`fixed/host.md`), real drill and `restore.test.ts` |
| 2 `main.ts` timer and a second loop | Fixed: HOST-08, HOST-09 (`writer.ts`) |
| 3 versions | Fixed: HOST-13, HOST-14 |
| 4 probes traced | Fixed: HOST-29 |
| 5 malformed OTLP header | Fixed: HOST-16, HOST-17 |
| 6 compose grace and host health check | Fixed: HOST-10 (60 s, `init`, healthcheck) |
| 7 hung background step | Fixed: HOST-07 (own loop each; late after 60 s, never twice) |
| 8 questions | Answered: D59, D61, D62, D19; hardening of Kubernetes and ECS is not offered |
| new | HOST-03 (a user for each worker), HOST-04, HOST-05, HOST-18, HOST-19, HOST-27, INS-10, INS-15, INS-25, INS-28 |

Still open, mention in the page or the owner's list: a drill of restore, Postgres major upgrade and offline install; the Fly `workers` group's user; `fixed/t4-instance-host.md` notes `guide.test.ts` series test (INS-29) and `docs-apps.test.ts` failed on their branches (not checked since).

## F. Diagrams and runbooks

- **Diagrams:** two-network topology with trust boundaries; boot sequence (section B); lease to run lifecycle; request-to-address decision; multi-replica key rotation; connection budget; backup set; worker host users and directories.
- **Runbooks:** first install; Caddy and nginx configs (SSE, forwarded headers, 25 s hooks, overwriting the three headers); external Postgres role SQL; backup and a **tested** restore drill (`pg_dump --no-owner`); upgrade and restore-based rollback; key rotation (1 or N replicas) and `rekey --data-role`; changing `AUTH_SECRET`; recover a locked-out operator; disk full; growing queue; emergency stop (`TRIGGERS_PAUSED`); no worker starting (capabilities `CHOWN`, `DAC_OVERRIDE`, `KILL`); adding a standalone worker with `--token-file`; air-gapped image transfer; Postgres major upgrade; hardening checklist; alert rules on `volvel_` series.
