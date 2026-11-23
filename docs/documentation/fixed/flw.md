# Lane flw: fixed

Rows: FLW-02, 03, 04, 05, 06, 07, 08, 24, 33, OPS-04. All done; none refuted. Migration: `0086_flw_flow_run_output_ref.sql` (not locked).

## FLW-02 (5ad47c2)
`kernel/execution/runs.ts` `unstorable`, `storable`, `refuseUnstorable`, `storePayload`; `kernel/flows/engine.ts` every `JSON.stringify` into step_run/flow_run, `advanceDueFlows`, `failStuck`. Test: `flows.test.ts` "a value the database cannot hold…" (failed before: run stayed `running`). Half characters become U+FFFD and NULs are dropped in the engine's writes; a start with a NUL or half character answers 400 naming where; a pass that throws 3 sweeps in a row fails its run with the reason. Siblings: `startRun` input (refuses), approval comment and respond answer (cleaned). Not done: webhook/form starts go through `startRun`/`startFlowRun`, so they refuse the same way; no separate test.

## FLW-03 (08fa6ed)
`FlowEditor.tsx` `addedIds`, `carryName`: new-schedule zone applies only to steps added from the palette, kept through rename. Pasted and duplicated steps no longer take the workspace zone. Test: `FlowEditor.test.tsx` (carryName). The rename test is on the helper, not a rendered editor.

## FLW-04 / D33 (0f925a3, cedc864)
Manifest: optional `key` on a trigger node (`packages/manifest/src/kinds.ts`, `flow.ts` type, `addressedStarts`, duplicate check in `checkFlow`); SDK `trigger.*({key})`; `schemas/` emitted; `docs/contracts/bundle.md`. `triggers.ts` `carryRenamed`: a row with the same key moves to the new node id with its token (re-encrypted), pause and refusals. `deploy.ts`: `summary.breaking` names a webhook/form start whose address stops. Editor: renaming a webhook or form start in a flow that is not new sets `key` to the old name and says so. Test: `flow-start-keys.test.ts`. Old bundles: no key means the node name is the key, as before.
Left out: a way to see or edit `key` in the inspector (only set by rename); swapping two starts' names by key.

## FLW-05 (08fa6ed)
`FlowSteps.tsx` `updateGrants`, `wholeOf`. Editing a field keeps `with` written in code; switching to one expression keeps the fields as a map expression and keeps `with`. Whole to fields still clears `input` (Undo restores). Tests: `FlowSteps.test.tsx`.

## FLW-06 (08fa6ed)
`FlowEditor.tsx` `ValuesEditor` (rows held as a list, `valueRowProblem`, `rowsToValues`, Remove, limits 50/20, header seed `x-header` = `''`, header names checked against `RESPONSE_HEADERS_REFUSED`). Both uses (Set values, Headers). A row with a taken or bad name is flagged and not saved. Tests: `FlowEditor.test.tsx`, `FlowSteps.test.tsx`.

## FLW-07, FLW-08 (08fa6ed)
`insertAfter(…, made)` uses the new step's first output (Branch: first case; Fail: none, onward edge dropped). `followCases` (rename and removal of a case move or drop its edge, one undo). `CaseName` renames on Enter or blur and refuses a taken name. `problemsAt` now reports unknown case, edge with no case, duplicate or reserved case name, edge leaving a Fail. Tests: `FlowEditor.test.tsx`, `FlowSteps.test.tsx`.

## FLW-24 (e61b5bb)
`InputDialog.tsx` `isStoredInput`, `onSame`; `RunPage.tsx` flow run header: "Run again…" offers only the same input when stored; Copy as curl hidden. Script run page checked: its API gives the full input, no change. Test: `InputDialog.test.tsx`.

## FLW-33 (94d9e22)
Migration adds `flow_run.output_ref`; `engine.ts` `#finish` writes it, `seedRetry` copies it to the retry's key, `context.ts` `readOutput` gives the same note. Test: `flows.test.ts` "a sub-flow's answer too large…" (failed before). Older rows have no ref and behave as before.

## OPS-04 (94d9e22)
`triggers.ts` `fireDueSchedules`: an error that is not an `HttpError` rolls that start back, moves the schedule's next time on in its own transaction, logs it, and the loop goes on. Test: `trigger-limits.test.ts` (failed before). Left out: "record why" on the trigger (OPS-08's); it is logged only. Siblings `publishEvent`, `relaySource`: not changed.

## Screens to walk
Flow editor on a Fernhill instance, at 1440/768/390, light and dark, keyboard, reload: rename a schedule step (zone unchanged) and a webhook step (message, key kept); Add step > Branch and Fail mid-flow (edges drawn, "To fix"); branch cases (Enter or blur renames, taken name refused, Remove drops the edge, Undo); Set values and Headers (Add, Remove, duplicate name flagged, limit); a script step with an edited field (grants kept); a flow run with a 300 KB input, Run again. Gate: states (taken name, limit reached, too large) shown on the row; lifecycle Add/rename/remove/undo; keyboard Enter commits a case name; copy plain. The browser walk was not run.

## Found
- `applyDecision`/respond: none. A step's `with` for a For each over a core node still cannot be drawn (MP-3).
- `git stash` was used once in this lane, early (stash and pop of `FlowSteps.tsx` on p29-flw, restored). The two stashes now in the list belong to other lanes (p29-acc, p29-tab).

## Lines for docs and CHANGELOG
- Flow start `key` (manifest, SDK): a webhook's or form's address, pause and last fired time follow it through a rename.
- A deploy lists, under breaking changes, each webhook or form start whose address stops.
- A flow run's large output is kept in storage with `output_ref`; a step after a sub-flow sees the same note as after a script.
