# Findings: self-hosting

Slice of [the inventory](../inventory/self-hosting.md), settled at `270e509`. `CP/` = `apps/control-plane/src/`, `W/` = `packages/worker/src/`, SH = `docs/self-hosting.md`. Container checks ran in the local image `volvel-test:main-35a61cc` (same deploy scripts and worker host) with no network or an internal one. Nothing was built or pulled. Scratch tests, databases and roles were removed. Security rows name the class only.

Where each item went. D: 1 HOST-11, 2 HOST-15, 3 HOST-20, 4 HOST-21, 5 HOST-22, 6 to 8 HOST-23, 9 HOST-12, 10 HOST-24, 11 HOST-06 and HOST-31, 12 HOST-25, 13 HOST-26, 14 HOST-27, 15 HOST-28. E: 1 HOST-01 and HOST-02, 2 HOST-08 and HOST-09, 3 HOST-13 and HOST-14, 4 HOST-29, 5 HOST-16 and HOST-17, 6 HOST-10, 7 HOST-07, 8 the questions. HOST-03, -04, -05, -18, -19 and -30 were found while settling.

## Rows

### HOST-01 A database restored from `pg_dump` onto a new server shows every custom table empty
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `packages/db/src/datastore.ts:255-270` (setup makes the role after the restore, and only re-targets a policy that exists); `CP/kernel/data/apply.ts:590-664` (a policy is made only when its definition changes); SH:68-76 names `pg_dump` as the backup.
- **Evidence:** open, owner and rules tables with a row each. Dump has no `CREATE ROLE`. Restored where the `vxd_` role is absent (same database name): 12 errors `role "vxd_…" does not exist`, `psql` goes on, the instance boots. `pg_policies` empty; lists answer 0, 0, 0; insert 403. Redeploying the bundle (201) does not help. The rows are there, and nobody can read them, in the one backup the guide gives. The same holds for a dedicated database.
- **Fix:** at open, compile every active table's policy that is missing or not for this role (extend `upgradePolicies`, `apply.ts:674`, from `data_table.policy`), and do row security and grants with it. The guide gets a tested drill with `--no-owner` and roles. Siblings: dedicated stores, `import.ts`, clone, HOST-02. Test first: dump, drop role, restore, open, read.
- **Size:** M. **Milestone:** M2

### HOST-02 After a restore under another database name, tables with row rules show nothing
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `packages/db/src/datastore.ts:263-270`: `policyname = 'rows'` only; rules tables have `rows_read`, `rows_insert`, `rows_update`, `rows_delete`.
- **Evidence:** same server, new name, 0 restore errors. `t_open` and `t_owner` are handed to the new role, the four rules policies are not. Open 1, owner 1, rules 0; insert into rules 403; a redeploy changes nothing.
- **Fix:** with HOST-01: one list of policy names shared by `datastore.ts` and `apply.ts` (`POLICY_NAMES`). Test first: extend `datastore.test.ts:97` with rules policies.
- **Size:** S. **Milestone:** M2

### HOST-03 On one worker host, one tenant's script can read and change another tenant's worker
- **Outcome:** reproduced (files and signals); confirmed by code (the changed file is what runs)
- **Severity:** security
- **Where:** `W/host.ts:188-206` (every lease gets the same uid and gid); `W/worker.ts:251, 266, 405-408` (bundle kept in `/tmp/volvel-worker-<id>`, checked against its digest once, when downloaded); `W/runner.ts:71`. SECURITY.md:30 says "each as a user of its own".
- **Evidence:** class: no isolation between tenants in a shared container. As uid 10001 beside another such process: read and overwrote its cached bundle, read its environment, ended it. `SECURITY.md` "does not protect" says a script reaches files its user can read, so it is partly disclosed, but the host serves tenants whose code the operator did not write, which is its purpose.
- **Fix:** a uid and gid per worker from a range (firewall by `--uid-owner` range), private `0700` home per worker removed on exit. Sibling: supervisor `own` mode. Test first: two leases, one cannot read the other's directory. Until then SECURITY.md says it plainly. See question 1.
- **Size:** M. **Milestone:** M1

### HOST-04 The worker host cannot stop its workers: no drain, no memory guard, and it crashes when told to stop
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `deploy/compose/compose.yaml:71` (`cap_drop: ALL`, no `KILL`); `W/host.ts:134-152, 225-232`; `W/machine.ts:195-199` (EPERM swallowed).
- **Evidence:** compose's exact capabilities: `kill` of a uid 10001 child is EPERM, with `KILL` it works. `host.stop()`: logs "a worker could not be started: kill EPERM", says the worker exited, reports the lease ended (its credential is revoked under a running script), then SIGKILL's error is uncaught and the host dies. `MemoryGuard` does nothing, where SH:226 says the largest script is stopped. `process` mode with `own` is the same (`node-cp`: EPERM, `supervisor.ts:344-363`); phase 11 M2 knew that for `process`, not for the host.
- **Fix:** add `KILL` in compose, a file capability on `node-cp`, and the Fly notes; a `kill` error must not be taken for a spawn error or an exit, and must be handled more than once. Say at start when signals are refused. Siblings: `supervisor.ts:341`. Test first: a child whose `kill` fails keeps its lease.
- **Size:** S. **Milestone:** M12

### HOST-05 A caller's address is whatever the request says: limits by address can be passed, and members can be locked out
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/app.ts:105` (`trustProxy: true`); `CP/kernel/auth.ts` (no `advanced.ipAddress`); SH:48, 399 ask the proxy for `Host` and `X-Forwarded-Proto` only.
- **Evidence:** class: client-supplied forwarding headers believed. End users' sign-in: 20 then 429 from one address; none refused when a proxy appends to a header the client sent. Members' sign-in: a made-up single address is never limited; with two addresses, or none, the library logs "falling back to a single shared per-path bucket", so everyone behind a CDN plus a proxy shares 3 tries in 10 s, and anyone can use them up. The audit log's and sessions' address is equally untrue. `X-Forwarded-Host` decides the place too (`kernel/apps/hosts.ts:91`); the origin check refused the cross-address sign-in tried (403).
- **Fix:** a `TRUSTED_PROXIES` setting (networks, or a hop count; default private and loopback) given to Fastify, and `request.ip` handed to the library in a header of our own, stripped from callers. One place for the address. Guide: the proxy overwrites all three headers. Siblings: `front.ts` limiters, webhooks, guests, approval links, audit. Test first: an untrusted peer's header does not change `request.ip`.
- **Size:** M. **Milestone:** M1

### HOST-06 The Fly README's worker host cannot start a worker, nor reach the control plane
- **Outcome:** reproduced, but for Fly itself (the README says it was not run)
- **Severity:** broken
- **Where:** `deploy/fly/README.md:41-57`; `deploy/image/volvel-worker-host:19-38`; `Dockerfile:62`; `CP/config.ts:348`; `W/host.ts:113-128`.
- **Evidence:** as the image's user: no firewall, "not running as root", each start fails `spawn EPERM`. The host logs "The control plane could not be reached", and never ends the lease. With `--url`, as the README has it, no rule accepts the control plane: the script reads only `VOLVEL_URL`. With an IPv6-only name no rule accepts it, and `fc00::/7` is refused, which is where `.internal` is. `HOST` is IPv4 only.
- **Fix:** run the group as root (an entry point that keeps capabilities), read `--url` too, accept IPv6 control plane and name servers, `HOST=::` on Fly, report the lease ended and name the real cause when a spawn throws. Add `processes = ["app"]`. Test first: `host.test.ts`, a spawn that throws ends its lease and is not called unreachable; a script test of the rules made from `--url` and an AAAA name.
- **Size:** M. **Milestone:** M12

### HOST-07 One step that waits stops schedules, retries and flows on that replica
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/kernel/execution/background.ts:79-99` (steps in turn, `running` with no limit); `CP/kernel/data/health.ts` `checkDueSources` (10 in turn, 5 s each); `CP/storage.ts:37-44` (no request timeout); `CP/kernel/retention.ts:26, 341, 408` (30 s budget, then the audit export with none).
- **Evidence:** 4 bound sources that accept and never answer: the step took 20,023 ms, so 10 hold it 50 s of each minute, from any tenant. `put` to a store that never answers was still waiting after 45 s; in the retention pass it waits for good, holding the lock other replicas need. SH:103 "nothing waits on it" is untrue.
- **Fix:** each step its own loop with its own "still going" flag and a time limit that is logged and counted; sources checked together; request and connection timeouts on the S3 client (shared, `readyz` included). `stop()` waits for steps in progress before the database closes. Test first: a step that never ends does not stop the next.
- **Size:** M. **Milestone:** M12

### HOST-08 `rekey` that takes over ten seconds crashes
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/main.ts:90-91` reads `stopping`, declared at `:136`, after the awaited `rekey` at `:118`.
- **Evidence:** table locked 16 s: at 10 s `ReferenceError: Cannot access 'stopping' before initialization`. A batch is a transaction, so nothing is lost, and a second run goes on.
- **Fix:** start the timer after boot is done and never for `rekey` (with HOST-09). Put `main.ts` behind a function that a test can call.
- **Size:** S. **Milestone:** M12

### HOST-09 A start that takes over ten seconds runs the background work twice
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/main.ts:90-112, 170-176`.
- **Evidence:** object store answering in 14 s: at 10 s "the database takes writes again", background starts before the first rekey, sign-in setup and listen; at the end boot starts it again. Two retention passes logged 5 s apart. The first loop and, in `process` mode, the first supervisor are never stopped, so each tick is doubled and workers can exceed the cap.
- **Fix:** the watch starts after `startWriting({ atBoot })` or the read-only listen, and `startWriting` returns if already on. Test first: boot with a slow store has one loop.
- **Size:** S. **Milestone:** M12

### HOST-10 Stopping or upgrading with compose cuts scripts off
- **Outcome:** reproduced (compose `config`; the drain itself is HOST-04)
- **Severity:** broken
- **Where:** `deploy/compose/compose.yaml:12, 59`: no `stop_grace_period` (Docker 10 s; the host gives 30 s, the supervisor 10 s); no `init`, no host healthcheck. `deploy/worker/compose.yaml` the same: a worker there finishes a script of any length. `fly.toml` has no `kill_timeout`.
- **Evidence:** `docker compose config` shows none of them.
- **Fix:** `stop_grace_period` above the drain in both files, `init: true`, a host healthcheck (last answer from the control plane), `kill_timeout` on Fly, and a line in Upgrading on what happens to running scripts. A test reads the compose file.
- **Size:** S. **Milestone:** M12

### HOST-11 Most settings in compose's `.env` do nothing
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `deploy/compose/compose.yaml:25-44, 72-74`.
- **Evidence:** `config` with `METRICS_TOKEN`, `TRIGGERS_PAUSED`, `RETENTION_RUNS_DAYS`, `DATABASE_POOL_SIZE`, `RUN_SLOTS`, `OTEL_*`, `DOCS_URL`, `S3_REGION`, `MANAGED_WORKER_UID` set: none is in either service. 34 of the 53 in `CONFIG_VARS` are not passed (two the image sets), among them the emergency stop. The host gets no `RUN_SLOTS`, memory floor or uid, so compose cannot size it.
- **Fix:** pass every variable of `CONFIG_VARS` (and the host's) from one list, and write `.env.example` from it. Test first: `enforce`-style, each `CONFIG_VARS` name is in the compose file or on a list of exceptions with reasons.
- **Size:** S. **Milestone:** M12

### HOST-12 "Leave the bundled services out" is not possible
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** SH:56-58; `compose.yaml:19-30` (addresses and names fixed, `depends_on` both, `POSTGRES_PASSWORD` and `OBJECTSTORE_SECRET` required).
- **Evidence:** `DATABASE_URL=postgres://mine`, `S3_ENDPOINT`, `S3_BUCKET` in `.env`: `config` still shows the bundled ones.
- **Fix:** profiles for `postgres` and `objectstore`, `depends_on … required: false`, `${DATABASE_URL:-…}`. A `config` check in CI for each way.
- **Size:** S. **Milestone:** M12

### HOST-13 A released image would say 0.5.0 whatever its tag
- **Outcome:** confirmed by code, and run for the range check
- **Severity:** broken
- **Where:** `scripts/release-version.mjs:9` (8 packages, not the control plane, worker, console); `CP/version.ts:4`; `packages/sdk/src/index.ts:50-51` (`SDK_VERSION`, `CORE_RANGE` fixed); `packages/cli/src/local.ts:154` (`^0.5.0`); `packages/manifest/src/bundle.ts:240`.
- **Evidence:** the image's `package.json` is 0.5.0. Nothing ties `CORE_RANGE` to the release, so today both stay 0.5.0 and a 0.6.0 SDK's bundle is taken by a 0.5 instance it was not made for; once the SDK's range moves, `bundleCompatibility("0.5.0", {min 0.6.0}) = core_too_old`: every bundle refused. A starter from CLI 0.6.0 asks for the older SDK. A prerelease's third part is `NaN`, so any comparison of it is "ok".
- **Fix:** the script sets control plane, console, worker and the SDK's constants (read from `package.json`), and the starter's range; `parts()` drops a prerelease. `/instance`, OpenAPI, MCP and exports follow. Test first: `release-check.mjs` compares the five after a dry bump.
- **Size:** M. **Milestone:** M12

### HOST-14 The Workers page shows 0.7.0 for every worker
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `W/worker.ts:85, 363`; shown at `apps/console/src/screens/Execution.tsx:1012`. It equals the last "Added in 0.7.0" of `docs/contracts/worker-protocol.md:37`, numbers no product version has.
- **Evidence:** package 0.5.0. SH:151 says workers should run the instance's version, and this is the one place to see it.
- **Fix:** read the package's version, set by HOST-13; the contract's numbers become the versions that shipped. Test: the claim's `version` equals the package.
- **Size:** S. **Milestone:** M12

### HOST-15 `EGRESS_ALLOW` is described as limiting scripts
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `CP/config-vars.ts:284-288` ("that scripts and connections may reach"), the reference page made from it. Nothing in `W/` reads it; the host's firewall ignores it (HOST-20). SH:299-307 and `.env.example` are right.
- **Fix:** "Private networks and host names the instance itself may reach for a tenant: identity providers, Git, data sources, OAuth token addresses, hostname checks. Scripts are not held to it." Opening the firewall too is question 2.
- **Size:** S. **Milestone:** M12

### HOST-16 A malformed `OTEL_EXPORTER_OTLP_HEADERS` stops the instance with a stack trace
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/kernel/telemetry.ts:394-402`, called at `CP/config.ts:365` outside `problems`.
- **Evidence:** `a=50%`: `URIError: URI malformed`, no setting named, and the other problems are not listed.
- **Fix:** the reader answers a problem; `loadConfig` lists it. Test first: `config.test.ts`.
- **Size:** S. **Milestone:** M12

### HOST-17 A worker sends OTLP headers undecoded
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `W/trace.ts:24-28`.
- **Evidence:** `Authorization=Bearer%20abc`: instance sends `Bearer abc`, worker `Bearer%20abc`, so a vendor refuses the worker's spans, silently.
- **Fix:** one reader for both. Test beside `telemetry.test.ts:182`.
- **Size:** S. **Milestone:** M12

### HOST-18 Some IPv6 forms of private addresses pass the egress guard
- **Outcome:** reproduced (the decision; no connection was made)
- **Severity:** security
- **Where:** `CP/kernel/egress.ts:47-56, 104-109` (NAT64 is matched only in dotted form, which neither URLs nor DNS answers are in).
- **Evidence:** class: incomplete list of internal addresses. The NAT64 form of a private IPv4 address, 6to4 and site-local answer "allowed". It matters only where the network translates or routes them.
- **Fix:** refuse `64:ff9b::/96`, `64:ff9b:1::/48`, `2002::/16`, `2001::/32`, `fec0::/10` by network, and judge the embedded IPv4 by its bits. Siblings: the firewall's list in `volvel-worker-host:29, 34` (also `192.0.0.0/24`). Test first: `egress.test.ts`.
- **Size:** S. **Milestone:** M1

### HOST-19 With `MANAGED_WORKERS=process` or `false` in compose, the worker host warns for ever
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `.env.example` offers both; `CP/kernel/http.ts:329-330` answers 404 unless `host`; `W/host.ts:164-167, 124` logs "could not be reached" every 2 s. `compose.yaml:59` always starts it.
- **Fix:** the host knows a 404 of its route and says managed workers are not set to `host`, with a long pause; a compose profile for the host. Sibling: HOST-06's wrong cause.
- **Size:** S. **Milestone:** M12

### HOST-20 The worker host does not read `MANAGED_WORKERS_MAX`, and its flag is unchecked
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `W/host-bin.ts:90`; SH:236 "or from the same variables". `--max-workers x` gives `NaN`, which is no limit. The host's environment is in no list, so no reference page has it.
- **Fix:** read it, through `positive()`. One list of the host's and worker's variables beside `CONFIG_VARS`, for the reference. Test: `--max-workers x` exits 2.
- **Size:** S. **Milestone:** M12

### HOST-21 "Rate limits on … sign-ins … are counted in the database"
- **Outcome:** confirmed by code, and seen in HOST-05
- **Severity:** wrong
- **Where:** SH:215, SECURITY.md:49. Members' sign-in: the library's memory store, 3 in 10 s per replica (`create-context.mjs:170-175`, no setting in `auth.ts`). Portal pages, forms, votes, approval pages: memory (`CP/kernel/apps/front.ts:157-160, 583-585`). End users, webhooks, guests, SSO: database. So it is true of some.
- **Fix:** give the library a storage on `rate_limit` (its `customStorage`), and the `Limiter` the same store. Test first: two apps on one database share members' tries.
- **Size:** M. **Milestone:** M12

### HOST-22 Connections for each replica are undercounted
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** SH:259 "+ 2": it is + 2 queue (`packages/db/src/database.ts:22`) + 1 listener (`CP/kernel/stream.ts:80`), as SH:51 says. A dedicated location adds 5 + 5 for each replica (`CP/kernel/data/stores.ts:145`), a data source 4 (`external.ts:50`).
- **Fix:** the numbers, from one constant that the guide's table is checked against.
- **Size:** S. **Milestone:** M12 (text), phase 31

### HOST-23 Small untruths in the guide
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** SH:60 the data role's password comes from a sealed seed, not the master key (SH:97 is right, but new instances also seed from their first key); SH:545 workers "in the last minute" is 90 s (`CP/kernel/execution/workers.ts:213`); the metrics tables leave out `database_read_only`, `memory_total_bytes`, and give `db_pool`, `database_size_bytes`, `machine_running`, `memory_available_bytes` in prose only (all seen in a scrape).
- **Fix:** rewrite in phase 31; generate the metrics table from the metrics' own help lines.
- **Size:** S. **Milestone:** M12 or phase 31

### HOST-24 Slots are worked out from the host's memory, not the container's
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `W/machine.ts:30-41` (`/proc/meminfo`); SH:232 "1 GB gives 3".
- **Evidence:** a container held to 1 GB: 96 slots, floor 1,596 MB, total 15,955 MB. The host starts far more than fits, the floor and guard never act, and the kernel ends it. "1 GB gives 3" needs 992 MB reported; a 1 GB machine reports less than 1 GB, so 2 or 3: on Fly, read "this machine's share" in the log.
- **Fix:** the probe takes the smaller of `/proc/meminfo` and the cgroup's `memory.max` and `memory.current` (v2, then v1). Siblings: the supervisor, the memory metrics, a standalone worker (no floor at all). Test first: `machine.test.ts` with a cgroup limit.
- **Size:** S. **Milestone:** M12

### HOST-25 SECURITY.md says things that are no longer so
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** SECURITY.md:56 "only invitations and password resets" (approval mail goes out, its own line 32 says so); `:50` "No route accepts SQL" (written queries do, read-only); `:14` rule 2's list lacks OAuth token addresses (decision 0001's amendment has them); `:30` "each as a user of its own" (HOST-03), and guests, webhooks and sign-ins "counted in the database" (HOST-21); no address to report to.
- **Fix:** text with each milestone's change; the address is question 3.
- **Size:** S. **Milestone:** M12

### HOST-26 README is stale
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** README.md:5 "at phase 6"; `:35` `alias platform=` then `volvel …`, which is not found; `:98` leaves out the worker host and `WORKER_HOST_TOKEN`.
- **Fix:** text. **Size:** S. **Milestone:** M12

### HOST-27 The standalone worker's compose hands the credential the way the guide advises against
- **Outcome:** confirmed by code
- **Severity:** security
- **Where:** `deploy/worker/compose.yaml:17` `VOLVEL_WORKER_TOKEN` in the environment; SH:184; `W/bin.ts:55` deletes the variable, which does not change `/proc/<pid>/environ`, and scripts run as that user.
- **Evidence:** class: credential readable by the code it runs. Limited: the same tenant's own code.
- **Fix:** a Compose secret file, read by a new `--token-file` or entry through `--token-stdin`; the worker restarted as another user for scripts is question 1's sibling. Test: no worker file in `deploy/` names the variable.
- **Size:** S. **Milestone:** M1

### HOST-28 The guide has no restore, Postgres major upgrade, `AUTH_SECRET` change, air-gapped install, object store needs or support policy
- **Outcome:** confirmed by code (not written; `grep` empty)
- **Severity:** rough
- **Where:** SH. Restore is HOST-01 first. Store needs: HeadBucket, Get, Put, Delete; CreateBucket on 404 only; any other answer fails boot (`CP/storage.ts:42-51`).
- **Fix:** pages 16, 17, 7, 13, 14, 25 of the inventory, each from a drill that ran. **Size:** M. **Milestone:** phase 31

### HOST-29 Health probes are traced
- **Outcome:** reproduced; the same as INS-22
- **Severity:** wrong
- **Where:** `CP/app.ts:170` (`/health`; the routes are `/healthz` and `/readyz`).
- **Evidence:** collector received `GET /api/v1/healthz` and `GET /api/v1/readyz` spans: compose's probe alone is 8,640 a day.
- **Fix:** a `traced: false` on the route's config, for health and metrics, in place of endings of names. **Size:** S. **Milestone:** M12 (with INS-22)

### HOST-30 `process` mode with workers of their own user throws at shutdown
- **Outcome:** confirmed by code; the EPERM reproduced on `node-cp`
- **Severity:** rough
- **Where:** `CP/kernel/execution/supervisor.ts:341-344, 354-360`: the first EPERM deletes the worker, the second has no listener, so the control plane dies 10 s into a stop, with audit and queue not closed. Its credential is not revoked either (`error` does not call `endManagedSlot`).
- **Fix:** with HOST-04; a worker told by its closed standard input, or by an answer to its claim, needs no signal. **Size:** S. **Milestone:** M12

### HOST-31 "`[http_service]` lacks `processes`" and "`fly.toml` defaults to `process`"
- **Outcome:** not a bug
- **Severity:** rough
- **Evidence:** a service with no `processes` goes to the default group, which the README names `app` (from Fly's own rules; not run). The file's comment says `process` is its default, and the README sets `host` with the group. Named in HOST-06's fix all the same.

## Checked, and right

- A wrong `MASTER_KEY` fails boot by design; a rotation not changing the data role's seed is decided (SH:97). A way to change it is question 5.
- `WORKER_HOST_TOKEN` is needed by compose even for `process`: it keeps the service startable. HOST-19 covers the noise.
- The firewall works as said on an IPv4 network: control plane and name server accepted, private ranges refused for the worker's uid.
- `METRICS_WORKSPACE_LABELS=false` adds series together; no duplicates (`CP/kernel/metrics.ts:121`).
- The company named in SH and the Fly README is allowed by `name.test.ts`.

## Missing parts

The API or program has these; no control, or an incomplete one.

1. **Master key status.** `GET /instance/master-key` (`CP/routes/master-key.ts:12`), `instance:read`. Console: Instance, Health. The same as the instance slice's part 4, counted there. **S**
2. **What a replica is set to.** The instance knows its mode, slots, floor, pools, retention, mail, apps address and allowed networks (`CP/config.ts`); no route or screen shows any. Place: Instance, Health, secrets as set or not, `instance:read`. The API has none today, so it is listed for the owner (question 6). **M**
3. **Worker `concurrency` and `idle-exit` in the standalone deploy.** Flags of `W/bin.ts:11-18`; only `VOLVEL_WORKER_IDLE_EXIT` has a variable, and `deploy/worker/compose.yaml` passes neither, nor `OTEL_*`. **S**
4. **Worker host settings in compose.** `--run-slots`, `--memory-floor`, `--max-workers`, uid, gid (`W/host-bin.ts:5-13, 54`). With HOST-11 and HOST-20. **S**
5. **`rekey` and `--help` for the image's programs.** `main.ts rekey` is an argument with no help; an unknown word starts the instance. Place: `volvel-start --help`, `migrate`, `rekey`, `check-config` over `loadConfig`. **S**
6. **Rate limit and proxy trust.** `trustProxy` of Fastify and `ipAddress` of the sign-in library exist and have no setting. With HOST-05. **S**
7. **Per-host health.** Compose can probe the control plane; the host and a standalone worker answer nothing to ask. With HOST-10. **S**

## Owner decides

1. **Workers of different tenants on one host:** (a) a user per worker, (b) a container per worker, (c) keep, and say it. Recommended: (a) now, as HOST-03; (b) belongs to sandboxing. The same for a standalone worker's own credential.
2. **Should the host's firewall open what `EGRESS_ALLOW` lists?** Options: a separate `WORKER_EGRESS_ALLOW`, the same list, or never (a standalone worker). Recommended: a separate list, empty by default; until then the words only.
3. **Where is a vulnerability reported, and how soon is it answered?** Needed before the first release. Recommended: a mailbox and GitHub's private reports, 3 working days.
4. **Which versions are supported, and when is the first published?** Recommended: the newest minor and the one before, tags only from a clean rehearsal (HOST-13 first).
5. **May the data role's seed be changed?** Today never. Recommended: yes, `rekey --data-role`, one replica at a time, as a leaked first key otherwise still opens the rows' sign-in.
6. **Which topologies are supported?** Compose and Fly are in the repository; Kubernetes and ECS are not. Recommended: compose supported, Fly as an example, others "the image and its needs". Also whether Instance, Health shows settings (part 2): recommended, yes.
7. **Is `pg_dump` a supported backup?** Recommended: yes, once HOST-01 makes it whole, with point-in-time recovery preferred.
