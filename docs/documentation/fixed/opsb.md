# Lane opsb: fixed

Migration: `packages/db/migrations/0090_opsb_step_decided_by.sql` (adds `step_run.decided_by_type`, `decided_via`; backfills `member`; unlocked). `decided_by` was never a reference to `member`, so it now holds the ID of whichever principal decided.

Tests: `apps/control-plane/src/operations-b.test.ts` (new), `extensions.test.ts` (OPS-22, OPS-38), `operations.test.ts`, `flows.test.ts`, `page-approvals.test.ts` (existing expectations moved with OPS-27/31/32); console `OperateB.test.tsx` (new), `RunPage.test.tsx`, `Runs.test.tsx`, `ApproveLink.test.tsx`; `packages/screens/src/approvals.test.tsx`; `packages/manifest/src/permissions.test.ts`. Each new test was seen failing on the code before the change (reverse-applying the source diff).

## OPS-21 pause not shown on script and flow pages
- `GET triggers` answers `pausedBy: instance | workspace | trigger | null` per item (`routes/execution.ts` list route). `TriggerState` (`Operate.tsx`) reads it; `workspacePaused` is now optional; `ObjectPages.tsx` `TriggersOf` passes none, so it follows the server.
- Tests: `operations-b.test.ts` "an event counts only the triggers..." (pausedBy), `OperateB.test.tsx` "a script's triggers say that the workspace or the instance is paused", "a trigger paused on its own, in a workspace that is paused".
- Siblings: Overview (`Overview.tsx:633`) and Triggers workbench still pass `workspacePaused`, which agrees; the new "Instance paused" shows wherever the list comes from `GET triggers`. TenantOverview and the Shell badge show the workspace flag and are unchanged.
- Screens to walk: a script's and a flow's Triggers tab, with the workspace paused (Environments), a trigger paused alone, and the instance paused.

## OPS-22 runs of a trigger source
- `activity` items carry `source` (`routes/operations.ts`); `POST runs/:id/rerun` answers 409 for a run whose trigger has `relay` (`routes/execution.ts`). Console: `isSourceRun`, `sourceLink` in `runAgain.ts`; `RunPage.tsx` and `Runs.tsx` link the source's editor (`extensions/trigger_source/edit/<path>`), offer no re-run, no Run again in the row menu, no curl, and "Run again" for checked rows leaves source runs out and says so.
- Tests: `extensions.test.ts` "a run of a source says so, and cannot be run again by hand (OPS-22)"; `RunPage.test.tsx` "a run of a trigger source opens the source...".
- Left out: the run page's version link goes to the source's editor, not to a version-at-run view of the source (there is none).

## OPS-23 "Listening: 2 triggers" when both are off or paused
- `routes/flows.ts` events list counts triggers that are on and not held; `listeners` is that count, new `pausedListeners` the on-but-held ones (own pause, workspace, instance). Console `listening()` and copy "Listeners are paused", "2 triggers, all paused" (`Operate.tsx`).
- Tests: `operations-b.test.ts` (OPS-23), `OperateB.test.tsx` "an event whose listeners are all paused...".

## OPS-24 "See it in the event log"
- `ObjectPages.tsx` sends `?name=`. Events' `started` now carries `state` (`flowStateSql`/`runStateSql`), used by the inspector instead of `stateOf(status)`.
- Tests: `OperateB.test.tsx` "the event's page opens the log...", "what an event started shows the state the server gives".

## OPS-26, OPS-27 (D30)
- `decideApproval` takes `decidedBy: {type, id}` and `via` (console, api, mcp, app, email); it stores them on the step. `deciderOf(principal)` keeps members and service accounts. A rejection without a comment is 400 on every route (the check follows the "no longer waiting" check, so deciding twice is still 409). Decided list (`routes/flows.ts`) joins service accounts and says `decidedBy.type` and the widened `via`.
- The approvals widget: `askWhy: never` now applies to approving only; a rejection always asks (`widgets-core/views/approvals.tsx`, `kernel/pages/approvals.ts` unchanged, it already asked on reject). Tests moved: `page-approvals.test.ts`, `screens/approvals.test.tsx`.
- Tests: `operations-b.test.ts` "every route asks why a rejection is made...", "a decision by a service account is listed as decided...".
- Siblings looked at: MCP `decide_approval` (via `mcp`), batch (replays the route), approval links (via `email`), app widget (via `app`). Not changed: `decidedSteps` in `kernel/pages/approvals.ts` and the retry plan's `approvalsKept` join `member` only, so a service account's decision has no name there (Found).

## OPS-28 three screens say three things about rejecting
- One sentence, `REJECTING` in `apps/console/src/kit/approvals.ts`: "Rejecting fails the step: the flow takes its error path, or fails if it has none." Used by the approvals page, its toast, the mailed page (`ApproveLink.tsx`), the inline Reject dialog (`Flows.tsx`); MCP's tool description says the same.
- Test: `ApproveLink.test.tsx`.

## OPS-29 Copy as curl
- Copies `POST runs/:id/rerun` (`{bundle: "original"}`) or `POST flow-runs/:id/retry` (`{from: "start"}`): `scriptAgainCurl`, `flowAgainCurl` in `runAgain.ts`, used in `RunPage.tsx` (both kinds) and `Runs.tsx`. The "stored input" gate is gone.
- Test: `RunPage.test.tsx` "a copied command runs the run again on the server...".

## OPS-31 attempts
- `insight` lists attempts 1 to `run.attempt`; `failed` is "followed by another, or the run failed on it"; `errorsLogged` is a count; `startedAt` and `endedAt` are null where nothing was logged (`routes/operations.ts`). Console shows "nothing logged" and "N error lines" (`RunPage.tsx`, `Runs.tsx`).
- Tests: `operations-b.test.ts` (OPS-31), `operations.test.ts` (updated), `RunPage.test.tsx` "an attempt that logged nothing is listed".

## OPS-32 old run, version deployed now
- `insight` reads `runnable(kernel, bundle, path)` for the run's own bundle; `diagnose` names an unbound connection only when the message names it.
- Tests: `operations-b.test.ts` (two).
- Left out: why other patterns do not match is the scripts slice's.

## OPS-33 a step's run in the Runs list
- `Runs.tsx` looks the ID up with `GET runs/:id` when `activity?q=` lacks it, and opens the script panel under "A step of a flow run. Open the flow run".
- Test: `RunPage.test.tsx` "a step's run, opened by its ID in the list...".
- Left out: searching by an exact ID ignoring When (C1), and a child flow run's ID (neither is a script run); both still say "No run has this ID" if the list lacks them.

## OPS-38 skip while the source's runs go
- `triggers.ts`: a schedule with a source and `overlap: skip` checks `stillGoing` before starting the source; `stillGoing` reads both labels (`schedule`, `trigger`).
- Test: `extensions.test.ts` (OPS-38).

## OPS-40 words
- `permissions.ts` trigger:write now says it pauses and resumes; `batch.ts` comment names `run:write`; `Runs.tsx` "canceled"; `docs/self-hosting.md` names the button "Cancel N queued".
- Not done (not mine to edit): `packages/docs/content/configure/alerts.md` line 4 and 7: change "or a queue backs up" to nothing: "Who is told, and how, when a run fails." Nothing alerts on a queue.
- Tests: `permissions.test.ts`, `Runs.test.tsx`.

## C9 (D29)
- `kernel/execution/alerts.ts`: a script's own `onFailure` replaces the default; one that names neither a script nor a connection leaves the default. Alerts page and SDK doc say "replaces". Test: `operations-b.test.ts` "replaces the workspace's default".
- Line for docs: "A script's `onFailure` replaces the workspace's default alert as a whole."

## Question 4 (D31): Fire now
- `fireScheduleNow` refuses (409, with words) when the schedule, its workspace or the instance is paused; a schedule that is turned off still fires. The console hides Fire now and "Run it now" for any held schedule (`Operate.tsx`, `ObjectPages.tsx`). Tests: `operations-b.test.ts` D31, `OperateB.test.tsx` "a schedule that is held is not offered a run".

## Screens to walk
Triggers (inspector, a held schedule), a script's and a flow's Triggers tab, Events (a paused listener, a flow waiting for approval in "What it started"), Approvals (reject dialog text, a reject with no reason is refused), the mailed approval page after rejecting, a run page of a trigger source, a script run with several attempts, a step's run in Runs (`?run=<step run id>`), Alerts copy. At 1440, 768, 390; light and dark; keyboard; reload. Polish gate: states (held, paused, off, nothing logged), lifecycle (decided by an account is listed), keyboard (no new control), copy (as above). Not walked in a browser in this lane.

## Found
- `kernel/pages/approvals.ts` `decidedSteps` and the retry plan (`routes/flows.ts`, `approvalsKept`) name deciders by `member` only: a service account's decision has no name there.
- The run's page and Runs inspector read `trigger.relay` without a schema; `relay` is in the run's `trigger` as `resourceId`, `node`, `mode` only.
- `fireScheduleNow` ignores a schedule's `source` (starts its target with the schedule's input).
