# Phase 32: the browser suite runs in a third of the time

Status: built, at the owner's stop, on branch `phase-32-faster-suite`, off `phase-31-write-the-docs`. Nothing merged or pushed.
Last updated: 2026-11-24

The owner (2026-11-23): the browser suite "slows down development more than the time it takes to implement. I'm not saying get rid of the suite but to figure out how to speed it up", and chose to make this the first thing after phase 31. The plan is `~/.claude/plans/i-would-like-to-fuzzy-meteor-of-45518b7f-b8fc-41f4-9613-9ba4253edadd.md` (phase 32).

**What was measured (phase 31's last runs).** `pnpm e2e` took 20.8 to 28.4 minutes for 203 to 221 tests. The tests' own times add up to the whole run: `workers: 1` on a 16-core machine. Two specs took almost half: `polish-measures` (one test, about 330 page opens, 6 minutes) and `polish-layout` (8 serial tests, 6.7 minutes). Specs sign in through the form at 116 places; `e2e/sign-in.ts` still waits on the old 3-per-10-seconds limit, while the instance now allows 20 a minute per address.

**Exit criterion.**

- The full local run, on the same machine and a seeded instance, takes 10 minutes or less (to be measured), with every test that passed before still passing;
- three full runs in a row pass with nothing flaky;
- `pnpm e2e:changed` runs only the specs a change touches, and `pnpm e2e --grep @<area>` an area's;
- CI's three groups pass, and the groups that need no Fernhill do not seed it.

## Owner decisions

| Area | Decision |
|---|---|
| The suite | Stays whole; made faster, not smaller (2026-11-23) |
| Order | First after phase 31; then phase 33 (docs reading and the changelog) |

## Milestones

| # | Milestone |
|---|---|
| M1 | Sign in once per person (saved sessions), sign-in honours Retry-After, a worker's own address |
| M2 | Three projects: parallel, Fernhill, alone; workers from `E2E_WORKERS`; nothing shared races |
| M3 | `polish-measures` and `polish-layout` split per screen group and width, on a worker's own tenant |
| M4 | Run what a change touches: `e2e:changed`, tags; CI re-cut |

## Findings

**Timings** (the same machine, 16 cores and 15 GB; the same seeded instance; nothing else running):

| Run | Wall | Result |
|---|---|---|
| Before (phase 31), 1 worker | 20.8 min | 203 passed |
| Lanes s1 and s2 merged, 4 workers | 13.0 min | 5 failed, 15 not run (Fernhill specs side by side) |
| Fernhill one file at a time, 4 workers | 16.0 min | 1 failed |
| Same, with a sampler | 15.3 min | all passed |
| Main part only, 8 workers, with a timeline | 11.7 min | 1 failed (an animation sampled on an overloaded machine) |
| Fernhill first, one polish tenant per run, 4 workers | **12.4 min** (9.2 main + 3.2 alone) | **all 270 passed** |
| A Fernhill copy per Fernhill worker (3), the instance-wide specs on a second instance at the same time, 6 workers | 9.3 min | 1 failed (the drawer's animation, sampled frame by frame) |
| The same, after the fixes below | **9.0 min** (9.0 main, 4.5 alone beside it) | **all 271 passed** |
| Three in a row after the last fix | **9.2, 9.0, 9.0 min** | all passed, each time |

**What limited each run, measured rather than guessed** (a sampler every 5 s: the instance's CPU in the window, Postgres's CPU, the load, runs queued; and Playwright's JSON report for each test's worker, start and end):

1. **The instance was not the limit at 4 workers.** It averaged 31% of one core (peaks of 3.8 cores), Postgres 27%, the load 4.4 of 16, and no run waited. The machine was mostly idle while tests waited.
2. **The scheduler started the longest chain last.** Playwright hands out work in the order of the projects. The Fernhill chain, which must run on one worker, was listed after the parallel specs, so it started 251 s in and then ran alone to the end. Listing it first made the main part's wall time the chain's own length.
3. **Each worker built the same setup.** Every polish worker built a tenant of its own, 90 to 130 s each: deploying, running scripts, and waiting for a failed run and an approval. At 8 workers that was 8 at once. The measuring specs only look, so one tenant per run now serves every worker (polish specs: 4.6 to 3.6 min at 4 workers).
4. **At 8 workers Postgres became the limit.** It held a full core (98% average), and up to 23 runs queued, almost all from the simultaneous polish setups. More workers than 4 do not help on this machine.
5. **Shared data serialises.** Fernhill's specs share one seeded tenant. One spec's rows (`phase-28` adds invoices and appointments) change what another counts, so they must run one after another. That chain, about 8.7 min, is now the critical path of the main part. Splitting `phase-28.spec.ts` would not shorten it, since its parts would still queue on the one Fernhill worker.
6. **A swallowed error leaked resources.** The old polish teardown's deletion was refused (a tenant with a run in progress is not deleted) and the refusal ignored, so every polish run left a tenant behind: 52 on the test instance. The teardown now cancels the waiting run first and says so if a deletion fails.
7. **Retries had the wrong clock.** `sign-in.ts` waited 10.5 s for the old limit of 3 sign-ins per 10 s, while the instance now allows 20 a minute per address. Saved sessions removed most sign-ins, and the rest honour `Retry-After` from a worker's own address.
8. **Timing assertions break under contention.** The drawer's opening animation, sampled frame by frame, failed only when the machine was overloaded (8 workers).

**For an application that scales** (what the suite showed about Volvel itself):

- **Vertical:** the first limit was Postgres, not the Node process. The control plane spread work over several cores at peaks while Postgres held one. Before adding replicas, look at what a deploy or a run costs the database (statements per deploy, per run start, per poll).
- **Horizontal:** more control-plane replicas on one Postgres would not have helped at 8 workers, because they share the bottleneck. Replicas help request handling; the database needs its own plan (pooling, read replicas for read-heavy screens, fewer round trips per operation).
- **Isolation is parallelism:** work that shares a tenant serialises (here Fernhill's tables; in the product, a tenant's deploys and drafts). Per-tenant boundaries are what let work run side by side.
- **Do expensive setup once and share it read-only:** the same holds for a replica's cold start or a worker's warm-up.
- **Schedule the longest chain first:** for a job queue, ordering by expected length shortens the total time.
- **Rate limits keyed only by address** penalise many clients behind one address (the workers here; an office behind NAT in production). Key by account as well.
- **Live updates need a periodic check behind them.** An event stream alone loses events: one sent before a page subscribed, or dropped under load. Whatever shows a live state should read it again now and then until it is final (fixed here for runs; other live screens are worth the same look).
- **Run slots are sized from memory alone** (96 on 16 cores here), and each tenant has a managed worker process of its own. Under many tenants at once that is memory, not CPU, that runs out, and the free-memory floor then holds every new worker back. Slots bounded by cores as well as memory, and idle workers reaped sooner, would keep a busy instance fair.
- **Is the database limit real?** Mostly the suite's own shape: what saturated Postgres was 8 tenant setups at once, each making a schema, tables and row policies, deploying and running. That is what onboarding many tenants or deploying often looks like, and it is worth making cheaper. Ordinary use (reads, row writes, runs) never came near it: at 4 workers Postgres averaged 27% of a core. A load test shaped like real traffic would say how far ordinary use goes.
- **Clean-up must not fail silently:** a refused deletion should be surfaced and retried.

**The last two changes** (owner, 2026-11-24: "make those two changes"):
- **A Fernhill copy per worker** (lane f1, `fixed/p32-f1.md`): the seed takes `FERNHILL_SLUG`; copies reuse the instance's people (an existing account is added to a tenant, not refused), so the saved sessions still work; `fernhill-copies.setup.ts` seeds the missing copies in parallel, once per instance; each Fernhill worker claims its own. The Fernhill chain went from 8.7 to 4.3 minutes on 3 copies.
- **A second instance for the specs that change the whole instance** (`E2E_ALONE_URL`, port 8090, which Keycloak's test realm sends sign-ins back to): they run there beside the rest. Without one they still run after the rest, as CI's groups do.

**Found on the way, fixed:**
- **A product fault.** A run followed while the live stream was up was read again only on an event naming it, so a missed event left it "Running" for ever: the Test pane read "ran 1m 26s" for a run that had succeeded in 0.3 s. `useLiveRun` (`apps/console/src/screens/Execution.tsx`, used by the Test pane, the run page, the runs workbench and flow runs) now asks again every 5 s while the stream is up, until the run ends; a test in `Stream.test.tsx` fails without it.
- **The instance's free-memory floor** (a tenth of memory by default) held managed workers back while the browsers took memory, so a new tenant's first run waited past its test's limit. Test instances and CI set `RUN_MEMORY_FLOOR_MB=512`.
- **Two goes side by side:** each writes its output outside the folder Playwright searches (`e2e-results/`), since a go empties its output folder when it starts and the other, still listing its specs, found it gone.
- **The drawer's slide** is now seen by its running animation as well as by a frame part of the way: frames are skipped on a loaded machine.

**Not counted above:** the run slots the instance gives itself are sized from memory alone: 96 at once on this 16-core machine, each tenant with a managed worker process of its own. For a product finding, see "For an application that scales".

For daily work, the tags and `pnpm e2e:changed` run only what a change touches.

**Polish gate.** Not applicable: no screen a person sees changes in this phase.

**Full suites at the end.** `pnpm e2e`: three full runs in a row passed (above). `pnpm test`: 4979 of 4990 passed. The 7 failures are the same 7 that failed when the whole unit suite ran at the end of phase 31: `DraftBasis`, `Queries`, `MarkdownEditor` and `TextOnPage`, all editor tests with timing. Run alone, all 28 tests of those files pass. They fail only under the full suite's load and are worth the same look as the browser suite's timing tests.
