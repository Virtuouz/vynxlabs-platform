# fix-last (phase 29): what the re-walks r-narrow, r-screens and r-build still found

Tests were seen failing on the code before each change (the change applied in reverse, or the test written first). No migration. No contract change (only who may call existing routes; see 1).

## 1. A person bound on one flow or script reaches that one (r-screens 6)
- Commits: "a person bound on one flow or script reads, starts and re-runs that one"; "run lists and flow lookups use the shared resolver".
- `apps/control-plane/src/routes/flows.ts`: `GET flows/*`, `GET flow-runs` (with `flow=`), `flow-runs/:id` (and its steps), `/definition`, `/retry-plan`, `/retry`, `/cancel` are now `access.custom` and check the permission at the workspace or on the flow (`check` counts a resource binding), through `authorizeRun` (the run's own `resource_id`). A run, or a flow, that is not there answers as one that is not allowed (403), as before. `apps/control-plane/src/routes/execution.ts`: the same for `GET runs` (with `script=`), `runs/:id`, `/logs`, `/cancel` (`/rerun` and `POST runs` already did).
- A list without a `flow=` or `script=` still needs the workspace permission (403 for someone bound on one flow); a list that names the flow or script is checked on it.
- Tests: `apps/control-plane/src/flows.test.ts` "reads, starts and re-runs the flow it was given, and nothing else" and "reads, runs and re-runs the script it was given, and no other": the grantee reads, starts, re-runs; is refused on another flow, its runs, retry, cancel, a layout write, `GET runs`; a member with no grant is refused all of it. The earlier "starting one flow and no other" test now expects that someone who may start a flow may cancel its run (409, ended) and not another flow's (403). `path-lookups.test.ts` ALLOWED for `routes/flows.ts` brought down to 3.
- The console already asked `useMayOn`/`useNeeds` with the resource on the flow page (Start flow) and run pages (Re-run); no console change was needed there.
- Siblings looked at, left: other kinds that can be bound (tables `data:read`, apps `app:read`, queries) already check with the resource; connections, variables, triggers, `compare` (`/previous-success`), `operations` (`/runs/:id/insight`), and `GET flows` / `GET scripts` lists are still workspace-wide (found, not changed). Role of the walk's `w_readonly_flow_runner` holds no `flow_run:read`, so on the run page it sees only how its own runs ended (as before); a role with `flow_run:read` on the flow reads all of the flow's runs.
- Screens to walk: grant on one flow: flow page (Start flow, runs list, a run, Re-run, Cancel), another flow (refused), at 1440 and 390.

## 2. Script peek (r-screens 5)
- `apps/console/src/screens/Execution.tsx` (`Scripts`): Open editor, Run and Offer to an agent are off for someone without `resource:write`, `run:write`, `binding:write` (checked with the script as resource, `useMayOn`), and the first missing one is said by `NotAllowed`. Test: `ViewerGating.test.tsx` "the script peek in the list ...".
- Siblings: `OfferButton` in `Authoring.tsx` (editor) and `Flows.tsx` (flow page) are not gated by `binding:write` (found).

## 3. Narrow cells and paths (r-narrow 1, 4)
- `kit/references.tsx:60`: `UsedBy` was `inline-block min-w-[9rem]`; now `block min-w-0 [overflow-wrap:anywhere]`. Used on Connections, Variables, Secrets (Execution.tsx, Tenant.tsx) and the table page (Data.tsx).
- `kit/DataTable.tsx`: new column option `wide` (14rem at every width, counted twice in the table's minimum so the table scrolls sideways first). Set on Resources "Path", Flows "Flow", Triggers "Trigger". `kit/Truncate.tsx`: a middle-cut path longer than 24 characters carries its whole as `title` from the start (touch has no hover).
- Test: `kit/narrow-cells.test.tsx`. Not measured in a browser. Walk: Resources, Flows, Triggers, Connections, Variables, Secrets at 390 and 768.

## 4. SSO Settings save bar at 390 (r-narrow 2, r-screens 4): refuted, not changed
- Ran: the built console (this tree's `apps/console/dist`, and the main checkout's) in Chromium through Playwright with a mocked API, mobile emulation, tenant `/t/t1/single-sign-on` and `/instance/single-sign-on`, provider Settings tab, a name edit, with and without the read-only strip, at 390x800 and 390x844. The bar's bottom equalled the viewport bottom every time (main scrollport 48 to 800; bar 721 to 800). A static copy of the DOM chain (sticky bar in a `fieldset.contents` in a form in a scrolling `main`) behaves the same. The ancestors of the bar hold no overflow other than `main`.
- So the cut is not in the layout of the bar, the fieldset or the shell as built. What the walk saw (top 759, bottom 838 at 800 and 844 alike) is the bar at its natural place, as if `main` did not scroll or the page were 38 px taller than the window, which could not be made to happen. Needs a measure on the walk instance: `getBoundingClientRect` of `#main`, `#app` and the bar, and `innerHeight`.

## 5. Access changes tab (r-narrow 3, r-screens 1)
- Cause: `nav.ts` `TENANT_WORKBENCHES` lacked `releases`, so the tab got the page's `px-8` padding on top of the list's own (the 32 px inset, and no room beside help). Added. The actions column ("Go back to this", Approve, Decline) gets `width: "w-44"` in `AccessReleases.tsx`.
- Tests: `Shell.test.tsx` (every `ACCESS_TABS` slug is a workbench), `AccessReleases.test.tsx` "from a tablet up ...". Walk: Members & access, every tab, with help open, 1440/768/390.

## 6. Account h1 (r-screens 2)
- `screens/Account.tsx`: `Page title="Account"` with API keys as a section (`as="section"`). Test: `Account.test.tsx`.

## 7. SideSheet Tab leak (r-screens 3)
- `packages/ui/src/SideSheet.tsx`: `tabbables` now matches the browser's stops (not hidden inputs, not undrawn controls by `checkVisibility`, one stop for each radio group), so first and last are where Tab really begins and ends. And `useKeepFocusInside`: after a Tab, focus that lands on the body, a focus guard, or the page outside any layer goes back to the first (Shift+Tab: last) control. Tests: `packages/ui/src/dialogFocus.test.tsx` (two).
- Siblings: `Dialog.tsx` uses Base's own trap; not changed. Walk: Create group and every SideSheet, 40+ Tab presses, forward and back.

## 8. r-build extras
- Table Definition row actions clipped: `Data.tsx` actions column `wide` and `flex-wrap`. Test `Data.test.tsx`.
- Add a field: `FlowStepFields.tsx` moves focus to the new field's name. Test `FlowEditorWalk.test.tsx`.
- "waited 0 ms" next to "Waiting until": `kit/Elapsed.tsx` `waitedAndRan` gives no wait for a run not yet due. Test `Elapsed.test.tsx`.
- Runs chips over a backwards window: `Runs.tsx` counts are empty then (chips and the bulk Cancel buttons). Test `Runs.test.tsx`.

## Found
- `path-lookups.test.ts` fails on `kernel/pages/standing.ts` and `routes/workspaces.ts` (exact path queries, other lanes); `enforce.test.ts` "formatted by kit/format.ts" fails on `screens/RowRules.tsx:401 toLocale…`. Neither is in a file this lane touched.
- `routes/compare.ts` and `routes/operations.ts` run routes still check the workspace only.
