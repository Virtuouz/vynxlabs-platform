# Lane t3-flow-editor: fixed

Items: FLW-MP1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14. All built; none refuted. No migration, no contract change (every field already existed in `packages/manifest`). Each test was run on the code before the change and failed there (`git apply -R` of the screens' diff). Two commits: one for the flow inspector (MP1 to MP12), one for the run screens (MP13, MP14).

## Shared pieces (new): `apps/console/src/screens/FlowStepFields.tsx`
`DurationField` (number and unit, kept as seconds), `TagsField`, `EventStartFields`, `ApproversFields`, `GrantsFields`, `InputSchemaField`, `withCurrent` (a multi-select drops chosen values its list lacks; this keeps them, so a grant written in code survives any change).

## Inspector (`FlowEditor.tsx`, `FlowSteps.tsx`)
- MP1 For each "How many at once (optional)", 1 to 20, a problem in "To fix" outside it. `FlowEditor.tsx` foreach block, `MAX_AT_ONCE`.
- MP3 "What the script may reach" (connections, tables, events) on script and For each steps; picks made in a field still add to it.
- MP4 Wait ("How long to wait") and an approval's "Give up after (optional)" are one `DurationField`; maximum 30 days is a problem. The hint says the step fails on expiry and takes its error path.
- MP5 `ApproversFields`: groups by key, roles by name, loaded from the tenant; says "anyone who holds the approval permission" when none chosen; load failure and loading are shown.
- MP6 `EventStartFields`, now also in `ResourceEditor.tsx` (trigger kind). The filter is a plain field, not a run preview, so `trigger` and `steps` are never offered; hint names `event.name` and `event.payload`.
- MP7 `TagsField` for webhook (`WebhookSettings`, so the trigger kind too), event (both editors) and schedule (`WhenFields`, so the schedule kind too). More than 10 is an error and a problem.
- MP8 `InputSchemaField` on a manual start: JSON typed stays as typed, saved once it is a JSON object, error shown until then.
- MP9 Webhook signature: "What the sender signed" (body; timestamp.body; v0:timestamp:body; own text), timestamp header (required when the text has `{timestamp}`, also a problem), tolerance as `DurationField` (up to 1 day).
- MP10 `outputs()` gives Set and Branch an error handle: dot on the canvas and "On failure, go to" under "Where it goes next"; an error edge written in code on either now has a handle to draw to.
- MP11 NodeInputs: "Use an expression" on every choice, yes/no and pick field; a value that is not on the list shows it on. Going back to the list drops an expression that is not a listed value (said in the hint). An expression for a pick hands over nothing, said in its hint (see MP3).
- MP12 The "Script" field is always shown on a script step; `changedScript` keeps the fields the new script has and moves what the old picks granted.

## Run screens
- MP13 `RetryOnVersion.tsx`: "On another version…" in the run page's Re-run menu and a flow row's menu; picks a version, from the failed step or the start; asks as the other retries do; sends `bundleId` (`runAgain.ts` `FlowVersion`). A version that draws a kept step differently is said in the question, and the server's refusal is shown.
- MP14 `CancelOlder.tsx`: "Cancel by age…" in the Runs header while anything is going; flow runs (`flow-runs/cancel`) or script runs (`runs/cancel`, include `all`, with the list's filters but not its time window); asks twice; says how many and whether more are left. Empty each time it opens.

## Tests
`FlowInspectorFields.test.tsx` (16), `RunPage.test.tsx` (MP13), `Runs.test.tsx` (MP14). Also run: `FlowEditorWalk`, `FlowSteps`, `FlowEditor`, `ResourceEditor`, `ScheduleForms`, `Triggers`, `enforce`. `tsc -p apps/console`.

## Siblings looked at (POLISH-013)
`WebhookSettings` (flow and trigger kind), `WhenFields` (flow start and schedule kind), event start (flow and trigger kind), `NodeInputs` (script steps only), Wait/approval time (one field). Not changed: the standalone form trigger, `Operate.tsx`.

## Lines for docs and CHANGELOG
Inspector now sets: how many at once, what a script may reach, approval time limit and approvers, event filter, tags on starts, manual input schema, webhook timestamp signing, error path of Branch and Set, expressions in choice fields, changing a step's script. Run pages: retry on any version; cancel runs by age.

## Screens to walk (not run)
Flow editor with each step type chosen; Runs list; run page of a failed flow run. 1440, 768, 390; light and dark; keyboard (switches, dialogs, Esc); reload. The browser walk was not run.
Gate: states (loading and failed groups, no versions, nothing entered), lifecycle (undo of each field), keyboard, copy plain.

## Found
- The manual input schema is a JSON text box, not a field builder; invalid text is lost when another step is chosen.
- Error from a Branch: the layout of its handles on the right edge was reworked (error dot is below, as for other steps).
- Approval timeout: nothing in "To fix" checks a group that no longer exists.
