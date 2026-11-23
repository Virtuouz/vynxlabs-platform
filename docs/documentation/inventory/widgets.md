# Inventory: widgets

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

Line numbers are at HEAD 270e509. Path shorthand, all under .:
- **W** = packages/widgets-core/src/index.ts
- **V/** = packages/widgets-core/views/
- **S/** = packages/screens/src/
- **I/** = apps/console/src/kit/inspector/
- **CP/** = apps/control-plane/src/
- **page.ts** = packages/manifest/src/page.ts

packages/manifest/src/conditions.ts does not exist; conditions are in action.ts. I read code only; nothing was run in a browser.

## (A) Proposed pages (under packages/docs/content)

New:
- **build/widgets/index.md**: categories, where each is allowed, shared states, download, phone
- **build/widgets/{table,list,record-detail,form,button,action-group,approvals,stat,goal,chart,pivot,section,tabs,search-and-filter,text}.md**: 15 pages
- **build/widgets/data.md**: source, only include, sort, limits, following filters
- **build/widgets/number-formats.md**
- **build/widgets/grouping-rows.md**
- **build/actions/index.md**: steps, order, transaction, refresh
- **build/actions/{confirmations,values,rules}.md**
- **build/actions/clicks-and-drilldown.md**
- **build/pages-and-navigation.md**: kinds, sizes, addresses
- **build/phone-and-tablet.md**
- **operate/widget-limits.md**
- Generated: **reference/widgets/***

Existing:
- Split build/app-builder-editor.md ("What each widget offers" moves out).
- Fix data/dashboard-builder.md, data/dashboards.md, build/writing-a-widget.md.

The inspector and builder register no per-widget help topic (no hits there), so F1 could open the widget page with `useHelpTopic`.

## (B) Inventory

### Shared
- **Packs:** core has 14 widgets (W:1603). labs has one, `labs/goal`, and it **ships**: console builder/registry.ts, the served runtime (packages/screens/runtime/main.tsx:37) and the manifest (page.ts:602).
- **Inspector tabs:** Data, Display, Actions, Rules. Text's tab may be relabelled. Size is under ⋯ › Layout (I/LayoutPanel.tsx): On desktop Column/Row/Width/Height; tablet and phone Automatic/Custom; On narrow screens Automatic/Keep/Full/Stack/Hide; Priority −10..10.
- **What you see is the custom drawer** (I/widgets/register*.ts), not always the definition hint.
- **Frame states** (S/Frame.tsx:233): skeleton; failed notice + "Try again"; forbidden "You may not see this. …"; empty; unfinished "Choose what it shows in Data." / "Nothing is set up here yet."; no record "Open a record to see it here."; "Choose a row in X to see it here." (S/PageView.tsx:673). Stale rows fade after 500 ms. Empty under filters offers one "Clear filters" / "Show everything" per page (PageView:1648).
- **Download** (Frame:324): CSV or .xlsx, for rows and broken-down summaries; capped at 10,000 rows (S/useWidgetData.ts:32). CSV escapes formulas.
- **Sources:** table, saved query, SQL (dashboard only), record/selected/own (app, record shape), approvals (page.ts:1074-1136). External data-source tables list but can't total (CP/kernel/data/query/inputs.ts:552).
- **Only include** operators by type: I/conditionWords.ts:59. Conditions can also hold `{record: col}` or `{user: "id"}`; a missing ref matches nothing (inputs.ts:223).
- **Sorted by / At most:** choices 5, 10, 25, 50, 100, 500, 1000 (I/rowsItUses.tsx:654). Up to 4 sorts, 20 conditions, 6 joins; limit 10,000 (page.ts:68).
- **Measures:** Count, Count of different, Sum, Average, Smallest, Largest.
- **Numbers:** Money; Money, whole; Money, short; Number; Percent; Plain; plus currency and cents.
- **Page caps:** 20 pages, 30 widgets, 8 filters, 12 columns, 40-row height.

### Widgets (A = app, D = dashboard; all but Section/Tabs may go in a container)

**Table** `core/table` W:73, V/table.tsx. A+D; min 4×4, default 12×8.
- Data: Source, Only include, Sorted by, At most; read-only "Searching" row.
- Display › Columns (max 50; unset = first 8 non-system, non-JSON): Heading, Shown as Text/Badge or number format, Align Auto/Right, Width Auto/Fixed, Sort by clicking the heading, Show a total at the bottom, Hide on phones, Badge colors (Automatic + 5 tones).
- Display › Look: Group rows by; Row height Comfortable*/Compact; Rows at a time 5–200 (25); When empty; Stripe rows (off).
- Actions: When a row is clicked (Do nothing / Open record detail / Go to a page / Run an action; Opens as Side sheet/Full page/Modal); Row actions (5); Buttons above the table (5); Let people select several rows.
- YAML-only: column `as: bar|delta`.
- Phone: list — first column is title, first number right, first badge, rest in a line.

**List** `core/list` W:257. A+D; table or query; min 3×4. Display: Title, Under the title, Right, Badge (choice), Picture (text/url); Group rows by; Rows List*/Cards. Actions: row click, row actions (5). Page size fixed at 100 (inputs.ts:100).

**Record detail** `core/detail` W:899. **A only.**
- Data "Shows": the page's record; the row selected in a table; the current user's own record (Table, Email column).
- Display: Fields (Label, Hidden, number Format) and sections; Heading; Big figure; Status; Fields across 1/2*/3; Let people edit fields in place.
- Actions: max 6 buttons.
- Empty fields read "Not set"; a null record reads "There is nothing here for you yet."
- Hidden fields appear under "+ Show another field (n hidden)" (V/detail.tsx:462).

**Form** `core/form` W:1043. **A only.**
- Data: Table; What it does (Makes a new record* / Changes the record that is open).
- Display: fields (Label, Help under the field, Must be filled in, Format), sections, Submit says ("Save"), After saving (Close the sheet or dialog; Say).
- Actions: When it is sent; must contain create or update (page.ts:1277).
- Controls by type: V/form.tsx:82. Timestamps are typed in UTC. Two columns at ≥34rem. Cancel only in a sheet or modal.
- `initial` (today/me/value) is YAML or Add-form only.

**Button** `core/button` W:816. **A only**; 2×1–12×2, no card. Says, Icon, Style Main*/Normal/Quiet/Danger, Full width, Position 3×3 (middle-left). Event "When clicked".

**Action group** `core/actions` W:1348. **A only.** 1–8 buttons, each with Display/Actions/Rules; Line up Left*/Right/Spread; Show up to 1–8 (3). Overflow goes to ⋯, measured by width (V/actions.tsx:29). Place is not applied horizontally when Right/Spread.

**Approvals** `core/approvals` W:1451. **A only.**
- Data: Workflows (none = all, including future); Whose Theirs to decide* / Every one.
- Display: Looks like Rows*/Cards/Queue; A click opens Sheet*/Modal/None (not Queue); What each shows (12; unset = first four); Show decided ones; When nothing waits ("Nothing waits for you.").
- Actions: Approve says, Reject says, Ask why Never/Rejecting*/Always, Ask before approving, Go to the next one (on).
- Server: members only with their own approval:read/write, named approvers, 409 when already decided, `decide_in_console` (CP/kernel/pages/approvals.ts:475-600). `seenBy` **is** enforced here. Shows 50 waiting, 30 decided; comment ≤2,000.

**Stat** `core/stat` W:317. A+D; one value. Title, Caption (`{previous}`), Numbers, Compare with the period before (needs a date-range filter), Show change as % / $ or Number / Points (percent only), Going up is Good/Bad. More: trend line by. Event click.

**Goal** `labs/goal` packages/widgets-labs/src/index.ts. A+D. Value; Goal fixed or from a column (a second summed measure); Over (a date filter); Show the percentage (on); When reached Bar turns green*/stays. More: Good news is, Color by how close (bands 40/75%).

**Chart** `core/chart` W:438. A+D; 1–6 measures, 1–2 breakdowns.
- Data: Measure, For each, Split into colors, Include periods with no…, Bars in order, Show at most.
- Display: Bar/Bar sideways/Pie/Line/Area/Heatmap, greyed with reason (V/chartSpec.ts:83); Several series; Numbers; Colors App theme/Cool/Warm/Greys; Show values on bars; Show axis titles; Legend; Compare; Smooth the line; Mark each point.
- Scatter is YAML-only. Event pointClick gives a group.

**Pivot** `core/pivot` W:671. A+D; 1 value, 2–3 breakdowns (drawer sets two). Shade cells by size, Total for each row/column (all on). Event cellClick.

**Section** `core/section` W:1137. A+D, container. Style Plain*/Card, Can be collapsed, Starts folded; fold kept in localStorage. **Tabs** W:1191: 1–8 tabs, Opens first, Underline*/Pills, Remember the last tab. Precedence: address > remembered > opens first > first (PageView:1321). Containers go one level deep.

**Search and filter** W:1279. A+D. Search, Date range, Choice, Text, Number; Label, Kind, Starts as, values, Narrows checkboxes; Filters sit In a row*/Behind a button; Offer "Clear". Phone forces the button when any non-search filter exists (PageView:464). Choices ≤200 (CP/routes/widget-data.ts:17); search ≤200 chars and 10 words, all must match; 300 ms pause; `/` focuses, Esc clears.

**Text** W:761. A+D. Style Plain*/Note/Warning/Tip, Heading, Markdown (10,000), Height Fits*/Set by hand.

### Actions (action.ts:87; labels I/actionModel.ts:69)
- **Steps, max 8.** Server: Update the record, Make a record, Remove the record, Run a workflow (manual trigger), Run a script. Browser: Open a page, Close (sheet/modal only), Show a message (Good news / Just so you know), Filter the page, Show the rows behind.
- **On dashboards:** only filter, message and rows.
- **Values:** A value, Today, Now, The current user (id/name/email), a field of this or the clicked record, What was asked.
- **Ask to confirm:** title 120, text 500 with `{column}`, button 40, up to 6 questions (A line / Some text / A number / A date / One of a list; "It must be answered"). Left untitled, words are made from the record (S/confirmWords.ts). Dismiss says "Go back" if the button is Cancel. The question is in the address as `ask=`.
- **Rules:** Show this widget (`showWhen`), Who can see it (`seenBy`, drawing only), Can be pressed when (`when`, max 10, all must hold), Who can run it (`runBy`, ≤10 groups). Conditions: field tests, user in group, record is chosen/not.
- **Server** (CP/kernel/pages/act.ts): locate page → runBy → inputs whitelist → read records under row policy → `when` → data steps in one transaction as the action's own grant → audit `page_action.*` → after commit start flows/scripts → browser steps. Bulk 1–200, all or nothing (`MAX_RECORDS`:37). The page rereads after every action, and at 1/3/8 s when something was started (S/actions.tsx:586).
- **Navigation** (S/navigation.tsx): `f.<filter>`, `tab.<widget>`, `sheet`, `modal`, `record`, `modalRecord`, `ask`. The sheet steps through its list ("2 of 236"), reading more as needed. Tabs and sheets push history; filters replace it.
- **Reads:** default 1,000 rows, max 10,000, 5 MB (run.ts:20); choices 50. Dashboards refresh off/1/5*/15/60 min, paused while editing; 20 per member.

## (C) Gotchas
1. Relative date filters resolve on the server in **UTC** (filters.ts:46), while custom dates and row grouping use the reader's zone. "Today" values are UTC.
2. **Hidden columns are still sent and downloaded** when the query names no columns (Frame:24). Totals and bars cover loaded rows only.
3. Download is in the heading: no title/subtitle/buttons means no Download. Money downloads as stored (cents).
4. Header sort is server-side only when more pages exist.
5. Ask why "Never" still opens an optional box on Reject. "Ask before approving" is skipped when a reason is required.
6. Forms: an edit sends only changes. In place: Enter saves, Esc cancels, blur does nothing; json, uuid and timestamp never edit.
7. `when` with several conditions is AND; list values are any-of / none-of.
8. A refused flow start comes after the data was saved.
9. Open after a bulk run carries no record. "Filter the page" and "Show the rows behind" are refused for more than one row.
10. Sheets and modals keep their own filters in memory.
11. Containers stack below 28rem, pages below 42rem, tablet below 58rem (PageView:186).
12. A phone place sets order, not size.
13. "Already narrowed" search hides a table's own When empty words.
14. Pivot totals add up cells, so totals of averages are wrong.
15. In bulk, an action that can't run on one selected row is not offered at all.

## (D) Docs wrong, stale or missing
- data/dashboards.md: says an app page may not read a saved query. It may (only SQL is refused, page.ts:1129).
- "Add a filter in its Data tab" (dashboard-builder, app-builder-editor): it is Display.
- dashboard-builder: "Narrow the page" → "Filter the page"; "Show the rows behind it" → "Show the rows behind"; "Reset" → "Clear"; the Goal widget is missing.
- app-builder-editor: "Can be folded" → "Can be collapsed"; "Value / Break down by" → "Measure / For each"; row actions are greyed, not removed ("doesn't offer it" in app-builder.md).
- "Add a row" → "Make a record"; "Only when the publish check lists…" claims need checking against publishCheck.ts.
- Search "pick the text columns": the filter drawer says each widget's text columns; picking is on the widget's Data tab (I/rowsItUses.tsx:405).
- writing-a-widget.md: shapes omit `approvals`; check props (`viewing`, `decide`, `place`, `tab`).
- Generated interface/dashboard pages: action, confirm, condition and visual-query fields have empty descriptions.
- Missing entirely: limits, confirm questions, download, addresses, states, bulk rules, number formats.

## (E) Likely product bugs (from code, not reproduced)
1. **Sort by clicking the heading never works from the console.** The switch treats unset as on (ColumnEditor.tsx:145) and `tidyColumn` drops `true` (columnModel.ts:147), but the view needs `spec.sortable` truthy (V/table.tsx:489). Only YAML `sortable: true` sorts.
2. **A Form whose submit asks to confirm loses what was typed.** The confirm path submits only the dialog's answers (S/actions.tsx:439 vs 372). No test covers it.
3. **Dashboards pass no `user` to PageView** (apps/console/src/screens/Dashboards.tsx:552), so "Who can see it" and "user in group" hide the widget from everyone.
4. Chart "Along the bottom / Up the side" write title text into `config.x/y`, which the view reads as column names (chartDrawer vs chartSpec.ts:223): no effect, or a changed axis.
5. Edit in place cannot be limited: `editBy` is read (act.ts:242) but the detail schema forbids it.
6. Hidden detail fields open an editor in the disclosure, yet the server refuses them (act.ts:121).
7. Pivot click on an empty group sends "—" rather than null (V/pivot.tsx:60,124).
8. Goal always draws as a pressable button (goal.tsx).
9. Remembered tab key omits app and page (S/tabMemory.ts), so same-id Tabs collide.
10. Legend "Always" equals "Automatic"; palettes don't reach heatmaps.
11. A field formatted as money loses its Format row (fieldsList shows it only for "Number").
12. UI copy: Rules says conditions can use page filters (no such condition); the form note promises "when to show it"; grantWords says everyone can, ignoring runBy.
13. enum_list in place is a plain text box.
14. `done` and the Form's `initial` have no control that I found.

Open question: is Goal supported, given `labs`?

## (F) Screenshots
Add to page list; Table drawer + column editor; grouped table; bulk bar; phone list; chart type tiles greyed; stat comparing; goal; pivot shaded; step timeline; confirm preview and served dialog; Rules tab; greyed button tooltip; record sheet with stepper; Approvals queue; filters on desktop and phone; Publish check; View as; rows-behind sheet.

## (G) Generating the reference
**Yes, worthwhile, but partial.** `CORE_WIDGETS` and `LABS_WIDGETS` are plain data; packages/docs/generators can import them from dist as it does `platformKinds`. Counted on built core: 89 config properties, all with an `x-volvel` hint (tab, group, label, control, choices, `when`, order), 43 with `help`, 3 with `description`. The 76 nested properties inside array/object settings (columns, fields, actions, format) have **0** descriptions. Defaults, layout, events, data shapes, surfaces and dataHints are all machine-readable.

`fieldsOf` reads only `description`, so a new generator should read `x-volvel` (label/help). Blockers:
- Custom drawers override labels (I/widgets/*), so hint labels drift: "Bars lie down" vs "Bar, sideways", "Make bars" etc.
- Coverage's floor (0.429, coverage.json) only covers kinds; add a widgets floor.

Suggested split: generate reference tables (type, sizes, sources, options, defaults, events, YAML names); hand-write the prose and drawer labels. Action steps and conditions could be generated from `stepSchema` + `STEP_WORDS` once described.
