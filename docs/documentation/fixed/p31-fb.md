# Fixed: lane fb of phase 31 (console faults the writers found)

Migration: none. Contract: one route answer gains a field (`hasDefault` on `GET data-source-tables/*` columns). Each row: the fault, what changed, the test, siblings looked at, screens to walk. A walk in a browser was not run in this lane (no instance was started); the screens to walk are listed for the integrator.

1. **Run waiting for its time has no Cancel run.** `kit/status.tsx` `LIVE_STATES` is the one rule; `RunPage.tsx` and `Runs.tsx` both use it. Test: `RunPage.test.tsx` "a run set for later". Sibling: flow run page already used LIVE. Walk: a run started with Later, its page and the Runs row menu.
2. **Tenants inspector hides Rename / console-code switch.** Cause was the server's `mayRename` (`routes/tenants.ts`, list and one tenant) asking without `orInstance`, which the route allows. Test: `tenant-list.test.ts` "an operator who is not in a tenant". Walk: Tenants, a tenant the operator is not in, inspector.
3. **"Through a grant" with no grant.** Now "Not a member" (list tag, inspector line); the list does not know of grants. `Tenants.tsx`; `Account.test.tsx`.
4. **Add operator raw schema error.** `ListScreen.tsx` CreateDialog: a `choose` field is required unless `required:false`, said at the field ("Choose one."). Test: `Account.test.tsx` "Add operator with nobody chosen". Siblings: Set variable, Declare a source's path, new-table reference (already `required:false` with `when`). Walk: Instance > Operators > Add operator; Variables > Set variable.
5. **Delete anyway missing full stop.** `kit/format.ts` `endSentence`; used in `Environments.tsx`, also `SignIn.tsx` and `builder/PublishCheck.tsx`. Test: `Environments.test.tsx` INS-17.
6. **"All 0 workspaces arrived".** `Environments.tsx` import report: says the tenant had no workspaces. Test: `Environments.test.tsx` "an import of a tenant with no workspaces".
7. **Builder DraftClash lacks Copy what I wrote.** `builder/AppBuilder.tsx` passes `mine`. Test: `builder-clash.test.tsx`. Siblings: Authoring, Dashboards, ResourceEditor already pass it.
8. **Phone-layout question names a missing control.** `builder/PhoneFrame.tsx` `layoutByHandText`, `ALL_AUTOMATIC`; test in `builder-frame.test.tsx`. Walk: drag a widget on the phone preview, first time.
9. **Connection-group member buttons for a read-only member.** `Execution.tsx` `ConnectionGroups` uses `useNeeds` (`connection:write`, workspace), Add a member, Change, Remove off with the reason and a line. `GateRoles.test.tsx` two rows. Walk: Connection groups as viewer.
10. **bound/bind words.** Overview, Release, Alerts, Environments (clone), ConnectionWizard hints; server: deploy notes (`deploy.ts`), diagnoses (`diagnose.ts`), route descriptions. Now "set up here / not set up here". Tests updated: `Environments.test.tsx`, `release.test.ts`, `environments.test.ts`, `data-access.test.ts`, `execution.test.ts`. Left: role "bound to" (access bindings) and `ResourceIdentity` "what is bound to it" are the access vocabulary, not connections.
11. **Custom connectors missing from New connection.** `ConnectionWizard.tsx` Kind lists every connector of `GET connectors`, the workspace's own labeled "(this workspace's own)". Test: `Connections.test.tsx` "of the workspace's own connector". Walk: Connections > New connection > Kind.
12. **Scatter refused a joined number column.** `chartShared.tsx` `queryOf` takes `columnsNamed(catalog, table, joins)` so `via.column` has a type. Test: `charts.test.tsx` "Also from". Siblings: `groupsOf`, `shapeOf`, `suggest`, SortRow columns (now also list joined columns).
13. **Row action confirm date a day off.** `widget-sdk` `formatMoment` is the one formatter; the table cell (`widgets-core/views/cells.tsx`) and `screens/confirmWords.ts` use it for timestamps (reader's zone); a date column stays literal. Test: `confirmWords.test.ts` (Chicago zone). Left: `formatDay` callers for buckets (groups, pivot) keep UTC keys.
14. **Promote step contradictory state.** `Release.tsx` PromoteStep: a 409 preview is one notice, no spinner text, no Try again, Promote off with a tooltip. Test: `Release.test.tsx`.
15. **Viewer offered "Change where this promotes to".** Off with the reason, `useNeeds` `workspace:write` of the workspace. `GateRoles.test.tsx` row.
16. **Empty "Runs at once" cannot be saved.** Workspace settings: empty means the limit stays; the hint says "Left empty, it stays at N". `Environments.tsx`; test in `Environments.test.tsx`. The script's own "Runs at once" already says "Empty: no limit of its own".

Coordinator items
17. **Queries rename leaves the old path.** `ResourceIdentity` now tells its screen of a saved rename even if the list drops the button first (unmount effect); Discard on a renamed query goes to `renamedFrom` (`Queries.tsx`). Tests: `Queries.test.tsx` two. Callers of ResourceIdentity: ResourceEditor, Authoring, Dashboards, Tenant, Queries (all get the fix).
18. **Add row requires `id` on a source.** `GET data-source-tables` columns now carry `hasDefault` (default, sequence, identity: `kernel/data/sources.ts`, `routes/sources.ts`); `Data.tsx` SourceView does not require such a column. Tests: `data-reading.test.ts`, `Data.test.tsx`.
19. **"the platform" copy.** Data sources, source page, data source resource help say Volvel. Test: `Data.test.tsx`.
20. **Kept dashboard's list title.** `routes/authoring.ts` drafts list gives a dashboard draft its body's title when none is set. Test: `authoring.test.ts`.
21. **Connections table at 390 px.** A phone keeps name and state: Used by, Kind, Points to are priority 2; Health also shows "Not set up here". `Execution.tsx`; test `Connections.test.tsx`. Shared `DataTable` is correct (priority). Other lists with 4+ columns and no priority, to look at: Tenant (members?), AgentAccess, Authoring, Domains, SingleSignOn, Dashboards, Data, Interfaces, Provisioning, OldPaths, AccessReleases (found by a scan, not fixed).
22. **Focus lost after Escape on the Share sheet.** Apps remounted the list (`key`) on close; now it reloads in place (`Apps.tsx`). Test: `Interfaces.test.tsx` sharing test. Walk: Apps > app > Share > Esc.
23. **Script editor code area 5 px stacked.** `kit/SplitPane.tsx` stacked: the first pane has a min height (`minFirst`) and panes share height by the kept share. Test: `SplitPane.test.tsx` (classes and variables; happy-dom does no layout). Callers to walk below lg (768, 390): Authoring script editor, Release, builder EditorShell, FlowEditor (two), RunPage, KitSheet.
24. **Ctrl+Enter ran with `{}`.** The shortcut presses the pane's Run button (one path). `Authoring.tsx`; test `Authoring.test.tsx`.
25. **Repository script's Settings offered Change.** `ObjectPages.tsx` compared to "repository"; the value is "code". Test: `ObjectPages.test.tsx`. Grep for other ownership comparisons: none wrong.
26. **Fitted diagram at the left edge at 390.** `diagrams/draw.ts` fit worked the middle from an unclamped scale; now the drawn scale is the one used and a wide diagram is fitted whole (zoom out goes as far as the fit). Test: `diagrams/draw.test.ts`. Walk: docs editor and served page with a wide diagram at 390.

## Found, not fixed
- Lists with 4+ columns and no `priority` (see 21).
- p31-faults items outside console (promote CLI, workers threshold etc.) are lane fa's.

## Screens to walk (1440, 768, 390; light and dark; keyboard; reload)
Run page (waiting run), Runs, Tenants and inspector, Instance > Operators, Environments (clone, import, settings), App builder (clash, phone layout), Connection groups, Connections (+ New connection), Overview, Release > Promote, Queries rename, Data source page (Add row), Dashboards list, Apps > Share, script editor (stacked), docs diagram.
