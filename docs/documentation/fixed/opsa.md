# Lane opsa: fixed

No migration. Commits: `fad14f18` (server), then the console commit.

## OPS-10 Load more waits behind "N new runs"
- `apps/console/src/kit/arrivals.ts:44-52`: only rows that come before the first row already known are arrivals; a page added at the end, or a row that fills a gap, shows at once.
- Tests: `arrivals.test.tsx` "a page added at the end is shown at once", `Runs.test.tsx` "Load more shows the older runs at once..." (rows checked, then Load more). Both failed before.
- Siblings: `useArrivals` is used only by Runs. `kit/paged.tsx` (OPS-11's sibling note) folds to page 1 on a new first page and was not changed: it has no arrivals hold. Left, not a row of mine.
- Seen: Runs with 100+ runs in a day, tick a row, press Load more: the older rows are there, no pill. Walk at 1440/768/390, light/dark, keyboard (Load more is a button), reload.

## OPS-11 A new run drops an older one after Load more
- `screens/Runs.tsx` (effect after `loadMore`): when the first page is read again, the pages the reader loaded are read again from it until at least as many rows as before are held; rows in both are shown once.
- Test: `Runs.test.tsx` "after Load more, new runs at the top do not push older ones out of the list". Failed before (r101 to r105 gone). Takes about 6 s: the list asks again every 5 s while a run is going.
- Sibling `kit/paged.tsx` (Events and others): not changed, listed in Found.

## OPS-12 A saved view with a search loses its search
- New shared `kit/useSearchParam.ts`: the box follows the address; typing reaches the address after 300 ms and is never written back over an address that changed. Used by Runs and Audit (same bug), and the Events name box follows its address (`screens/Operate.tsx`, effect under `useUrlParam("name")`).
- Test: `Runs.test.tsx` "a saved view's search stays in the address and the box". Failed before.
- Siblings: Audit fixed with the same hook. Other list searches (`ListCollection`) read from the address and have no separate typed state; not changed.

## OPS-13 Checked runs survive a filter
- `kit/DataTable.tsx` (`kept`, near `shown`): checked keys the table no longer has are dropped (and `onCheck` told), and the count, toolbar, select-all and `batch(...)` use only what is there.
- Test: `Runs.test.tsx` "rows checked and then filtered away are no longer checked or acted on". Failed before.
- Siblings, all through DataTable: Triggers, Approvals, Release drafts, Data (checked rows), the kit sheet. Same rule for all.

## OPS-14 More than 100 checked is refused whole
- `kit/BatchResult.tsx` `inSlices`/`BATCH_LIMIT`: slices of 100, one after the other, answers added up. Used by Runs (script and flow batches), trigger pauses and approvals (`screens/Operate.tsx`), draft discards (`screens/Release.tsx`).
- Test: `BatchResult.test.tsx` "a batch of more than a hundred is sent in slices...". Failed before.
- Left: `drafts/batch` calls in Docs/Interfaces send their own changes, not checked rows; not changed.

## OPS-15 "Cancel N queued" under a chip that shows none
- `screens/Runs.tsx`: shown only under All and Queued, and not for flows; the dialog says "Every queued script run <scope> is canceled, whether or not this page has loaded it." American "canceled" in the toast.
- Test: `Runs.test.tsx` "Cancel queued is offered where the list shows queued runs, not under Failed". Failed before.
- Left out: runs that only wait for a start time are still counted as queued (OPS-25, not mine).

## OPS-16 A schedule's run does not link to its schedule
- Server: schedule runs write `trigger` (`kernel/execution/triggers.ts`, source and target starts, Fire now); event runs write `trigger` (the subscribing trigger's label) beside `event` and `eventId` (`kernel/flows/events.ts`); `stillGoing` reads `trigger` or the old `schedule`.
- Console: one `startedBy` in `screens/Execution.tsx` (moved out of RunPage), used by script and flow run pages and the Runs details; reads either key, and links an event run to `events?item=<id>`.
- Tests: `operations.test.ts` "a run says which schedule started it...", "an event's run says the trigger it came through"; `Runs.test.tsx` "a run of a schedule from before the change, and an event's run, link...". `execution.test.ts` and `flows.test.ts` assertions changed from `schedule` to `trigger`. All failed before.
- Docs line: a schedule's run trigger is `{ type: "schedule", trigger: "<path>", scheduledFor }`; runs from before have `schedule` in its place.

## OPS-17 A flow's schedule shows no cron, and says UTC
- `routes/execution.ts` triggers list reads `row.config` first (the resource body only for older rows).
- Test: `operations.test.ts` "a flow's schedule says its cron and its zone". Failed before.
- Siblings: ObjectPages and Overview read the same list.

## OPS-18 Fire now with a source starts the script without the source
- `kernel/execution/triggers.ts` `startSourceRun`, shared by a due time and `fireScheduleNow`. Fire now while the source is still looking: 409 "The source is still looking from the last time", no refusal record.
- Test: `extensions.test.ts` "Fire now on a schedule with a source starts the source...". Failed before.
- Left out: Fire now on a paused schedule is not yet refused by the API (D31); it is a row in the owner's list, not one of mine.

## OPS-19 "Not fired yet" beside the run it started
- `routes/execution.ts` `lastRunOf`: runs started by hand are not a trigger's last run. A webhook with a source now says it fired (the relay sets `last_fired_at` when it started something; tier 1).
- Tests: `operations.test.ts` (same test as OPS-16), `extensions.test.ts` "a webhook whose source started runs says it fired". The first failed before; the second already held after tier 1.

## OPS-20 A paused or turned-off schedule shows a next time
- Server: `register` keeps no `next_fire_at` for a schedule turned off, and the lists (`routes/execution.ts`, `routes/flows.ts`) give none for one that is off.
- Console: `nextFireOf` beside `TriggerState` in `screens/Operate.tsx` is the one rule: next / fires once when resumed (paused and already due) / not while paused / not while off. `TriggerState` and the inspector's Next row use it.
- Tests: `operations.test.ts` "a schedule that is turned off has no next time"; `Operate.test.tsx` "a trigger that is off or paused gives no next time...". Both failed before.
- Siblings: Overview and ObjectPages use `TriggerState`. `Flows.tsx` "runs next at" gets null when off from the server; it does not know of pauses (OPS-21, lane opsb).

## EXT-03 (told through the failure alert) and Found item
- `triggers.ts` `relaySource`: when items were refused for good, the workspace's failure alert goes out once for the pass (the source script's own `onFailure` wins, as for any failed run), the trigger's refusal says where each item is kept (the source run's output, `refused`, by place in `items`), and the run is not marked failed.
- Test: `extensions.test.ts` "an item refused for good is told through the workspace's failure alert, once for the pass". Failed before.
- Found "a source run that fails after its relay is announced as succeeded": `kernel/execution/runs.ts` `afterRun` passes on the answer before announcing, then announces what the run came to.
- Test: `extensions.test.ts` "a source run that fails after its answer was passed on is announced as failed". Failed before.
- Not changed: the `runEnded` metric and trace are still recorded as "succeeded" for such a run (`completeRun`).

## Screens to walk
Runs (list, Load more, checked rows with a search, saved view with a search, Cancel queued under each chip, details "Started by" for a schedule, event and webhook run); Triggers (inspector Next, Last fired, paused and off rows, Fire now on a schedule with a source, a flow's schedule row); Audit search with a saved view; Events name box with Back. 1440/768/390, light/dark, keyboard, reload.
Polish gate: states (held/off/paused each say so in words), lifecycle (Fire now, Load more, batch of 100+), keyboard (no new controls), copy (plain, "canceled").

## Found
- `kit/paged.tsx` folds to page 1 on a new first page and loses the reader's place (OPS-11 sibling): not changed.
- `completeRun` records the run-ended metric and trace as succeeded before its relay can fail the run.
