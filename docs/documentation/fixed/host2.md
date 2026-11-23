# Fixed: lane host2

No migration. No screen changed. Commits are named by row; `git log --oneline p29-host2`.

## HOST-07 A step that waits stops only itself
- **Changed:** `apps/control-plane/src/kernel/execution/background.ts` (`startStepLoops`: each step has its own timer and "still going" flag; one past `STEP_LIMIT_MS` (60 s) is logged "a background step is taking longer than its limit" with a count, never started twice; `stop()` waits for steps in progress for at most the limit, then the database closes); `kernel/data/health.ts:123` (`checkDueSources` checks its sources together); `storage.ts` (S3 client `connectionTimeout` 5 s, `requestTimeout` 60 s, shared by `readyz`, retention and exports).
- **Tests:** `background.test.ts` ("a step that never ends does not stop the next one", "a step still going is not started a second time, and stop waits for it"). The old loop was one `for` of awaits; its stall was the row's evidence. The S3 timeouts have no test of their own (a 60 s wait).
- **Siblings:** `pruneOnce`, `rekeyIfRotating` and the supervisor tick are steps of the same loop; the retention pass's audit export and `put` now end at the S3 timeout. `docs/self-hosting.md` "nothing waits on it" reworded.
- **Left:** a counter in `/metrics` for late steps: the log line carries the count.

## HOST-08, HOST-09 `rekey` and a slow start
- **Changed:** `apps/control-plane/src/writer.ts` (new: the queue, the background loop and the watch for writes, out of `main.ts`; `start` returns when already on; `watch()` is called only after boot is done, so `rekey` and `recover-operator` never start it); `main.ts` uses it.
- **Tests:** `writer.test.ts` ("a slow start and the watch begin one background loop, not two": fails with the guard removed, 2 loops; "stops when writes stop and starts again when they return, once each"). `main.ts` itself is still a script: the `ReferenceError` cannot be reached any more (the timer is made after `stopping` exists); no test runs the command.

## HOST-06 The Fly worker host
- **Changed:** `packages/worker/src/host.ts` (`#start` catches a throwing spawn: logs "a worker could not be started" with the error and a hint on root and capabilities, frees the user slot, removes the directory, ends the lease, and the loop pauses `startFailurePauseMs`, default 5 s, instead of calling it "unreachable"); `deploy/image/volvel-worker-host` (reads `--url`, `--url=` and `VOLVEL_URL`; accepts the control plane's IPv4 and IPv6 addresses and name servers of both families before the refusals); `deploy/fly/fly.toml` (`HOST = "::"`, `processes = ["app"]`); `deploy/fly/README.md`.
- **Tests:** `host.test.ts` "a worker that cannot be started ends its lease and is not called unreachable (HOST-06)" (the old code never ended the lease and the test hung); `firewall.test.ts` runs the script with stand-in `iptables`, `ip6tables`, `getent` and `node` ("--url, an IPv6-only name, an IPv6 name server": fails on the old script).
- **Left out:** that the `workers` group runs as root on Fly. The image has `USER node`; whether Fly runs a process group as root was not run, and I built no image. The README says the group must be root and the log now names the cause. If Fly does run as `node`, the answer is an image whose entry drops to `node` for the control plane instead (a change to `Dockerfile` and compose that needs a build).

## HOST-10, HOST-11, HOST-12, D20, HOST-15, HOST-20
- **Changed:** `deploy/compose/compose.yaml` (every `CONFIG_VARS` name is passed to the control plane, except `HOST`, `PORT`, the two image folders and `MAIL_CAPTURE_DIR`; the worker host gets `RUN_SLOTS`, `RUN_MEMORY_FLOOR_MB`, `MANAGED_WORKERS_MAX`, `MANAGED_WORKER_UID/GID/USERS`, `WORKER_EGRESS_ALLOW`; `init: true` and `stop_grace_period: 60s` on both; a worker host healthcheck; `postgres` and `objectstore` are profiles, `depends_on … required: false`, `DATABASE_URL`, `S3_*` default to the bundled ones; `POSTGRES_PASSWORD` and `OBJECTSTORE_SECRET` are no longer required by interpolation); `deploy/compose/.env.example` (`COMPOSE_PROFILES=postgres,objectstore`, own-service lines, `WORKER_EGRESS_ALLOW`, every other setting commented, written from `CONFIG_VARS`); `deploy/worker/compose.yaml` (`init`, 300 s grace); `deploy/fly/fly.toml` (`kill_timeout = 60`); `packages/worker/src/host.ts` (touches `<tmp>/volvel-host-alive` each time the control plane answers a request for work: what the health check reads); `host-bin.ts` (`MANAGED_WORKERS_MAX`, and `--max-workers x` exits 2); `config-vars.ts` (`WORKER_VARS`: `VOLVEL_URL`, `VOLVEL_WORKER_TOKEN`, `WORKER_EGRESS_ALLOW`; `EGRESS_ALLOW` says it is for the instance, scripts are not held to it); `packages/docs/generators/reference.mjs` draws `WORKER_VARS` under "Worker host".
- **Tests:** `compose-vars.test.ts` (the list check, `.env.example` check, grace and init, health check, and, with `docker compose config`, the two ways of leaving the bundled services out); `host-bin.test.ts`; `firewall.test.ts` ("WORKER_EGRESS_ALLOW opens what it lists for workers, and EGRESS_ALLOW does not"). Compose files were checked with `docker compose config` only: no image built or run.
- **A person sees:** `docker compose up` needs `COMPOSE_PROFILES=postgres,objectstore` in `.env` (in the new `.env.example`); an existing `.env` without it starts no database. Say so in Upgrading. CHANGELOG: new setting `WORKER_EGRESS_ALLOW` (empty: scripts reach nothing private); the worker host's health check; compose stop grace 60 s.
- **Left:** the "Upgrading" line on running scripts.

## HOST-13, HOST-14 One version
- **Changed:** `scripts/release-version.mjs` (`setVersion`: published packages, control plane, console, worker, `SDK_VERSION`, `CORE_RANGE` as that minor's range, `STARTER_SDK_RANGE` in `packages/cli/src/local.ts`); `packages/manifest/src/bundle.ts` `parts()` drops a prerelease; `packages/worker/src/worker.ts` `WORKER_VERSION` is the package's.
- **Tests:** `scripts/release-version.test.mjs`, `packages/manifest/src/versions.test.ts`, `packages/worker/src/version.test.ts`. `release-check.mjs` was not changed: the test is the dry bump, on a copy.
- **Left:** `docs/contracts/worker-protocol.md` still says "Added in 0.6.0/0.7.0", numbers no product version has. Which versions they become is the owner's at the first release.

## HOST-17 A worker decodes OTLP headers
- `packages/worker/src/otlp-headers.ts` (`readOtlpHeaders`, exported), used by `trace.ts` and by the control plane's `readHeaders` (still strict: HOST-16 is another lane's, and its reader is that one function). Test: `telemetry.test.ts` beside the old assertion.

## HOST-21 Guests' limits in Postgres
- `kernel/apps/limit.ts` `Limiter` counts with `countHit` in `rate_limit` (key `front:<name>:<key>`); `front.ts` five limiters, `await`ed. Test `limit.test.ts` (two limiters on one database share a count; fails on the old constructor). Members' sign-in was HOST-05 in tier 1. A database error lets the request through (the page fails by itself without the database).
- **Cost:** each anonymous page or file request is one upsert.

## HOST-22, HOST-23, HOST-25, HOST-26 Text
- `docs/self-hosting.md`, `SECURITY.md`, `README.md`. Not done: HOST-22's "one constant the table is checked against", and the metrics table drawn from help lines (writing phase 31).

## HOST-24 A container's memory
- `packages/worker/src/machine.ts` `memoryOf`: the smaller of `/proc/meminfo` and the cgroup limit (v2 then v1), available as limit less what is held (less `inactive_file`). Test `machine.test.ts` ("a container held to 1 GB": total 1024, slots 3). Siblings: the supervisor, the metrics and the guard use `procProbe`. A standalone worker still has no floor.

## HOST-29 Probes are not traced
- `traced: false` on `/healthz`, `/readyz` and `/metrics` (`kernel/http.ts`, `routes/health.ts`, `routes/execution.ts`); `app.ts` reads it instead of name endings. Test `telemetry.test.ts` "health probes are not spans". Also INS-22.

## D55 Metric names
- Every series is `volvel_…` (`kernel/metrics.ts`, `routes/execution.ts`, tests, `docs/self-hosting.md`). Test `metric-names.test.ts` scrapes and checks every name. CHANGELOG: all metric names changed from `platform_` to `volvel_`: dashboards and alerts must be renamed.

## D19 `rekey --data-role`
- `kernel/rekey.ts` `rekeyDataRole` (new random seed, sealed, audited `instance.data_role_rekeyed`), `main.ts` flag. Test `rekey.test.ts` "the data role's seed can be changed". Every replica must be restarted after it (the role's password and the claim key are remade at start); the command says so. The guide's rotation section still says the seed cannot change: writing phase.

## Found, from tier 1's notes
- **Compose `CHOWN`, `DAC_OVERRIDE`:** already in tier 1's compose file; kept, and `KILL`.
- **`X-Forwarded-Host` only from a trusted proxy:** tested, and it holds already, because Fastify gives `request.host` the header only from a peer `TRUSTED_PROXIES` names. `proxy-trust.test.ts` "X-Forwarded-Host is believed only from a trusted proxy". With the default `1` any peer is "the proxy": an instance reached directly must set `TRUSTED_PROXIES=0` (said in `.env.example`).
- **Supervisor kill handling:** `supervisor.ts` ends a credential when spawn throws or errors before it ran, `stop(grace, giveUp)` logs a worker it could not stop. Options `spawn` and `waiting` for tests. Test `supervisor-stop.test.ts`.
- **New:** `docs-apps.test.ts` "is refused when a page takes one of the product's own terms…" fails in this worktree (a deploy's terms check); it does not touch anything of mine, and was not looked into.
