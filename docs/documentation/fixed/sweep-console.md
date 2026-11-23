# Fixed: lane sweep-console (the final sweep, console screens and widget packages)

No migration, no contract change, no change to `schemas/`. Every test below was seen failing on the code before its change, except where said. Walks were not run in a browser; tests stand in. Screens to walk, at 1440, 768 and 390 px, light and dark, by keyboard, with a reload: the palette's Recent after opening an app, a trigger and a schedule; a dashboard the workspace keeps, saved over by someone else (the notice sits above the page editor); a resource editor with a draft saved over; a flow with a manual start (type half a schema, choose another step, come back) and an approval naming a group that is gone; a script's page, Settings tab; a condition "is between" on a money column; the builder header's rename; a record detail's choice field and status chip; a chart with several measures; a saved query's and SQL's values in a widget's Data tab; the page editor and Add a page with the tables refused.

## Recent for apps, triggers and schedules (t3-account)
- Tests: `Triggers.test.tsx` "a schedule that is opened is remembered ...", `recent.test.ts` "a trigger, a schedule and an app are known by the address of their editor", `Portal.test.tsx` "an app that is opened is remembered ...". **Changed:** `recent.ts` (kinds, address of `resources/edit/trigger|schedule/<path>`), `Operate.tsx` `TriggersWorkbench` and `Apps.tsx` `AppList` call `useRecordRecent` when one is open (a flow's own trigger, which has a node, is not remembered). The server already accepted both kinds.
- Siblings: the palette's `pageOf` already links all three through `objectHref`.

## objectHref("dashboard") (t3-data)
- Test: `ObjectPages.test.tsx` (`objectHref` of a dashboard). **Changed:** `kit/objects.tsx` goes to `dashboards/at/<path>`. Siblings: every `ObjectLink` and the Changes list use `objectHref`.

## DraftClash with "Copy what I wrote" (t2-walk-shell, t3-data)
- Tests: `ResourceEditor.test.tsx` "a draft someone else saved first offers to copy ...", `Dashboards.test.tsx` "a dashboard the workspace keeps, saved over by someone else ...". **Changed:** `ResourceEditor.tsx` passes `mine`; `Dashboards.tsx` keeps what was refused (`clash`), does not reload over it, blocks further saves, shows `DraftClash` in the page editor (`shell.notices`, status "Not saved: someone else saved this dashboard") and in the view. Siblings looked at: `Authoring`, `FlowEditor`, `AppBuilder` already had it; `Queries.tsx` and `DocEditor.tsx` not changed (left, check they pass `mine`).

## Manual start schema kept; To fix checks approver groups (t3-flow-editor)
- Tests: `FlowEditorWalk.test.tsx` "a schema typed for a manual start is still there ...", `FlowEditor.test.tsx` "an approval that asks a group the tenant no longer has is said ...". **Changed:** `FlowStepFields.tsx` `InputSchemaField` takes `kept` (the editor holds the text by step); `FlowEditor.tsx` `problemsAt(…, groups)` and `useGroupKeys` (member groups only; nothing is said until they are read or when they cannot be).
- Left: the schema is still a JSON box; a field-by-field form for it is not built.

## Script page shows the settings (SCR-08)
- Test: `ObjectPages.test.tsx` "a script's page shows the settings it runs with". **Changed:** `ObjectPages.tsx` `ScriptSettings`, a Settings tab (read-only, from `resources/<path>`; says where to change them).

## Money in "is between" (WID-26)
- Test: `rows-it-uses.test.tsx` "a money column's "is between" ...". **Changed:** `packages/ui/src/drawer/EditorBodies.tsx` `BetweenInput` takes `money`. Siblings: every `ConditionEditor` caller gets it through `money`.

## Builder header typed count (BLD-06)
- Test: `builder-frame.test.tsx` (rename shows "n of 100"). **Changed:** `BuilderHeader.tsx` `RenameField`.

## WID-M4 detail field badges and status colors
- Tests: `records.test.tsx` two "WID-M4". **Changed:** `ColumnEditor.tsx` `BadgeColors` (extracted; the table uses it), new `choiceBadges.tsx`, `fieldsList.tsx`, `detailDrawer.tsx`. `statusBadges` now has its row under Record header.

## WID-M6 chart measures and scatter
- Test: `charts.test.tsx` "WID-M6". **Changed:** `measureControls.tsx` `MoreMeasures` ("Add another measure", up to six), `chartDrawer.tsx` scatter tile. Left: chart `x`, `y` as columns and `sort` (the row order is still the breakdown's; "Sorted by" stays hidden).

## WID-M11 saved query and SQL values
- Tests: `rows-it-uses.test.tsx` two "WID-M11". **Changed:** `rowsItUses.tsx` `ConstantValues`.

## BLD-03 (left), D38 (left)
- Test: `builder-frame.test.tsx` "the page editor and the new page dialog say that the tables could not be read"; `dates-and-lists.test.tsx` "the kit's locale is the reader's locale". **Changed:** `PageEditor.tsx`, `NewPageDialog.tsx`; `packages/ui/src/dates.ts` `localeOf` is `readerLocale`.

## Left
- WID-M10 (visual `joins`): a large control, not started. Not touched: the audit area's template actions (phase 30 M9), the CLI, the server items, the wizard notice for group members, `tenant.console_code`, CreateDialogs' "Created.", the tables items of t3-tables, Files' help topic, the flow list's one fault per step, `JsonView`'s `{stored}`.

## Found
- `Portal.test.tsx` "APP-MP3 ..." passes alone and fails after the first test of the file ("Found multiple elements with the role button and name /App/") once the phase branch is merged in; it passed before the merge. Not looked into.
