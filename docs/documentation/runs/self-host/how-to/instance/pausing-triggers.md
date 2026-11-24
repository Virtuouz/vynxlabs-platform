# Run log: self-host/how-to/instance/pausing-triggers.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as the operator `admin@example.com` with Playwright headless, at 1440 px in light for every step; 390 px (members, health, databases) as a screenshot only; no dark run and no keyboard-only run. Other writers used the instance at the same time (their tenants and members are in the lists).
- Names made for this run start with `instance`: tenants `instance-demo`, `instance-demo-2`, `instance-loc-t`, `instance-loc-2`; the member `instance-walk@example.com`; the database location `instance-walk-db`, backed by a throwaway database `instwalk_loc` made in the dev Postgres container and dropped at the end. Everything made was deleted afterwards except the member (a member cannot be deleted).

## What was done
- The owner's rule is that this instance is never paused, so **Pause every trigger** and **Resume triggers** were NOT pressed and `volvel instance triggers` was NOT run. The page is written from the code (`InstanceTriggers.tsx`, `instance-control.ts`, `cli.ts`) and the CLI's test (`cli.test.ts:329`).
- Seen on the instance: **Instance > Triggers** in the running state: the header, "EMERGENCY STOP", "Triggers are on", the explanation and the button **Pause every trigger**.
- Seen: a dev workspace of another writer showed the pill and Overview card for a workspace's own pause ("Triggers are paused"), which is a different switch from the instance's.

## The steps as followed
None. This page is not run, and is not presented as finished: a run on a throwaway instance that may be paused is still to do.

## Not run
- Pause (with and without a Why), the paused notice, Resume, the paused-by-environment state, the CLI, the workspace pill and Overview card for the instance's pause, a webhook refused with 503.

## Second check, 2026-11-23 (second agent)
- Still NOT run, on purpose: this instance is never paused (the owner's rule), so **Pause every trigger**, **Resume triggers** and `volvel instance triggers` were not used. The page is written from the code and the CLI's source (`cli.ts:1215-1223`: "Triggers are running.", "Triggers are running again.", "Every trigger is paused. Runs already queued or going carry on.", "Why: ..."), and the page is not presented as run. It needs a throwaway instance that may be paused.
- Seen again: **Instance > Triggers** in the running state at 390 px in dark (no horizontal scroll, **Pause every trigger** reachable by Tab).
