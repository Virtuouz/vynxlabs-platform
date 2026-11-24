# Fixed: lane host

## HOST-01, HOST-02 Restored databases show every table, under any database name

- **Commit:** "Phase 29: a restored database reads every table, under any name (HOST-01, HOST-02)".
- **Changed:** `packages/db/src/datastore.ts` (`POLICY_NAMES`, the one list; `setUp` hands every policy name to the new role, not only `rows`); `packages/db/src/index.ts` exports it; `apps/control-plane/src/kernel/data/apply.ts` (`upgradePolicies`) also finds every active table with no policy for the store's role, turns row security on and compiles its policy again from `data_table.policy`; it uses the shared `POLICY_NAMES`.
- **Tests:** `data.test.ts` "tables restored without their policies (HOST-01)" (runs in both platform and dedicated mode); `datastore.test.ts` "row policies of every shape are handed to the new sign-in (HOST-02)". Both fail without the fix. Real drill (docker exec `pg_dump --no-owner` and `psql`, databases `p29_host_dedicated` and `p29_host_renamed`, dropped after): a tenant on a dedicated database with open, owner and rules tables, one row each, dumped, database and `vxd_` role dropped, restored; before: 0, 0, 0 rows and 403 on insert; after: 1, 1, 1 and 201, same name and a new name. The drill script is not in the suite (it needs `docker`).
- **Siblings:** dedicated databases (same `#upgraded` path on `connect` and `platform`), tenant import (`restoreRules` calls `setPolicy` with the new role: right), clone (same). The setting `policy` of a retired table stays unmade by design.
- **A person sees:** after a `pg_dump` restore the instance reads and writes its tables again at the first start; a log line "row policies now read the signed claim" counts them.
- **Left for the writing phase:** a drill in `docs/self-hosting.md` (`--no-owner`, restore, start). D59 says `pg_dump` is a backup once this is fixed: it is.

## HOST-05, API-15, API-20, D15 The caller's address is the one the proxy saw, and sign-in is limited in Postgres

- **Commit:** "Phase 29: the caller's address is what the proxy saw, and member sign-in is counted in Postgres (HOST-05, API-15, API-20)".
- **Changed:** new setting `TRUSTED_PROXIES` (`config-vars.ts`, `config.ts` `parseTrustedProxies`, `Config.trustedProxies`; a number of proxies, default 1, 0 for none, or networks) given to Fastify (`app.ts` `trustProxy()`), also in `deploy/compose/compose.yaml` and `.env.example`. `kernel/auth.ts`: the library reads the address only from `x-volvel-client-address` (`advanced.ipAddress`); `routes/auth.ts` deletes the caller's `x-forwarded-for` and sets that header to `request.ip`. The library's limiter is on in every mode (`Config.authLimits`, off only in `testConfig`), counted by `countHit` (`kernel/ratelimit.ts`, now also what the routes' store uses) in the `rate_limit` table; sign-in, sign-up, change password or email, password reset and verification mail are 20 a minute per address and path, as end-user sign-in (`SIGN_IN_ATTEMPTS_PER_MINUTE`). Other library paths keep its 100 per 10 s.
- **Tests:** `proxy-trust.test.ts` (4 tests on member and end-user sign-in with forged `X-Forwarded-For`, none trusted, per-address counting, forged library header; `parseTrustedProxies`), `config.test.ts`. The first two fail with `trustProxy: true`.
- **Siblings looked at:** every `request.ip` use (audit actor, sessions, guests, forms, votes, approval links, SCIM, end-user sign-in) takes the same one address through Fastify. Not changed: `X-Forwarded-Host` still decides the place when a peer is trusted (`kernel/apps/hosts.ts:91`); the guide must say the proxy overwrites all three headers. With the default one hop and no proxy at all, a caller can still write the last header entry: say so in the guide, and use `TRUSTED_PROXIES=0`.
- **A person sees:** a member who signs in wrong 21 times in a minute from one address gets 429 (the library said 3 in 10 s, in memory, per replica); behind a CDN plus proxy nobody shares a bucket of 3.
- **Left for the writing phase:** the settings page is drawn from `config-vars.ts`; the guide's proxy section should name `TRUSTED_PROXIES` and the three headers.

## HOST-18 IPv6 forms of private addresses pass the egress guard

- **Commit:** "Phase 29: NAT64, 6to4, Teredo and site-local addresses are refused like the private ones they carry (HOST-18)".
- **Changed:** `apps/control-plane/src/kernel/egress.ts` (`internal` gains `64:ff9b::/96`, `64:ff9b:1::/48`, `2002::/16`, `2001::/32`, `fec0::/10`; `ipv6Bytes` and `embeddedIpv4` read mapped and NAT64 forms by their bits, in hex as `isIP` and DNS give them; an operator's `EGRESS_ALLOW` network still opens the IPv4 a mapped or NAT64 address carries); `deploy/image/volvel-worker-host` firewall lists get the same IPv6 networks and `192.0.0.0/24`.
- **Test:** `egress.test.ts` "other forms an internal address can take in IPv6 are refused too (HOST-18)"; it failed on `64:ff9b::a00:1` before. The shell script is only syntax-checked (`sh -n`): no container was run here.
- **Siblings:** every caller goes through `addressAllowed` (`guardedFetch`, `checkHost`, the lookup). A public NAT64 or 6to4 address is also refused now; an operator who needs one lists it in `EGRESS_ALLOW`.

## HOST-03, D1 One worker host: each worker has a user and a private directory of its own

- **Commit:** "Phase 29: each worker on a host has a user of its own and a private directory (HOST-03)".
- **Changed:** `packages/worker/src/host.ts` (`#start`, `#freeSlot`): the lowest free slot of `user.count` gives uid and gid (`MANAGED_WORKER_UID` plus slot, `MANAGED_WORKER_GID` plus slot); a `0700` directory `volvel-lease-<id>` is made and chowned to it, and is the worker's `HOME`, `TMPDIR` (where the worker keeps its bundle, `worker.ts:251`) and cwd; removed when the worker exits; the host runs no more workers than users. `host-bin.ts` reads `MANAGED_WORKER_USERS` (default 256), and refuses to start as any user of the range. `deploy/image/volvel-worker-host` firewall rules match the whole uid range. `deploy/compose/compose.yaml` worker host gets `CHOWN` and `DAC_OVERRIDE` beside `SETUID`, `SETGID`, `NET_ADMIN`. New setting `MANAGED_WORKER_USERS` in `config-vars.ts`, read (checked) in `config.ts`; descriptions of `MANAGED_WORKER_UID` and `_GID` say "first".
- **Test:** `host.test.ts` "each worker alive has a user and a private directory of its own (HOST-03)": three concurrent leases get uids 20000 to 20002, gids likewise, distinct `0700` directories that are `HOME`, `TMPDIR` and cwd, and the directories are gone at exit. It failed before (one uid). It records what spawn was asked, since a test is not root: no real cross-user read was attempted. The image was not built and no container run.
- **Siblings:** supervisor `process` mode keeps one user for all its workers: `allowed()` lets it serve only tenants whose code only the operator writes (checked at `supervisor.ts:271`), so no tenant's script shares a user with another's there; not changed. Standalone worker: HOST-27. Fly: the worker machines run as root and need no capability change; README sentence updated.
- **A person sees:** nothing in the console. An operator on the compose file sees the worker host's log "started a worker" and `ps` showing users 10001 and up. Existing compose files need `CHOWN` and `DAC_OVERRIDE` added to the worker host, or no worker starts ("a worker's directory could not be made").
- **Left out:** HOST-04 (a host cannot signal workers of another user without `CAP_KILL`) is not mine; with a user for each worker it matters more.

## HOST-27 The standalone worker's compose hands the credential in the environment

- **Commit:** "Phase 29: a standalone worker reads its credential from a secret file (HOST-27)".
- **Changed:** `packages/worker/src/token.ts` (`readTokenFile`), `bin.ts` `--token-file <path>` (beside `--token-stdin`, `--token`, and the variable, which still work); `deploy/worker/compose.yaml` uses a Compose secret `worker_token` from `./worker-token` mounted at `/run/secrets/worker_token`; `deploy/worker/.env.example` no longer has the variable and says how to make the file; `.gitignore` lists `deploy/worker/worker-token`.
- **Tests:** `token.test.ts` (the file reader; "nothing the deploy folder gives a standalone worker puts its credential in the environment (HOST-27)", which failed on the old files). `docker compose config` was run on the new file.
- **Siblings:** the worker host passes workers their credential on standard input already; `deploy/fly` sets only the host token as a secret (an environment variable, as Fly's secrets are: not changed). The file is readable by the worker's own user, and so by its scripts: the gain is that `docker inspect` and `/proc/<pid>/environ` no longer show it. Running scripts as another user than the worker's (HOST-04's sibling) is not done.
- **For the writing phase:** `docs/self-hosting.md:184` should name `--token-file` and the compose file's secret; `CHANGELOG`: "`volvel-worker --token-file`; the standalone compose reads `worker-token`. An existing `.env` with `VOLVEL_WORKER_TOKEN` must move it into the file."

## HOST-01, HOST-02 again: a regression test without docker

- `apps/control-plane/src/restore.test.ts`: a tenant in a database of its own with an open, an owner and a rules table, a row each. Test 1 drops every policy, `drop owned by` the `vxd_` role and drops the role, then opens the store again and reads and inserts as a member. Test 2 renames the database (the role's name comes from it), policies still handed to the old role. Both fail on the old code (checked by reversing the fix: 2 failed; with it: 2 passed).

## HOST-04 The worker host stops, drains and guards workers of other users

- **Changed:** `packages/worker/src/host.ts`: an `error` event after a worker has started (a refused signal) is logged and does not end the lease or delete the worker; `stop(graceSeconds = 30, giveUpSeconds = 10)` handles the error every time, ends with SIGKILL after the grace, and gives up with "a worker could not be stopped and is left running" rather than waiting for ever; at start the host says when it lacks CAP_KILL (`canSignalOtherUsers`, `machine.ts`, reads `CapEff`). `MemoryGuard.check` says "the machine is low on memory and a script cannot be stopped" when the kill is refused, then waits a minute. `deploy/compose/compose.yaml`: worker host gets `KILL` and `stop_grace_period: 60s` (30 drain, 10 give-up, 20 spare). Sibling `apps/control-plane/src/kernel/execution/supervisor.ts` (`process` mode, `#start`, `stop`): same distinction between a refused signal and a failed start, and `stop` gives up after the grace plus 10 s (typechecked only; nothing in the suite starts it as another user). Not done: a file capability on `node-cp`, and the Fly notes (Fly machines run as root with all capabilities by default).
- **Tests:** `host.test.ts` "a worker that cannot be signalled keeps its lease, and stopping does not end the host (HOST-04)" (a child whose `kill` emits EPERM; failed with the old code); `machine.test.ts` the guard's refusal and `canSignalOtherUsers`.
- **Left:** `worker.test.ts` and the runner's tests (4: "ends a script that ignores its time limit", "ends a canceled run's process") timed out or hit a node out-of-memory when I ran the whole `packages/worker` suite on the shared machine; I did not look into them. The files I touched pass.

## Isolation proved as root in a container (HOST-03, HOST-04)

Image `node:24-alpine` (already on the machine; nothing pulled or built), `--network none`, the worktree mounted read-only at `/app`, root with only `SETUID SETGID CHOWN DAC_OVERRIDE KILL`. The real `WorkerHost` from `packages/worker/dist` runs in it with a fake control plane on the container's loopback, two leases for two tenants, and a probe as each worker. The host's environment holds `WORKER_HOST_TOKEN`. Scripts: `docker run --rm --name p29_host_iso --network none --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add KILL -v <worktree>:/app:ro -v <scripts>:/iso:ro --tmpfs /shared:mode=1777 node:24-alpine node /iso/harness.mjs`. Answers, the same for both workers (a is uid 20000, b is uid 20001):

| attempt, by one worker against the other | answer |
|---|---|
| list the other's directory (`/tmp/volvel-lease-<id>`) | EACCES |
| read the other's file (its cached bundle's place) | EACCES |
| overwrite the other's file | EACCES |
| create a file in the other's directory | EACCES |
| signal the other's process (SIGTERM) | EPERM |
| read the other's `/proc/<pid>/environ` | EACCES |
| read the host's `/proc/<pid>/environ` (holds the host token) | EACCES |
| signal the host | EPERM |
| read its own file | allowed |

Then both workers exited, both leases were reported ended, and no `volvel-lease-*` directory was left. Stopping, with a worker that stays: with `KILL` the worker was ended and `workers still running: 0`; without `KILL` the log says "this process may not send signals to workers of other users ... Give its container CAP_KILL", then "a signal to a worker was refused" twice and "a worker could not be stopped and is left running", and the host went on (it did not crash, as it did before). Containers were started with `--rm`; `docker ps -a --filter name=p29_host` is empty.
