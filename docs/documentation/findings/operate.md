# Findings: operate

Prefix `OPS`. Slice of [the inventory](../inventory/operate.md), settled at `270e509`. Paths: `CP/` = `apps/control-plane/src/`, `X/` = `CP/kernel/execution/`, `CO/` = `apps/console/src/`, `S/` = `CO/screens/`, `M/` = `packages/manifest/src/`. "Scratch test" is a control-plane file with its own instance; "browser" is a Playwright script on a tenant of its own at `localhost:8091`. Both were removed. Seven small tenants named "Ops triage" are left on the throwaway instance (there is no route to delete a tenant).

## Rows

### OPS-01 Approval mail and its link page show values the queue masks
- **Outcome:** reproduced (E1)
- **Severity:** security
- **Where:** `CP/kernel/flows/approval-links.ts:125`; `CP/routes/approval-links.ts:60`. The queue, the run page and the app widget mask: `CP/routes/flows.ts:1367,1253`, `CP/kernel/pages/approvals.ts:126`.
- **Evidence:** scratch test, a detail with secret-named fields: the queue answered `[redacted]` for both; the mail's text and the unauthenticated link page held the real values.
- **Fix:** one function that gives an approval's detail as shown, used by the queue, mail, link page, widget and MCP (OPS-02). Test first: `approval-links.test.ts`, mail and page hold no masked value.
- **Size:** S. **Milestone:** M1

### OPS-02 MCP shows masked values to people who only read: `list_approvals`, and `get_run` / `get_flow_run` of another person's run
- **Outcome:** owner decides (behavior reproduced)
- **Severity:** security
- **Where:** `CP/routes/mcp.ts:223-246` (no mask), `:409-433` (another's run, by `run:read` or `flow_run:read`), `:473`.
- **Evidence:** scratch test: the API masked the same approval and run output; both tools gave the real values. Phase 13 M7 left MCP results unmasked because "they are the answer to a call the agent made, not a display of a past run"; neither of these is that.
- **Fix:** mask in `list_approvals`, and in `get_run` and `get_flow_run` when the run is not the caller's. Test first: `mcp.test.ts`.
- **Size:** S. **Milestone:** M1

### OPS-03 Event payloads are shown unmasked to anyone with `event:read`, a viewer included
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `CP/routes/flows.ts:1748` (`payload: row.payload`).
- **Evidence:** scratch test: a viewer read a secret-named field and a field the event's schema marks `x-secret`. The run that event started showed the first as `[redacted]`.
- **Fix:** `redact(row.payload, the event's payload schema)`. The same schema should mask the run's input it became. Test first: `redact.test.ts`, `GET events`.
- **Size:** S. **Milestone:** M1

### OPS-04 One flow schedule whose bundle cannot be read stops every schedule on the instance
- **Outcome:** reproduced
- **Severity:** broken (availability, across tenants)
- **Where:** `X/triggers.ts:698-808`: only `HttpError` is caught; the transaction rolls back, so the same row stays first by `next_fire_at`. `X/background.ts:85` logs and tries it again. Cause: `CP/kernel/flows/engine.ts:97` reads storage.
- **Evidence:** scratch test: one workspace's active bundle missing from storage. Three ticks threw "No stored object"; another workspace's due schedule never fired. With that row set aside, the next tick fired it. Happens after a restore without storage, or a lost object.
- **Fix:** on any error, roll back that one start, move the schedule's next time on in its own transaction, record why (OPS-08), and go on. Siblings: `publishEvent` and `relaySource` also roll everything back for one subscriber. Test first: `trigger-limits.test.ts`.
- **Size:** S. **Milestone:** M2

### OPS-05 A script that writes the table it listens to loops without end
- **Outcome:** confirmed by code, and the constant depth reproduced (E8)
- **Severity:** data
- **Where:** `CP/routes/data.ts:199-218` (`depth: 0`), called by a run at `CP/routes/worker.ts:967`. Others in a chain pass `trigger_detail.depth` (`worker.ts:785`, `X/runs.ts:564`, `engine.ts:441`).
- **Evidence:** scratch test: a run at depth 10, then a row change as the worker announces it: the event is stored at depth 0 and starts another run. Phase 3 says a chain stops at 10.
- **Fix:** `announceRows` takes a depth; `worker.ts` gives the run's. Also pass the table's path now, not `body.table`, which may be the name before a rename. `kernel/pages/act.ts:584` and the API stay 0. Test first: `flows.test.ts`, a table listener that writes its own table stops.
- **Size:** S. **Milestone:** M2

### OPS-06 A trigger source that gives more than 100 items loses the rest
- **Outcome:** reproduced (C14)
- **Severity:** data
- **Where:** `X/triggers.ts:569,610` (`MAX_RELAYED`), `:621-628`: the cursor is moved past the dropped items; only a server log says so. An item that does not fit what it starts is dropped the same way (`:645`).
- **Evidence:** scratch test: 130 items with cursor 130 started 100 runs and kept cursor 130. The limit is in no document or SDK type.
- **Fix:** fail the source's run, starting nothing and moving no cursor, with a message that names the limit; say it in `TriggerSource`'s types. Record a dropped item on the trigger (OPS-08). Test first: `extensions.test.ts`.
- **Size:** S. **Milestone:** M2

### OPS-07 Editing a paused schedule loses the firing it was holding
- **Outcome:** reproduced (E12, the rest of it)
- **Severity:** data
- **Where:** `X/triggers.ts:285-307` (`register` always sets `next_fire_at: firstFire(now)` and replaces `config`).
- **Evidence:** scratch test: paused and an hour overdue; a deploy that changed only its description moved the next time to 2027 and cleared "last skipped"; resuming fired nothing. The API says "keeps its due time and fires once when resumed" and "the pause outlives deploys". For a flow, any edit of the flow does it. A deploy that does not change the resource does not (it is skipped).
- **Fix:** keep `next_fire_at` when cron and zone are the same; keep `lastSkipped*`, best as columns. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M2

### OPS-08 A trigger that cannot start its run says nothing anywhere
- **Outcome:** reproduced (C12 and more)
- **Severity:** wrong
- **Where:** `X/triggers.ts:798-805` (schedule), `:764` (busy source, E12), `:645` (source item), `CP/kernel/flows/events.ts:106-137` (filter error, payload that does not fit), `X/triggers.ts:1030` (webhook input that does not fit: 400, no refusal kept).
- **Evidence:** scratch test: a schedule whose input no longer fits: "Last fired" moves on every minute, `lastRun`, `lastSkipReason` and `lastRefusal` null. A failing filter and an unfitting event: nothing. A webhook answered 400: `lastRefusal` null.
- **Fix:** one `recordRefusal` for every type with reasons `input`, `filter`, `busy`, `error`; "last fired" set only when something started; shown by the existing `lastRefusal` notice. Test first: one per type in `operations.test.ts`.
- **Size:** M. **Milestone:** M7

### OPS-09 A renamed connection silently ends the workspace's failure alerts
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/kernel/rename.ts:31-62` does not carry `workspace.failure_alert`; `X/alerts.ts:169-176` reads the path as it was.
- **Evidence:** scratch test: default `{script, notify}`; deploy renames both. The setting keeps the old paths; the alert answers `The connection "chat" is not bound.` while `ops/chat` is bound. The script still starts through its alias, for 90 days.
- **Fix:** hold the two by resource key, or rewrite them in `renamePathState` (workspace JSON is not seen by the test that looks for path columns). Sibling: CFG-01. Test first: `renames.test.ts`.
- **Size:** S. **Milestone:** M2

### OPS-10 "Load more" on Runs seems to do nothing: the older rows wait behind "N new runs"
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CO/kit/arrivals.ts:44-49`: any row not seen before is an arrival, and is held while scrolled (always so at the button) or while rows are checked. `S/Runs.tsx:318`.
- **Evidence:** browser, 130 runs: after Load more the list still had 100 rows and a pill "30 new runs" at the top; pressing it showed 130.
- **Fix:** only rows that come before the first known row are arrivals. Test first: `arrivals.test.tsx`, a page appended is shown at once.
- **Size:** S. **Milestone:** M7

### OPS-11 After "Load more", each new run drops an older one from the middle of the list
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `S/Runs.tsx:214-245`: page 1 is read again and shifts; later pages keep the cursor of the old one. Later pages are also never refreshed, so their states go stale.
- **Evidence:** browser: 130 rows, 5 runs arrive: still 130 rows, 5 earlier ones gone, with no way to see them but a reload.
- **Fix:** read again up to the last cursor shown, or keep rows by ID and merge. Sibling: `CO/kit/paged.tsx` (Events and others) folds back to page 1 on any new first page, which loses the reader's place. Test first: `Runs.test.tsx`.
- **Size:** M. **Milestone:** M7

### OPS-12 A saved view with a search loses its search
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `S/Runs.tsx:190-201`: the box's own text is written back over the address 300 ms after the address changes from outside. Back and forward do the same.
- **Evidence:** browser: applying a view with `q=alpha` gave `?q=alpha`, and 1.5 s later no search and an empty box.
- **Fix:** a shared `useSearchParam` (box follows address) in kit. Sibling: the Events name box does not follow the address (`S/Operate.tsx:659`); Audit should be checked. Test first: `Runs.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-13 Checked runs survive a filter, and a batch acts on only some of those it names
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `S/Runs.tsx:316-350`: `checked` is never pruned; `kindOf` looks only in the loaded rows, so a hidden one is sent nowhere. `CO/kit/DataTable.tsx:400` counts it.
- **Evidence:** browser: 6 checked, then a search: "6 selected", the dialog "Cancel 6 runs?" with raw IDs for the hidden ones; 3 were canceled and nothing was said of the other 3.
- **Fix:** in DataTable, prune `checked` to the rows it has. Same class as the tables finding of checked rows; siblings: Triggers, Approvals, Release drafts. Test first: DataTable.
- **Size:** S. **Milestone:** M2

### OPS-14 More than 100 checked is refused whole
- **Outcome:** reproduced (E5)
- **Severity:** broken
- **Where:** `CP/routes/batch.ts:19,51`; `S/Runs.tsx:329-341` sends all in one request. Ctrl+A after Load more reaches it.
- **Evidence:** 101 IDs: 400 "must NOT have more than 100 items", shown as it is. "Run again" of both kinds can do one kind and then fail.
- **Fix:** the console's `useBatch` sends slices of 100 and adds up the answers. Siblings: approvals, trigger pauses, draft discards. Test first: `useBatch`.
- **Size:** S. **Milestone:** M7

### OPS-15 "Cancel N queued" says "every queued run this list shows" under a chip that shows none
- **Outcome:** reproduced (E6)
- **Severity:** wrong
- **Where:** `S/Runs.tsx:288-314`. It also counts runs that only wait for their start time (OPS-25).
- **Evidence:** browser, chip Failed, 0 rows: "Cancel 9 queued", dialog "Every queued run this list shows (from the last 24 hours)". It would cancel the 9. Kind, search, tags and target are followed correctly.
- **Fix:** show the button only under All and Queued, and say "every queued run of script runs matching…" from the filters. Test first: `Runs.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-16 A schedule's run does not link to its schedule
- **Outcome:** reproduced (E3)
- **Severity:** broken
- **Where:** written as `schedule` (`X/triggers.ts:773,792,866`); read as `trigger` in `S/RunPage.tsx:219`, `S/Runs.tsx:1079` and the flow run's header. Event runs have no trigger named either, only `event`.
- **Evidence:** scratch test: `{"type":"schedule","schedule":"on",…}`.
- **Fix:** write `trigger` for schedules too, and read either for old runs, in one shared "Started by". Also link an event run to its event (`?item=`). Keep `stillGoing` reading both. Test first: `RunPage.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-17 A flow's schedule shows no cron, and says UTC whatever its zone
- **Outcome:** reproduced (E2)
- **Severity:** wrong
- **Where:** `CP/routes/execution.ts:1834-1835` reads the resource's body, which is the flow's. `trigger_state.config` has both. `S/ObjectPages.tsx:461` and Overview show it too.
- **Evidence:** scratch test, `0 9 * * *` in America/New_York: `{"cron":null,"timezone":"UTC"}`, next time right. Browser: no Schedule row.
- **Fix:** read `row.config`. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-18 Fire now on a schedule with a source starts the script itself, without the source
- **Outcome:** reproduced (E4)
- **Severity:** wrong
- **Where:** `X/triggers.ts:842-877`. The route says "as the schedule's next time would".
- **Evidence:** scratch test: the script ran with `{}`; the source did not run.
- **Fix:** start the source as `fireDueSchedules` does, shared. Test first: `extensions.test.ts`. Fire now on a turned-off schedule: 201, see Owner decides.
- **Size:** S. **Milestone:** M7

### OPS-19 "Not fired yet" beside the run it started
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/routes/execution.ts:1768` counts runs fired by hand under the schedule's label; `S/Operate.tsx:333,599` says they are not counted. A webhook with a source never sets `last_fired_at` (`X/triggers.ts:999-1019`).
- **Evidence:** scratch test: after Fire now, `lastRun` set and `lastFiredAt` null; the inspector shows both. After a source webhook: `lastFiredAt` null.
- **Fix:** leave `manual` runs out of `lastRun` (or say "started by hand"); set `last_fired_at` in the source path and in `relaySource`. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-20 A paused or turned-off schedule shows a next time, and one held while paused shows a past one
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `X/triggers.ts:289` (set whatever `enabled` is); `S/Operate.tsx:591`.
- **Evidence:** browser: "Paused just now… Nothing it would start is started" and "Next 20:00:00". Scratch test: `enabled:false` with a next time.
- **Fix:** give `nextFireAt` only when it will fire: not off, and paused as "Fires once when resumed" if due. One rule, beside `TriggerState`. Siblings: draft rows, Overview. Test first: `Operate.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-21 A workspace's pause is not shown on script and flow pages, and an instance pause nowhere
- **Outcome:** reproduced for the workspace; confirmed by code for the instance (E9)
- **Severity:** wrong
- **Where:** `S/ObjectPages.tsx:461`; the only reader of `/instance/triggers` is `S/InstanceTriggers.tsx:23`, which needs `instance:read`.
- **Evidence:** browser, workspace paused: the script's Triggers tab said "On" and "Next in 2h"; the Triggers page said "Workspace paused".
- **Fix:** the server says it: `GET triggers` (and the workspace) answer `pausedBy: instance | workspace | trigger`, so `TriggerState` needs no prop. Siblings: Overview, TenantOverview, Shell badge (`CO/Shell.tsx:1125`). Test first: `ObjectPages.test.tsx`.
- **Size:** M. **Milestone:** M7

### OPS-22 Runs of a trigger source lead to pages that are not there, and offer a re-run that always fails
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `S/RunPage.tsx` header and palette, `S/Runs.tsx:1069`, row menu; `CP/routes/execution.ts:1282-1290` passes no `relay`, so `startRun` looks for a script.
- **Evidence:** browser: header link `/scripts/src` gives "Nothing here"; Re-run gives "The script src was not found." (also on the version deployed now). Copy as curl has the same fault.
- **Fix:** the run says its kind (`relay` in its trigger); the console links the source and offers no re-run, as for a flow's step; the route answers 409 that says why. Test first: `RunPage.test.tsx`, `extensions.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-23 "Listening: 2 triggers" when both are off or paused
- **Outcome:** reproduced (C11)
- **Severity:** wrong
- **Where:** `CP/routes/flows.ts:1724-1737`.
- **Evidence:** scratch test: one turned off, one paused: `listeners: 2`, started nothing. So "Nothing listens" is never shown for it.
- **Fix:** count enabled and not paused, and give the rest apart ("2, both paused"). Test first: `flows.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-24 "See it in the event log" opens the whole log
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `S/ObjectPages.tsx:347` sends `?q=`; Events reads `?name=` (`S/Operate.tsx:658`).
- **Fix:** `?name=`. Also `stateOf(one.status)` at `S/Operate.tsx:826` shows a flow that waits for approval as running: the route should send `state`. Test first: `ObjectPages.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-25 A run set to start later shows as Queued, and is counted and canceled as queued
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `X/state.ts:59` ignores `scheduled_for`; `X/bulk-cancel.ts:48`.
- **Fix:** queued with a future `scheduled_for` is `waiting_time`, with its time as `wakeAt`. Siblings: the run page (which shows no due time), `run-stats`. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-26 A decision by a service account is not under Decided
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `CP/routes/flows.ts:1419` (`decided_by is not null`; it is set only for a member, `CP/kernel/flows/engine.ts:1265`).
- **Evidence:** scratch test: a service account rejected; the flow failed; Decided was empty. Only the audit has it. A decision from an app or MCP is listed as `via: console`.
- **Fix:** keep who decided by type and ID, and `via` on the step for every route. Test first: `flows.test.ts`.
- **Size:** M (a column). **Milestone:** M7

### OPS-27 Rejecting without a reason is refused by the mail page only
- **Outcome:** reproduced (C7)
- **Severity:** rough
- **Where:** `CP/routes/flows.ts:1571`, `CP/routes/mcp.ts:489`, `CP/routes/batch.ts:255` take none; `CP/routes/approval-links.ts:109` refuses; the app widget asks as it is set.
- **Evidence:** scratch test: `{"decision":"reject"}` answered 204.
- **Fix:** see Owner decides; if yes, in `decideApproval`. Test first: `flows.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-28 Three screens say three things about rejecting
- **Outcome:** confirmed by code (D)
- **Severity:** wrong
- **Where:** `S/Operate.tsx:931` "rejecting fails that step" (true), `:1007` "The flow takes its rejected path", `S/ApproveLink.tsx:107` "The flow stops here, and says why."
- **Fix:** one sentence in one place: "The step fails: the flow takes its error path, or fails if it has none." Sibling: the inline Reject in `S/Flows.tsx:786`, MCP's description.
- **Size:** S. **Milestone:** M13

### OPS-29 Copy as curl carries `[redacted]` as the input
- **Outcome:** confirmed by code (E7)
- **Severity:** wrong
- **Where:** `S/Runs.tsx:946`, `S/RunPage.tsx:412,835`. A flow's large input is copied as its `{stored}` pointer.
- **Evidence:** `run.input` is masked on read. The re-run dialog refuses masked values; a pasted command sends them as they are.
- **Fix:** copy `POST …/rerun` (`…/retry` for a flow), which uses the real input on the server. Test first: `RunPage.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-30 "Different from the last success" opens on a difference that shows nothing
- **Outcome:** confirmed by code (C15)
- **Severity:** rough
- **Where:** `CP/routes/compare.ts:85` compares real values; `S/RunCompare.tsx:113-120` sets masked ones side by side.
- **Fix:** when the masked values are equal, say "Only masked values differ." Test first: `RunCompare.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-31 Attempts: one that logged nothing is missing, and one error line marks a success as failed
- **Outcome:** confirmed by code (C4)
- **Severity:** wrong
- **Where:** `CP/routes/operations.ts:508-520,605`; drawn at `S/RunPage.tsx:432`.
- **Fix:** an attempt failed when it is not the run's last, or the run failed on it; attempts run 1 to `run.attempt`, with times where the log has them. Logged errors are a count, not a failure. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-32 An old run shows the time limit, uses and diagnosis of the version deployed now
- **Outcome:** confirmed by code (C5)
- **Severity:** wrong
- **Where:** `CP/routes/operations.ts:529-570` reads `resource.body`. A removed script shows none. Any unbound connection is named as the cause of any failure (`X/diagnose.ts:70`). Why other patterns do not match is the scripts slice's.
- **Fix:** read `runnable(kernel, bundle, path)`, as a worker does; name an unbound connection only when the message names it. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M4

### OPS-33 A step's run opened in the Runs list says "No run has this ID"
- **Outcome:** reproduced for the search; confirmed by code for the panel (C2)
- **Severity:** wrong
- **Where:** `S/Runs.tsx:262-268`; the activity route leaves steps out (`CP/routes/operations.ts:168`).
- **Evidence:** scratch test: `activity?q=<step's run ID>` gives 0 items; `/runs/<id>` opens it.
- **Fix:** look the ID up with `GET runs/:id` (then flow runs), as the run page does, and show the panel with "A step of a flow run". Searching by an exact ID should ignore When (C1). Test first: `Runs.test.tsx`.
- **Size:** S. **Milestone:** M7

### OPS-34 Sorting by shortest duration puts unfinished runs first
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/routes/operations.ts:281` (`-1`; the comment says last).
- **Evidence:** scratch test, `dir=asc`: running, queued, then the finished one.
- **Fix:** sort nulls last both ways, in the keyset too. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-35 Operate and Alerts offer a viewer actions the server refuses
- **Outcome:** reproduced (E10)
- **Severity:** rough
- **Where:** `S/Tenant.tsx:689` (`editable` always); `S/Operate.tsx` Pause, Resume, Fire now; `S/Runs.tsx` Cancel, Cancel N queued, Run again.
- **Evidence:** browser as a viewer: Alerts' fields enabled with Save; Resume on a trigger; "Cancel N queued" on Runs. The server refuses each (403). The console has no shared way to ask what a member may do here.
- **Fix:** one `useMay(permission)` from the server's answer about the caller, used by these (and the instance screens of M10). Alerts: `workspace:write` for Save, `connection:write` for the test. Test first: `Alerts.test.tsx`.
- **Size:** M. **Milestone:** M7

### OPS-36 A trigger paused by one person and again by another names the first
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/routes/execution.ts:2033` (the conflict updates reason and time, not `paused_by`). The inspector shows neither name (`S/Operate.tsx:535`).
- **Evidence:** scratch test: by A, reason B's.
- **Fix:** set `paused_by`; show the name. Test first: `operations.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-37 A webhook paused alone, or by the instance, says the workspace is paused
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/routes/execution.ts:3339`; form pages should be checked with it.
- **Fix:** "This webhook is paused, so it started nothing. Try again later." Keep the code `workspace_paused` or add `trigger_paused` to `M/errors.ts`. Test first: `webhooks.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-38 A schedule with a source ignores "Skip a time while its last run goes"
- **Outcome:** confirmed by code (a tick with a source returns before the check)
- **Severity:** wrong
- **Where:** `X/triggers.ts:756-784`; the runs it relays carry `trigger`, not `schedule`, so `stillGoing` would not find them either. The inspector still says it skips.
- **Fix:** check before starting the source, over both labels; or refuse `overlap` with `source` in the manifest. Test first: `extensions.test.ts`.
- **Size:** S. **Milestone:** M7

### OPS-39 An operator working through an access grant is offered saved views and cannot save one
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `CP/routes/preferences.ts` (`POST /me/views` 404 "The tenant was not found."); `CO/kit/views.tsx`.
- **Fix:** allow it while the grant lasts, or leave the menu's save out. Test first: `preferences.test.ts`.
- **Size:** S. **Milestone:** M10

### OPS-40 Words that are not true
- **Outcome:** confirmed by code (D)
- **Severity:** wrong
- **Where:** `packages/docs/content/configure/alerts.md` "or a queue backs up" (nothing alerts on it; also its front matter, shown in search); `docs/self-hosting.md:290` "Cancel queued runs"; `CP/routes/batch.ts:113` `run:execute`; `M/permissions.ts:321` `trigger:write` leaves out pausing and resuming; "cancelled" beside "canceled" in `S/Runs.tsx:291,308`.
- **Fix:** correct each. The permission's text is shown in the role editor.
- **Size:** S. **Milestone:** M13

## Not a bug

| Item | Why |
|---|---|
| E13, daylight saving | Run: 02:30 on the spring day fires at 03:30, 01:30 on the autumn day fires once, hourly fires every real hour. Right, but no test holds it: add those three to `trigger-limits.test.ts` (S, M7) |
| E12, "deploying" clears it | Only a deploy that changes that resource; the rest is OPS-07 |
| C3, C6, C8, C10 | As designed in phases 3, 5 and 15; to be documented. `docs/phases/phase-5-environments.md` states the pause |
| C13 | Built-in roles as specified |
| E11, event picker in the flow editor | The same as ResourceEditor's: declared events only. Listed below |
| Timed-out approvals absent from Decided | Stated in the route |
| Deciding leaves "Waiting for others" stale | Suspected in reading, refuted: a write marks every read of the tenant |

## Missing parts

| # | Part | What takes it | Where it belongs, siblings, permission | Size | Milestone |
|---|---|---|---|---|---|
| 1 | Publish an event by hand | `POST …/events` (`CP/routes/flows.ts:1763`) | Events header and an event's page, with a form from its schema (`InputDialog`); `event:write`; production as a danger | S | M7 |
| 2 | Platform events in the event picker, with their payload's fields | `M/bundle-check.ts:25`; `CP/kernel/flows/events.ts` | `S/ResourceEditor.tsx:640` and `S/FlowEditor.tsx:1544` from one shared list in the manifest package | S | M3 |
| 3 | Fire now for a flow's schedule | `POST …/schedule-firings` takes `node` (`CP/routes/execution.ts:1899-1940`; 201 in a scratch test) | `S/Operate.tsx:444,501` hide it; `S/ObjectPages.tsx`; `run:write` | S | M7 |
| 4 | Approvers and a timeout on an approval step | `M/flow.ts:123` (`approvers`, `timeoutSeconds`) | `S/FlowEditor.tsx:1667`: groups, roles, time; `flow` write. Counted in the flows slice | M | M3 |
| 5 | Signature options: what was signed, timestamp header, tolerance | `M/kinds.ts:385-403` | the signature fields, `S/FlowSteps.tsx:318-354`, used by both editors. Without them Slack cannot be set up in the console | S | M3 |
| 6 | Tags a trigger gives its runs | `M/kinds.ts:329,469,487` (schedule, webhook, event; also flow nodes) | `S/ScheduleForm.tsx`, `S/ResourceEditor.tsx`, `S/FlowEditor.tsx`, one shared list of expressions | S | M3 |
| 7 | Runs between two times | `activity?from&to` and `runs/cancel` filters (`CP/routes/operations.ts:231`) | Runs' When: "Between…"; in the address and saved views | S | M7 |
| 8 | Run later, and with a priority | `POST …/runs` `startAfter`, `priority` (`CP/routes/execution.ts:1183-1184`) | The run dialog, after OPS-25; `run:write` | S | M7 |
| 9 | What a run published | `events?run=` (`CP/routes/flows.ts:1685`), used only by the script editor | The run page, beside "failure handler's run" | S | M7 |
| 10 | What a failure's notification did, on the run page | `run.alert.notified`, `notifyError`, `handlerError`, `repeats` | `S/RunPage.tsx:511` shows only the handler's link and a suppression; the flow run page shows none | S | M7 |

10 parts: 9 S, 1 M. Number 4 is also in the flows slice.

## Owner decides

1. **Should MCP mask when it shows another person's run or a waiting approval (OPS-02)?** Mask those and keep the caller's own runs as they are / leave all unmasked as phase 13 says. Recommended: mask those.
2. **Does a script's own `onFailure` replace the workspace's default, or add to it (C9)?** The page, the code's comment and phase 2 say it wins; it is merged per field, so `notify` alone still starts the default script (reproduced). Replace / merge and say so. Recommended: replace.
3. **Must every rejection carry a reason (OPS-27)?** The server asks on every route / only people's screens ask. Recommended: every route; the app widget may ask for more.
4. **May Fire now start a schedule that is turned off?** Yes, as a way to test it, and said so / no. Recommended: yes for off; for paused it is hidden in the console and should be refused by the API too.
