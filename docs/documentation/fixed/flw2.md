# Lane flw2: fixed

Rows: FLW-10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 26, 28, 29, 32, Q1, Q3, D32 (also SCR-09), D34, and the empty-field wording from `draft.md`. All done, none refuted. No migration. One commit for the lane: the rows share files (`FlowEditor.tsx`, `FlowSteps.tsx`, `authoring.test.ts`), so they were not split. Every test below was run on the code before the change and failed there.

## D32, Q1, SCR-09 A test uses its own draft and the drafts it names
`kernel/authoring.ts` `draftsUsedBy` (the draft, and every draft its strings name, however far: a flow's scripts and flows, `uses`, a path written in code); `routes/authoring.ts` POST `test-runs` composes only those (`composeDrafts(…, used)`), new body field `withAllDrafts` for the old behavior, and the `code:write` check looks only at those drafts. A test of something with no draft runs what is deployed. Console: "Build with all drafts" checkbox in `FlowTestPanel.tsx` (state in `FlowEditor.tsx`, sent by Run and by Test from a step) and in the script editor `Authoring.tsx`. Tests: `authoring.test.ts` "a test uses its own draft and the drafts it uses, not someone else's broken one (D32)" (failed: 400 "does not build" naming the other draft), `FlowTestPanel.test.tsx` (D32). Siblings: `deriveSchemas` already composed one path; CLI `volvel run --remote` sends a bundle, not drafts: unchanged. Sees: another person's broken draft no longer stops a test; the choice is in the Test panel.

## FLW-10, 14, 21 For each: script or flow, `flowFrom`, emptied expression
`FlowEditor.tsx`: the palette makes For each with no `script`; choosing a script clears flow and `flowFrom`, choosing a flow clears the script. For each and Run a flow share one "Which flow" control (named, or chosen by the data with `allow`). `problemsAt` takes `flowFrom` for For each. `expression(…, {keepEmpty})`: an emptied `flowFrom` stays `""`, so the mode and the field stay and "To fix" says it is unfinished. Tests (`FlowEditorWalk.test.tsx`): FLW-10 (saved a `script: ""`), FLW-14 (said "needs a script or a flow"), FLW-21 (field vanished). Siblings: Run a flow (same control now).

## FLW-11 Starter "Decide, then answer"
`screens/starters.ts` `trigger.amount` (was `input.amount`). Proven by running: `authoring.test.ts` "every starter flow runs, on an input that fits it (FLW-11)" drafts each starter and test-runs it with `{amount: 500}` and `{amount: 5}`; before, the branch starter failed ("Unknown variable: input"). Sibling check: `EXPRESSION_ROOTS` (`packages/manifest/src/flow.ts`: trigger, steps, now, item, index, event); the upload check (`bundles.ts` via `Expressions.check(expr, true)`, a strict CEL environment in the thread) and `volvel build` (`packages/cli/src/build.ts`) refuse any other name. Tests: `flows.test.ts` "expressions that do not parse…" (accepted before), `build.test.ts` "catches a name no expression of a flow has". Left out: an unknown `steps.<name>` (needs the flow's step list); not done.

## FLW-12 A draft-only flow leads to "The flow was not found."
`Flows.tsx` `flowPage`: the list link and the inspector Open take a draft-only flow (no version) to the editor in a dev workspace. Test: `FlowsList.test.tsx`. Siblings looked at: command palette, `Release.tsx`, `Operate.tsx` (already link to the editor); `kit/objects.tsx` links `flows/<path>` for references: a reference to a draft-only flow still lands on the 404 (not changed).

## FLW-13 "Waiting for a person"
`routes/flows.ts` list: `runs.waiting` counts only approval steps (`s.detail ? 'title'`, as `flowStateSql`). Test: `flows.test.ts` delay test (counted 1, now 0) and approval test (counts it).

## FLW-15 Arrangement
`routes/flows.ts` `flowPositions` (body layout, then the saved arrangement over it) for the flow page and the run's definition; `kernel/execution/deploy.ts` clears a flow's `flow_layout` when a deploy changes its body `layout`. The editor reads the draft or `resources/<flow>` body, which a deploy now makes the newer; positions saved from the flow page and not yet overwritten by a deploy are still not read by the editor (not changed: see Found). Test: `authoring.test.ts` "a flow is drawn where the newer of the two arrangements says" (flow page 0 vs 777 before; 0 vs 5000 after a deploy).

## FLW-16, FLW-26 Run page header
`RunPage.tsx` `FlowRunHeader`: a run with `parentFlowRunId` shows "Retry the flow that started it" (link) instead of Re-run, the palette command says the same, and no curl; other runs copy the retry request (`POST …/flow-runs/:id/retry {from: "start"}`), which needs no manual start and carries no masked or stored input (replaces FLW-24's `isStoredInput` condition there). Tests: `RunPage.test.tsx` (two). Sibling: script run's copy unchanged (its API gives the full input).

## FLW-17 Words for a start
`kit/starts.ts` `STARTED_BY`, `STARTED_ON` (manual, schedule, webhook, event, form, flow, alert, rerun, retry); used by `Flows.tsx`, `Execution.tsx` (`TRIGGER`, so `Runs.tsx` and `RunPage.tsx` too). "By hand" is now one wording (was "Started by hand" on the run pages). Test: `FlowsList.test.tsx`.

## FLW-18, FLW-19, FLW-20 Form designer and step inputs
`FlowEditor.tsx` `problemsAt` flags a question named website, key or return (`FORM_RESERVED_NAMES`); `FormDesigner` shows it on the name field (shared with the standalone form trigger in `ResourceEditor.tsx`). `OptionsField` keeps the typed text and reads the list from it, tidying on blur (`TextAreaField` takes `onBlur`, `packages/ui/src/Fields.tsx`). `NodeInputs`: a choice or yes/no is written by its type (`2`, `true`), and an expression that is not one of the values is shown as an expression field. Tests: `FlowEditorWalk.test.tsx` (three). Not done: a switch to enter an expression in a choice field (MP-11). Sibling: other `split("\n")` with `filter` fields: `SingleSignOn.tsx:716` splits on save, not on change; not changed.

## FLW-25 A last step with an error path
`engine.ts` `#finish`: a succeeded step with only error edges after it is a last step. Test: `authoring.test.ts` (FLW-25), output `{}` before. Sibling: `startFlow` in the SDK reads the same output.

## FLW-28 "today"
Flows list chip, column and inspector say "in 24 hours"; `TenantOverview.tsx` the same ("N failed runs in 24 hours"). Test: `FlowsList.test.tsx`, `TenantScreens.test.tsx` (text).

## FLW-29 Needed fields marked optional
`ExpressionField` takes `required` (several-line fields were forced to `false`): For each Items, Fail Message, the flow path, Branch When and Set value now say required. Step inputs and Detail stay optional. Test: `FlowEditorWalk.test.tsx`.

## FLW-32 Docs
`docs/master-spec.md` (the editor is built), `README.md` (no stale phase), `docs/phases/phase-3-events-flows.md` (history note: the run page draws the run's version), `flow_run:write` text in `packages/manifest/src/permissions.ts`. Not done: `docs/sdk-guide.md` flow section and the generated `kinds/flow.md` (phase 31's pages).

## Q3, D34 Removing a step never asks
`FlowEditor.tsx`: "Remove this step" no longer asks; the button, the menu, ⌫ and cut say "Removed X. Its connections went with it." with Undo (`saidRemoved`). Test: `FlowEditorWalk.test.tsx` (D34): a dialog appeared before, and no message.

## Empty field in plain words
`packages/manifest/src/registry.ts`: a pattern refusal of `""` reads "is empty: it needs a value" instead of "must match pattern" (the kind validator now keeps the data, `verbose`). Test: `manifest.test.ts`.

## Tests run
`authoring.test.ts`, `flows.test.ts`, `flow-start-keys`, `kernel`, `trigger-limits`, `page-approvals`, `release`, `apps` (control-plane); `manifest`, `cli build/example/examples`; console `FlowEditorWalk`, `FlowsList`, `RunPage`, `FlowTestPanel`, `FlowEditor`, `FlowSteps`, `Authoring`, `Runs`, `TenantScreens`, `RemoveDraft`, `InputDialog`, `FlowGraph`, `enforce`; `packages/ui`. `tsc -b` and `-p` on `apps/console` and `packages/ui`.

## Screens to walk (not run)
Flow editor and Test panel (checkbox, a second broken draft), Flows list (draft-only flow, "Form", "in 24 hours"), flow run page (a child run, copy as curl), script editor test, form designer (reserved name, typing a list), For each (script, flow, chosen by data, clearing), Fail and For each fields (required mark), removing a step (message and Undo, ⌫), at 1440/768/390, light and dark, keyboard, reload. Gate: states (unfinished field, reserved name, a child run); lifecycle (remove then Undo); keyboard (⌫ then Undo from the message); copy plain. The browser walk was not run.

## Found
- The editor opens a deployed flow from `resources/<path>`, which has no saved flow-page arrangement; one arranged on the flow page and not since deployed shows at its body positions in the editor.
- `kit/objects.tsx:19` links a reference to `flows/<path>`; a draft-only flow still lands on "The flow was not found."
- Existing deployed bundles with a name outside `EXPRESSION_ROOTS` are refused when uploaded again; no example in the repository has one (`examples.test.ts` passes).
- `routes/authoring.ts:414` has an unused variable `held` (lint warning, not mine).

## Lines for docs and CHANGELOG
- Test runs build with the draft tested and the drafts it names; `withAllDrafts: true` on `POST …/test-runs` builds with all.
- An expression in a flow, a trigger filter or a schedule is refused at upload and build when it reads a name other than trigger, steps, now, item, index or event.
- A flow's last step with only an error path still gives the flow its output. A flow's saved arrangement is cleared by a deploy that changes its `layout`.
- `flow_run:write`: start, retry and test a flow, and cancel its runs.
