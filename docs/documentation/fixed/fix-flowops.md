# fix-flowops (phase 29, lane p29-fix-flowops)

Rows are the walks' "Wrong" items in `walks/w-operate.md` (OP) and `walks/w-flows.md` (FL). No migration.

## OP-found: drafts deployed together fail when a trigger or schedule sorts before what it starts
- Cause: `deployBundle` applied manifests in bundle order (path order for a deploy of drafts), though `KIND_ORDER` existed. A schedule at `wop/a-clock` was applied before the flow `wop/a-flow` it starts, and refused.
- Fix: `apps/control-plane/src/kernel/execution/deploy.ts` applies manifests sorted by `KIND_ORDER` (stable within a kind; kinds not listed come last). The same piece serves CLI, Git, promotion and console deploys.
- Test: `authoring.test.ts` "drafts deployed together apply what a resource depends on first" (script, webhook trigger, schedule to script, flow, schedule to flow, all listed before their target). Failed first with `The schedule refers to a flow that does not exist`.
- Looked at: flow to script and trigger to script (checked on the whole bundle or order of kinds), app to table, binding to connection, interface/dashboard to table/query (all in `KIND_ORDER` in the right order). Flow to flow (Run a flow step) is validated on the whole bundle in `bundle-check.ts`, not by apply order; not separately tested (the step's draft shape was not built in the test).
- Not changed: `clone.ts` sorts unknown kinds first with `order()`; left as is.

## FL-1 Run a flow step with no flow chosen
`builder/publishCheck.ts` `actionProblem`: "it has no flow chosen" / "it has no script chosen". Test: `builder-publish.test.ts`. Sibling: `kit/inspector/tabProblems.ts` calls it, so every action editor gets it.

## FL-2 Duplicate field names in the manual-start form
The message "Another field has this name." already showed on each row; what was missing was that the JSON keeps the last schema meanwhile. `FlowStepFields.tsx` SchemaFields now says so while any row has a problem. Test: `FlowEditorWalk.test.tsx` FLW-dup.

## FL-3 A schema with `title` is shown by the form
`screens/inputSchema.ts`: top-level `title` is kept as it is; a field's `title` is a row (Label of field N) and written back. Test: FLW-title in `FlowEditorWalk.test.tsx`. Sibling: `Authoring.tsx` has its own `schemaOf` (a script's), not changed.

## FL-4 Pasting steps drops them silently
`flowClipboard.ts` `readClipReport` returns what was skipped and why; `FlowEditor.tsx` `pasteText` says it for both the Mod+V and the canvas menu Paste. Text that is no steps now says so. Test: `flowClipboard.test.ts`.

## FL-6 Event filter reads `trigger.x`
`FlowEditor.tsx` `problemsOf`: a problem on the start's filter. Test: `FlowEditor.test.tsx` FLW-filter.

## FL-7 Role picker lists each role twice
Picker at fault, not the seed: a role the repository defines is one row per workspace it is deployed to, and `GET /tenants/:t/roles` returns them all. `FlowStepFields.tsx` `ApproversFields` lists this workspace's and the tenant's roles, once by name. Test: `FlowInspectorFields.test.tsx` FLW-roles. Sibling to look at (not changed): the endpoint itself still returns every workspace's row; other pickers of `/roles` (access screens) were not examined.

## OP-2 Pause reason runs into the next sentence
`Operate.tsx`: the reason ends with a period, then a space. Test: `Triggers.test.tsx`.

## OP-3 Window that ends before it starts keeps old rows
`Runs.tsx` `items` is empty when `backwards`. Test: `Runs.test.tsx`.

## OP-4 Run set for later
`InputDialog.tsx` copy: "A later run is listed as waiting until its time, and starts then." Run page header now gets `until={run.scheduledFor}` (`RunPage.tsx`, `Execution.tsx` LiveRun type), so it says "Waiting until HH:MM". Test: `RunPage.test.tsx`. Flow run pages: the flow's delay time is already on the step.

## OP-7 bound / Unbind / missing beside "Not set up here"
- "Unbind" is now "Remove from here" (`ObjectPages.tsx`, `Execution.tsx`, `Data.tsx`), confirm text "until it is set up again".
- Sidebar "N missing" is "N not set up" (`Shell.tsx`; no test, `panelFor` is not exported).
- "The connection X is not bound." is "...is not set up in this workspace." (`routes/alerts.ts`, `kernel/execution/alerts.ts`). Release.tsx "until it is bound" now "set up".
- Tests: renamed buttons in `ObjectPages`, `Configure`, `Data`, `ConfigExt` tests.
- Left: server `deploy.ts` messages "is not bound in this workspace" (tested in 4 files, shown in Release); `status.tsx` `Bound/Not bound` (voc rows).

## Screens to walk
Flow editor: manual start (fields, duplicate, title), approval Who may decide, event start filter, paste of steps, interface action with Run a flow. Triggers (paused). Runs (between, backwards). Run page of a run set for later. Connections list/page, data source page (Remove from here), sidebar badge. Releases with drafts of a trigger and its script.
