# Lane t3-flow-ops-sdk: fixed

No migration.

## FLW-MP15, FLW-MP16, FLW-MP17 (SDK)
- `packages/sdk/src/index.ts`: `step.foreach` takes exactly one of `script`, `flow`, or `flowFrom` with `allow` (a type union); `step.subflow` takes a flow or `{ flowFrom, allow, input }`; `allow` takes paths or definitions (`pathOf`). `trigger.schedule`, `trigger.webhook`, `trigger.event` take `tags`. `FlowOptions.layout` (typed by node names) is written to the flow body.
- Test: `packages/sdk/src/flows.test.ts` "a flow's choice of flow, tags and layout" (3 tests), seen failing before.
- Siblings: `defineSchedule` and the trigger kinds already had `tags`; `FlowBody` already accepts `layout`, `flowFrom`, `allow` and `tags` (manifest `flow.ts`), so no contract changed.
- A person sees nothing; code authors see the new options.

## OPS-MP3 Fire now for a flow's schedule
- `apps/console/src/screens/Operate.tsx` (the command and the footer button): the `!open.node` conditions are gone; `fireNow` already sent `node`. The route took it already; `ObjectPages.tsx` "Run it now" already offered it for nodes.
- Test: `apps/console/src/Triggers.test.tsx` "a schedule fires now from its inspector, and so does a flow's schedule, naming its node" (was: asserted no button).
- Siblings: ObjectPages `TriggersOf` row action (already right); Overview has no fire control.
- Sees: the Triggers workbench, a flow's schedule node: "Fire now" in the footer and the palette, which opens the flow run's page. Hidden while the workspace or the trigger is paused, as for a script's schedule. Walk: Triggers with a flow schedule chosen; 390 px footer wraps.

## OPS-MP9 What a script run published
- `apps/console/src/screens/RunAlert.tsx` `RunEvents`: "Published" section in the script run page's side column (ended runs), from `GET events?run=`; each event leads to `events?item=<id>`; "It published no events." when none; nothing while loading or when the read fails (the page is whole without it).
- Test: `RunPage.test.tsx` "a script run says what its failure alert did, and what it published", "a script run that published nothing says so...".
- Siblings: a flow run publishes through its step runs, which have their own pages; the events list API only filters by script run, so a flow run page has no section (left out; would need `events?flowRun=`).

## OPS-MP10 What a failure's notification did
- `RunAlert` (same file), used by the script run page (replacing the handler link and the suppressed sentence) and the flow run page (under the header). Says: handler run link, "The failure handler did not start: <error>" (`handlerError`), "The failure notification was posted." / "was not sent: <error>" / "is waiting for a worker to post it." (`notified` true/false/null), "N later failures were counted on this alert, not sent on its own." (`repeats`), and the suppressed sentence.
- API: `GET flow-runs/:id` (and the other `FlowRun` responses) now carry `alert` (`routes/flows.ts` `FlowRun`, `toFlowRun`), as a script run's did.
- Tests: `RunPage.test.tsx` "a flow run says that its failure handler failed to start...", and `apps/control-plane/src/flows.test.ts` "a failed step with no error path fails the flow..." (now reads `alert`).
- Polish gate: states: no alert shows nothing; queued, posted, failed, handler failed all say so. Lifecycle: ends at the run page (the alert is written once). Keyboard: links only. Copy plain. Walk: a failed script run with a notify connection unbound; a failed flow run; 390 px.

## OPS-MP7 Runs between two times
- `apps/console/src/screens/Runs.tsx`: "Between…" under When; From and To date-time fields (`from`, `to` in the address, one instant each, shown in the reader's zone). `to` empty means until now. The list asks `activity?from&to` and "Cancel queued" sends both in `filters` and names the window in its text. Saved views keep it, because they keep the address (`ViewsMenu`, `viewQuery`). A window that ends before it starts says "The end is before the start." and asks for nothing. Choosing a relative window again clears both.
- Tests: `apps/console/src/Runs.test.tsx` "runs between two times: ...", "a window that ends before it starts says so and asks for nothing". Seen failing before.
- Siblings: the other lists with "Last 24 hours" windows: none besides Runs found. The API took `from` and `to` already.
- Polish gate: states: loading, empty ("Nothing ran in this time"), refused window (notice). Keyboard: native fields. 390 px: the fields wrap in the header actions. Walk: Runs, Between, reload, a saved view.

## OPS-MP8 Run later, with a priority
- `apps/console/src/InputDialog.tsx`: `timing` prop adds "Start: Now / Later" (a "Starts at" date-time field) and "Priority" to the input form and gives `onSubmit(input, { startAfter?, priority? })`. A time that has passed, no time chosen with Later, and a priority that is not a whole number from -100 to 100 are refused in words, in the dialog's notice. Used by the script Run button (`Execution.tsx` `RunButton`, so a script's page and its list) and the palette's `/run` (`kit/CommandPalette.tsx`, scripts only). Flows are not offered it: `POST flow-runs` takes neither. The API is unchanged (`POST runs` already took both).
- Tests: `InputDialog.test.tsx` "a run can start later and with a priority...", `CommandPalette.test.tsx` "/run can start the script later and with a priority". Seen failing before.
- Siblings: "Run again with other input" on the run page and in Runs use `POST runs/:id/rerun`, which takes neither (left out). Dialogs that do not pass `timing` are unchanged.
- Depends on OPS-25 (t4-flows-ops): until it lands a later run is listed and counted as queued; the dialog says it "waits as queued".
- Polish gate: states: saving and failure are the form's; keyboard: native select and fields, Enter submits; 390 px: the fields wrap. Walk: Run on a script page, with Later and a past time, with priority 500, then a valid one; reload clears it (a dialog).

## OPS-MP2 Platform events in the event picker
- `packages/manifest/src/bundle-check.ts`: `PLATFORM_EVENTS` (name, description, payload fields) for `platform/run-succeeded`, `run-failed`, `flow-run-finished`, `deployment-created`, `row-changed`; exported from the manifest package. `apps/console/src/kit/platformEvents.ts` `listenChoices` adds them after the workspace's own events, each with a hint "<what> Payload: a, b." Used by the trigger editor (`ResourceEditor.tsx`) and the flow editor's event trigger (`FlowEditor.tsx`). Not used for the "may publish" grants of a step (`pickChoices.event`): the platform's events cannot be published by anyone else (`POST events` refuses `platform/`).
- Tests: `ResourceEditor.test.tsx` "an event trigger can listen for the platform's own events...", `PlatformEvents.test.ts`, and `apps/control-plane/src/platform-events.test.ts`, which fails when the control plane publishes a platform event the list lacks.
- Siblings: the bundle check already accepts any `platform/` event path (`expect`); `defineEventTrigger`/`trigger.event` in the SDK take any path. A script's `events` grant picker and the Events screen are unchanged.
- Sees: Triggers editor, "Event" field; flow editor, an event start's "Event" field. Walk both at 390 px (long hints wrap in the list).
