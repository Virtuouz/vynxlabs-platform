# Fixed: lane t3-widgets (widget drawers, tier 3)

No migration, no contract change. Walks were not run in a browser; the tests stand in. Screens to walk: a Form field editor, an action editor, a table's column editor, a pivot, a stat and a chart on a page with two date ranges, a list's "Only include" on a record page, a chart axis in a German browser, Publish with the catalog refused, Remove page, Make an app.

## D38 Chart numbers in the reader's locale
- **Test:** `packages/ui/src/chartEngine.test.ts` > "numbers in a chart follow the reader's locale" (failed before). **Changed:** `chartEngine.ts` `numberLocale`, `createChartView(..., locale)` sets Vega's number locale from `Intl`. The other views already used `readerLocale`/`undefined` (no `en-US` is left in `widgets-core`, `screens`, `ui`); `packages/ui/src/dates.ts` `localeOf` is still its own copy of the rule.
- **Siblings:** every chart goes through `Chart.tsx` > `createChartView`.

## BLD-03 (left) useCatalog, useGroupKeys
- **Test:** `builder-frame.test.tsx` > "tables and groups that could not be read are said, not taken for missing" (failed before: "1 data source not found"). **Changed:** `catalog.ts` reports either read failing; `groupChoices.tsx` `useGroupKeys` gives `error`; `PublishCheck.tsx` leaves those checks off and says "Could not check ...".
- **Siblings, not changed:** `PageEditor.tsx` and `NewPageDialog.tsx` still use `useCatalog` without `error` (an empty catalog reads as no tables).

## WID-10 (left) Form file column
- **Test:** `packages/screens/src/form.test.tsx` > "a file column is not a box to type in". **Changed:** `form.tsx` `file` kind: the label and "A file cannot be added in a form. Add it to the row in the table." No upload control (no route lets a form carry a file).

## WID-M1 Starts as
- **Test:** `records.test.tsx` > "a form field says what it starts as". **Changed:** `widgets/fieldStart.tsx` (new), used by `fieldsList.tsx`: Nothing, Today or Now, the person filling it in (email, name, id), a value (text, number, money in the currency, yes or no, a choice). Not offered for a picker or a type with none.

## WID-M2 When it is done, say
- **Test:** `actions-rules.test.tsx` > "an action can say something when it is done". **Changed:** `actionControls.tsx` `ActionEditor` (the one editor of every action place), writes `done`.

## WID-M5 Table number as bar or change
- **Test:** `tables.test.tsx` > "a number can be drawn as a bar or as a change". **Changed:** `ColumnEditor.tsx` "Drawn as". Sibling: a list's `right` has no such control.

## WID-M7 Pivot "Then by"
- **Test:** `charts.test.tsx` > "pivot data: a third breakdown". **Changed:** `pivotDrawer.tsx`.

## WID-M8 Compare across
- **Test:** `charts.test.tsx` > "a stat on a page with several date ranges". **Changed:** `chartShared.tsx` `CompareAcross`, in `statDrawer.tsx` and `chartDrawer.tsx`.

## WID-M9, WID-26 (conditions) This record's, the current user, money
- **Test:** `rows-it-uses.test.tsx` (two; failed before). **Changed:** `ConditionEditor` (`packages/ui/src/drawer/EditorBodies.tsx`) takes `valueFrom` and `money`; `rowsItUses.tsx` gives them (the page's record columns on a record page, sheet or modal; the user for a text column; money from `moneyFormatOf`); `conditionWords.ts` words the chip ("Number is this record's number", "the current user"). Money in "is between" is still typed as a number.
- **Left out:** filter "Starts as" over money: a page filter has no column of its own (each widget binds it to one), so there is no money to know.

## BLD-07 Show it, BLD-06 typed count
- **Tests:** `builder-records.test.tsx` (removal; failed before), `Interfaces.test.tsx` ("0 of 100"). **Changed:** `ConfirmOptions.links` in `Dialogs.tsx` (Show it, closes the question as "no"); `AppBuilder.tsx` `removePage` with `openerPlaces`; `TextField showCount` in `Fields.tsx`, used by Make an app, Rename, Page settings, New page. The builder header's inline title is a bare input and has no count.

## Left
- WID-M4 (detail field `as`, `badges`, `statusBadges`), WID-M6 (chart x/y, 2 to 6 measures, scatter, sort), WID-M10 (visual `joins`), WID-M11 (a saved query's constant `values`): not built. WID-M3 is lane bldwid's, already done.

## Found
- `dates.ts` `localeOf` duplicates `readerLocale`.
