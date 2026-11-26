# Phase 35: an instance is loaded until it bends, broken on purpose, and attacked

Status: built; the owner's decisions on what the red team left are open. On branch `phase-35-stress-and-red-team`, off `phase-34-yaml-first-and-widgets`.
Last updated: 2026-11-26

The owner asked, on 2026-11-25, for proof that phases 25 to 34 did not cost performance or the
ability to recover a broken instance: a stress test of a freshly seeded Fly instance to find the
limits of the application and the hardware, with issues noted and fixed along the way, then a
red-team exercise. The last load test was [phase 11](phase-11-load.md), re-run on 2026-11-16.

**Exit criterion.** On a fresh Fly instance seeded with `examples/fernhill` and `examples/stress`:

- phase 11's criterion still holds: runs wait in the queue and the machine never freezes; a busy
  read answers 503 with `Retry-After` or 422, never 500; reads and sign-in work while the database
  takes no writes; flows do not stack; a clone does not hold up the instance;
- every scenario has a measured limit, set beside phase 11's figure where there is one;
- each fault (database disk full, a killed app machine, a killed database, exhausted memory, an
  unreachable object store) is recovered from without SQL by hand, and the time it took is written
  down;
- a database dump taken under load is restored into a second instance, with its keys;
- every confirmed finding of the red team has a proof that worked before its fix and fails after.

## Owner decisions

| Area | Decision |
|---|---|
| Target | A new, separate Fly app (`volvel-stress`). `volvel-test` is not touched. Asked 2026-11-25 |
| Hardware | Phase 11's machines first (app shared-cpu-2x 2 GB, database shared-cpu-1x 512 MB), then the database on a performance CPU. Asked 2026-11-25 |
| Faults | All four families: disk full, kill and restart, backup and restore, memory and object store loss. Asked 2026-11-25 |
| Agents | Up to 20 Sonnet subagents |
| Findings | An unfixed vulnerability is not written into git. Only fix records are committed |

## Milestones

| # | Milestone |
|---|---|
| M1 | The instance stands on Fly and is seeded; how it was made is written down |
| M2 | The load tooling is in the repository |
| M3 | The scenarios are run and the limits recorded |
| M4 | The faults are injected and recovered from |
| M5 | The database is stepped up and the scenarios it limited are run again |
| M6 | The red team's findings are confirmed and fixed |
| M7 | The full suites pass |

## Limits

Measured on `volvel-stress` on 2026-11-25 and 26 with `scripts/load/`, from one address outside
Fly (about 48 ms of every request is the network: `/instance`, which reads nothing, answers in 48 ms).
Twelve Fernhill tenants and twelve `examples/stress` tenants. Unless a row says otherwise both
machines are **performance-1x with 2 GB**: nine run slots, as on phase 11's 2 GB. A limit is the
last stage whose p95 stayed under one second with under 1 % errors.

| # | Scenario | Result | Phase 11 | Holds |
|---|---|---|---|---|
| 1 | Idle: `/healthz`, `/readyz`, `/instance`, the summaries, two users | p50 60 ms, p95 154 ms, twice within 1 % | `/readyz` 57 to 84 ms | Yes |
| 2 | Console read mix, ramped | 72 users, 150 requests a second; p95 157 ms at 8 users, 395 at 32, 988 at 72; no error at any stage; `/readyz` 242 ms at worst. The app's CPU was 76 % busy, the database's 48 %, and 29 requests waited for a connection on average | Console p95 85 to 104 ms | Yes |
| 2 | The same on shared CPUs | Database shared: over one second at four users. App shared: 160 a second on its burst, then 22 to 27 (STR-03) | | No |
| 3 | 12 tenants, 156 runs a minute of 20 s scripts, 3 minutes | 442 started, none failed. Five scripts at once on average and nine at most; free memory never under 323 MB; `/readyz` 157 ms at worst; starting a run p95 137 ms. The queue reached 422 and drained | Held at nine slots, free memory never under 170 MB, readiness 57 to 84 ms | Yes |
| 3 | Scripts that return at once, at 5, 10, 20 and 40 a second for a minute | Every run succeeded (4,963 over the four). About four runs a second finish, with the app's CPU 92 % busy: each run is a new process. At 40 a second, starting a run p95 900 ms and up to 186 waiting for a connection; `/readyz` 315 ms at worst | 533 foreach items a minute on two shared CPUs | Yes |
| 4 | Table reads, sorted, filtered and totalled, on tables of 200,000, 199,500, 53,500 and 34,500 rows, ramped | 24 users, 57 requests a second. No 500 and no 503. A total was refused 422 `too_slow` in 0.3 to 0.8 % of reads. The database's CPU was 84 % busy: this one is the database | No 500s; two reads in three were 503 or 422 | Yes |
| 8 | New since phase 11: `widget-data`, dashboards, app pages, `/docs`, tenant docs, search, MCP | 24 users, 91 requests a second, no error. At eight users: MCP p50 299 ms, `widget-data` 153 ms, app pages and docs 72 to 87 ms. An MCP `tools/list` with 28 tools sends 61 statements, and each `tools/call` pays the same (STR-05) | None: this sets it | Yes |
| 5 | A flow over 1,000 items, due every minute, for six minutes | One flow run at a time; the others were skipped as overlapping. 250 to 270 items a minute once under way, and the 1,000 done in about five minutes | One flow run; 210 items in the first minute, then 23 to 35 | Yes |
| 6 | Two clones with data started together, of workspaces with tables of 200,000 and 54,000 rows, with eight console users | The larger finished in about 6.5 s. The other waited as `queued` and finished at about 8.5 s. The rows of each clone equal its source. Console p50 and p95 were 88 and 131 ms before and 89 and 133 ms during; no error; `/readyz` 279 ms at worst | 40 s and 58 s; other calls 58 to 319 ms | Yes |
| 6 | A tenant exported with its history and imported again, with eight console users | Export 2.1 to 2.6 s for an archive of 20 to 22 MB; staging the upload 5 s; the import 11 s. All twenty tables had the same number of rows after as before. No 5xx. An import of a tenant that is still on the instance is refused 409: it keeps its id, so a copy beside the original cannot be made | None | Yes |
| 7 | Seven tenants of about 14,000 rows each deleted | 1.24 to 1.43 s each, and gone from the list within 75 ms. A tenant with flow runs in progress is refused 409 until they are cancelled, and says so | 0.3 to 0.5 s each, of smaller tenants | Yes, slower |
| 7 | 2,190 runs queued in one workspace and cancelled in one call, while workers claimed them | Cancelled in 35 s, 16 ms a run, in one answer. Runs elsewhere went on. Before the fix of STR-06 this stopped every run on the instance | 1,140 in 8 s, 7 ms a run | Yes, slower |
| 9 | Limits as documented | A webhook took 120 in a minute and refused the next 30 with 429. A sixth stream was refused 429 `too_many_streams`, with no `Retry-After` | 120 a minute | Yes |
| 10 | Two hours: 50 console users and 1.5 run starts a second over twelve tenants, 70 % of each of the two limits at once | The console held for the two hours: 1,051,775 requests, none refused and none failed, 134 to 140 a second, p95 634 to 658 ms in every ten minutes; `/readyz` 398 ms at worst and never other than 200; free memory 330 to 520 MB with no trend, and no swap used. The runs did not keep up: 10,798 started, 3,309 finished, none failed, and 7,673 waited at the end, the oldest for an hour and a half. The app's one CPU was 91 to 96 % busy, which is the two loads together asking for more than one CPU; but only two scripts ran at once on nine slots, and that was the product (STR-07) | None | Console yes. Runs: queued and none lost, as the criterion asks, but far below what the machine could do |
| 10 | The same runs alone after STR-07 and STR-12, 2.5 starts a second | 139 runs a minute finished, 6.2 scripts at once on average, free memory never under 505 MB, none failed. The soak's backlog of 7,400 drained at 62 a minute before the fixes and 126 after the first of them | | Yes |

## Faults

Each fault was injected into `volvel-stress` under load on 2026-11-25, and timed from the fault to
the instance doing its work again. Nothing was mended by hand in the database in any of them.

| Fault | What happened | Back | Phase 11 |
|---|---|---|---|
| The app machine killed (`fly machine kill`) with six scripts in progress | Fly started it again. `/readyz` answered 200 after 22 s and scripts ran again after 53 s. The queue was whole (5,089 waiting before and after). The six in progress were failed as "timed out, or its worker stopped responding, and it had no retries left": a script that declares no retries is not run a second time. None ran twice | 53 s | Not measured |
| The app machine restarted in order (a deploy, `fly machine restart`) | Before STR-08 every deploy failed the three to eight scripts in progress, 52 over the evening. After it: six in progress, none failed | About 20 s | Not measured |
| The database machine killed | Before STR-09 the control plane exited three seconds later and Fly restarted it: 22 s without an answer, scripts again after 53 s, the eight in progress failed. After STR-09 and STR-10 the control plane stayed up: `/readyz` 503 within 20 ms for four seconds, 200 from the seventh; no script failed, and five to seven went on running | 7 s | Not measured |
| The database's disk full (97 %; Fly's Postgres turns the database read-only) | Seen 9 to 14 s after the disk filled. While full: `/readyz` 200 with `readOnly: true`, reads 200 in about 135 ms, the console served, starting a run 503 `read_only` every time (30 of 30). Writes came back 11 to 17 s after the disk was freed, with no restart. One write was answered 500 at the instant Postgres restarted to go read-only (open). The scripts in progress when writes stopped are failed (STR-11) | 11 to 17 s after the disk is freed | 26 s |
| A script asking 700 MB under its limit of 512 | Failed with "The script ran out of memory (512 MB)". Nothing else was touched | | Held |
| 24 scripts of 300 MB for 20 s at once, two for each tenant | The machine never stopped answering: `/readyz` 200 on every probe. Before STR-12, 15 to 17 of the 24 were stopped as "the machine ran low on memory" and free memory fell to 18 MB. After it, and after a restart: 23 succeeded and one was stopped, three at once at most, free memory 101 MB at its lowest, `/readyz` 0.33 s at worst | No outage | Free memory never under 170 MB (with smaller scripts) |
| The object store unreachable (its addresses dropped at the app machine's firewall) | `/readyz` 503 in three seconds, naming the object store and not the database. Reads 200 and runs started. With Fly's check on `/readyz` the whole instance then could not be reached from outside, though inside it answered (STR-13). With the check on `/healthz`: 100 s without the store, reads, run starts and `/docs` served throughout. Ready again within two seconds of the store's return | 2 s | Not measured |
| A dump under load, restored into a second instance | `pg_dump -Fc --no-owner` of the 288 MB database with 1.5 run starts a second and 16 console users: 14 s, 42 MB. `pg_restore` into a new database: 35 s. A second app (`volvel-stress-restore`) on that database with the same `MASTER_KEY`, `AUTH_SECRET` and bucket: ready 48 s after its deploy began. There: the operator signs in with the same password, 24 tenants, no sealed value that opens with neither key, a tenant's API key reads its runs and rows, a script started and succeeded | About two minutes in all | Not done |

## Issues

Each issue found, by number, with what was seen, the cause, the fix and the rerun.

| ID | Found in | What | Fix |
|---|---|---|---|
| STR-01 | Seeding, M1 | The app's shared CPU is throttled once its burst is spent. The first Fernhill seeded in 138 s; the eleven copies after it took 389 to 823 s each, with the app machine at 86 % steal and a load of 5 on two shared CPUs, while the database sat 93 % idle. Phase 11 saw 52 % steal on the same size | Hardware, not code. Every scenario is run on this size for comparison, then again with the app on a performance CPU. `sizing-and-scaling.md` is to say what a shared CPU sustains |
| STR-02 | Filling a table, M1 | With 24 tenants, the 2 GB machine had under 100 MB free with no script running: 13 managed workers held about 105 MB each (1.35 GB), and the control plane 470 MB resident and 330 MB in swap. Below the floor a worker counted itself as never idle (`packages/worker/src/worker.ts`, "Not idle: the work is there, the memory is not"), so none left; nothing was claimed, 8 runs sat queued with none running, and each script that did start, down to one of 31 MB, was stopped as the machine's largest. The slot arithmetic plans 160 MB a run and 512 MB kept back, and nothing for a worker | A worker that exits when idle now leaves after 8 to 16 s below the floor with no run in progress, and a worker is started only where 128 MB stays above the floor, in the supervisor and in the worker host. Tests in `worker.test.ts` and `supervisor-stop.test.ts`. That alone was not enough: at 22:00 the hourly schedules of twelve tenants came due together, twelve workers started and six scripts were handed out on one reading of free memory, the machine fell to 56 MB and `/readyz` timed out, then answered 503. Three more changes: what was started a moment ago is counted before more is started, workers and scripts in one place (`kernel/execution/workers.ts`, `machineShortOfMemory`), a worker at 96 MB for ten seconds and a script at 160 MB until it ends or eight seconds pass; a worker tells the control plane its free memory with each claim; and a worker loads `@volvel/manifest/digest` alone and the mail library only when a script sends, so its code takes 64 MB where it took 126. **Rerun**, 120 runs over twelve tenants in 20 s, half of them holding 120 MB, with the hourly schedules landing in the middle: 118 succeeded and none failed, free memory never under 368 MB, `/readyz` 200 throughout and 560 ms at worst, four to seven scripts at once |
| STR-03 | Scenarios 1 and 2 | A shared CPU does not hold either machine. **Database** (shared-cpu-1x, 512 MB): after two hours of filling tables it ran at 59 % steal on average and 86 % at worst with the app idle, and the console's p95 was 960 to 1,115 ms at two users and 2,475 ms at four, where phase 11 had 85 to 104 ms. An idle Fly Postgres uses about its whole shared allowance, so it earns almost no burst back. **App** (shared-cpu-2x): it served about 160 requests a second on its burst, then 22 to 27 at 45 % steal with the database 10 % busy | Hardware. The database was moved to performance-1x with 2 GB and the app to performance-1x with 2 GB, the same memory, so the run slots are the same nine. The sizing page is to say that a shared CPU serves a burst and not a load |
| STR-04 | Scenario 2 | On the performance database the console read mix reached 44 users and about 110 requests a second before its p95 passed one second, with neither CPU busy (database 43 %, app 16 %): requests waited for the ten connections, up to 58 at once. Statements for one request: a workspace's summary 50, the list of tenants 31, a tenant's summary 27, search 16, a list of runs 7. The check (`kernel/authorize.ts`) read a member's standing and bindings anew for each permission asked, and neither read depends on the permission | A request that changes nothing reads what decides a place once (`StandingMemo`, kept by `RequestContext` for GET and HEAD only). After: 25, 29, 15, 9 and 6 statements, and 150 to 164 requests a second at a p95 of 173 to 361 ms. Test in `kernel.test.ts`. The list of tenants still sends about two and a half statements a tenant: open |
| STR-05 | Scenario 8 | Where many places are each asked one permission, the check still reads for each: the list of tenants sends 29 statements for twelve tenants, and an agent's `tools/list` 61 for 28 tools, as does every `tools/call`, which loads the list to find its tool | `checkMany` in `kernel/authorize.ts`: at most three statements for any number of places, deciding through the same `decide` as `check`. Used by the list of tenants, an agent's tools, the list of workspaces, the visual query's tables and the docs' apps. `authorize-many.test.ts` compares it with `check` over every principal, ten permissions and nineteen places, more than 2,000 answers. The list of tenants: 36 statements for fifteen tenants before, 8 after |
| STR-06 | Scenario 7 | **Cancelling a backlog stopped every run on the instance.** 1,200 runs were queued in one workspace and cancelled in bulk while workers claimed them. The cancel did not answer in 60 s; 995 runs stayed queued, no worker ran, and nothing was claimed anywhere for eight minutes, until it was looked at. In Postgres: the cancel's transaction idle, holding a run `for update`; the queue's own connection waiting to cancel that run's job; a claim holding the job and waiting for the run. Two waits on three connections, which Postgres does not see as a deadlock. The claim kept its machine's turn (`onMachine`), so no other claim was made | `cancelRun` takes the job first and then the run, the order a claim takes them in, and cancels the job in its own transaction (`Queue.cancel` takes a transaction). A claim sets a `lock_timeout` of 15 s and hands out nothing when it passes. `trigger-limits.test.ts` holds a claim between its two locks and cancels: stuck on the old code, both finish on the new. **Rerun**: 2,190 runs cancelled in 35 s in one answer, with runs elsewhere going on |

| STR-07 | Scenario 10 | **Two scripts ran at once on nine slots.** After STR-02 each start was counted at 160 MB until it ended or eight seconds passed, on top of the memory it really took, which the machine's free memory already showed. With 440 to 700 MB free that let two to four run. A script that slept five seconds in 50 MB was counted at 160 for all five | A worker reports the most each script's process held (`peakMb` with the run's end), and the next start of that script is planned a quarter over the most of its last four runs, 48 MB at least and 160 for one never seen. See STR-12 for what the count became. A tenant found to have had its share of a machine is not asked about again for half a second or until a run ends: each of its worker's four claims had taken the machine's turn and a transaction once a second to be told the same. The backlog drained at 62 runs a minute before and 126 after, five to eight scripts at once |
| STR-08 | Killing the app | **Every deploy failed the scripts in progress.** Two causes. `fly.toml` had no `kill_timeout`, so Fly gave the machine five seconds (the template in `deploy/fly/` has 60; the one in use was copied from the test instance, which has none). And the control plane stopped its workers in a hook of the server's closing, when it already answered 503 to everything: a worker's script ended and could not be reported | The workers are stopped, and wait for their scripts, before the server is told to close (`main.ts`), and have thirty seconds as the worker host's do. Proved on the instance: a restart with six scripts in progress failed none, where it had failed three to eight. No unit test: the order is in the process's own signal handler |
| STR-09 | Killing the database | **The control plane exited when the database went away.** A pool listens for errors on its idle connections only. A connection in the middle of a transaction said `error` to nobody, and Node ends a process on that. A data source a tenant points at a server of their own could have done the same by hanging up in the middle of a query | `surviveLostConnections` (`packages/db/src/lost-connection.ts`) listens on every connection each of the four pools opens. `lost-connection.test.ts` ends a connection between two statements of a transaction: the process died without it |
| STR-10 | Killing the database | A script that ended while the control plane could not take its result said so once, was answered 500, and was failed half a minute later as not heard from | A worker says how a run ended again for up to 90 seconds while the answer is 5xx or none (`#report`); a refusal is final at once. Test in `worker.test.ts`, which failed on the old code |
| STR-11 | The disk full | The scripts in progress when the database stopped taking writes were failed eight seconds after writes returned: their heartbeats had been refused all that time | The queue is not supervised while writes are stopped, and every run in progress is counted as heard from before it is again (`forgiveSilentRuns`). Tests in `queue.test.ts` and `writer.test.ts`. **Not enough for a disk:** the control plane stops its managed workers when writes stop, thirty seconds and then an end, so a script in progress then is still failed when writes are away longer than that. Its result has nowhere to be kept. It helps a shorter stop, and a worker that runs elsewhere |
| STR-12 | Memory | **Counting a start for a fixed time was wrong both ways**: too long for a script that sleeps in 50 MB (STR-07), too short for one that takes ten seconds to reach 300, whose room was given away while it grew. And what was known of each script was in the control plane's memory, so every deploy forgot it | A worker says what each script holds now, with its claims and heartbeats and once a second and a half after the start, and only what a script has yet to take of its plan stays counted (`noteScriptsSeen`). One that outgrows its plan raises the plan at once. The most each run held is kept (`run.peak_memory_mb`, migration 0103) and read again for a script the first time it is claimed after a start. A script's memory is looked at 150 ms after it starts and when it says it is done, so one that ends at once is known too. Tests in `machine-memory.test.ts`, `machine-slots.test.ts` and `worker.test.ts`. Still so: a script never run is planned at 160 MB, and one whose input makes it take four times what it took before is planned by its past |
| STR-13 | The object store | With Fly's health check on `/api/v1/readyz`, an object store that could not be reached made the whole instance unreachable, console and API with it: the check decides where Fly sends traffic, and there is one machine | The template's check is on `/api/v1/healthz`, and the README says why. The test instance's own configuration has the old check and no `kill_timeout`: for the owner to change |

## The red team

Fifteen reviewers each took one part of the product (the front door, sign-in, single sign-on, SCIM, the authorization core, the data plane, saved SQL, outbound requests, the worker protocol, isolation as deployed, flows, the browser side, secrets, imports), from the code first. Each finding was then proved by a test that failed on the code as it was, fixed, and attacked again by a second reviewer who was given the fixes. What is fixed is recorded in `docs/documentation/fixed/p35-rt-*.md`, one file for each group. A finding that is not fixed is not written here or anywhere in the repository: the register is kept outside it, with the owner.

| Group | Fixed | Record |
|---|---|---|
| Isolation | A script could start the copy of node that may switch users, and become root in its container (critical; proved on the built image before and after) | `p35-rt-node-cp.md` |
| Browser | A docs app's own files ran as the console's address; a tab in a return address sent a person to another site after sign-in; tokens of approval, password and form pages were written to the log and the trace; the console could be drawn inside another site's page | `p35-rt-browser.md` |
| Authorization | An operator with no grant, or a member with `member:write`, could set a tenant admin's password through a password link; a role that deploys code without `code:write` was not counted as writing code; a developer could write role and binding resources; an operator's reads through six routes left no entry in the tenant's log | `p35-rt-authorization.md` |
| Workers and queries | A tenant's own worker could name any machine and fill it; a script could publish the platform's own events; a credential could report on a run it did not hold; one SQL result could make the control plane hold about 2 GB; ten slow readers of an export took every database connection | `p35-rt-worker.md` |
| Schemas and imports | A tenant's schema pattern could hold the control plane's one thread, two tenants' schemas with one `$id` collided, and each run start kept a compiled schema for ever; an archive could loop its reader, name its own key cost, call itself an older unsigned format, tie any account to an identity, and name another tenant's files | `p35-rt-import.md` |
| Expressions, egress and smaller ones | One tenant's slow expression failed every tenant's; the widget pattern check missed bounded repeats; a refused outbound request named the private address; credentials followed a redirect to another site; a second reset request ended the first link; three statements of `SECURITY.md` that the code did not keep | `p35-rt-small.md` |

**What held**, under both passes: no read or write across tenants was found in the authorization core, the data plane and its row policies, the worker protocol, the handling of SAML and OIDC, the read-only SQL guard, the outbound request guard or the cryptography. The two changes this phase made to the check (STR-04, STR-05) were reviewed by two reviewers and held.

**The second pass** broke five of the first fixes and they were fixed again (the "Round two" section of each record). It also joined findings into chains that rested on decisions that were the owner's.

**The owner's decisions, 2026-11-26**, on what the second pass left, and what was built for each (the "Round three" sections of the records):

| Decided | Built |
|---|---|
| A password reset and a first single sign-on tie end what could sign in before; an account with no membership keeps nothing that can sign in | `kernel/sign-ins.ts`. Sessions, a person's own API keys and recovery codes are ended, and the password where it applies. Replayed on the instance after the fix: the earlier password, session and key all answered 401 |
| The stricter rule for a member's password link only where the link comes back to the caller | With mail, `member:write` is enough again. A send that failed had still returned the link: it is now 503 |
| Nobody gives what they do not hold | One comparison (`requireToGive`, `kernel/authorize.ts`) at every door by which a role or a binding comes to be. The built-in workspace admin gained `*:read` (migration 0104) so that it can give viewer and deployer; it does not hold `code:write`, so the developer role is given by a tenant admin. A permission only its own name gives is given by whoever holds everything there |
| A deploy that changes who holds what needs the permission to | A deploy, promotion, rollback or clone that adds, changes or removes a `role` or `binding` resource needs `role:write` or `binding:write`. Fernhill's first deploy is now the practice manager's, not the deployer's |
| Patterns run on RE2 | `re2js` 2.10.0, for schemas and for expressions on the server. A pattern is at most 10,000 characters and its text at most 100,000, less for a large pattern; backreferences and lookaround are refused, with words that say so. The widget frame keeps the check by shape: the engine is 183 KB against a frame of 10 |
| Large tenants | The four limits on exports are settings (`EXPORTS_AT_ONCE`, `EXPORTS_PER_TENANT`, `EXPORT_STALL_SECONDS`, `EXPORT_MAX_MINUTES`). The command line is the recommended way and is not a way round them: it reads as fast as the server writes, so it is never the slow reader. The defaults suit about 15 GB of archive, by one measured rate; nothing over 20 MB has been run |
| Documented, not changed | What `sso:write` amounts to, what is and is not proved of an app's end users, and what apps that share an address share: each is in `SECURITY.md` and the pages it names |
| Format 1 archives stay refused | Nothing to build |

**Dependencies.** `nodemailer` went from 7.0.13 to 10.6.1, which cleared four high advisories; `pnpm audit --prod` now reports six, all low, in `dompurify` and `katex`. A workflow fails a pull request on a high or critical advisory and runs weekly.

## Findings

**Did phases 25 to 34 cost performance or the ability to recover?** The read paths did not: every figure phase 11 has is met or bettered on a dedicated CPU, and the new surfaces (widgets, dashboards, app pages, docs, search, MCP) hold 91 requests a second. Three things had got worse or had never been true, and were found only by breaking the instance:

- The control plane exited when its database restarted (STR-09), and every deploy failed the scripts in progress (STR-08). Neither is in phase 11, which never killed a machine.
- Cancelling a backlog stopped every run on the instance (STR-06).
- The memory arithmetic of phase 11 plans nothing for the workers themselves. With 24 tenants it stopped scripts for memory at rest (STR-02), and the first mending of that starved them (STR-07, STR-12).

**What the hardware is.** A shared CPU serves a burst and not a load, for the database and for the app (STR-01, STR-03). On one dedicated CPU the app is the limit for console traffic and for short scripts, since each run is a new process, and the database for reads of large tables. Console traffic and scripts together want more than one CPU: the console keeps its speed and the runs wait.

**Not fixed, and why.**

- A script in progress when the database stops taking writes for more than about thirty seconds is failed (STR-11): its result has nowhere to be kept.
- A write that meets Postgres at the instant it restarts is answered 500, not 503. Seen twice, one request each time.
- A script never run is planned at 160 MB, and one that takes four times what it took before is planned by its past (STR-12).
- Scripts in progress when a machine is killed outright are failed, not run again, unless they declare retries. That is the design.
- `query-result-size.test.ts` and `export-readers.test.ts` fail in some full runs of the suite and pass alone: the first measures memory, which the other tests disturb, and the second's limits are held once for the process. Both are to be made steadier.

**What could not be seen while watching**, for the monitoring work set aside:

- Why a script is not starting. Slots, a tenant's share, the memory floor and what is counted against it all end in the same silence; only `runs_queued` and `runs_running` are there. A count of claims refused, by reason, and the memory spoken for on each machine, would have found STR-07 in a minute and not an evening.
- What each script takes. `run.peak_memory_mb` is now kept and is shown nowhere.
- A deploy or a restart, and what it cost: runs failed as not heard from are counted with every other failure.
- The control plane's own memory and its event loop's delay. Both were read over `fly ssh`.
- Time waiting for a database connection, by route. `volvel_db_pool{state="waiting"}` says that requests wait and not which.
- `/readyz` is one answer for two things. A monitor needs "serving" and "whole" apart, as STR-13 shows.
- Per tenant: nothing. Every figure here is the instance's.

**The suites.** `pnpm test`: 5,460 tests, all passing but the one above. `pnpm e2e`, run in full twice, before and after the second round of fixes: 260 and 271 passed; three failed each time and passed when their files were run again, so none failed twice. Two are timing on a phone layout (`phase-27.spec.ts:478`, `phase-28.spec.ts:2170`, the second in both runs). The third is `redesign.spec.ts:170`: the Apps screen on a phone sometimes draws its description paragraph and sometimes not, which moves everything below it by about 100 px against the reviewed picture. None touches what this phase changed; the third is a real fault of that screen, found here and not mended. A third full run, after the owner's decisions were built: 274 passed, and that same Apps screen was the one failure; it passed alone. The nine tests after it in its file did not run in the full pass.

