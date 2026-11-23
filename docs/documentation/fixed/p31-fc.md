# Fixed: lane fc of phase 31 (console, round 2)

Migration: none. Contract: none. No browser walk was run in this lane (no instance started); the screens to walk are listed at the end. Tests were seen failing first, except where "written with the fix" is said.

## operate
1. **Fire now sets Last fired.** A manual firing is a firing: `fireScheduleNow` (`kernel/execution/triggers.ts`, `markFired`) sets `last_fired_at`, and `lastRunOf` (`routes/execution.ts`) no longer skips `manual` runs. Copy "Runs started by hand are not counted" removed (`Operate.tsx`, two places). Tests: `operations.test.ts` "Fire now is a firing", `Triggers.test.tsx`. A script run by hand directly was never matched to a trigger, so it still does not count.
2. **"the platform" / Bind in diagnoses.** `diagnose.ts` says Volvel and "Set it up under Connections". Test: `operations.test.ts` "never the platform". Alerts screen and others: only variable names say bound/bind now.

## queries
3. **Encrypt Yes, 500 on a source page.** Screen part: `Data.tsx` `sourceFailure` says the server may not support encrypted connections, with the way out, when the answer is only "Internal Server Error" and the source encrypts. Test: `Data.test.tsx`. The server answering the reason is fd's.
4. **Group names lowercased in "Seen by".** `Dashboards.tsx` keeps the names as written. Test: `Dashboards.test.tsx`.
5. **Data sources row clipped at 390.** Row buttons stack in one column on a phone (`Data.tsx`, `max-sm:flex-col`). Test: `Data.test.tsx` (classes; layout was not measured). Updated WLK-09d.
6. **Tab trapped in the SQL editor.** `editor/CodeEditor.tsx` `TabHint` (shared by every Monaco editor: Queries, Authoring, ObjectPages, docs, widgets): while focused, "Tab indents. Press Ctrl+M, then Tab, to move on." Only Ctrl+M is said: Monaco has no Esc-then-Tab. Test: `editor/CodeEditor.test.tsx`.
7. **Test/Change/Remove from here offered to a reader.** `Data.tsx` `useSourceWrite` (`data_source:write`) off with the reason, on the source page, Connect and the list; list Edit (`resource:write`) is a disabled button with the reason. Tests: `GateRoles.test.tsx` (source page rows fail before; list rows were already off through the list's fieldset; Edit link rows).
8. **Rename moves to the new address.** Confirmed on this build by `Queries.test.tsx` "a query renamed ... is followed to its new path" and "discarding ... renamed query". Nothing changed.

## app-builder
9. **Publish check lists a failure twice, counts twice.** `publishCheck.ts` `checksFor` merges a refusal by its words (keeps the place), `FixPill` counts distinct words. Test: `builder-publish.test.ts`.
10. **App name squeezed at 390.** `kit/PageHeader.tsx` bar: the name takes the whole row on a phone and the pill goes under it (also every other bar header). Test class check: `PageHeader.test.tsx` (written with the fix).

## basics
11. **Start flow picker lists a never-deployed flow.** `kit/CommandPalette.tsx` lists only `version !== null`. Test: `CommandPalette.test.tsx`.
12. **Batch Cancel reports finished runs "not done".** `kit/BatchResult.tsx` `leftAlone` (409 to a cancel): toast and dialog say "N left alone because they had finished"; `Runs.tsx` uses it for cancel only. Test: `BatchResult.test.tsx`.
13. **Workspace overview overflows at 390.** `Overview.tsx` grid has `grid-cols-[minmax(0,1fr)]` and `min-w-0` on its first column. Class test only (`Approvals.test.tsx`, written with the fix). The 481 px source was not measured: walk it.
14. **"The run already cancelled."** `runs.ts` `alreadyEnded`, also used by the flow run: "This run was already canceled." / "This run already succeeded." Test: `execution.test.ts`.

## access
15. **Bad attribute name refused after Save.** `Groups.tsx` `AttributesDialog` refuses at the field ("Bad Name cannot be a name. Use lowercase letters, digits and underscores, starting with a letter, up to 63 characters.") and Save sends nothing. Test: `AccessT3.test.tsx`. Callers: EndUsers and Groups share the dialog.

## lists
16. **15 lists with 4+ columns and no `priority`.** Added in AgentAccess, Authoring (extensions), Dashboards, Data (retired columns), Domains, Execution (variables, worker credentials), Interfaces, OldPaths, Provisioning (three), SingleSignOn (two), Tenant. AccessReleases already had them. Test: `ListsPriority.test.ts` scans every `columns={[` of the screens (it listed exactly these 15 before). Layout at 390 not measured.

## round 2 additions
17. **Table picker offers tables the deploy refuses.** `FlowEditor.tsx` `ofKind`: in a flow owned by the repository (`state === "repository"`) only resources with `ownership: "code"` are offered, and no drafts: tables, events, connections. Tests: `FlowEditorWalk.test.tsx` (two).
18. **"the platform" in Register database, a refusal, Health.** `Environments.tsx`, `routes/locations.ts` (description and the 400 "That is this instance's own database."), `InstanceHealth.tsx` ("for Volvel's own work"); also Execution, ConnectionWizard, FlowEditor, Flows, Data, Authoring, Domains, Operate's "Volvel" label. Tests: `Locations.test.tsx`, `InstanceHealth.test.tsx`, `environments.test.ts` INS-15, `Alerts.test.tsx`. Left: "platform/..." event names and `platform` folder (identifiers).
19. **Success toasts vs "Reconnecting…".** Cause: a success toast sat in an `aria-live` region with no role, so a reader or a test looking for `role=status` found only the page's `Reconnecting` span (empty unless a read failed). Now every non-danger toast card has `role="status"` (`packages/ui/src/Toast.tsx`; danger already `alert`). The toasts were shown all along. Test: `Toast.test.tsx`. Not run: the full console suite (the 11 suites that query `status` pass).
20. **Unfollowing "Also from" leaves its columns in Display.** `kit/inspector/rowsItUses.tsx` `follow(off)` now writes the query and drops the table's columns from `config.columns` (by `via.column` and `via_column`) in one write. Test: `rows-it-uses.test.tsx`. Only caller: `AlsoFrom` (every visual source). Other column-control config fields naming a joined column are not cleaned: found, not fixed.
21. **"self-hosting guide" in the refused-workers notice.** `Execution.tsx` opens the help page `self-host/explanation/running/managed-workers-and-isolation` with `openHelp`. Test: `Workers.test.tsx`.

## Found, not fixed
- Config fields (list slots, chart columns) that name a joined column are not dropped on unfollow (20).
- Whether the help panel resolves the `self-host/...` path was not checked against built help: walk it (21).

## Screens to walk (1440, 768, 390; light and dark; keyboard; reload)
Triggers (Fire now, Last fired), Dashboards (shared with a group), Data sources list and a source page (as viewer and as admin; encrypted source with no SSL), Queries/SQL editor focus hint, App builder header with "N to fix" and the publish check, Command palette > Start flow, Runs > check finished runs > Cancel, Workspace overview at 390, Access > end user > Attributes, the 15 lists at 390, a repository flow's step grants, Instance > Database locations > Register, Instance Health, any save toast (screen reader or DOM), widget inspector Also from, Connections/Workers refused notice.
