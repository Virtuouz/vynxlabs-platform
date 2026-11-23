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
