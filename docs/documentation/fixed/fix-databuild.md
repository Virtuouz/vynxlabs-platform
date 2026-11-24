# fix-databuild: w-data 1-7 and w-builder 1-7 (phase 29)

No migration. No contract changed. Every test was seen failing on the code before its fix.

## w-data
1. Retired table loses indexes. `apps/control-plane/src/routes/data.ts` (table detail, near `if (!resource && table.status === "retired")`) now reads the platform's `ix_` indexes from Postgres when no resource is left, so the retired page lists them and Bring back saves them. Test: `data-tabp.test.ts` "w-data 1". Siblings: `bodyOfRetired` (Data.tsx) already sent `table.indexes`; Release.tsx Bring back uses the same detail. The retired table's description is still not kept (said in `bodyOfRetired`).
2. Picker hint hides the name. `kit/inspector/queryParts.tsx` ChoiceList: hint `min-w-0 max-w-[50%] truncate`, name `min-w-[40%]`, both with `title`. Test: `ChoiceList.test.tsx` (class contract; layout needs the walk).
3. Queries header overlap at 390. `screens/Queries.tsx`: the state pill/tag is its own wrapping flex item, path `break-all`. Test: `Queries.test.tsx` "w-data 3".
4. Prompt dialog cut at maxLength. `packages/ui/src/Dialogs.tsx`: no native `maxLength`; hint says "Up to N characters.", over the limit the field says "Use at most N characters. This is M." and the action is off. Every caller of `prompt` (only Dashboards.tsx NAME_MAX sets it). Test: `Dialogs.test.tsx` "w-data 4".
5. Group count. `screens/RowRules.tsx`: thousands marked, "The first 20 are listed." said once (footer skipped for a group with a count). Test: `RowRules.test.tsx` "w-data 5".
6. Disabled reason only in `title`. Shared piece: `Button`'s `tooltip` (focusable stop + tap to show). Converted `Files.tsx` Delete, `Interfaces.tsx` Rename, `ResourceIdentity.tsx` Name and path. ObjectPages' run fieldset already shows `mayRun.line`. Test: `Files.test.tsx` (TAB-P10 list). Not changed: icon-picker `title={words}` (a name, not a reason).
7. Text default quoted / "Optional." twice. `Data.tsx` "When not given" uses `showValue`; hints "Optional." removed in Data.tsx (two) and `ColumnControls.tsx` (the label already says "optional"). Test: `Data.test.tsx` "w-data 7".

## w-builder
1. Recent app. `screens/Apps.tsx` matches `?app=` by ID or path; `kit/CommandPalette.tsx` `pageOf` links an app by its path (search gives the path as `ref`), `pageOf` exported. Tests: `Portal.test.tsx` "w-builder 1"; `CommandPalette.test.tsx` "w-builder 1" checks every Recent kind's link (script, flow, table, interface, connection, event, doc, variable, data_source by round trip through `openedAt`; trigger, schedule, query, app, run, flow_run by address).
2. Axis words. `chartDrawer.tsx`: `drawnGroups`/`drawnMeasure` used by the Show axis titles help and `readsAs`. Test: `chartAxes.test.tsx`.
3. Sorted by a joined breakdown. `tabProblems.ts` compares `groupName(group)` too. Test: `tabProblems.test.ts` "w-builder 3".
4. Joined column naming collision. Console refuses at the chip: `rowsItUses.tsx` `collides()` disables the chip and a line says why. Test: `rows-it-uses.test.tsx` "w-builder 4". Server still refuses at run (`visual.ts` "two columns of the result are called"); a chip already chosen can be unchosen.
5. Starts as "A value". `packages/manifest/src/page.ts` skips the check while `value` is undefined. Test: `page.test.ts` "w-builder 5". Needs manifest rebuilt for tests that read dist.
6. Duplicate `labs/goal`. Found: a deploy checks the whole workspace (`bundle-check.ts`), so refusals about other dashboards/apps came into this app's check, unnamed. `publishCheck.ts` `refusalWords` names the other resource ("boards/x (dashboard), which this deploy also carries: ..."). Test: `builder-publish.test.ts` "w-builder 6". NOT proven: that the owner's two lines were two dashboards; the test proves other resources now say who they are.
7. Flow field name / retries. `FlowStepFields.tsx`: "Give the field a name." only after the name was left. `ObjectPages.tsx`: limit 0 reads "Never: a failed run is not tried again". Tests: `FlowEditorWalk.test.tsx`, `ObjectPages.test.tsx` "w-builder 7".
8. 429 stream cap: not mine.

## Polish gate
States, lifecycle: no new control. Keyboard: disabled reasons now on a focusable stop; chips disabled with a visible line. Copy: plain, American.

## Found
- Other `maxLength` on `TextField` (`kit/inspector/controls.tsx:200`, `Form.tsx:253`, `SchemaForm.tsx:477`) also cut silently.
- Row fields in the add-row dialog (`Data.tsx` ~1464-1486) are `required={false}` always, so a required column's label says "optional".
- `Interfaces.test.tsx` "widgets are added and removed..." times out at 5 s under load without my changes.

## Screens to walk
Data: retired table (indexes, Bring back), table Definition, Add column dialog, See it as a group (390), Files (keyboard/touch Delete), Dashboards New dashboard (101 chars). Queries header at 390. Picker "Where it reads from". Apps via palette Recent; Interfaces list Rename; chart drawer Look and Data (Also from with a clash); form field Starts as; publish check; flow Start input fields; script Settings.
