# Phase 35: an instance is loaded until it bends, broken on purpose, and attacked

Status: in progress, on branch `phase-35-stress-and-red-team`, off `phase-34-yaml-first-and-widgets`.
Last updated: 2026-11-25

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
| 7 | 2,190 runs queued in one workspace and cancelled in one call, while workers claimed them | Cancelled in 35 s, 16 ms a run, in one answer. Runs elsewhere went on. Before the fix of STR-06 this stopped every run on the instance | 1,140 in 8 s, 7 ms a run | Yes, slower |
| 9 | Limits as documented | A webhook took 120 in a minute and refused the next 30 with 429. A sixth stream was refused 429 `too_many_streams`, with no `Retry-After` | 120 a minute | Yes |

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

## Findings

What the phase as a whole found.
