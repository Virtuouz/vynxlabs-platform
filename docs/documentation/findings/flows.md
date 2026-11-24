# Findings: flows

Settled from [the inventory](../inventory/flows.md) at `270e509`, in the pinned tree `tree29`. Scratch tests and scripts (`triage-flw*`, now removed) reproduced what is marked `reproduced`: a test instance for the server, a browser on the throwaway instance for the editor. Nothing here is fixed. FE = `apps/console/src/screens/FlowEditor.tsx`, FS = `FlowSteps.tsx`, FL = `Flows.tsx`, RP = `RunPage.tsx` (same folder), CP = `apps/control-plane/src`, ENG = `CP/kernel/flows/engine.ts`, RT = `CP/routes/flows.ts`, MF = `packages/manifest/src`.

## Rows

### FLW-01 The expression preview shows what the run page masks
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `RT:254-340` (`GET …/expressions/value` needs only `flow_run:read` and returns the value as it is), against `RT:1207-1260`, where every payload goes through `redact`.
- **Evidence:** A flow run was started with two secret-looking fields. A viewer reading the run got `[redacted]` for both. The same viewer asking the preview for the trigger, or for a step's output, got both in full.
- **Fix:** Redact the context before it is evaluated (`expressionContext`, with the script schemas `stepInput` and `payloadSchemas` use), so a test on a secret cannot be used to guess it either. Redacting the answer alone is not enough. Siblings: any other reader of `expressionContext`; script logs and errors (SCR-01). Test first: in `flow-editor.test.ts`, a viewer's preview of a masked field.
- **Size:** S. **Milestone:** M1.

### FLW-02 A step value Postgres cannot hold leaves the flow running for ever
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `ENG` `advance`, `#insert`, `#update`, `#succeed` (only `StepFailure` fails a step; any other error rolls the pass back), `advanceDueFlows` (`limit 200`, oldest first).
- **Evidence:** `trigger.text.substring(0, 2)` on text whose second character is an emoji gives half a character. The step cannot be saved, the run stayed `running` with no step after the trigger, and it is tried again at every sweep. A NUL character in an expression does the same. A NUL in a start's input answers 500 `internal_error`. By the query, 200 such runs take every place in a sweep (not run).
- **Fix:** One helper that makes JSON storable (well-formed text, no NUL) in `storePayload` and the engine's writes, or fails the step by name; a start refuses with 400. A pass that keeps throwing must fail its run after a few tries and not hold a place in the sweep. Siblings: `startRun`, `completeRun`, webhook and form starts, approval detail. Test first: `flows.test.ts`, the emoji cut.
- **Size:** M. **Milestone:** M2.

### FLW-03 Renaming a schedule's step in the editor changes its time zone
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `FE:1513` (`fresh={!loadedIds.current.has(chosen.id)}`), `ScheduleForm.tsx` `WhenFields` effect that writes the workspace's zone into a "fresh" schedule.
- **Evidence:** A schedule with no zone (UTC), in a workspace on America/New_York, was renamed. The autosaved draft then held `timezone: America/New_York`. Nothing was said. By the same code, duplicating or pasting one does too.
- **Fix:** Know a new step by being added here, not by its name: keep the set of ids added from the palette, and carry it through rename. Siblings: paste and duplicate (`pasteClip`). Test first: rename a loaded schedule, no `timezone` in the save.
- **Size:** S. **Milestone:** M2.

### FLW-04 Renaming a webhook or form step gives it a new address, and the old one stops
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `CP/kernel/execution/triggers.ts:258-340` (a trigger's row and token are keyed by node id), `FE` `rename` and `NameField` ("references to it follow").
- **Evidence:** A deployed webhook's step was renamed in the editor and deployed. No question was asked. The flow's URL changed, and the old address answered 404. A trigger paused alone, and its last fired time, are lost with the row (code). Changing "It starts" away and back, deployed between, does the same.
- **Fix:** At least say it and ask before renaming a deployed webhook or form start, and list it in the release plan (Q2 asks for more). Test first: the plan names an address that will stop.
- **Size:** S to warn, M to carry the address. **Milestone:** M2.

### FLW-05 Editing one field of a step drops grants written in code
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `FS` `NodeInputs.set` and the input-mode switch (`with: grantsFor(spec, next)`), `grantsFor`.
- **Evidence:** A step with `with: {connections: [crm/main], tables: [orders]}` had an unrelated text field edited. The change no longer had `with`. Grants not made by an `x-pick` field are lost, and so are grants for a field chosen by an expression. Switching "Its input" back to fields also clears the inputs with no question.
- **Fix:** Only replace the grant that the changed pick made; leave the rest. Test first: in `FlowSteps.test.tsx`, edit a text field, `with` stays.
- **Size:** S. **Milestone:** M2.

### FLW-06 Set values and Headers: no Remove, and typing a name already used deletes a value
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `FE` `ValuesEditor` (2319-2367).
- **Evidence:** No Remove button. Values `{one: 1, two: 2}`: typing `one` as the second name saved `{one: 2}`, the first value gone while typing. "Add" uses `value_<count+1>`, which overwrites a value of that name (code). "Add a header" adds `value_1`, a name headers do not allow, with a value that is not text: the next save is refused 400. At 50 values or 20 headers Add still offers.
- **Fix:** Hold rows as a list while editing (as `CasesEditor` does with `useKeys`), flag a duplicate or bad name on the row, add Remove, seed a header as `x-header` with `''`, and flag `RESPONSE_HEADERS_REFUSED`. Siblings: both uses of the editor. Test first: rename to a taken name keeps both.
- **Size:** S. **Milestone:** M2.

### FLW-07 Adding a Branch or Fail in the middle of a flow makes a connection nobody can see
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `FE` `add` (742-771: checks what the step before offers, not the new one), `insertAfter` (hands on "next" to any new step).
- **Evidence:** `first → second`, then Add step > Branch: saved `{from: branch, to: second}` with no case. It is not drawn, not in "Where it goes next", and "To fix" is empty. A test or deploy is refused 400. With Fail, `{from: fail, to: second}` deploys, and `second` can never run.
- **Fix:** Use `outputs(made)`: a Branch takes the connection on its first case or "otherwise", a Fail takes none. Also FLW-08: one reconcile step. Test first: `insertAfter` with a branch and a fail.
- **Size:** S. **Milestone:** M4.

### FLW-08 Branch cases: a removed case keeps its connection, and renaming past another name takes its connection
- **Outcome:** reproduced (the second half is data)
- **Severity:** data
- **Where:** `FE` the branch inspector and `CasesEditor` (2236), `checkFlow` refuses it only at deploy.
- **Evidence:** Removing `maybe` kept `{output: "maybe"}`: after a reload two of three edges are drawn, "To fix" is empty, deploy refuses. Cases `a` and `ab`, typing `bc` after `a` (so it passes `ab`): both connections were saved as `abc`, and `ab` lost its own. Add after removing a middle case made two `case_3`, not flagged.
- **Fix:** Rename a case on blur or Enter (as steps are), refuse a taken name, drop the edge with its case (one undo). Give `problemsAt` every edge check `checkFlow` makes: unknown case, missing case, duplicate case. Test first: the three above, as one `problemsAt` test and one editor test.
- **Size:** S. **Milestone:** M2.

### FLW-09 A draft with one unfinished field is not saved at all
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `CP/kernel/authoring.ts:205-224` (only `interface` and `dashboard` may be unfinished), `FE` palette (`script: ""`, `flow: ""`, `event: ""`).
- **Evidence:** Adding Run a script, Run a flow or For each, or an event start, makes every autosave 400 until it is chosen, and after five tries nothing else is saved either. The same for a cleared approval title, Fail message, branch condition, value expression, For each items, form title, or signature secret. "To fix" says nothing for the approval title, message, condition, value or items (its list was empty). The notice prints the whole `oneOf` dump ("must have required property 'trigger' … must be equal to constant …").
- **Fix:** Let a flow draft hold unfinished steps, as pages do, with compose refusing them in plain words; or have the editor leave such a step out of the save and say so. Report only the issues of the step type named by `type` (a discriminator in `validateManifest`, for every kind with a `oneOf`). Add the missing fields to `problemsAt`. Test first: saving with a step not yet chosen.
- **Size:** M. **Milestone:** M4.

### FLW-10 For each running only a flow cannot be saved
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `FE:178` (`script: ""`).
- **Evidence:** For each, flow chosen: saves `{script: "", flow: "a/child"}`, 400 "The manifest is not valid.", "To fix" empty. By code, choosing a script and clearing it removes the empty one.
- **Fix:** The palette makes it without `script`; choosing one clears the other. Test first: that PUT body.
- **Size:** S. **Milestone:** M4.

### FLW-11 The starter "Decide, then answer" always fails
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `apps/console/src/screens/starters.ts:107-110` (`input.amount`; the start is `trigger`). `FlowBuilding.test.ts` checks its shape only.
- **Evidence:** Run with `{amount: 5}`: "The expression for "case large" could not be evaluated: Unknown variable: input". A name that cannot exist (`input`, `steps.nothere`) passes the build, because `unlistedVariablesAreDyn` is on.
- **Fix:** `trigger.amount`; test each starter by running it on the engine. Sibling: teach `bundleExpressions` the root names (`trigger`, `steps`, `now`, `item`, `index`) and unknown steps, so a wrong name is refused at deploy.
- **Size:** S (starter), M (checks). **Milestone:** M4.

### FLW-12 A flow that is only a draft leads to "The flow was not found."
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `RT:577` (`/flows/*` reads deployed flows only), `FL` list link and inspector Open. The list includes drafts (`RT:503-508`).
- **Evidence:** A draft-only flow's name and Open both gave 404 and that page.
- **Fix:** In the list and inspector, link a draft-only flow to the editor (a dev workspace), or give the flow page the draft with its state. Siblings: command palette, `Release.tsx:294`, `Operate.tsx:68`, which already link to the editor. Test first: the list row of a draft-only flow.
- **Size:** S. **Milestone:** M4.

### FLW-13 "Waiting for a person" counts waits, For each and sub-flows
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `RT:462-467` (any `waiting` step), `FL:118` head note, the Waiting chip. `flowStateSql` already tells them apart with `detail ? 'title'`.
- **Evidence:** One run on a Wait of 15 minutes: the head says "1 run is waiting for a person. Decide", and Approvals says 0.
- **Fix:** Count only approval steps in `waiting`; keep the Waiting filter for the runs in state `waiting_approval`. Sibling: `POLISH` A1-13 (the count against "waiting for you"). Test first: the list count with a delay is 0.
- **Size:** S. **Milestone:** M4.

### FLW-14 For each with `flowFrom` is called unfinished, and choosing a flow makes it invalid
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `FE:481` (looks at `script` and `flow` only), `FE` foreach fields show neither `flowFrom` nor `allow`.
- **Evidence:** "x needs a script or a flow to run for each item." Choosing one in "Or a flow" then saved both `flow` and `flowFrom` with "To fix" empty, which deploy refuses. The engine runs such a flow correctly.
- **Fix:** As MP-2: give For each the same "Which flow" control as Run a flow, one component. Test first: no problem for `flowFrom` plus `allow`.
- **Size:** S. **Milestone:** M4.

### FLW-15 Arrangement: the flow page ignores the editor's layout, the run page and editor ignore the flow page's
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `RT:600-603` (`flow_layout` over the body's `layout`), `RT:972-975` (the other way round), `FE` `open` (body only).
- **Evidence:** Body at x 0, saved arrangement at 777: the flow page drew 777, the run's definition 0, the editor 0. A new layout (5000) deployed from the editor still showed 777 on the flow page.
- **Fix:** One helper for all three; the newer wins, so a deploy whose `layout` changed clears that flow's `flow_layout`. Test first: those four reads.
- **Size:** S. **Milestone:** M4.

### FLW-16 A sub-flow's run offers Re-run, always refused
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `RP` `FlowRunHeader` (Re-run menu and palette) and `RT:1044-1050`. `parentFlowRunId` is already in the answer (`RT:127`).
- **Evidence:** On a child run, all four items are shown; "Again from the start" asks, then answers "This flow run was started by another flow. Retry the flow that started it."
- **Fix:** With a parent, show "Retry the flow that started it" with a link. Siblings: palette commands. Test first: no Re-run on a child.
- **Size:** S. **Milestone:** M4.

### FLW-17 "form" and "retry" are shown as raw words
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `FL:45-60` (`STARTED`, `TRIGGER`, no `form` or `retry`), against `Execution.tsx:81-91`, which has both.
- **Evidence:** The list says "form", and "Recent runs" says "retry".
- **Fix:** One map in the kit, used by all three screens. Test first: every `FlowTrigger` type and `retry` has words.
- **Size:** S. **Milestone:** M4 (words M13).

### FLW-18 Form editor: reserved names are found only at deploy
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `FE:430-460` (`problemsAt` has no `FORM_RESERVED_NAMES`), FS `FormDesigner`.
- **Evidence:** A question called `website` saved 200 with "To fix" empty; the test compose refused it. `fieldName` avoids them, typing does not.
- **Fix:** Call `checkForm` in `problemsAt` (shared with the manifest). Sibling: the standalone form trigger's editor. Test first: that name is flagged.
- **Size:** S. **Milestone:** M4.

### FLW-19 A choice list cannot be typed: Enter and spaces disappear
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `FS` `FormDesigner` "The list, one to a line" (each line trimmed, empty ones dropped, on every key).
- **Evidence:** Options One, Two; Enter then "Very good" at the end: saved `["One", "TwoVerygood"]`. Only pasting several lines works.
- **Fix:** Hold the text locally and split it on blur. Siblings: the standalone form trigger uses the same component; look for other `split("\n")` fields with `filter(Boolean)` on change. Test first: type three keys.
- **Size:** S. **Milestone:** M4.

### FLW-20 A numeric choice in a step is sent as text, and an expression in a choice or yes/no field shows as "Not set"
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `FS` `NodeInputs` (enum uses `quoted`, boolean matches only `true` and `false`, picks use `unquoted`).
- **Evidence:** An input `enum: [1, 2]` chosen as 2 saved `'2'`, which a number schema refuses. `flag: trigger.flag` shows an empty choice (the value is kept until changed).
- **Fix:** Write the literal by type, and show an expression as an expression field (MP-11). Test first: enum of numbers.
- **Size:** S. **Milestone:** M4.

### FLW-21 Clearing the expression of "Chosen by the data" turns it into "Always the same one"
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `FE` `expression()` (an empty value becomes `undefined`) and the subflow fields keyed on `flowFrom === undefined`.
- **Evidence:** The field vanishes as the last character is deleted; "To fix" says "x has no flow chosen"; the draft saves with `allow` left behind.
- **Fix:** Keep `""` for `flowFrom` in the editor; `problemsAt` already handles it. Test first: clearing keeps the mode.
- **Size:** S. **Milestone:** M4.

### FLW-22 Loops and unreachable groups are not flagged until deploy
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `FE:392-496` (`reached` is "has any edge into it"), no loop check.
- **Evidence:** Two steps joined to each other and to nothing else: "To fix" empty; deploy refuses both. Dragging a loop is allowed. `respond: flow` with no reachable answer passes if any Answer exists (code).
- **Fix:** Run `checkFlow` in the editor, in place of these hand-written ones; give it a message per node and field. Test first: that graph.
- **Size:** S. **Milestone:** M4.

### FLW-23 Limits and step names found only when saving
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `FE` `add` from a script (a path ending in a digit-led name, such as `jobs/2nd`, makes a step name `2nd`, refused by `^[a-z]`), Seconds to wait (no maximum, 2,592,000), texts with no `maxLength` (description 500, approval title 200, expressions 2000), 20 cases, `flowClipboard.ts` `readClip` (pasted names and types unchecked: `"Bad Name!"` and an unknown type are accepted).
- **Evidence:** `99999999` seconds and a cleared title are 400 from a draft PUT; a paste test took `Bad Name!`.
- **Fix:** Limits from the kind's schema in one place; `readClip` checks `NODE_ID` and known types. Test first: each of the four.
- **Size:** S. **Milestone:** M4.

### FLW-24 A run started again from a large input gets the storage reference as its input
- **Outcome:** reproduced (API), confirmed by code (dialog)
- **Severity:** data
- **Where:** `RT:1220` (`input_ref` shown as `{stored}`), `RP` `FlowRunHeader` (`initial={run.input}`, curl from `run.input`), `InputDialog` (only `[redacted]` is noticed).
- **Evidence:** 300 KB input: shown as `{"stored": "flow-runs/…"}`. Starting with that as input is accepted and runs with it. "Again from the start" is right (the server reads the payload).
- **Fix:** Say that it is too large to edit here and offer only the same input, or read it through a download. Siblings: the script run page (same `initial={run.input}`), Copy as curl. Test first: a run whose input is stored.
- **Size:** S. **Milestone:** M2.

### FLW-25 A last step with an error path gives the flow no output
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `ENG:1104-1114` (`#outgoing(...).length === 0`).
- **Evidence:** `start → last`, with an error edge from `last`: succeeded, output `{}`. Adding an error path silently empties what a sub-flow, an app or an agent receives.
- **Fix:** A succeeded step with only error edges out counts as last. Siblings: the docs of "flow output"; `startFlow` in the SDK. Test first: that flow.
- **Size:** S. **Milestone:** M4.

### FLW-26 "Copy as curl: start this flow again" is refused for a flow with no manual start
- **Outcome:** reproduced (API), confirmed by code (button)
- **Severity:** broken
- **Where:** `RP` `FlowRunHeader` `CopyIcon` (`POST …/flow-runs` always, also with masked values).
- **Evidence:** "The flow s/hook has no manual trigger, so it cannot be started by hand."
- **Fix:** Copy the retry request (`/flow-runs/:id/retry`, `from: start`), or hide it. Sibling: the script run's copy and masked values.
- **Size:** S. **Milestone:** M4.

### FLW-27 Trigger tags that do not parse deploy without a word
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `MF/bundle-check.ts:457-473` and `flowExpressions` (`flow.ts:163-212`, tags not listed).
- **Evidence:** A webhook tag `trigger.(((` deployed 201; a broken step expression is refused. At run time it is left out by design.
- **Fix:** Add tags to `flowExpressions` and the `trigger` and `schedule` kinds. Test first: a broken tag is refused.
- **Size:** S. **Milestone:** M4.

### FLW-28 "Failed today" and "today" mean the last 24 hours
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `RT:463` (`interval '24 hours'`), `FL` chip, column and inspector.
- **Evidence:** At one minute past midnight it counts yesterday.
- **Fix:** Say "in 24 hours"; Siblings: other "today" counts on the Overview and Runs. Test: words only.
- **Size:** S. **Milestone:** M4 (words M13).

### FLW-29 Fields that are needed are marked optional
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `ExpressionField.tsx` (`rows` sets `required={false}`).
- **Evidence:** For each "Items", Fail "Message" and the flow's path expression carry "optional", and clearing one makes the draft unsaveable (FLW-09).
- **Fix:** A `required` prop from the caller. Sibling: step inputs, where the label text says optional already.
- **Size:** S. **Milestone:** M4.

### FLW-30 The flow page offers Start, drag and edit to anyone who may read it
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `FL:400-470` (no permission is asked; the server refuses with 403 text on saving an arrangement). Same class as CFG-26.
- **Fix:** Know what the person may do before drawing (one answer, as CFG-26 settles it), hide Start, Edit and drag. Test first: a viewer sees none.
- **Size:** S. **Milestone:** M12.

### FLW-31 Changing "It starts" and back drops the start's own settings
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `FE:1476-1487`.
- **Evidence:** A manual start with an input schema, to event and back: the schema is gone. Undo brings it back; nothing is said. Also drops tags and a filter.
- **Fix:** Keep the last settings per type while the step is open.
- **Size:** S. **Milestone:** M4.

### FLW-32 Docs that are stale or missing
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `docs/master-spec.md:434` (read-only graph; the editor is built), `docs/phases/phase-3-events-flows.md:46` (drawn as deployed now; `GET /flow-runs/:id/definition` draws the run's version), `README.md:5` ("phase 6"), `flow_run:write` permission text (also retries and tests), `docs/sdk-guide.md` has no flow section, the generated `kinds/flow.md` merges all step types.
- **Fix:** Correct the spec and README lines, a note on the phase page (history, left as it is), the permission text in the permission registry. The pages are phase 31's.
- **Size:** S. **Milestone:** M13.

### FLW-33 A sub-flow with a large answer gives the next step a reference with no note, and a retry keeps the reference to the old run's file
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `ENG` `#finish` (`{stored: ref}`, no `note`), `context.ts:48-55` (child output not checked for size), `ENG` `seedRetry` (`child.output` copied as it is, with `outputRef = null`).
- **Evidence:** The comment says a retry "needs nothing of the run it retries"; for this case it does, and retention may have removed it. Not run.
- **Fix:** Use `output_ref` for a flow run's output as for its input, and let `readOutput` give the same note. Test first: a 300 KB child output.
- **Size:** S. **Milestone:** M2.

### FLW-34 Claims that were not faults
- **Outcome:** not a bug
- **Severity:** rough
- **Where / Evidence:** CEL numbers as doubles, missing fields as errors, unanswered optional form fields absent, rejection text in `error.message` (the language, and `engine.ts` explains the double case in the error). Tests mail approvers "[Test]" and run real scripts (phase 10). Saving a repository flow's draft takes it over (the editor says so, and does not autosave it). "Again, with other input" for a webhook that takes the whole request: the schema is the word `request`, and the dialog falls back to JSON with the input (ran). `resources?limit=200` in the editor: the route ignores `limit` and gives all 207 (ran), so nothing is hidden. Two undo entries for one removal: `History.record` drops the repeat (ran: one undo restores the steps and edges).
- **Fix:** None; write the gotchas on the pages.
- **Size:** S. **Milestone:** M4.

### FLW-35 ⌫ on the canvas and the menu's Remove do not ask; the "Remove this step" button does
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** `FE` ReactFlow `onNodesChange`, `removeMany`, "Remove this step".
- **Evidence:** ⌫ removed a step with its connections and no dialog; one undo brought all back (ran).
- **Fix:** Q3.
- **Size:** S. **Milestone:** M4.

### FLW-36 Testing one flow is refused while any other draft is broken
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** `CP/routes/authoring.ts:1269` (composes every draft).
- **Evidence:** An unrelated draft with a join of one edge gave 400, naming that flow, for a test of another one.
- **Fix:** Q1.
- **Size:** M. **Milestone:** M4.

## Missing parts

Console parts are all in the editor's inspector, save with `resource:write`, and are kept on edit today but shown nowhere. Each needs a control that reads the same schema and is checked by `checkFlow`.

- **MP-1 For each: how many at once.** `concurrency` 1–20, default 1 (`kinds.ts:695`). Number field beside "Keep going". Siblings: none. **S.**
- **MP-2 For each: flow chosen by the data.** `flowFrom` plus `allow` (`flow.ts:100-105`). The "Which flow" control of Run a flow, shared. Fixes FLW-14. **S.**
- **MP-3 What a step hands its script (`with`).** On script and foreach, `connections`, `tables`, `events`, up to 20 each (`flow.ts:82-96`). Today only `x-pick` fields make it, and foreach has none, so a For each over a core node (which needs a connection) cannot be drawn. A pick list per kind the script `takes`. Siblings: FLW-05, SCR MP-1 `node.takes`. **M.**
- **MP-4 Approval: timeout.** `timeoutSeconds` 1 s to 30 days (`flow.ts:119`). A number with unit, shared with Wait, which shows seconds only. **S.**
- **MP-5 Approval: who may decide.** `approvers.groups` and `.roles`, 20 each (`flow.ts:120-125`). Pickers from `/groups` and `/roles`, as `kit/inspector/catalog.ts` does, with what "nobody" means and a warning for an unknown name (the build takes one; it is resolved later). Needs `group:read` and `role:read` to list. **M.**
- **MP-6 Event start: filter.** `filter` (`flow.ts:63`), reading `event` only, as `ResourceEditor.tsx:646` already offers for a trigger resource: share it. Its preview must not show `trigger` and `steps`. **S.**
- **MP-7 Tags on a start.** `tags`, up to 10, webhook, schedule, event (`kinds.ts:591,605,614`). Siblings: the trigger and schedule kinds take `tags` (`kinds.ts:329,469,487`) and their editors have no field either: one shared field. **M** (three forms).
- **MP-8 Manual start: what the input must be.** `input` JSON Schema (`flow.ts:42-48`), which draws the Start form and the agent's tool. The script editor's schema box; the editor's Test panel already reads it. **M.**
- **MP-9 Webhook signature: what is signed, timestamp header, how old.** `signed`, `timestampHeader`, `toleranceSeconds` (`flow.ts:34-38`), so Slack and Stripe-like senders. In `WebhookSettings`, shared with the trigger resource's editor. **S.**
- **MP-10 Error path from Branch and Set.** Both can fail, YAML takes `error: true`, and the engine follows it (ran). The editor has no dot or field, and an edge written in code is not listed in "Where it goes next". `outputs()` in FE. Check Join, Wait: they cannot fail. **S.**
- **MP-11 Expressions in choice, yes/no and pick fields.** A field takes only a literal (`FS` `NodeInputs`); the manifest takes any expression. A "use an expression" switch per field. Picks by expression still need MP-3. **M.**
- **MP-12 Change which script a step runs.** Once chosen, the step shows a label only; another needs "As one expression" first (`FE:1555-1575`). **S.**
- **MP-13 Retry on a chosen version.** `bundleId` on `POST /retry` (`RT:1033`); the console offers the run's and the active one. **S.**
- **MP-14 Cancel flow runs in bulk by age.** `POST /flow-runs/cancel` with `olderThanSeconds` (`RT:1315`); CLI only (`cli.ts:609`). Sibling: the same for script runs. `flow_run:write`. **S.**

The SDK (`packages/sdk/src/index.ts`):

- **MP-15 `step.foreach` and `step.subflow` with `flowFrom` and `allow`** (`subflow` takes one `flow`; both are in `flow.ts`). `allow` takes definitions or paths, as `pathOf` does. Types must make `flow` and `flowFrom` exclusive. **S.**
- **MP-16 `tags` on `trigger.schedule`, `trigger.webhook` and `trigger.event`.** `defineSchedule` has them (`:318,332`), as the trigger kinds do; `trigger.*` and `defineEventTrigger` do not. **S.**
- **MP-17 `layout` in `defineFlow`** (`FlowOptions`, `:921`), so a flow keeps positions when pulled from the console and deployed from files. Typed by its nodes' names. Sibling: FLW-15. **S.**

No CLI part is missing: flows are files, and the CLI runs, starts and cancels them.

## Owner decides

- **Q1.** Should a test of a flow use every draft in the workspace, or only its own draft and those it uses? Options: all (now: what deploy-all would run, but one broken draft blocks every test), only what it uses, or a choice in the Test panel. Recommend only what it uses, with "with all drafts" as the choice.
- **Q2.** When a webhook or form start is renamed, should its address follow? Options: warn and let it change (FLW-04), carry the address with a stable key on the trigger as resources have, or lock the name once deployed. Recommend a warning now and the key with the manifest change that adds it.
- **Q3.** Should removing a step ask? Options: never ask and rely on undo (recommended, with a toast that names Undo), or always ask, for ⌫ and the menu too.
- **Q4.** Is the console the full flow tool, so that all the fields above belong there? The inventory asked whether they are planned. Recommend yes for MP-1 to MP-12 in M4; MP-13 and MP-14 may wait.
