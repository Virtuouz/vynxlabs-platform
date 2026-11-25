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

## Issues

Each issue found, by number, with what was seen, the cause, the fix and the rerun.

| ID | Found in | What | Fix |
|---|---|---|---|
| STR-01 | Seeding, M1 | The app's shared CPU is throttled once its burst is spent. The first Fernhill seeded in 138 s; the eleven copies after it took 389 to 823 s each, with the app machine at 86 % steal and a load of 5 on two shared CPUs, while the database sat 93 % idle. Phase 11 saw 52 % steal on the same size | Hardware, not code. Every scenario is run on this size for comparison, then again with the app on a performance CPU. `sizing-and-scaling.md` is to say what a shared CPU sustains |
| STR-02 | Filling a table, M1 | With 24 tenants, the 2 GB machine had under 100 MB free with no script running: 13 managed workers held about 105 MB each (1.35 GB), and the control plane 470 MB resident and 330 MB in swap. Below the floor a worker counted itself as never idle (`packages/worker/src/worker.ts`, "Not idle: the work is there, the memory is not"), so none left; nothing was claimed, 8 runs sat queued with none running, and each script that did start, down to one of 31 MB, was stopped as the machine's largest. The slot arithmetic plans 160 MB a run and 512 MB kept back, and nothing for a worker | A worker that exits when idle now leaves after 8 to 16 s below the floor with no run in progress, and a worker is started only where 128 MB stays above the floor, in the supervisor and in the worker host. Tests in `worker.test.ts` and `supervisor-stop.test.ts`. That alone was not enough: at 22:00 the hourly schedules of twelve tenants came due together, twelve workers started and six scripts were handed out on one reading of free memory, the machine fell to 56 MB and `/readyz` timed out, then answered 503. Three more changes: what was started a moment ago is counted before more is started, workers and scripts in one place (`kernel/execution/workers.ts`, `machineShortOfMemory`), a worker at 96 MB for ten seconds and a script at 160 MB until it ends or eight seconds pass; a worker tells the control plane its free memory with each claim; and a worker loads `@volvel/manifest/digest` alone and the mail library only when a script sends, so its code takes 64 MB where it took 126. **Rerun**, 120 runs over twelve tenants in 20 s, half of them holding 120 MB, with the hourly schedules landing in the middle: 118 succeeded and none failed, free memory never under 368 MB, `/readyz` 200 throughout and 560 ms at worst, four to seven scripts at once |

## Findings

What the phase as a whole found.
