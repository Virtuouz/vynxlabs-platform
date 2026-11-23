# Lane trg: fixed

Migration: `packages/db/migrations/0086_trg_refusal_reasons.sql` (widens `webhook_refusal.reason`; unlocked).

## OPS-05, SCR-04 (commit "a script's row changes carry its depth")
- `routes/data.ts` `announceRows` takes `depth` and announces only inserted/updated/deleted with a string id; new shared `announceScriptRows`. `routes/worker.ts` uses it with the run's depth and the table's path now.
- Tests: `data-access.test.ts` "a chain of its own changes stops, as a chain of events does", "an aggregate is no change...". Both failed before.
- Siblings: row routes in `data.ts` and `kernel/pages/act.ts` call `announceRows` unchanged (depth 0).

## EXT-01
- `packages/manifest/src/bundle-check.ts` checks a source's connections and variables exist; `kernel/execution/deploy.ts` `missingBindings` counts its secrets, connections, variables.
- Tests: `bundle.test.ts` "what a trigger source names"; `extensions.test.ts` "a source that names a secret nobody bound is refused at deploy". Failed before.

## EXT-02, OPS-06 (D26), EXT-03, EXT-04, OPS-07, OPS-08
- `triggers.ts` `relaySource`: more than 100, or poll `items` not a list, fails the source's run (alerts sent), starts nothing, keeps the cursor, records refusal `error`. A non-HTTP failure rolls back everything (cursor too), fails the run, and rethrows. Webhook sources over 100 fail the same way.
- EXT-03 decision: an item that does not fit is permanent (the same item would be refused again), so the others start and the cursor moves; the item's place and reason go to the source run's `output.refused` (the item itself stays in that output) and a refusal `input`. Transient failure loses nothing: whole answer undone. Keys `source:<run>:<index>` make a repeat pass-on start nothing twice (tested).
- EXT-04: pause during the source run records refusal `paused`.
- OPS-07: `register` keeps `next_fire_at` and `lastSkipped*` when cron and zone are the same (kept in config, no new columns).
- OPS-08: `recordRefusal` exported, reasons `input|filter|busy|error`; recorded for schedule input, busy source, webhook input 400, event filter error and unfitting event payload (`kernel/flows/events.ts`). `last_fired_at` is set only when a run started.
- SDK doc of `PollResult.items` names the limit. Console `Operate.tsx` REFUSED copy for the new reasons.
- Tests: `extensions.test.ts` "what it gives that cannot be started" (5), `operations.test.ts` "a trigger that cannot start what it is for" (3). 8 failed before.
- Siblings: `form` trigger and flow `startTarget` callers unchanged; forms already answer the person.
- Screens to walk: Triggers (Operate) notice "Last refused ..." with the four new reasons, at 1440/768/390, light/dark; Runs for a failed source run.
- Line for docs: a source tick may start at most 100 items; more fails the tick and keeps the cursor.

## Found
- Source run is marked failed after it was reported succeeded (the run-succeeded event was already published).
- Process: I used `git stash` once during the lane; it collided with another lane's stash (see report).
