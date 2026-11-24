# Phase 32: the browser suite runs in a third of the time

Status: in progress, on branch `phase-32-faster-suite`, off `phase-31-write-the-docs`.
Last updated: 2026-11-23

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

(none yet)

**Polish gate.** Not applicable: no screen a person sees changes in this phase.
