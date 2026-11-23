# Inventory: widgets

**Refreshed 2026-11-23** (phase 30 M0) against the code at `4992c9da`, branch phase-30-docs-system. First written from `270e509` on 2026-11-22.

What changed in this brief:
- **Goal is `core/goal`** (D37). `labs/goal` is gone; the labs pack holds only `labs/probe`, which is not offered in "Add to page". Core has **15** widgets.
- Section (E) is now **settled**: all 14 bugs are fixed, built, or kept with a reason (table in E).
- Settled behavior added: reader's time zone (D21), downloads (D36, WID-29), number formats in the reader's locale (D38), Approvals "Ask why" (rejecting always asks), flow starts refused before data is saved, who can edit in place, who sees a dashboard widget, bulk limits, chart scatter, axes, sort and up to six measures, detail field badges, field "Starts as", joined columns, "When it is done, say".
- Vocabulary applied: Flow (not Workflow), canceled, grays, Apps. The App Builder's own button is still **Publish** (a check, then "Publish N changes"); do not call it Deploy.
- Section (A) now gives collection and Diátaxis type for every page.
- **Not verified**: nothing was run in a browser; `fixed/*.md` says no lane walked its screens either. The phase 29 walks are listed there, not here. The old line numbers for the three "Likely bugs" are gone with the bugs. The counts in (G) were made by running the built `packages/widgets-core/dist/index.js` (built Nov 22), which may differ from a count by another method. The widget pages under `packages/docs/content` still use the old words (see D); I did not edit them.

A report, not checked prose. Path shorthand, all under the repository root:
- **W** = packages/widgets-core/src/index.ts
- **V/** = packages/widgets-core/views/
- **S/** = packages/screens/src/
- **I/** = apps/console/src/kit/inspector/
- **CP/** = apps/control-plane/src/
- **page.ts** = packages/manifest/src/page.ts
- **sdk page.ts** = packages/widget-sdk/src/page.ts

packages/manifest/src/conditions.ts does not exist (only `conditions.test.ts`); conditions are in action.ts.

## (A) Pages to write

Collections: Get started (GS), Console (CON), Develop (DEV), Administer (ADM), Self-host (SH). Types: T tutorial, H how-to, R reference, E explanation.

### Console (building pages in the App Builder and on dashboards)
| Page | Type | Purpose | Sources |
|---|---|---|---|
| Widgets: an overview | E | Five categories (records, understand, content, action, organize), where each is allowed (app, dashboard), the shared states, Download, the phone view | W:1780-1797; Frame.tsx:233-340; PageView.tsx:673-685 |
| Build a page with widgets | T | One walk: add a Table, a Stat and a Chart; filter them; set a click | all of B below; walk it first |
| Table | R + H (how to show a column, group rows, select several rows) | Every setting of Table | W:74; V/table.tsx; I/widgets/tableDrawer.tsx, ColumnEditor.tsx |
| List | R | | W:258; I/widgets/listDrawer.tsx |
| Record detail | R + H (edit in place, limit it to a group) | | W:928; V/detail.tsx; I/widgets/detailDrawer.tsx |
| Form | R + H (make or change a record) | | W:1095; V/form.tsx; I/widgets/formDrawer.tsx |
| Button, Action group | R | | W:845, W:1400; V/button.tsx, V/actions.tsx |
| Approvals | R + H (put the queue where people work) | | W:1629; V/approvals.tsx; CP/kernel/pages/approvals.ts |
| Stat | R + H (compare with the period before) | | W:318 |
| Goal | R | New page: it was in the labs pack | W:1499; V/goal.tsx; I/widgets/goalDrawer.tsx |
| Chart | R | | W:439; V/chartSpec.ts |
| Pivot | R | | W:700; V/pivot.tsx |
| Section, Tabs | R | | W:1189, W:1243 |
| Search and filter | R + H (filter a dashboard) | | W:1331; V/filter.tsx; I/widgets/filterDrawer.tsx |
| Text | R | | W:790 |
| Where a widget reads from (Source, Only include, Sorted by, At most, Also from) | R | One page for the Data tab | I/rowsItUses.tsx; page.ts:70-135 |
| Number formats | R | Money, Money whole, Money short, Number, Percent, Plain; reader's locale (D38) | packages/ui/src/drawer/NumberFormat.tsx:17-21 |
| Group rows by | H | | I/groupRowsControl.tsx |
| Actions: steps and order | E + R | Ten step kinds, max 8 steps, one transaction, what refreshes | action.ts:151-184; I/actionModel.ts:71; CP/kernel/pages/act.ts |
| Ask before an action runs (confirm) | R | Title 120, text 500, button 40, up to 6 questions | action.ts:159-172; S/confirmWords.ts |
| Values an action can use | R | | I/actionModel.ts:232-253 |
| Rules: who can see it, press it, run it, edit it | R + E | `showWhen`, `seenBy`, `when`, `runBy`, `editBy` | I/RulesTab.tsx; action.ts:151,191-214 |
| Clicks and "Show the rows behind" | H | Which event gives what | I/actionModel.ts:71-100; page.ts (checkAction) |
| Pages, sizes and addresses | R | `f.<filter>`, `tab.<widget>`, `sheet`, `modal`, `record`, `modalRecord`, `ask` | S/navigation.tsx; sdk page.ts:181-186 |
| Phone and tablet | H + E | Automatic or Custom, On narrow screens, Priority | I/LayoutPanel.tsx; page.ts:430-461 |
| Limits of a page | R | Single table of every limit in B | see B |
| Download a widget's rows | H | CSV or spreadsheet, first 10,000 rows, in the heading or the corner | S/Frame.tsx:317-360; S/export.ts; S/useWidgetData.ts:32 |

### Console, existing pages to fix (phase 31 rewrites them)
- `build/app-builder-editor.md`: "What each widget offers" moves to the widget pages.
- `data/dashboard-builder.md`, `data/dashboards.md`: see D.

### Develop
| Page | Type | Purpose | Sources |
|---|---|---|---|
| Write a widget | T | Walk through a small widget. The old page walks `labs/goal`; use `labs/probe` or a new example. Goal is `core/goal` | `build/writing-a-widget.md`; packages/widgets-labs/src/index.ts:17-42; D37 |
| The widget contract | R | `defineWidget` fields, shapes (add `approvals`), props (`viewing`, `decide`, `place`, `tab`), events. Published, marked for contributors to the platform (D60) | packages/widget-sdk/src; W |
| Widget settings in YAML | R | Names that have no control: `as` is now a control (**Drawn as**), `initial` is now a control (**Starts as**), `scatter` is in the drawer; still YAML-only: see B | W |
| Generated widget reference (`reference/widgets/*`) | R, generated | One page per core widget from `CORE_WIDGETS`: see G | packages/docs/generators; phase 30 M9 |

### Not built, say so on the page
- Pivot with more than 3 breakdowns; a chart with more than 6 measures; SQL in an app page (dashboards only, page.ts:1146-1150); a Form cannot take a file (the field says "A file cannot be added in a form. Add it to the row in the table."); a Form or Detail on a dashboard; no per-widget help topic opens from F1 (the inspector and builder register none); end users have no dashboards.

## (B) Inventory

### Shared
- **Packs:** core has **15** widgets (W:1780-1797): table, list, detail, form, button, actions, approvals, stat, chart, pivot, goal, section, tabs, filter, text. labs has none to offer: `LABS_WIDGETS = []` (packages/widgets-labs/src/index.ts:42); `labs/probe` exists for contract tests.
- **Categories** (W): records (Table, List, Record detail, Form); understand (Stat, Chart, Pivot, Goal); content (Text); action (Button, Action group, Approvals); organize (Section, Tabs, Search and filter).
- **Inspector tabs:** Data, Display, Actions, Rules (I/Inspector.tsx:158-402). Size is under ⋯ › Layout (I/LayoutPanel.tsx): On desktop Column/Row/Width/Height; tablet and phone Automatic/Custom; On narrow screens Automatic/Keep/Full/Stack/Hide; Priority −10..10 (page.ts:455-460).
- **What you see is the custom drawer** (I/widgets/register*.ts), not always the definition hint.
- **Frame states** (S/Frame.tsx:233-310): skeleton; failed notice + "Try again" (:282, :436); forbidden "You may not see this. …" (:290); empty; unfinished "Choose what it shows in Data." / "Nothing is set up here yet." (S/PageView.tsx:681); no record "Open a record to see it here." (:677); "Choose a row in X to see it here." (:685). Stale rows fade after 500 ms (Frame.tsx:411). Empty under filters offers one "Clear filters" / "Show everything" per page (PageView.tsx:1647-1669).
- **Download** (S/Frame.tsx:317-360): menu "Download as CSV" / "Download as a spreadsheet", with "(the first 10,000 rows)" when more. Offered in the heading; **with no heading it sits in a quiet corner** (WID-29; not for a bare widget or a container); not offered while building. A table's file is **what is shown**: its columns in order, headings, money in units, no hidden column (D36; S/Frame.tsx:20-62, download.test.ts). Lists, charts and summaries are as read. Capped at `DOWNLOAD_ROWS` = 10,000 (S/useWidgetData.ts:32). CSV escapes formulas (S/export.ts).
- **Sources:** table, saved query, SQL (dashboard only), record/selected/own (app, record shape), approvals (page.ts:1105-1156). **A saved query is allowed in an app page**; only SQL is refused. External data-source tables list but can't total. Whoever saves a page naming a bound source needs `data_source:read`, and `sql:read` for SQL typed into a dashboard; a reader needs `data:read` (D24, D25; CP/kernel/pages/standing.ts; a repository deploy is not asked).
- **Only include** operators by type: I/conditionWords.ts:76. Conditions can also hold `{record: col}` or `{user: "id"}` (the editor offers "this record's" and "the current user"; money is typed by the column's format); a missing ref matches nothing.
- **Also from** (visual `joins`, WID-M10): a chip for each table the chosen one points to, up to six; columns from joined tables are named `via.column` and are offered by Only include, Sorted by, breakdowns, measures and search columns. Chart, Stat, Goal and Pivot have no "Also from" row.
- **Sorted by / At most:** choices 5, 10, 25, 50, 100, 500, 1000 (I/rowsItUses.tsx:942). Up to 4 sorts, 20 conditions, 6 joins, 8 measures, 4 breakdowns; limit 10,000 (page.ts:70-135).
- **Saved-query and SQL values** (WID-M11): a widget over a saved query or SQL sets the query's parameters in Data (`ConstantValues`, I/rowsItUses.tsx). A required parameter with no value answers "Choose <label>."; a value that does not fit names the parameter (DAT-17).
- **Measures:** Count, Count of different, Sum, Average, Smallest, Largest.
- **Numbers:** Money; Money, whole; Money, short; Number; Percent; Plain; plus currency and cents. Counts and numbers follow the reader's locale (D38; `readerLocale`, `countText` in @volvel/widgets); the server's own words stay en-US.
- **Time zone** (D21): the reader's zone is sent on every read and every action (S/useWidgetData.ts:75-76). "Today", "last N", named ranges and the day bounds of a time column use it, UTC when none is sent. Times in a Form are typed on the reader's clock and saved as the instant.
- **Page caps:** 20 pages, 30 widgets, 8 filters, 12 columns, 400 rows, 40-row height (sdk page.ts:181-186). 20 dashboards per member (CP/routes/dashboards.ts:14). Dashboards refresh Never by itself/1/5*/15/60 min, paused while editing (sdk page.ts:272-274).
- **Widget titles** are limited to 100 characters with the count shown at the limit (fix-limits.md).

### Widgets (A = app, D = dashboard; all but Section/Tabs may go in a container)

**Table** `core/table` W:74, V/table.tsx. A+D; min 4×4, default 12×8.
- Data: Source, Only include, Sorted by, At most; read-only "Searching" row (I/widgets/registerTables.tsx:52).
- Display › Columns (max 50; unset = first 8 non-system, non-JSON): Heading, Shown as Text/Badge or number format, **Drawn as** Number/Bar/Change (WID-M5), Align Auto/Right, Width Auto/Fixed, **Sort by clicking the heading** (**on unless turned off**; never for json or several-choice columns, V/cells.tsx:229), Show a total at the bottom, Hide on phones, Badge colors (Automatic + 5 tones).
- Display › Look: Group rows by; Row height Comfortable*/Compact; Rows at a time 5–200 (25); When empty; Stripe rows (off).
- Actions: When a row is clicked (Do nothing / Open record detail / Go to a page / Run an action; Opens as Side sheet/Full page/Modal); Row actions (5); Buttons above the table (5); Let people select several rows.
- **Several rows chosen:** at most 200 at a time, said beside the count; an action with a "Filter the page" or "Show the rows behind" step is not offered for several rows (WID-25); confirming says "Remove 2 invoices?" and leaves the author's `{column}` words out (WID-03).
- Phone: list: first column is title, first number right, first badge, rest in a line.

**List** `core/list` W:258. A+D; table or query; min 3×4. Display: Title, Under the title, Right, Badge (choice), Picture (text/url); Group rows by; Rows List*/Cards. Actions: row click, row actions (5). Page size fixed at 100 (inputs.ts:108). "Right" has no Drawn as control.

**Record detail** `core/detail` W:928. **A only.**
- Data "Shows": the page's record; the row selected in a table; the current user's own record (Table, Email column). The own record is found whatever the capitals of the stored email (WID-18); an action on it runs on that record only (WID-01).
- Display: Fields (Label, Hidden, number Format incl. Money, Starts as is a Form-only control) and sections; Record header: Heading, Big figure, Status; badge colors per choice field and status colors (WID-M4); Fields across 1/2*/3; Let people edit fields in place.
- Rules › **Who can edit** (`editBy`, up to 10 groups, WID-19): checked on the server; a person outside sees "Only <Group> can edit this."
- Actions: max 6 buttons.
- Edit in place: a native button inside the value, named "Edit <label>: <value>"; Enter saves, Esc cancels and focus returns to the field, blur does nothing; json, uuid, timestamp and file never edit; several-choice is a list of ticks with Save and Cancel; a hidden field is read only (WID-09, 10, 31).
- Empty fields read "Not set"; a null record reads "There is nothing here for you yet." (V/detail.tsx:77, :358). Hidden fields appear under "+ Show another field (n hidden)" (:524).

**Form** `core/form` W:1095. **A only.**
- Data: Table; What it does (Makes a new record* / Changes the record that is open).
- Display: fields (Label, Help under the field, Must be filled in, Hidden, Format, **Starts as**: Nothing / Today or Now / The person filling it in (email, name, id) / A value, WID-M1), sections (a section needs a unique name), Submit says ("Save"), After saving (Close the sheet or dialog; Say). Setting After saving changes the close and message in place and does not reorder steps (WID-17).
- Actions: When it is sent; must contain create or update (page.ts). With **Ask to confirm** on the submit, what was typed is sent with the answers, and a refused field is drawn at the field with the typing kept (WID-02).
- An edit form read again keeps what was typed; a field changed elsewhere says "<Field> was changed by someone else. What you typed is kept." (WID-05).
- Controls by type: V/form.tsx. A several-choice column is a list control; a file column says it cannot be added in a form (WID-10). Two columns at ≥34rem. Cancel only in a sheet or modal. Drawer note: "Required and checks come from the table. Click a field for its label and help text."

**Button** `core/button` W:845. **A only**; 2×1–12×2, no card. Says, Icon, Style Main*/Normal/Quiet/Danger, Full width, Position 3×3 (middle-left). Event "When clicked".

**Action group** `core/actions` W:1400. **A only.** 1–8 buttons, each with Display/Actions/Rules; Line up Left*/Right/Spread; Show up to 1–8 (3). Overflow goes to ⋯, measured by width. "Where it sits in its place" is the 3×3 grid with Left; with Right or Spread it is Top/Middle/Bottom, since columns do nothing (WID-30; I/widgets/actionsDrawer.tsx).

**Approvals** `core/approvals` W:1629. **A only.**
- Data: **Flows** (none = all, including future ones); Whose: Theirs to decide* / Every one.
- Display: Looks like Rows*/Cards/Queue; A click opens Sheet*/Modal/None (not Queue); What each shows (12; unset = first four); Show decided ones; When nothing waits ("Nothing waits for you.", V/approvals.tsx:30).
- Actions › Deciding: Approve says, Reject says, **Ask why** Never/Rejecting*/Always, Ask before approving, Go to the next one (on). **"Never" applies to approving only; a rejection always asks for a reason** (the server asks on every route; opsb.md).
- Server: members only with their own approval:read/write, named approvers, 409 when already decided ("who and what"), `decide_in_console` (CP/kernel/pages/approvals.ts:494-611). `seenBy` **is** enforced here (:185-193, :305, :521). Shows 50 waiting, 30 decided, comment ≤2,000 (:34-39). A service account that decided is named. Details written from a secret input are masked as `[redacted]` (mask2.md). A canceled run reads "was canceled".

**Stat** `core/stat` W:318. A+D; one value. Title, Caption (`{previous}`), Numbers, Compare with the period before (needs a date-range filter), **Compare across** (which date range, when the page has several), Show change as % / $ or Number / Points (percent only), Going up is Good/Bad. More: trend line by. Event click: Show a message, "Show the rows behind" (a Stat's click gives rows, on apps and dashboards).

**Goal** `core/goal` W:1499, V/goal.tsx (was `labs/goal`). A+D; min 2×2, default 3×3.
- Data: Source, Value (one measure, a second may be summed for the goal), Only include; **Goal**: "The goal is" **A fixed amount** / **From a column**; **Over** (a date filter, or All time).
- Display: A line under it, Numbers, Show the percentage (on), When reached, the bar: Turns green*/Stays. More: Good news is Up/Down, Color by how close (green from 75%, amber from 40%; reverse when down).
- Money: the amount is typed in the column's currency (WID-26). Event "When it is clicked": **drawn as a button only when something listens to the click** (WID-27).

**Chart** `core/chart` W:439; 1–6 measures ("Add another measure"), 1–2 breakdowns.
- Data: Measure, For each, Split into colors, **Include periods with nothing** (gaps filled to the page's range, WID-16), Bars in order (As it came/By name/Biggest first/Smallest first), Show at most, **Sorted by** (in the Order group; "Bars in order" wins when set).
- Display: Bar/Bar, sideways/Pie/Line/Area/Heatmap/**Scatter**, grayed with reason (V/chartSpec.ts); Several series (One on another/Side by side); Numbers; Colors App theme/Cool/Warm/**Grays** (also drawn on a heatmap); Show values on bars; Show axis titles with **Title along the bottom** / **Title up the side** (`xTitle`, `yTitle`); **Along the bottom** / **Up the side** pick the columns when there are two or more; **Legend Automatic/Never** (the value `shown` is gone); Compare; Smooth the line; Mark each point.
- Number labels follow the reader's locale (D38). Event pointClick gives a group; "Filter the page" and "Show the rows behind" are offered only for a group-giving event, and a group with no value says "Those rows have no value to narrow the page by." instead of widening the page (WID-12).

**Pivot** `core/pivot` W:700; 1 value, 2–3 breakdowns (**Rows, Columns, Then by**). Shade cells by size, Total for each row/column (all on). Totals add sums, find smallest and largest; **a measure that cannot be added (average, count of different) gets no total, and says so** (WID-20). Event cellClick gives each heading's stored value (an empty group is null, WID-11).

**Section** `core/section` W:1189. A+D, container. Style Plain*/Card, Can be collapsed, Starts folded; the fold is kept in localStorage per app and page, or per dashboard (`volvel.fold.<key>.<widget>`, S/PageView.tsx:1364-1369). **Tabs** W:1243: 1–8 tabs, Opens first, Underline*/Pills, Remember the last tab (`volvel.tab.<user>.<widget>`, S/tabMemory.ts). Precedence: address > remembered > opens first > first (PageView.tsx:1330-1336). Containers go one level deep. Renaming a tab by double-click is **not built**.

**Search and filter** W:1331. A+D. Search, Date range, Choice, Text, Number; Label, Kind, Starts as, values, Narrows checkboxes; Filters sit In a row*/Behind a button; Offer "Clear". It is on the **Display** tab ("Add a filter"). Phone forces the button when any non-search filter exists (PageView.tsx:463). Choices ≤200 (CP/routes/widget-data.ts:17); search ≤200 chars and 10 words (CP/kernel/data/query/filters.ts:124), all must match; 300 ms pause (V/filter.tsx:15); `/` focuses, Esc clears.

**Text** W:790. A+D. Style Plain*/Note/Warning/Tip, Heading, Markdown (10,000), Height Fits*/Set by hand.

### Actions (action.ts:151-184; labels I/actionModel.ts:71)
- **Steps, max 8.** Server: Update the record, Make a record, Remove the record, **Run a flow** (manual trigger), Run a script. Browser: Open a page, Close (sheet/modal only), Show a message (Good news / Just so you know; text ≤300), Filter the page, Show the rows behind.
- **When it is done, say** (`done`, ≤300): a line said when the action ends (WID-M2; I/actionControls.tsx:1243).
- **On dashboards:** only filter (group events), message, and rows (group events and a Stat's click). "Show the rows behind" is for a widget that reads a table; a saved query or SQL is refused (page.ts, DAT-20).
- **Values:** A value, Today, Now, The current user (id/name/email), a field of this or the clicked record, What was asked. A value for a column is stored by the column's type: "007" in a text column stays "007"; flow and script inputs are typed by their schema (WID-13).
- **Ask to confirm:** title 120, text 500 with `{column}`, button 40, up to 6 questions (A line / Some text / A number / A date / One of a list; "It must be answered"). Left untitled, words are made from the record (S/confirmWords.ts). Dismiss says "Go back" if the button is Cancel. A remove starts on the way back, other actions on the main button. The question is in the address as `ask=`.
- **Rules:** Show this widget (`showWhen`), Who can see it (`seenBy`, drawing only; **it works on dashboards now**, WID-07), Can be pressed when (`when`, max 10, all must hold; shown grayed with the reason as a tooltip), Who can run it (`runBy`, ≤10 groups, checked on the server), Who can edit (Record detail). Conditions: field tests, user in group, record is chosen/not; the Rules tab says conditions can use the current user or the record that is open.
- **Server** (CP/kernel/pages/act.ts): locate page → runBy → inputs whitelist → read records under row policy (an own-record widget acts only on the user's own record) → `when` → data steps in one transaction as the action's own grant → **a flow or script that would refuse its input is found out here, before saving: 400 and nothing saved** → audit `page_action.*` (:617) → after commit start flows/scripts → browser steps. A start that still fails after the commit answers 200 with `notStarted`: the data is kept and a toast says "Saved. The flow X could not be started." Bulk 1–200, all or nothing (`MAX_RECORDS` :40). The page rereads after every action, and at 1/3/8 s when something was started (S/actions.tsx:691).
- **Navigation** (S/navigation.tsx): `f.<filter>`, `tab.<widget>`, `sheet`, `modal`, `record`, `modalRecord`, `ask`. The sheet steps through its list ("2 of 236"), reading more as needed. Tabs and sheets push history; filters replace it.
- **Reads:** default 1,000 rows, max 10,000, 5 MB (CP/kernel/data/query/run.ts:21-23); choices ≤200 (widget-data.ts:17). A source that cannot be reached says so, not "internal error" (DAT-12).

## (C) Gotchas
1. Relative date filters, "last N" and the day bounds of a time column resolve **in the reader's zone** (D21), UTC only when the reader sends none. Custom dates and row grouping use the reader's zone too. A time is shown in the reader's zone with UTC on hover.
2. **Hidden columns are still sent to the browser** when the query names no columns; a table's download leaves them out. Totals and bars cover loaded rows only.
3. Download: with no heading it moves to a corner; money downloads in units (not cents); lists, charts and summaries download as read.
4. Header sort is server-side only when more pages exist (check in V/table.tsx before writing this as fact).
5. Ask why "Never" is for approving. Rejecting always asks. "Ask before approving" is skipped when a reason is required.
6. Forms: an edit sends only changes. In place: Enter saves, Esc cancels, blur does nothing; json, uuid, timestamp and file never edit.
7. `when` with several conditions is AND; list values are any-of / none-of.
8. **A refused flow start no longer follows a saved change**: the refusal comes first and nothing is saved (400). Only a failure after the commit (queue, database) is "Saved, but not started".
9. Open after a bulk run carries no record. "Filter the page" and "Show the rows behind" are refused for more than one row, and not offered for a bulk action.
10. Sheets and modals keep their own filters in memory.
11. Containers stack below 28rem, pages below 42rem, tablet below 58rem (PageView.tsx:185-190).
12. A phone place sets order, not size.
13. "Already narrowed" search hides a table's own When empty words.
14. Pivot totals add cells; averages and counts of different things get no total.
15. In bulk, an action that can't run on one selected row is not offered at all.
16. A remembered tab is kept by user and widget id only (S/tabMemory.ts:6-7), so two pages with a Tabs of the same id share it. A Section's fold is kept per app and page.
17. A stored chart `legend: "shown"` is outside the schema (no back-compat owed).

## (D) Docs wrong, stale or missing (packages/docs/content, for phase 31)
- data/dashboards.md:10 says an app page may not read a saved query. It may (only SQL is refused, page.ts:1146-1150).
- "Add a filter in its Data tab" (data/dashboard-builder.md:18, build/app-builder-editor.md:112): it is Display.
- data/dashboard-builder.md: "Break down by" → "For each"; "Narrow the page" → "Filter the page"; "Show the rows behind it" → "Show the rows behind"; "Reset" → "Clear"; "colour" → "color"; Goal is missing.
- build/app-builder-editor.md: "Can be folded" → "Can be collapsed"; "Value / Break down by" → "Measure / For each"; row actions are greyed, not removed ("doesn't offer it" in app-builder.md); "workflows" → "flows" (:14, :91); "greyed" → "grayed".
- build/app-builder.md: "Add a row" → "Make a record" (:66); "Run a workflow" → "Run a flow" (:67); "Narrow the page" (:71) and "Show the rows behind it" (:72); the Approvals paragraph (:46-54) says a rejection is asked unless you say never: now a rejection always asks; "Only when the publish check lists…" claims need checking against publishCheck.ts.
- build/writing-a-widget.md lines 6, 27, 97, 117, 127, 155 still say `labs/goal` and "Colour"; it is `core/goal` (D37, t3-cli-docs.md). Shapes omit `approvals`; check props (`viewing`, `decide`, `place`, `tab`).
- Search "pick the text columns": the filter drawer says each widget's text columns; picking is on the widget's Data tab (I/rowsItUses.tsx).
- Generated interface/dashboard pages: action, confirm, condition and visual-query fields had empty descriptions; recheck after phase 30 M9.
- Missing entirely: limits, confirm questions, download, addresses, states, bulk rules, number formats, time zone, "Who can edit", "Also from", Scatter, "Starts as", "When it is done, say".
- For dashboards: "Show the rows behind is for widgets that read a table" (dat2.md line for docs).

## (E) Findings: settled (all 14 of the earlier list)
Source: `fixed/wid.md`, `fixed/bldwid.md`, `fixed/fix-close.md`, `fixed/fix-final.md`, `fixed/t3-widgets.md`, `fixed/sweep-console.md`; `outcomes.md` row WID-27..31.

| Was | Now |
|---|---|
| 1. Sort by clicking the heading never worked | Fixed, WID-06: unset means sortable (V/cells.tsx:229) |
| 2. A Form that asks to confirm lost what was typed | Fixed, WID-02 |
| 3. Dashboards hid "Who can see it" widgets from everyone | Fixed, WID-07: `GET /tenants/:t/me/groups`, `useViewer` |
| 4. Chart axis rows wrote titles into `x`/`y` | Fixed, WID-08: `xTitle`, `yTitle` hold titles; `x`, `y` are columns (WID-M6) |
| 5. Edit in place could not be limited | Built, WID-19: `editBy`, Rules › Who can edit |
| 6. Hidden detail fields opened an editor the server refused | Fixed, WID-09: read only |
| 7. Pivot click sent "—" for an empty group | Fixed, WID-11 |
| 8. Goal always a button | Fixed, WID-27 (fix-close.md) |
| 9. Remembered tab key omits app and page | **Open**: S/tabMemory.ts:6-7 still keys by user and widget. WID-21 fixed the fold (and the dashboard half), not the tab. Say so; not named in remaining.md |
| 10. Legend "Always" = "Automatic"; palettes missed heatmaps | Fixed, WID-28: Automatic or Never; heatmap takes the palette |
| 11. Money field lost its Format row | Fixed, WID-15 |
| 12. Misleading copy in Rules, form note, grantWords | Fixed, WID-22, WID-23 |
| 13. enum_list in place was a text box | Fixed, WID-10 |
| 14. `done` and Form `initial` had no control | Built, WID-M2 (When it is done, say), WID-M1 (Starts as) |

Also settled: WID-01 (own-record actions), WID-03 (bulk confirm words), WID-04 (flow refusal before save), WID-05 (edit form kept), WID-12 (narrow and rows only for group events), WID-13, WID-14, WID-16, WID-17, WID-18, WID-20, WID-25, WID-26, WID-29 (download in a corner), WID-30, WID-31, WID-M4, M6, M10, M11 (all built), D21, D36, D37, D38.

Open or left: the Form still has no file upload (route does not carry one); Money in an "is between" condition is typed as a number; page filter "Starts as" over money; Chart, Stat, Goal and Pivot have no "Also from" row; tab-rename by double-click not built; `dates.ts` `localeOf` duplicates `readerLocale` (remaining.md). **No phase 29 lane walked these screens in a browser**; walk them before writing screenshots.

## (F) Screenshots
Add to page list; Table drawer + column editor (Drawn as); grouped table; bulk bar with the 200 limit; phone list; chart type tiles grayed, with Scatter; stat comparing; **goal (new)**; pivot shaded with a total absent for an average; step timeline; confirm preview and served dialog (several rows: "Remove 2 invoices?"); Rules tab (Who can edit); grayed button tooltip; record sheet with stepper; Approvals queue; filters on desktop and phone; Publish check; View as; rows-behind sheet; Download in the corner of a table with no heading; Form field "Starts as"; "Also from" chips.

## (G) Generating the reference
**Yes, worthwhile, but partial** (phase 30 M9). `CORE_WIDGETS` is plain data (labs has none); packages/docs/generators can import it from dist as it does `platformKinds` (generators/reference.mjs:8). Counted on built core (15 widgets, by walking `config.properties` and nested `items`): **100** top-level config properties, all with an `x-volvel` hint (tab, group, label, control, choices, `when`, order), **49** with `help`, **4** with `description`. The **104** nested properties inside array/object settings (columns, fields, actions, format) have **0** descriptions. Defaults, layout, events, data shapes, surfaces and dataHints are all machine-readable. (The earlier count was 89/43/3/76 on 14 widgets.)

`fieldsOf` reads only `description`, so a new generator should read `x-volvel` (label/help). Blockers:
- Custom drawers override labels (I/widgets/*), so hint labels drift: "Bars lie down" vs "Bar, sideways", "Bar turns green" vs "Turns green". Read the drawer words for prose.
- Coverage's floor (`packages/docs/coverage.json`: `{ "kinds": 0.429 }`) only covers kinds; add a widgets floor.

Suggested split: generate reference tables (type, sizes, sources, options, defaults, events, YAML names); hand-write the prose and drawer labels. Action steps and conditions could be generated from `stepSchema` + `STEP_WORDS` once described.
