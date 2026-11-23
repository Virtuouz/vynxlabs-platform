# Inventory: self hosting

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

Abbreviations: `cp` = `apps/control-plane/src`, SH = `docs/self-hosting.md`. I ran nothing; everything is from reading code, and "(inferred)" marks conclusions I did not prove. **Disclosure:** to check publication I sent one unauthenticated HEAD request to Docker Hub with `volvel/volvel` in the URL. It put a project name in an outside request, which my instructions forbid. It returned 404; treat that as weak evidence.

## A. Pages (`packages/docs/content/self-hosting/`, in order)

Wiring:
- Add `self-hosting` to root `index.md` `pages`.
- Each folder needs an `index.md` with `pages`. Every page must be opened by the console or linked from another page (`packages/docs/check.mjs:80-94`).

| # | Page | From SH lines |
|---|---|---|
| 1 | index | 1-16 |
| 2 | architecture | 7-16, 186-206 |
| 3 | requirements | 20, 56-62, 238 |
| 4 | install-compose | 18-54 |
| 5 | reverse-proxy-and-addresses | 46-54, 360-407 |
| 6 | postgres | 56-62, 242-273 |
| 7 | object-store | 58, 114-139 |
| 8 | configuration (links `reference/settings`) | all variable tables |
| 9 | managed-workers | 186-215 |
| 10 | standalone-workers | 167-184 |
| 11 | sizing-and-scaling | 217-259 |
| 12 | dedicated-databases | 153-165 |
| 13 | secrets-and-keys | 76-99 |
| 14 | egress-and-offline | 64-66, 297-315 |
| 15 | mail | 413, 418-433 |
| 16 | backup-and-restore | 68-76 |
| 17 | upgrades | 141-151 |
| 18 | retention | 101-139 |
| 19 | monitoring | 523-567 |
| 20 | opentelemetry | 569-591 |
| 21 | load-and-emergency-stop | 261-295 |
| 22 | security-hardening | SECURITY.md |
| 23 | fly | `deploy/fly/*` |
| 24 | troubleshooting | 593-606 |
| 25 | versions-support-licences | new |

Move elsewhere:
- 317-358 (moving a tenant): `tenant/export`, `instance/import`
- 409-416, 435-448: `tenant/end-users`, `build/`
- 450-458: `configure/connections`, `operate/triggers`
- 460-499: `*/single-sign-on`
- 501-505: branding pages
- 507-515: configuration
- 517-521: `tenant/workspaces`

`instance/{databases,triggers,import,operators}`, `tenant/{workers,domains,export}` are one-line stubs; retention is nearly one.

Keep an SH redirect stub, or update its references: `packages/manifest/src/name.test.ts:21`, `apps/console/src/screens/Execution.tsx:1138`, `Dockerfile:42`, compose, fly and `.env*` comments.

## B. What to cover

**Architecture**
- One image: `volvel-start dist/main.js` (port 8080, user `node`), `volvel-worker-host`, and worker `node_modules/@volvel/worker/dist/bin.js` (`Dockerfile:35-66`).
- Postgres schemas: public, `pgboss`, `vx` (signed claim), `ws_<32 hex>`.
- S3 prefixes seen: `files/`, `flow-runs/`, `branding/`, `audit/`, plus bundles, assets and payloads.
- Background loop every 2 s on every replica: schedules, lost/dead runs, tasks, flows, sweep, health, retention, master key, supervisor (`cp/kernel/execution/background.ts:66-78`).

**Startup** (`cp/main.ts`)
1. Config; all problems listed together, exit 1.
2. Migrate.
3. Read-only check; queue start.
4. Build app; `ensureBucket`.
5. Bootstrap admin, rekey if rotating, data-role setup.
6. Listen, then background work.

Read-only databases listen and recheck every 10 s.

**Requirements**
- Node 24 image; CI tests Postgres 16 and 18 only.
- Database owner + CREATEROLE. `pg_trgm` optional (`0049`).
- Migration `0012` creates server-wide role `platform_data`; I found no current production use.
- S3: HeadBucket, Get, Put, Delete; CreateBucket only when HeadBucket says 404. A 403 fails boot (`cp/storage.ts:42-51`). No List.
- 2 GB to start. The control plane needs no persistent disk.

**Configuration** (`cp/config-vars.ts`, `cp/config.ts:133-389`)
- **Required:** `PUBLIC_URL`, `DATABASE_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AUTH_SECRET` (≥32 chars), `MASTER_KEY` (32 bytes base64).
- **Address:** `HOST` 0.0.0.0, `PORT` 8080, `LOG_LEVEL` info, `DOCS_URL`.
- **Database:** `DATABASE_POOL_SIZE` 10, `DATA_POOL_SIZE` 10 (both 2-500), `DATA_TENANT_CONNECTIONS` max(2, pool/3), `DATA_STATEMENT_TIMEOUT_MS` and `SQL_STATEMENT_TIMEOUT_MS` 15000 (1000-600000).
- **Files:** `S3_ENDPOINT`, `S3_REGION` us-east-1, `S3_FORCE_PATH_STYLE` true.
- **Secrets/first start:** `MASTER_KEY_SECONDARY`, `METRICS_TOKEN` (≥32), `BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` (together, ≥12).
- **Apps:** `APPS_URL` (host must differ from `PUBLIC_URL`), `APPS_ON_CONSOLE_ADDRESS` false.
- **Workers:** `MANAGED_WORKERS` process (`true` = process), `WORKER_HOST_TOKEN` (≥32, required for `host`), `MANAGED_WORKER_USER` own, `_UID`/`_GID` 10001, `MANAGED_WORKERS_MAX` 2×slots, `RUN_SLOTS`, `RUN_MEMORY_FLOOR_MB`.
- **Limits:** `SCHEDULE_BACKLOG_LIMIT` 200, `TRIGGERS_PAUSED` false.
- **Mail:** `SMTP_URL` + `MAIL_FROM` together; `MAIL_CAPTURE_DIR`.
- **Retention days:** `RETENTION_RUNS_DAYS` 30, `_EVENTS_` 30, `_REFUSALS_` 7, `_AUDIT_` 400 (90-3650).
- **Telemetry:** `OTEL_EXPORTER_OTLP_ENDPOINT`, `_HEADERS`, `_PROTOCOL` (http/json only), `OTEL_SERVICE_NAME` volvel, `OTEL_TRACES_EXPORTER`/`OTEL_METRICS_EXPORTER`=none, `OTEL_METRIC_EXPORT_INTERVAL` 60000 (≥1000), `METRICS_WORKSPACE_LABELS` true.
- **Network/image:** `EGRESS_ALLOW`, `CONSOLE_DIR`, `SCREENS_DIR`.
- **Worker** (`packages/worker/src/bin.ts`): `VOLVEL_URL`, `VOLVEL_WORKER_TOKEN`, `VOLVEL_WORKER_IDLE_EXIT`, `VOLVEL_WORKER_MACHINE` (internal), OTEL endpoint/headers/service/traces. Flags `--url --token --token-stdin --concurrency` (4) `--idle-exit`.
- **Host** (`host-bin.ts`): `VOLVEL_URL`, `WORKER_HOST_TOKEN`, UID/GID, `RUN_SLOTS`, `RUN_MEMORY_FLOOR_MB`. Flags `--run-slots --memory-floor --max-workers`.
- **Compose-only:** `POSTGRES_PASSWORD`, `OBJECTSTORE_SECRET`, `VOLVEL_BIND`, `VOLVEL_IMAGE`.

**Isolation** (`isolation.ts:5-13`)
- Internal modes: `host`, `isolated`, `shared`, `unable`, `off`.
- `process` + `own` starts workers only for operator-written code; `same` disables that rule (`supervisor.ts:257-265`).
- Firewall: `deploy/image/volvel-worker-host:18-41`.
- **No bubblewrap exists** (repo grep empty).
- One process per attempt: RSS ≤ `memoryMb`+64, checked every 500 ms; nice 10; 3 s abort grace; restricted environment.

**Workers**
- Leases: 20 s wait (max 25), 24 h credential, 60 s idle exit, one managed worker per tenant.
- Protocol: heartbeat, lost after 30 s.

**Sizing** (`machine.ts:66-88`)
- Slots (MB−512)/160, min 2, or 8 without `/proc`.
- Floor max(128, 10%); critical max(64, 5%).
- Connections/replica: `DATABASE_POOL_SIZE` + `DATA_POOL_SIZE` + 2 queue + 1 listener.
- Each opened dedicated location: owner 5 + rows 5 per replica (`stores.ts:141-149`).
- Data sources: max 4 each (`external.ts:50`).

**Keys:** five sealed places (`rekey.ts:10-52`); status `GET /instance/master-key`.

**Egress:** network list `egress.ts:31-59`; 10 s timeout, 5 redirects. Callers: Git, OIDC, SAML metadata, OAuth tokens, data sources, domain check.

**Health:** `/api/v1/healthz` (process only), `/readyz` (database + store, 3 s each; `readOnly`, `latencyMs`), `/api/v1/instance` (public: version, migration level).

**Limits:** file 25 MB, bundle 20 MB, import 50 GB, streams 5/caller. Hooks are held 25 s; SSE heartbeat 20 s.

**Metrics** (`cp/routes/execution.ts:3380-3555`, `metrics.ts:160-217`), all `platform_`:
- *Gauges:* `runs_queued`, `runs_running`, `queue_oldest_seconds`, `workers{kind}`, `workspace_runs_queued{tenant,workspace,pool}` (pool `default` when unnamed), `workspace_queue_oldest_seconds`, `flow_runs{state}`, `tasks_queued{kind}`, `machine_running{machine}`, `db_pool{pool=platform|queue|rows,state=total|idle|waiting}`, `database_size_bytes`, `database_read_only`, `memory_available_bytes`, `memory_total_bytes`.
- *Counted per replica:* `runs_finished_total`, `run_duration_seconds`, `run_queue_wait_seconds`, `flow_runs_finished_total`, `webhook_refusals_total`, `alerts_total`, `http_requests_total`, `http_request_duration_seconds`.

**OTel:** 2000 spans held, batches of 200, 2 s flush, 10 s timeout.

**Versions:** migration level 85; checksums and newer-database refusal in `migrate.ts`; oldest bundle core 0.2.0 (`deploy.ts:151`); tenant import needs an equal migration level.

**Licences:** Apache-2.0 "pending legal review"; allowlist `scripts/check-licenses.mjs`. No root NOTICE file.

**Publish status:** `release.yml` publishes only when `RELEASE_ENABLED == 'true'`. No git tags here; changelog says 0.3-0.5 "not yet released". Document building from source.

## C. Gotchas

- Slots and memory come from `/proc/meminfo`, normally the host's, not the container limit. Set `RUN_SLOTS` in capped containers.
- `trustProxy: true` (`app.ts:105`) trusts any peer's `X-Forwarded-For/Host/Proto`. The proxy must overwrite all three; block direct access.
- Unrecognized hostnames act as the console address (`hosts.ts:95`).
- Cookies are Secure by `PUBLIC_URL` scheme for members, by request protocol for app sign-ins.
- `MAIL_CAPTURE_DIR` overrides SMTP.
- `sslmode=require` verifies certificates in this pg version; `no-verify` disables that.
- Transaction poolers will not work (inferred: LISTEN, session advisory locks, and signing in by swapping user/password in the URL, `datastore.ts:198-203`).
- Role name comes from the database name; password and claim key from the sealed seed, which **is the first master key**. Rotating after a leak does not change either.
- A wrong `MASTER_KEY` fails boot when the seed cannot be opened.
- Firewall rules resolve the control plane once, at start.
- Standalone workers have no slots, floor or memory guard.
- Managed workers do not get the instance's OTEL settings.
- `rate_limit` is an unlogged table.

## D. Wrong, stale or missing

1. **Compose passes only some variables; there is no `env_file`.** Missing: `METRICS_TOKEN`, `TRIGGERS_PAUSED`, `RETENTION_*`, pool sizes and timeouts, `RUN_SLOTS`, `OTEL_*`, `DOCS_URL`, `MANAGED_WORKER_*`, `S3_REGION` (`compose.yaml:25-44, 72-74`). Setting them in `.env` does nothing.
2. **`EGRESS_ALLOW` text is wrong** (`config-vars.ts:281-285`): it says scripts and connections. It guards only control-plane calls. Worker-host firewall ignores it, so scripts reaching private systems need a standalone worker.
3. SH:236 says the host reads the same variables; it ignores `MANAGED_WORKERS_MAX`.
4. SH:215 says sign-in limits are database-counted. Member sign-in uses Better Auth's in-memory 3 per 10 s per replica; end-user routes do use the database; portal pages/forms are in-memory (`limit.ts`).
5. SH:259 says "+2" connections; it is +3 (SH:51 hints). Dedicated databases uncounted.
6. SH:60 (password from master key) contradicts SH:97; SH:97 is right, except new instances also seed from their first key.
7. SH:545 "last minute": 90 s (`workers.ts:213`).
8. SH metrics omit `database_read_only` and `memory_total_bytes`; several others appear only in prose.
9. SH:56 "leave the bundled services out": compose hardcodes database and store, and `depends_on` them.
10. SH:232 "1 GB gives 3": real MemTotal is lower, possibly 2 (inferred).
11. **Fly README, worker host likely broken** (inferred, never run): image is `USER node`, not root; `.internal` is IPv6 but `HOST` is 0.0.0.0; the firewall handles only IPv4 for the control plane and DNS, then rejects `fc00::/7`. `[http_service]` lacks `processes`. `fly.toml` defaults to `process`.
12. SECURITY.md: "only invitations and password resets" (approval mail exists); "No route accepts SQL" (read-only SQL queries exist); Rule 2's list omits OAuth token addresses; no reporting address.
13. README: "phase 6"; `alias platform=` then uses `volvel`; single-machine text omits the worker host.
14. `deploy/worker/compose.yaml` passes the token by environment, which SH:184 advises against.
15. Missing: restore, Postgres major upgrade, `AUTH_SECRET` rotation, air-gap, support policy, object-store requirements.

## E. Likely bugs / questions

1. **Policies after restore to another database name:** `datastore.ts:263-270` re-targets only policy `rows`, not `rows_read/insert/update/delete`, so rules tables would show nothing. Same-name restore needs the `vxd_` role pre-created by the platform user, because `pg_dump` omits roles (inferred).
2. **`main.ts:83-115`:** the 10 s timer reads `stopping`, declared at 132 (`let`). `rekey` over 10 s throws. A normal boot over 10 s can call `startWriting` early, then again, leaving two background loops.
3. **Version:** `release-version.mjs` does not bump control-plane, and `version.ts` reads its package.json. Released images would report 0.5.0, affecting bundle range checks. Worker reports a hardcoded 0.7.0 (package 0.5.0).
4. `/health` trace exclusion (`app.ts:170`) misses `/healthz` and `/readyz`, so probes make spans.
5. A malformed `%` in `OTEL_EXPORTER_OTLP_HEADERS` throws in `loadConfig` outside ConfigError; the worker does not decode headers.
6. Compose lacks `stop_grace_period`; Docker's 10 s default cuts the host's 30 s drain. Worker host has no healthcheck.
7. Background `running` has no overall timeout: a hung step stalls every later step.
8. Need owner decisions: security contact, support window, publish date, supported topologies (Kubernetes, ECS), a way to rotate the data-role seed.

## F. Diagrams and runbooks

- **Diagrams:** two-network topology with trust boundaries; boot sequence; lease to run lifecycle; request-to-address decision; multi-replica key rotation; connection budget; backup set.
- **Runbooks:** first install; Caddy and nginx configs (SSE, forwarded headers, 25 s hooks); external Postgres role SQL; backup and **tested** restore drill; upgrade and restore-based rollback; key rotation (1 or N replicas); disk full; growing queue; emergency stop; no worker starting; adding a standalone worker; air-gapped image transfer; Postgres major upgrade; hardening checklist; alert rules.
