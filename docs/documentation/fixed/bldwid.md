# Fixed: lane bldwid (App Builder and widgets, tier 2)

Commits are named by the row in their subject: `git log --grep "(BLD-02"`. No migration. Walks were not run in a browser by this lane (the tests below stand in; the screens to walk are listed under each row).

## BLD-02, BLD-03 The publish check, for a maintainer, and when it is refused
- **Tests:** `apps/control-plane/src/interfaces.test.ts` > "they read what publishing would do, for what is theirs, and the groups an action names (BLD-02)" (403 before); `apps/console/src/builder-frame.test.tsx` > "a check that the control plane refuses says so, with a way to ask again (BLD-03)" (timed out waiting before).
- **Changed:** `routes/authoring.ts`: `changes/preview` and `group-keys` check their own access; `deployment:read` as before, else `interface:write` for interfaces and apps named in `paths` (the deploy's own rule: no paths, or a path not theirs, is 403); `group-keys` takes the drafts' rule. `PublishCheck.tsx`: a refused or failed preview says why, with "Check again", and Publish stays off.
- **Siblings:** the deploy route (same rule); `useGroupKeys` and `useCatalog` still hide their own errors (left: the check goes on as "unchecked" for them).
- **A person sees:** an app maintainer's Publish opens a check that finishes; any refusal is written.
- **Walk:** Publish as a maintainer and as a viewer; 1440/390, light/dark, keyboard (Check again), reload.

## BLD-04, BLD-05 The preview draws as the person previewing, and finds its app
- **Tests:** `apps/console/src/app-preview.test.tsx` (two; both failed before).
- **Changed:** `AppPreview.tsx`: `user` from `useViewer` (as the dashboard and sheet preview), the published app found by its `interface`.
- **Siblings:** the builder's own app lookups use the app path already (`AppBuilder`, `Interfaces`).

## BLD-06 (D52) One name length, 100
- **Tests:** `packages/manifest/src/page.test.ts` (app title of 101 refused; failed before), field `maxLength` asserts in `Interfaces.test.tsx`, `builder-frame.test.tsx`, `page-settings.test.tsx`, `builder-composition.test.tsx`.
- **Changed:** `kinds.ts` app title 100 (`schemas/` re-emitted); `screens/builder/names.ts` `NAME_MAX`, used by Make an app, Rename, the header, Page settings, New page.
- **Left out:** the typed count beside the field is not drawn.

## BLD-07 Removing a page that actions open
- **Test:** `builder-records.test.tsx` > "removing a page that actions open names them in the question (BLD-07)".
- **Changed:** `publishCheck.ts` `openersOf`; `AppBuilder.tsx` `removePage` names them ("Mark paid, on Money").
- **Left out:** "Show it" in the question: the dialog is a confirm. The publish check still names them with Show it.

## BLD-08 Tab rename by double-click
- **Test:** `kit/inspector/widgets/records.test.tsx` (tabs). **Changed:** the words are dropped (`tabsDrawer.tsx`); it was not built.

## BLD-10 (D35) A repository app opens read only, with Take over
- **Tests:** `builder-read-only.test.tsx` (two).
- **Changed:** `AppBuilder.tsx`: `ownership: code` with no draft is read only with a notice and "Take over"; once taken over, or with a draft, a line says the next publish moves it out of the repository.
- **Walk:** open a repository app (Fernhill's), Take over, edit, reload.

## BLD-11 Help for a sheet or modal in the served app
- **Test:** `packages/screens/src/navigation.test.tsx` > "the Help topic of what is open". **Changed:** `helpingPage` in `AppView.tsx`, used by `runtime/main.tsx`. The runtime entry itself is not rendered by a test.

## WID-08 Axis titles
- **Tests:** `widgetOptions.test.tsx`, `inspector.test.tsx`. **Changed:** `xTitle`, `yTitle` in the chart's config (`chartSpec.ts`, schema, drawn by their hints, shown when axis titles are on, in place of the drawer's own rows that wrote the columns); `x`, `y` stay the columns. Left: a control for choosing the x and y columns (WID-M6).

## WID-10 Several-choice and file fields
- **Tests:** `core-actions.test.tsx` (ticks, no editor for a file), `form.test.tsx` (a list control, not a text box). **Changed:** `detail.tsx` (checkbox list with Save and Cancel; `file` not edited here), `form.tsx` (`enum_list` is a list control).
- **Found:** the Form still draws a file column as a text box; there is no upload control in a Form.

## WID-16 Periods with nothing
- **Tests:** `widgetOptions.test.tsx` (every other week, day, month; the page's ends), `widget-data.test.ts` (buckets, span). **Changed:** summaries carry `buckets` and `span` (`inputs.ts`, SDK `SummaryData`); `fillGapsIn` steps by the bucket and runs to the page's range.

## WID-19 (WID-M3) Edit in place limited to groups
- **Tests:** `manifest/page.test.ts`, `core-actions.test.tsx`, `actions-rules.test.tsx`, `page-actions.test.ts` (403 outside). **Changed:** `editBy` in the detail config, `missingGroups`, `actionAt` (`config/edit` carries `runBy`), the view greys with "Only Billing can edit this.", Rules tab "Who can edit".

## WID-20 Pivot totals
- **Test:** `widgetOptions.test.tsx`. **Changed:** summaries carry `measures` (the function of each value); sums add, min and max are found, averages and counts of different things get no total, and it says so. Siblings: the drawer's small grid has no totals.

## WID-22, WID-23 Copy
- **Tests:** `actionModel.test.ts` (who can do it), `actions-rules.test.tsx`, `records.test.tsx`, `inspector-join.test.tsx`. **Changed:** the four sentences; `grantWords` names the groups; a condition on the page's record or the user reads as that. Left: WID-M9, the control that sets those values.

## WID-24 Ask why: Never
- Settled by lane opsa: a rejection always says why (the server asks on every route). My change was taken back in the merge (`ad870974`); the row's premise no longer holds.

## WID-25 Bulk bar
- **Tests:** `tables.test.tsx` (two). **Changed:** `table.tsx`: no action with a `rows` or `narrow` step for several rows; at most 200 chosen, said beside the count.

## WID-26 A goal over money
- **Test:** `charts.test.tsx`. **Changed:** `goalDrawer.tsx` uses the money field when the format is currency. Left: condition values and filter "Starts as" on money.

## D21 (WID-Q1) Whose day
- **Tests:** `page-actions.test.ts` (an evening in America/Los_Angeles), `kernel/zones.test.ts`, `widget-data.test.ts`, `form.test.tsx`. **Changed:** the reader's zone is sent on every read and on every action (`zone`, a new optional field of `page-actions` and already of `widget-data`); filters' ranges by name, "last N", and the day bounds of a time column use it (`compileVisual`, `todayIn`); an action's `today` is the reader's day, and a day into a time column is midnight there as an instant (`act.ts`, over lane tab2's UTC); the Form types times on the reader's clock and sends the instant. `docs/contracts`: none names it.
- **Left out:** the console's Data editor (lane tab2's); hover with UTC.

## D36 (WID-Q2) Downloads
- **Test:** `packages/screens/src/download.test.ts`. A table's file has its columns in order, its headings, money in units, no hidden column. Lists and charts are as read.

## D37 (WID-Q3) Goal is `core/goal`
- **Tests:** `goal.test.tsx` (moved to screens), `widgets-labs/src/probe.test.ts`, `types.test.ts`. Labs keeps `labs/probe`, not offered. Fernhill, the e2e specs and the selector test follow. Docs under `packages/docs/content` (writing-a-widget) still name `labs/goal`: for phase 31.

## D38 Numbers in the reader's locale
- **Test:** `widget-sdk/src/index.test.ts`. `readerLocale`, `countText`, used by `formatValue` and every count in the widgets. The server's own words keep en-US.

## Flow and script inputs typed by their schema
- **Test:** `actionModel.test.ts` ("typed by its schema"). `inputType` maps the schema's property type; the helper is tested, the drawer row is not rendered by a test.

## Found
- `src/help/Help.test.tsx` > "/t/acme/workspaces/dev/dashboards/sales has the help data-dashboards-editor" fails on the merged tree: not this lane's (DAT-31 changed the dashboards' help topic).
- Form draws a file column as a text box (WID-10).
- `useCatalog` and `useGroupKeys` swallow their errors (BLD-03).
