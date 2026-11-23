# Lane t4-flows-ops: fixed

Rows: FLW-22, 23, 27, 30, 31, 36, OPS-25, 30, 34, 35, 36, 37, 39. No migration, no schema change (`packages/manifest` kinds untouched). The phase branch was merged in at the start and at the end. Each test below was seen failing on the code before its change, except FLW-22 and FLW-36 (already fixed: see them).

## Done

- **FLW-22 (verified, already done by WLK-15d).** `FlowEditor.tsx` `manifestProblems` already runs `checkFlow` in the editor's "To fix". Test `RefusalWords.test.tsx` "FLW-22": a loop with no start and a Respond the start cannot reach are listed. Passed on the code as found.
- **FLW-23.** `FlowEditor.tsx`: `stepNameFor(path)` (a script path ending in a digit or other bad character gives a valid step name, `step_2nd`); `problemsAt` says an approval title over 200, more than 20 cases, and an expression over 2,000 letters; the description and approval title fields take `maxLength` (description shows a count). `flowClipboard.ts` `readClip` drops steps whose name is not `^[a-z][a-z0-9_]*$` or whose type is unknown. Delay and approval time were already limited (FLW-MP4). Tests: `FlowEditor.test.tsx` "FLW-23", `flowClipboard.test.ts` "FLW-23".
- **FLW-27.** `packages/manifest/src/flow.ts` `flowExpressions` and `bundle-check.ts` `bundleExpressions` now list the tags of a flow's start and of a `trigger` or `schedule` kind, so an upload with a tag that does not parse is refused with 400 naming its place. Test: `flows.test.ts` "FLW-27".
- **FLW-30 and OPS-35.** A shared `useMay(root, ...permissions)` in `api.ts` and `GET /tenants/:t/workspaces/:w/allowed?permissions=` in `routes/workspaces.ts`, with `workspace-allowed.test.ts`. These are copied byte for byte from lane t4-config-ext (CFG-26), so the two branches should merge as one. Until the answer is in nothing is offered; if it cannot be had the controls stay and the server's refusal speaks. Used by: `Flows.tsx` `FlowView` (Start `flow_run:write`, Edit `resource:write`, arranging `flow:write`; a graph without `flow:write` is fixed), `Runs.tsx` (row menu, Cancel N queued `run:write`, Cancel by age, batch bar, run peek Cancel), `Operate.tsx` `TriggersWorkbench` (Pause, Resume, Fire now `trigger:write`), `Alerts.tsx` (fields and Save `workspace:write`, test `connection:write`). Tests: `FlowsList.test.tsx` "FLW-30", `Runs.test.tsx`, `Triggers.test.tsx`, `Alerts.test.tsx` "OPS-35".
- **FLW-31.** `FlowStepFields.tsx` `switchStart` keeps each kind's settings on a shelf while the step is open (a ref by step name in `FlowEditor.tsx`, one in `ResourceEditor.tsx` for a trigger kind) and carries tags between schedule, webhook and event. Tests: `FlowInspectorFields.test.tsx` "FLW-31", `FlowBuilding.test.ts`.
- **FLW-36 (verified, already done by D32).** `authoring.test.ts` "FLW-36": a draft flow with a join of one edge no longer stops a test of another flow. Passed on the code as found.
- **OPS-25.** `kernel/execution/state.ts` `runState(status, scheduledFor)` and `runStateSql(status, scheduledFor)`: a queued run with a future `scheduled_for` is `waiting_time`, with `wakeAt`. Used by the activity list and `GET /runs/:id`. `bulk-cancel.ts`: "queued" cancels only runs due now; "all" still cancels everything going. Test: `operations-b.test.ts` "OPS-25".
- **OPS-30.** `RunCompare.tsx`: when the two masked inputs are equal it says "Only masked values differ." Test `RunCompare.test.tsx`.
- **OPS-34.** `routes/operations.ts`: an unfinished run sorts last for duration both ways (sentinel 1e18 ascending, -1 descending), and the keyset follows. Test `operations-b.test.ts` "OPS-34".
- **OPS-36.** `routes/execution.ts` pause conflict also sets `paused_by`; the triggers list gives `paused.byName`; the inspector says "Paused 2 hours ago by Carl: reason". Tests: `operations.test.ts` "OPS-36", `Triggers.test.tsx`.
- **OPS-37.** `kernel/execution/triggers.ts` `fireWebhook` returns `heldBy` (instance, workspace, trigger); the route answers 503 `workspace_paused` only for the workspace, and the new code `trigger_paused` ("This webhook is paused, so it started nothing. Try again later.", or the instance's words) otherwise; `errors.ts` has it. Form pages say "not taking answers" and never named the workspace. Test `operations.test.ts` "OPS-37".
- **OPS-39.** `routes/preferences.ts` `mayKeep`: a member with an active access grant in the tenant may save views while it lasts. Test `preferences.test.ts` "OPS-39".

## Siblings looked at (POLISH-013)
`ObjectPages.tsx` (schedule page) offers Pause and Fire now too: not changed (t4-config-ext edits that file). Instance screens (GOV-37) can use `useMay` with an instance route later. Form pages, the CLI and `schedule-firings` already refuse in words.

## Not done
Run page (`RunPage.tsx`) and the flow run page still offer Cancel and Re-run to a viewer; only the list, its peek and the workbenches are gated. The Edit button on the Operate inspector is not gated.

## Lines for docs and CHANGELOG
A viewer is no longer offered Start, Edit, Cancel, Pause, Run again or Save where the server refuses them. A run set to start later is "waiting for its time". `trigger_paused` error code. `GET .../workspaces/:w/allowed`.

## Found
- `flows.test.ts` "a manual trigger that declares its input refuses one that does not match" fails on this branch (message lacks `/input/quantity`); not touched by this lane.
- `enforce.test.ts` "no screen draws a panel by hand" names `screens/Git.tsx:267`; not this lane.
- A flow-level grant for `flow_run:write` is not seen by `/allowed` (workspace level only), so someone who may start only one flow loses Start on its page.

## Screens to walk (not run)
Flow page as viewer and as developer; Runs list, row menu and bar as viewer; Triggers inspector paused by a named person; Alerts as viewer; flow editor: change "It starts" and back, paste a bad step, a 21st case, a long approval title; run page "Since it last worked". 1440, 768, 390; light and dark; keyboard; reload. The browser walk was not run.
