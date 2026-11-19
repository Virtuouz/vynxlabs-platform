# Phase 19: dashboards placed by drag, motion that is kept, and navigation that does not jump

Status: being built, on branch `phase-19-dashboards-motion`, off `main` at 178a3cb. M1 to M9 built. The walk-through on the test instance waits for the owner's word.
Last updated: 2026-11-19

Phase 18 was merged and a demo workspace put on the test instance. The owner walked it and wrote down what was wrong. Each item was checked in the code.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Drawers | The widget editor on a dashboard appears and goes at once. So do about fifteen other sheets and dialogs | They are drawn only while wanted, with `open` written bare (`Dashboards.tsx:427` → `WidgetEditor.tsx:930`). Base UI gives no opening motion to what is born open, and the parent takes it off the page the moment it closes |
| Moves by arrow | A column, an enum value, a form field moved with its arrow is redrawn in its new place in one frame | Eight places swap two items in a list and draw again. `@dnd-kit` animates only what was dragged |
| Dashboard layout | Widgets are placed by order and one of five widths, moved earlier and later with arrows | Phase 18 chose that on purpose (`phase-18-data-insight.md:379`). The owner prefers the app builder's drag |
| Rows behind a number | The dialog is 30rem wide and its table 60vh tall, so it nearly always scrolls. Dashboard tables cannot be filtered or have their columns ordered | `RowsBehind` uses the regular `Dialog`; `ResultTable` is a plain `Grid` |
| Figures and refresh | A figure has no trend line. A dashboard never refreshes and does not say how old its numbers are | Nothing asks for a series; `useLoad` has no interval |
| Vocabulary | The owner's mock-up needs sparklines, a prior-period series, bars lying down, a heatmap and tables with bars and chips in their cells | Not in `packages/manifest/src/dashboard.ts` |
| Breadcrumb | Inside a dashboard the section is plain text; the workspace's name only opens the switcher | `DashboardView` never names its object to the shell (`kit/title.ts`) |
| Rail | Clicking an area such as Data goes straight to its first section, Tables. On a phone the same tap closes the menu, so reaching Dashboards from Scripts takes two openings | An area is a `Link` to `areaHome()` (`nav.ts:312`), and the drawer closes on any click in it (`Shell.tsx:1145`) |

## Decisions

| Area | Decision |
| --- | --- |
| Layout | A dashboard widget has a place and a size on twelve columns, as an app page's widget does, and is dragged. This reverses phase 18 |
| Rail | An area with more than one section reveals its sections and goes nowhere |
| Refresh | A dashboard refreshes every 5 minutes unless it says otherwise |
| Vocabulary | Trimmed by the owner on 2026-11-19 to eight options. Cut as scope creep: colour rules (`thresholds`, `tones`), a figure's `alertWhen`, `target` and `of`, a chart's `annotate`, a `share` mark (a stacked bar lying down does it), a widget's `note` and `link` and a dashboard's `footer` (a text widget does them), a table cell's second line and marker. Deferred: comparing with the year before, and exporting a whole dashboard |
| Left out | Subscribing to a dashboard by mail, and PDF export |

## M1: every sheet and dialog arrives and leaves with motion

**Built.**

- `SideSheet` and `Dialog` (`packages/ui`) open a frame after they are on the page (`useOpening`, `presence.tsx`), so one born open has an opening.
- `Closing` (`presence.tsx`) is how a sheet is opened for a subject: it keeps the sheet on the page, told it is shut and still given its subject, for as long as closing takes, then takes it away so the next starts afresh. Seventeen call sites use it: the widget editor, the dashboard's filters, rows behind a number, a role, a promotion review, drift, a group's members, an end user's attributes, an enum's values, a reference's delete rule, a batch's results, the three "run again" dialogs, the connection wizard from Scripts, an app action's question, and the new-schedule sheet in two places.
- Below 1280 px the inspector's sheet stays on the page shut, so it slides both ways (`kit/layout.tsx`). Phase 18 had left it.
- `Appear` (`presence.tsx`) is for a panel drawn by hand. The flow editor's "Steps to add" uses it.
- The docked inspector's wrapper and `Appear` carry `data-drawer` and the same `data-starting-style` and `data-ending-style` a Base UI popup does.

**Tests, in three layers.**

1. `enforce.test.ts`, "every sheet and dialog can arrive and leave with motion": no bare `open` on anything but `Inspector`; no `key` that changes as the thing closes; no `role="dialog"` and no panel fixed over the page outside the kit. `overlay-allowed:` exempts a line.
2. `packages/ui/src/presence.test.tsx`: a sheet and a dialog born open are drawn a frame later; `Closing` keeps its subject while it shuts; `Appear` carries both styles.
3. `e2e/test.ts`: every spec imports `test` from it. A script in every page watches each `[role="dialog"]` and `[data-drawer]` that is added or removed, and the test fails if one arrived without its starting style or left without its ending one. Leaving by going to another page, and a window made narrower, are not closings. Nothing is asked under reduced motion. A spec does nothing to get this, so a drawer added later is held to it by whichever spec opens it.

**Findings.**

- The browser fixture found what the static rule could not: the new-schedule sheet was kept on the page but given `key={String(open)}`, so closing it made a new one, shut, and the open one went in a frame. The static rule now names that too.
- The fixture's first form looked for the starting style when it was told a panel had arrived. The docked inspector measures itself and leaves its starting style before the browser tells anyone, so the fixture also listens for the attribute changing.
- A dialog that closes with motion is on the page a quarter of a second longer. One browser test pressed a "Done" behind it too soon and now waits.
- **Not done:** the flow editor's test panel. It is a split of the editor's own area and not a panel over it; opening it moves the canvas into a new parent, and animating that means rebuilding how the editor is laid out. It still appears at once.

## M2: what is moved by a button or a key is seen to move

**Built.**

- `useFlip` (`packages/ui/src/useFlip.ts`): give its ref to what holds the things and each thing a `data-flip-key`. When the order changes, each is played from where it was to where it is over `motion-base`, with the browser's own `animate`. Places are measured from the holder, so scrolling between draws moves nothing. Nothing plays under reduced motion or while a pointer drags.
- `MoveButtons` (`packages/ui/src/MoveButtons.tsx`): the one pair of buttons, up and down for a list, earlier and later along a row. They say where the thing went.
- `useKeys`: a name for each place in a list whose items have none, which stays with the item as it moves. The cases of a branch, a form's questions and a `SchemaForm` list were keyed by position, so React rewrote each row in place and nothing moved; now the row itself moves and what is being typed keeps focus.
- Used by the columns dialog (buttons and the handle's arrow keys; a drag pauses it), an enum's values, a branch's cases, a form trigger's questions, an app widget's fields, `SchemaForm` lists, and the dashboard's widgets (buttons only; M4 replaces them with dragging).

**Tests.** `useFlip.test.tsx` (what moved is played from where it was, what did not is not; reduced motion and a drag play nothing; `useKeys`). `enforce.test.ts`, "every move by a button or a key is animated by the shared pieces": no move buttons outside `MoveButtons`, and a file that moves things from the arrow keys uses `useFlip` or the shared placement; `move-allowed:` exempts an arrow that moves nothing. `e2e/columns.spec.ts` reads the column's transform frame by frame while its button moves it.

**Findings.**

- Three lists' buttons said "Up" and "Down" or "Move up" and "Move down" in words. They are the icon buttons now, named the same for a screen reader.
- An app page's widgets moved with the arrow keys came with M4, when that code became the shared placement.

## M3: the breadcrumb leads back, and the rail shows before it goes

**Built.**

- **Breadcrumb** (`Shell.tsx`). The tenant is a link. The workspace's name is a link to its overview, and the switcher is the button beside it; before, the name was the switcher and nothing led to the workspace. The section is a link whenever something is open in it. An editor that has not named what it shows is named by the end of its address until it does, so every editor has a way back, and `DashboardView` names its dashboard (`useTitleObject`). Below 768 px, where the section has no room, a chevron goes back to it.
- **Rail.** An area with more than one section is a button with `aria-expanded`. Pressing it shows that area's sections and goes nowhere. Where the section panel is docked they take its place. In an editor, on the overview and between 768 and 1023 px they come out beside the rail over the page (`Appear`), the first section takes focus, and Esc or a press elsewhere puts them away. Pressing the area again puts them away. Going anywhere puts them away. Overview has one section and stays a link.
- **Phone.** Pressing an area changes the list of sections inside the open drawer. The drawer closes when a section is chosen. Scripts to Dashboards is one opening.

**Tests.** `Shell.test.tsx`: the areas are buttons and the one the person is in is marked; pressing Data shows its sections with the address unchanged; one address for each kind of editor in `nav.ts` has its section as a link back, and a chevron for a phone. `e2e/redesign.spec.ts`: on a phone, Scripts to Dashboards in one opening. `e2e/dashboards.spec.ts`: inside a dashboard, the crumbs link back and the rail's areas show without leaving.

**Findings.**

- `Link` did not pass `aria-label` on, and TypeScript does not check a hyphenated attribute it does not know: the back chevron had no name until a test asked for it by name.
- The phase-18 plan said the docs' `nav aria-label="Breadcrumb"`. It is still "Where you are", which the tests and the screen-reader wording use; not changed.

## M4: dashboard widgets are placed by dragging

**Built.**

- **Manifest** (`packages/manifest/src/dashboard.ts`). A widget has `at: {x, y, w, h}` on twelve columns, as an app page's widget does. `width` is still read. `placeWidgets` gives every widget a place: its own, or one laid in rows after the placed ones, in order, by its `width` or its kind's size. `checkDashboard` refuses a place that runs past the twelfth column.
- **One placement for apps and dashboards** (`packages/screens/src/placement.ts`). The dragging, stretching and arrow keys that were written inside the app page's renderer are `usePlacement`, and `settle` takes anything with a place. The app builder uses it and its tests did not change. Both now say aloud where a thing went from the keyboard, and what a move pushes out of its way is played there by `useFlip`.
- **Console.** The dashboard is that grid where there is room and one column, top to bottom and left to right, where there is not. A widget is as tall as its place: a chart is drawn to fit it with its axes inside, and a table scrolls in it, reachable by keyboard. Changing it: drag the heading, stretch the corner, or focus the move button and use the arrows (Shift for size). Each drop is saved; ⌘Z takes the last one back. A new widget goes under the rest. The earlier and later buttons and the Width field are gone.

**Tests.** `packages/manifest/src/dashboard.test.ts` (rows from widths, a kept place, the same answer twice, past the twelfth column). `Dashboards.test.tsx` (a new widget's place, a move from the keyboard, nothing lying on anything, what is said). `e2e/dashboards.spec.ts`, "widgets are dragged into place and stretched": a dashboard written with widths is drawn as it was, a chart fits its widget, a drag by the heading, a stretch by the corner, the keyboard, and undo.

**Findings.**

- **The plan said body version 3. It is still version 2.** A place is an optional field beside the old `width`, and a widget without one is placed when it is read. So no dashboard in a database or a repository has to be rewritten, and a file may still leave places out and be laid in rows. The console writes places from the first change.
- Vega-Lite's `height` is the plot's, without its axes, so a chart given its widget's height was cut at the bottom. On the grid the chart asks to fit (`autosize: fit`, padding inside).
- A rounded corner is not hit outside its curve: the stretch handle misses in the last three pixels of the corner. The app builder has the same handle. Left as it is.
- **Not done:** undo is the last changes of layout made in this visit, kept in the page. It does not undo a widget's edited question.

## M5: tables that can be searched, and a dialog big enough for one

**Built.**

- `ReadTable` (`apps/console/src/kit/ReadTable.tsx`): every heading sorts (numbers by size; up, down, as given), a filter button brings a row of fields that narrow the rows to those containing what is typed and says how many match, and the columns dialog hides and orders columns. It works on the rows it holds.
- It draws a dashboard's table widget, the rows behind a number, the widget editor's preview and the result on Queries. While a dashboard is being changed, the columns chosen for a table widget are saved to it; otherwise they last for the visit.
- `Dialog` has a `table` size: most of the window (76rem by 84vh at most), the table filling it, the whole screen on a phone. Rows behind a number use it.
- A bar, a point or a slice of a chart opens the rows it was worked out from (`Chart`'s `onPick`). The widget's menu still has "See the rows behind it", which is the way in for a keyboard.

**Tests.** `ReadTable.test.tsx`. `enforce.test.ts`, "a table that is read has its tools, and a dialog that holds one is big enough": no bare `Grid` in a screen (`grid-allowed:` for a table's own rows), and a dialog that holds a `ReadTable` or `ResultTable` is the `table` size.

**Findings.**

- **Left out: locking the first column** in a read table. The lock belongs to the keyboard grid (`navigation="grid"`), which makes the whole table one tab stop; a table with a button in its first column, as a dashboard's has, reads better as a plain table.
- Filtering is on the rows fetched: a widget's first 2,000, the 200 behind a number. The line under a cut-short table already says there are more.

## M6: a dashboard refreshes, and says how old it is

**Built.**

- A dashboard has `refresh`: `off`, or every 1, 5, 15 or 60 minutes. Left out, 5. It is set while the dashboard is being changed.
- Each widget asks again that often (`useLoad`'s `every`). The numbers on show stay until the new ones arrive. Nothing asks again while the tab is out of view or while the dashboard is being changed.
- Under the title: "Last refreshed 07:30:12 · Refreshes every 15 minutes", and **Refresh now**. The time is the oldest of the widgets' answers, so it never claims more than the stalest number, and it is not shown until every widget has answered.

**Findings.** The server keeps no cache of a widget's answer, so a refresh is the query run again for each person looking. A dashboard of thirty widgets on a one-minute refresh is thirty queries a minute for each open tab. Nothing limits that yet beyond the statement timeout; five minutes is the default for that reason.

## M7: a figure's trend, and a change said the right way

**Built.**

- `trend: { by, bucket? }` draws how the number went as a line under it. For a question built from menus, `GET …/widgets/:id/data?part=trend` asks the same question grouped by that column: by day for a range of up to 45 days, by week up to 200, by month beyond that or with no range. For a saved query or SQL the widget's own rows are the line and the figure is the last of them.
- `Sparkline` (`packages/ui`) is drawn by hand as one SVG line, so six figures do not load six charts. Its words for a screen reader say where it began and ended and its lowest and highest.
- The change is a mark beside the number: an arrow and "18.4%". `delta: absolute` says the amount, `delta: points` the points of a rate. `goodWhen: down` makes a fall green and a rise red. `caption` is a line in the maker's own words, with `{previous}`.

**Findings.** With a caption of the maker's own, the sentence about the change would be gone for a screen reader, since the mark's "18.4%" says neither which way nor against what. It is kept inside the mark for a screen reader in that case, and said once otherwise.

## M8: what the mock-up needed, trimmed to eight options

**Built.** `subtitle` on any widget. A chart: `compare` (the period before as a dashed line on the same scale, point for point), `horizontal` bars, and the `heatmap` mark. A table: `cells` (a heading, a format, and drawn as text, a bar of its share of the column's largest, a change with its direction, or a chip) and `totals` (a last row that stays last however the table is sorted; a change or a rate is not added up). Each is offered from menus in the widget editor and checked by `checkDashboard`.

**Not built, as decided:** see the table of decisions. Against the mock-up that leaves out the red bars for old loans, the "Peak" label, the reorder marker, two-line cells, the share bar's legend of percentages, and the notes and links in a widget's corner.

**Findings.**

- A table's `cells` could not be called `columns`: a pivot already uses that for what heads its columns.
- The period before is laid over this period by position, the first point with the first. Two periods of the same length have the same number of days, but not always of weeks or months that have anything in them: a week with no loans is no row, and the two lines then slip against each other. A series with no gaps would need the server to fill empty periods. Not done.
- A heatmap of weekday by hour, as the mock-up has, needs SQL: a question built from menus groups dates by day, week, month, quarter or year, and has no "hour of the day" or "day of the week". The example's heatmap is kind by status.

## M9: the example and the guides

`examples/higher-ed-devices/platform/reports/lending.dashboard.yaml` is rebuilt with places, a refresh, three figures (two with trends, one where down is good), bars lying down, a weekly line with the period before, a heatmap, a table with a chip and a bar and totals, the pivot and the saved query. `docs/sdk-guide.md` says each option, and no longer calls a text widget a `note`, which phase 18 got wrong.

**Not done in this phase**

- The new pieces (`Sparkline`, `MoveButtons`, `ReadTable`, the `table` dialog) are not on the kit's own sheet (`screens/KitSheet.tsx`). The columns dialog there shows `MoveButtons`.
- The flow editor's test panel still appears at once (M1).
- A read table does not lock its first column (M5).
- The walk-through on the test instance.
