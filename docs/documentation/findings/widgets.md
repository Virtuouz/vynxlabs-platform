# Findings: built-in widgets and actions

Slice inventory: [widgets.md](../inventory/widgets.md). Settled at `270e509` with scratch vitest files in the pinned tree (screens, inspector, and a control-plane test tenant); all removed. Nothing was run in a browser. Phases 25 to 28, S9 and decisions 0004 to 0007 were checked for owner decisions; where one applies it is named. E-numbers are the inventory's.

Short paths: `W` `packages/widgets-core/src/index.ts`, `V/` `packages/widgets-core/views/`, `S/` `packages/screens/src/`, `I/` `apps/console/src/kit/inspector/`, `act.ts` `apps/control-plane/src/kernel/pages/act.ts`, `inputs.ts` `apps/control-plane/src/kernel/data/query/inputs.ts`.

## Security and data

### WID-01 A button on a detail of "the current user's own record" runs on anyone's record the person can read
- **Outcome:** reproduced
- **Severity:** security
- **Where:** `act.ts:449-458` (the own check is inside `if (editing)`); `act.ts` `tableOfWidget` accepts `own` for every action.
- **Evidence:** end user with read on a shared table; detail with source `own`. Edit in place on another person's row: 404 (as meant). The same widget's `config/actions/0/action` on that row: 200, and the row was changed. Decision 0004 ("rows the person may read") does not cover it: the edit's own comment says own is "of theirs alone".
- **Fix:** move the ownership check to every action of a widget whose source is `own`, on `event` and `this`. Siblings: a Form in edit mode reading `own` (allowed by `page.ts:1089-1107`), `on/*` events of such widgets. Test first in `page-actions.test.ts`: the button answers 404.
- **Size:** S. **Milestone:** M1

### WID-02 (E2) A Form whose submit asks to confirm sends none of what was typed
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `S/actions.tsx:439` (`submit={(inputs) => call(…, inputs)}`); `run` drops `request.inputs` when `action.confirm` (`:351-366`, kept only at `:367`).
- **Evidence:** screens test: name typed, Save, confirmed: `act("f","config/submit",{records:{}})`, no inputs. With no required field this makes an empty row and clears the form; otherwise the dialog says "is required". The inspector offers "Ask to confirm" on a form's submit.
- **Fix:** merge `{...held.request.inputs, ...inputs}` in the confirmation's submit, and hand a refusal's fields back to the form. Siblings: table buttons, row and detail actions send no inputs. Test first in `form.test.tsx`.
- **Size:** S. **Milestone:** M2

### WID-03 Confirming an action on several rows names only the first
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `S/PageView.tsx:733-740` ("the first stands for them"); `S/confirmWords.ts` (takes no count); `S/actions.tsx` `Confirmation`.
- **Evidence:** 2 rows chosen, Remove: dialog "Remove the invoice INV-1?", and the call has `events: ["1","2"]`. A person agrees to one removal and gets several.
- **Fix:** `confirmWords` takes how many: "Remove 2 invoices?"; `{column}` in the author's words is left out for several. Shared with the inspector's preview. Test first in `row-actions.test.tsx`.
- **Size:** S. **Milestone:** M2

### WID-04 A flow or script that refuses its input does so after the data was saved, and says it failed
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `act.ts:581-638` (starts after the commit; before it only that the path exists is checked, `:379-384`); refusals in `kernel/flows/engine.ts:105-135` (no manual trigger, input not matching, not in the bundle).
- **Evidence:** button: create, then a flow whose manual trigger needs `why`. Pressed twice: 400 both times, and two rows made. No `page_action` message, the page is not read again (`call` throws before `refresh`).
- **Fix:** check what a start would refuse (trigger, input, deployed) inside the same step that checks the path, before the transaction; what still fails after the commit is answered as saved, with "X could not be started" and a refresh. Also tell it in the publish check. Test first: the second press makes no row.
- **Size:** M. **Milestone:** M2

### WID-05 An edit form starts again, losing what was typed, when its record is read again and any column changed
- **Outcome:** reproduced
- **Severity:** data
- **Where:** `V/form.tsx:246-247` (the key is the whole record as JSON).
- **Evidence:** "Typed" entered, record read again with another column changed: field back to "A". The page reads again after every action on it, and at 1, 3 and 8 s after one that starts a flow, so a "kick off" button beside a form does it, as does another widget's edit in place.
- **Fix:** key by mode and record id; on a new read, replace only fields not touched (and say when a touched one changed). Test first in `form.test.tsx`.
- **Size:** S. **Milestone:** M2

## Broken

### WID-06 (E1) "Sort by clicking the heading" is drawn on and does nothing; editing a column takes sorting away
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `I/widgets/ColumnEditor.tsx:145`, `I/widgets/columnModel.ts:147`, `V/table.tsx:337,489`.
- **Evidence:** `tidyColumn({sortable:true})` is `{column}`; a YAML column with `sortable: true`, renamed in the drawer, loses it; with it unset the page draws 0 heading buttons. Two tests hold the two meanings (`tables.test.tsx` in console: true is the default; in screens: unset is not a button).
- **Fix:** unset means sortable in the view (not for json, enum_list, as `Data.tsx:261`), as the drawer and its test say; state it in the schema. Sibling: Dashboard tables (same view). Test first in screens `tables.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-07 (E3) On a dashboard "Who can see it" and "user is in group" hide the widget from everyone
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `apps/console/src/screens/Dashboards.tsx:552` (no `user`); `S/actions.tsx:79-88,141`.
- **Evidence:** PageView with no user: `seenBy` 0 drawn, "in group" 0 drawn; with a user in the group, 1. Same host passes no `foldKey`, so a Section's fold is not kept, and Tabs remembers as "anyone".
- **Fix:** give PageView the member (id, email, name, groups, group names) and a `foldKey`. Siblings: `SheetPreview.tsx:177`, the app Preview (BLD-04): one host helper. Test first in `Dashboards.test.tsx`.
- **Size:** M. **Milestone:** M5

### WID-08 (E4) A chart's axis titles do nothing, or change the chart
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `I/widgets/chartDrawer.tsx:493-521`; `V/chartSpec.ts:223-229`; schema `W` chart `x`, `y` (column names).
- **Evidence:** typing "By clinic" writes `config.x: "By clinic"`; the spec is identical to one without it. `x: "total"` (a title equal to a column) changes what is drawn.
- **Fix:** new `xTitle`, `yTitle` in the schema and view for those two rows; `x`/`y` stay as columns (a missing part below). Migrate nothing (no back-compat owed). Test first in `charts.test.tsx`: the spec's axis title.
- **Size:** S. **Milestone:** M5

### WID-09 (E6) Hidden detail fields open an editor that cannot save
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `V/detail.tsx:323,462` (`canEdit` ignores `hidden`); server `act.ts:115-119`, refusing on purpose (`page-actions.test.ts:1055`; phase 28: "the fields shown").
- **Evidence:** "Edit secret" is drawn for a hidden field; the server answers 400 "is not asked for".
- **Fix:** `canEdit` is false for a hidden field. Being shown in the disclosure when served is as built and tested. Test first in `core-actions.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-10 (E13) Editing a several-choice or file field in place is a text box that cannot save
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `V/detail.tsx:58` (`NOT_EDITABLE` has neither), FieldEditor.
- **Evidence:** enum_list opens a text input holding "a,b", sends `"a,b"`; server: 400 "must be a list of these: a, b". A file opens its id as text; only a uuid is taken (`rows.ts:388-393`).
- **Fix:** the kit's multi-choice for enum_list; file not editable here. One editor per type shared with Form. Sibling: Form draws a file column as a text box (`V/form.tsx` `kindOf` has no file). Test first in `core-actions.test.tsx`.
- **Size:** M. **Milestone:** M5

### WID-11 (E7) A pivot cell of an empty group sends "—", and every number or yes/no heading as text
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `V/pivot.tsx:60,124-132`; server `inputs.ts:190-209` (null is "is empty", the rest `eq`).
- **Evidence:** groups `clinic: null, rating: 3`: emits `{clinic:"—", rating:"3"}`. Rows behind then looks for a clinic called "—".
- **Fix:** keep each heading's own value beside its words in `turn`. A real "—" value is also merged with empty today. Siblings: chart points give stored values (right). Test first in `widgetOptions.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-12 Dashboards offer "Filter the page" and "Show the rows behind" on a row click, where they do nothing or clear the filter
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `I/actionModel.ts:87` (returns all three whatever the event); `page.ts:1018` checks only that the filter exists; `S/actions.tsx:325-333`.
- **Evidence:** `stepKindsFor({surface:"dashboard"})` is `narrow, message, rows` with no group event. With no group `narrow` writes `null` (no narrowing) and `rows` has no input. A click on an empty group also writes null, so it widens the page.
- **Fix:** offer by event, as apps do (`rows` for a stat's click too); the page check refuses `narrow` on an event that gives no group; `narrow` on an empty group says it can't rather than clearing. Test first in `page.test.ts`.
- **Size:** S. **Milestone:** M5

### WID-13 An action's typed value of digits or "true" is kept as a number or boolean, whatever the column
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `I/actionModel.ts:156-162`, used at `I/actionControls.tsx:167`.
- **Evidence:** `typedConstant("007")` is 7. A text column refuses a number (`rows.ts:350`), so "Code becomes 007" always fails when pressed; a choice "1" likewise.
- **Fix:** `ValueControl` is given the column's type, and types by it (choices as a list). Sibling: the same control for flow and script inputs. Test first in `actionModel.test.ts`.
- **Size:** S. **Milestone:** M5

### WID-14 Clearing a section's name to retype it removes the section
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `I/widgets/fieldsList.tsx` `sectionOpen` editor, `swap`.
- **Evidence:** Name emptied then "Cost" typed: fields have no section. Typing through another section's name merges the two.
- **Fix:** hold the name in the editor and write it on leaving, not empty. Shared by Detail and Form. Test first in `records.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-15 (E11) A field set to money loses its Format row
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `I/widgets/fieldsList.tsx` (`type === "Number"`; `kindOfColumn` says "Money" once it is).
- **Evidence:** plain number: 1 Format row; with `style: currency`: 0. The only way back is YAML or removing the field.
- **Fix:** by the column's type (`isNumberType`), not the words. Shared by Detail and Form. Test first in `records.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-16 "Include periods with nothing" fills nothing when the data is sparse
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `V/chartSpec.ts` `fillGapsIn` (the step is guessed from the smallest gap).
- **Evidence:** every second week: 3 of 5; every second day: 2 of 3; months Jan, Mar, Jul: 3 of 7. Daily data that falls only on one weekday is filled as weeks.
- **Fix:** the summary says each breakdown's bucket (the query has it), and the fill uses it; also the page's date range for the ends. Test first in `widgetOptions.test.tsx`.
- **Size:** M. **Milestone:** M5

### WID-17 Setting "After saving" moves steps and drops messages
- **Outcome:** reproduced
- **Severity:** broken
- **Where:** `I/widgets/formDrawer.tsx:23-34`.
- **Evidence:** `create, close, open p, message(info)` becomes `create, open p, message(success), close`: the close now closes the page just opened.
- **Fix:** change the close and the first message in place; add them before any `open`. Test first in `records.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-18 "The user's own record" is found only when the email's capitals match
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `inputs.ts:707-731` (`eq`); the edit compares lower case (`act.ts:455`).
- **Evidence:** a row holding `Jess@x` is "There is no … for you yet", though the edit would allow it.
- **Fix:** one case-blind lookup used by both. Test first in `widget-data.test.ts`.
- **Size:** S. **Milestone:** M5

### WID-19 (E5) Edit in place cannot be limited to groups
- **Outcome:** confirmed by code
- **Severity:** broken
- **Where:** `act.ts:242` reads `editBy`; `W` detail's schema (`additionalProperties: false`) refuses it, so no page can hold it.
- **Evidence:** no other use of `editBy` in the repository. Phase 28: edit is "on the server's terms as an action's", which includes who can run it.
- **Fix:** `editBy: {groups}` in the schema, a "Who can edit" block in the Rules tab (`ActionRules`' chips), `canEdit` in the view greys with the reason. Test first: 403 for someone outside.
- **Size:** M. **Milestone:** M5

## Wrong

### WID-20 Pivot totals add up averages, smallest, largest and different counts
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `V/pivot.tsx` `turn` (sums); totals are on by default.
- **Evidence:** averages 10 and 20 in a row: Total 30.
- **Fix:** the server reads the totals (grouped by each axis and by none) for `avg`, `min`, `max`, `count_distinct`; or leave those totals out until it does. Sibling: the drawer's small grid. Test first in `widgetOptions.test.tsx`. Size S to leave out, M to read.
- **Size:** M. **Milestone:** M5

### WID-21 (E9) A remembered tab is shared by every app and page with a Tabs of the same id
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `S/tabMemory.ts:6-7`.
- **Evidence:** key `volvel.tab.u.tabs`; apps of one instance share an origin.
- **Fix:** use `foldKey` (app and page) as folds do. Dashboards need one too (WID-07). Test first in `containers.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-22 (E12) Copy that is untrue
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `I/RulesTab.tsx` "Conditions can use … the page filters" (no such condition, `action.ts`); `I/widgets/formDrawer.tsx:13` "and when to show it" (no such setting); `I/actionModel.ts:218-264` `grantWords`; `I/widgets/registerTables.tsx` "Which columns the search box looks in is set on the Search and filter widget" (it is the widget's own Data tab, `I/rowsItUses.tsx:405`).
- **Evidence:** with `runBy: billing`, grantWords: "People who can open the app can do this".
- **Fix:** the words; `grantWords` names the groups. Test first in `actionModel.test.ts`.
- **Size:** S. **Milestone:** M5

### WID-23 A condition on the page's record or the current user reads "Client is 0 days"
- **Outcome:** reproduced
- **Severity:** wrong
- **Where:** `I/conditionWords.ts:49` `shownValue` (any object is a "last N").
- **Evidence:** `{record:"client"}` and `{user:"id"}` both give "0 days". Saved unchanged if untouched.
- **Fix:** words for both ("this invoice's client", "the current user"); with the missing control below. Test first in `conditionWords.test.ts`.
- **Size:** S. **Milestone:** M5

### WID-24 "Ask why: Never" still asks why on Reject
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `V/approvals.tsx:260-265` (`which === "reject"` always opens the box).
- **Evidence:** the label is "Why are you rejecting this? (optional)". Decision 0007 rule 6 holds "Ask why" to never, when rejecting, always. With "Always", "Ask before approving" is skipped, but the reason box is itself a second step: not a fault.
- **Fix:** Never: Reject opens the same "Reject “…”?" step as "Ask before approving", with no box. Test first in `approvals.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-25 A bulk bar offers what the server refuses
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `V/table.tsx` `ChosenBar` (`can` only); `act.ts:280-298` (no `rows`/`narrow` for several, at most 200).
- **Evidence:** "Peek" (`rows`) is offered for 2 chosen; server 400. "Choose every row" goes past 200 once more pages are shown.
- **Fix:** leave out actions with those steps when more than one is chosen; say "200 at most" beside the count and stop there. Test first in `tables.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-26 A goal over a column kept in cents is typed in cents
- **Outcome:** confirmed by code
- **Severity:** wrong
- **Where:** `I/widgets/goalDrawer.tsx:166-176` (plain NumberField); phase 28 ("Money was typed in cents. It is typed as money") fixed the other sites.
- **Evidence:** `target` is compared with the stored value and drawn through `format.minorUnits`; $60,000 must be entered 6000000.
- **Fix:** the kit's money input by `config.format`. Siblings to check: condition values and filter "Starts as" on money. Test first in `charts.test.tsx`.
- **Size:** S. **Milestone:** M5

## Rough

### WID-27 (E8) A Goal is always a button
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `packages/widgets-labs/views/goal.tsx:61-66`.
- **Evidence:** nothing listens: one button drawn, focusable, with a progressbar inside it.
- **Fix:** `listensTo`/`press`, as Stat (put them in the SDK so a pack other than core can). Test first in `goal.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-28 (E10) Legend "Always" is "Automatic"; Colors does nothing for a heatmap
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `V/chartSpec.ts` (`legend` only tests `hidden`; the heatmap has no scale); `I/widgets/chartDrawer.tsx` rows.
- **Evidence:** specs identical for auto and shown, with and without a split; heatmap identical with `colors: warm`. Bars do change.
- **Fix:** drop "Always" from schema and drawer; give the heatmap the palette as its scale. Test first in `widgetOptions.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-29 No heading means no Download
- **Outcome:** reproduced
- **Severity:** rough
- **Where:** `S/Frame.tsx:225-231` (the slot is in the heading).
- **Evidence:** same table with a title: 1 Download; without: 0. Not a recorded decision (phase 25: "on any widget with rows").
- **Fix:** with `kept` and no heading, a quiet corner control that takes no row. Test first in `chrome.test.tsx`.
- **Size:** S. **Milestone:** M5

### WID-30 The Action group's position picker has three columns that do nothing with Right or Spread
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `V/actions.tsx` `side`; `I/widgets/actionsDrawer.tsx:285`.
- **Fix:** offer only top, middle, bottom then, as greyed chart types say why.
- **Evidence:** `lineUp` wins by design (the view's comment); the drawer does not say so.
- **Size:** S. **Milestone:** M5

### WID-31 An editable detail field is a `div role="button"` around a `dt` and `dd`
- **Outcome:** confirmed by code
- **Severity:** rough
- **Where:** `V/detail.tsx` `draw`.
- **Evidence:** the role hides the term and value inside it; a screen reader hears "Edit Total, button", never the value.
- **Fix:** a button inside `dd`, named by the label and value. Checked by the axe walk.
- **Size:** S. **Milestone:** M5

## Not a bug

### WID-32 Claims that do not stand, or are as decided
- **Outcome:** not a bug
- **Severity:** rough
- **Where:** inventory C and E.
- **Evidence:** C4 header sort on the loaded rows only when all are loaded: right. C9 bulk refuses rows and narrow, open carries no record: phase 28, decision on bulk (offering them is WID-25). C2 total "of the rows shown": said in the drawer. C6 in-place keys and C7 AND: as built and tested. C10 sheet filters in memory, C11 and C12: phases 26 to 28. C13: the "When empty" words are kept for a table the filters do not narrow ("No invoices" drawn), and give way only where they do, with "Clear filters". C15: the bar's comment decides it ("not offered"); all or nothing is phase 28. E5, E14 are missing parts. Chart "Show axis titles" off by default agrees with the drawer (defaults are merged, `I/model.ts:163`).
- **Fix:** none. **Size:** none. **Milestone:** none

## Documentation only (D)

Wrong names and stale statements in section D are for phase 31; none is a product fault except the search note (in WID-22).

## Missing parts

What the manifest accepts and the inspector cannot set. The control belongs in each widget's drawer; permission is the builder's own (`interface:write`, or a dashboard's owner) and nothing new is needed on the server. Milestone M5.

| # | The manifest takes | The control belongs | Siblings | Size |
|---|---|---|---|---|
| WID-M1 | Form field `initial` (`W:1086`): only Add form writes it | `fieldsList.tsx` field editor: "Starts as" (Nothing, Today, Me, A value) | Add form's words | S |
| WID-M2 | Action `done` (`action.ts` action schema): only made by suggestions | `ActionEditor`: end of the timeline, "When it is done, say" | every action place; `formDrawer` "Say" | S |
| WID-M3 | Detail `editBy` (with WID-19) | Rules tab, "Who can edit" | `ActionRules` | in WID-19 |
| WID-M4 | Detail field `as`, `badges`, and `statusBadges` (`W:948-975`; hidden by `registerRecords.ts`, no row) | field editor "Shown as" and Badge colors, as the table's `ColumnEditor`; the status row | Table column editor | M |
| WID-M5 | Table column `as: bar`, `delta` (`W:110`) | `ColumnEditor` "Shown as" for a number | List `right` | S |
| WID-M6 | Chart `x`, `y` as columns; 2 to 6 measures; `scatter`; `sort` (`W:438-660`; `ChartData` draws measure 0 only and hides sort) | `chartDrawer`: "+ Another measure"; scatter tile; x/y not needed if breakdown order is enough | `MeasuresControl` exists (`measureControls.tsx:253`) | M |
| WID-M7 | Pivot's third breakdown (`W:679`; Rows sets one) | `pivotDrawer`: "Then by" | Chart | S |
| WID-M8 | `compareTo` when a page has several date ranges (Stat and Chart hide it; `withCompare` takes the first) | under "Compare with the period before" | both | S |
| WID-M9 | Condition values `{record: column}` and `{user: "id"}` (`page.ts`, `inputs.ts:223`) | `rowsItUses.tsx` condition editor: "a value, this record's…, the current user" | WID-23 | M |
| WID-M10 | Visual query `joins` (6) (`page.ts` `visualSchema`) | "Rows it uses": "Also from" a referenced table | every visual source | L |
| WID-M11 | A saved query's constant `values` (`page.ts` `sourceSchema`): only a filter can fill a parameter; SQL `values` are kept but not drawn | `rowsItUses.tsx` under the query | filters' parameter rows | S |

## Owner decides

### WID-Q1 Whose day is "Today"?
- **Outcome:** owner decides
- **Severity:** wrong
- **Where:** page filters and "last N" (`kernel/data/query/filters.ts:46-109`), an action's `today` (`act.ts:475`): UTC. Form `initial: today` (`V/form.tsx:163-186`), row grouping, cells and custom ranges: the reader's. Form timestamps are typed in UTC (`V/form.tsx:571-577`) and drawn in the reader's time.
- **Evidence:** one page gives two days each evening in America: "Paid on becomes Today" writes tomorrow. Phase 28 (line 450) records it as how it was, not as a decision.
- **Fix:** options: UTC everywhere; the reader's zone everywhere (the browser sends it already for grouping); the workspace's zone (it has one, for schedules). Recommended: the reader's for filters, `today` and typed times. Sibling: the console's Data editor types UTC.
- **Size:** M. **Milestone:** M5

### WID-Q2 Does a download hold what the widget shows, or what it reads?
- **Outcome:** owner decides
- **Severity:** wrong
- **Where:** `S/Frame.tsx:24-38`.
- **Evidence:** confirmed by code: every column read, hidden ones too, under the table's names and not the headings set; money as stored (452000 for $4,520.00).
- **Fix:** options: as shown (columns, order, headings, money in units), or as stored. Recommended: as shown, numbers kept as numbers. Hiding still is not security: rows are sent whole.
- **Size:** S. **Milestone:** M5

### WID-Q3 Is Goal a core widget?
- **Outcome:** owner decides
- **Severity:** rough
- **Where:** `labs/goal`, in the builder, the served runtime and the manifest. Decision 0005 and S9 call `labs` the internal pack that proves the contract.
- **Evidence:** it is offered beside the core ones, and nothing says it is not supported.
- **Fix:** options: move to `core/goal` (no back-compat owed, so a rename now), or keep `labs` and say so in the docs. Recommended: move it, and keep a test-only widget in labs.
- **Size:** S. **Milestone:** M5
