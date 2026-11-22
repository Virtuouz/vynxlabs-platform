# Phase 28: the final walk and the approvals walk-through (draft)

For the integrator to fold into the phase document's Findings, and then delete.
Written 2026-11-22 by the F3 agent, on branch `p28-f3`.

## What was walked

- **Instance:** a throwaway one on port 8103, with a database and bucket of its own, seeded by `examples/fernhill/setup/setup.mjs`.
- **My own copy of Clinic performance** (`screens/f3walk`, app `f3walk`) in the sandbox workspace, with four pages added:
  - "All widgets": a Button and a Pivot, the two Fernhill lacks;
  - "Long values": a title of 100 characters (the most the manifest takes; a 300-character title is refused by the server), a 300-character Text, and an invoice number of 110 characters;
  - "No rows": a table that matches nothing, and one that matches one row;
  - "Ten thousand": a table over 10,000 invoices (put in with SQL).
- **People:** `maya.brooks` (builder, tenant admin), `rowan.ellis` (practice manager, served app), `devi.shah`, `jess.morgan` (an end user).
- **Pictures:** `…/scratchpad/f3/`. Each one named below was opened and looked at beside its board.

Widths, themes and times as walked:

| What | 1440 | 1440×640 | 768 | 390 | Light | Dark |
|---|---|---|---|---|---|---|
| Builder, Money | looked at | taken, not looked at | looked at | looked at | looked at | taken (Money, Visits), not looked at |
| Builder, the other page kinds (sheet, modal) | looked at | no | taken, not looked at | taken, not looked at | looked at | no |
| Builder drawers, 15 widgets | looked at: table, chart, approvals, text, form | no | no | no | looked at | no |
| Served app, every page | looked at: Money, Visits, Stock, All widgets, Long values, No rows, Ten thousand | no | taken, not looked at | looked at: Money, Stock, Visits, All widgets | looked at | looked at: Money, Stock |
| Dashboard (view) | looked at | no | no | looked at | looked at | taken, not looked at |
| Dashboard (new, edit) | looked at | no | no | no | looked at | no |

Not looked at, so not claimed: the drawers of Stat, Goal, Pivot, List, Record detail, Button, Action group, Section, Tabs and Search and filter (taken as pictures, not opened, so their matches to boards 11 and 14 to 18 are **not checked**); the draft preview (picture taken, not opened); the draft history dialog (the menu item was found, the dialog was not opened); the confirmation preview of a button's steps (board 4: the walk's script failed to reach it); Tablet in the builder (taken, not opened); the 1440×640 builder.

## Fixed in this walk

Each is small and in the shared piece. Commits `9f19897`, `acea539` (as rebased).

1. **"Done" on a request someone else decided first** (`packages/widgets-core/views/approvals.tsx`). It went back to the top of the list with the focus lost. It now opens the next request with the focus on it, as a decision does. A unit test and the walk-through check it.
2. **Publish, with nothing drafted** (`PublishCheck.tsx`). It showed a red "A draft at screens/f3walk was not found. Publish is off until this is fixed", because it asked the server about a page that has no draft. It now says "0 changes. The app is as people see it now." and the Publish button is off.
3. **"Show this approvals"** on the Rules tab (`RulesTab.tsx`). A widget whose title is a plural is called "widget": "Show this widget". (The other places that use the title: "Show this tabs" had the same fault.)
4. **A form's Data tab offered "Add Search and filter to let people narrow this page"** (`rowsItUses.tsx`). A form only writes, so it is offered only where the widget has conditions.
5. **The selector's suggestion read "17 workflows wait for a decision"** (`selectorData.ts`) when 17 workflows had an approval step and none waited. It now says "ask for a decision".

## Per board: matches or differs

Boards 7 to 19 win over 1 to 6 where they differ.

- **Board 1 (the frame): matches.** One header row: the app's name with a pencil, the device switch, View as, undo and redo, Preview, a Publish split button. PAGES with "+" and each page's kind at the right. ON THIS PAGE with handles and type icons. "Add to page A" full width. The hint at the foot. Compact filters with the label inside. Differs:
  - the board draws "3 draft changes" as a pill by the name; the console says "Published." as plain words when there is no draft, and the topbar's "3 drafts · Review" is the workspace's, not the app's;
  - the column guides are drawn, but faint, and only show between and above widgets;
  - the board's top bar is a breadcrumb ("Sandbox DEV promotes to Clinics / App Builder / …"); the console's carries more (Paused, Live, failed runs), which is the console's own.
- **Board 2 (Add to page, page inspector): matches.** Search, suggestions as cards, widgets in two columns of categories, a preview pane with "Good for" and the keys. The page inspector has the four tiles, the menu title and the icon picker. Differs: the preview of a widget is a grey sketch, not the rendered picture the board shows for Chart; the suggestion for Money is "A section for the numbers" and "Approvals", where the board has "Invoice detail" and "Status filter" (they were already on the page).
- **Board 3 (a row opens its record): matches.** "Preview of Invoice detail for …" with "Edit layout", the record's fields, and a footer that steps ("1 of 12,772 · F3BIG-07039 ›"). "When a row is clicked", "Opens as" and "Row actions" with "Add a row action". Differs: the table's Actions tab says "Can be pressed when Status is unpaid and Status is unpaid" (the summary adds Mark paid's rule and Void's rule together, so one repeats).
- **Board 4 (a button's steps): not checked.** The walk could not reach it (the script's click on Mark paid in the Action group failed).
- **Board 5 (Add a form): differs in what it starts with.** The structure is the board's: two columns, "Create a record" and "Edit a record" cards, a table select, fields as rows with a handle and a checkbox, a live Preview, "Also adds a 'New invoice' button…", Cancel and "Create form". But every column of the table is ticked to start with (Appointment, Chased at, Paid at, Payment ref and all), where the board starts with the few a person fills in and leaves the rest unticked, and the preview is a long form with two empty "date and time" fields. The control column says "Text · required" and "Number · required", where the board says "Picker · clinics", "Money", "Choice · Unpaid by default". Fernhill's own columns are plain text here, so the picker words may be the data's, not the dialog's. The "Opens as" and "After saving" selects are below the fold at 900 high.
- **Board 6 (phone and publish): matches.** The device frame; "Phone layout is made from the desktop one. 4 widgets changed by hand"; the filters collapse to "Filters · 2"; a table shows as a list; "Ready to publish" lists the checks, the changes, "Try as Practice managers first", and Publish. Differs: the popover opens to the left of the Publish button and covers the canvas, not under it at the right edge; the "Phone" settings (Stack below, Hide, Priority, Position on desktop) were seen in Layout, not in a phone preview with a widget chosen.
- **Board 7 (the selector): matches.** Search line, suggestions, tiles in categories, the preview pane. "sign off" finds Approvals.
- **Board 8 (one drawer): matches for table and chart.** Same header, four tabs with dots, grouped rows with their values, follow chips with a dashed one, a condition as a chip.
- **Board 9 (shared tabs): matches.** Layout leaves the tabs for ⋯ › Layout (Column, Row, Width, Height; Tablet and Phone Automatic or Custom; On narrow screens; Priority). "Back to settings" at the top. Differs: Priority is an empty box, where Automatic would be clearer.
- **Boards 10 and 11 (chart): matches.** Measure, For each, Split into colours, a sentence with a small picture, Order; chart types that do not fit are greyed with what they need; Look and Over time. The Actions tab says "Show the rows behind" twice (as the step's name and its line).
- **Boards 12 and 13 (table): matches.** Columns with an eye and a handle, a click opens the column; Look; Actions with a row click, row actions, buttons above, select several rows.
- **Boards 14 to 18 (stat and goal, pivot and list, record detail and form, button and action group, section and tabs): not checked** except the Form's drawer, which **matches in shape** (fields as rows, Buttons: Submit says, After saving; the Actions tab as steps). It differs from board 16 in that a field's line says its type ("Text", "Number") and not "Required · picker", "Today by default". The Data tab's first row is labelled "It" ("It: Makes a new record").
- **Board 19 (Search and filter, Text): Text matches; Search and filter not opened.** The style tiles, a heading row, the words with "Edit on the page", Markdown. Differs: the drawer's title is "Text", where the board's is the heading ("In dollars"); the words are shown whole, where the board cuts them with "…". "Edit on the page" opens the editor (Source, Split, Preview; Insert; the toolbar) **over the top bar and the header** of the builder, not at the widget.

## Per width and theme

- **No page scrolled sideways** in the served app at 390, 768 or 1440, in either theme, on any of the seven pages, or in the dashboard. The builder did not either.
- **Served, 1440:** looked at Money, Visits, Stock, All widgets, Long values, No rows and Ten thousand. They match the earlier phases' pictures. The note on Money sits in a box two rows tall for one line of words.
- **Served, 390:** the filters collapse to "Filters · n", stats are two across, a table is a list with its row buttons, the approvals queue has the list over the request with full-width buttons, Tabs and the section fold are whole. **The Pivot is wider than its card:** the "void" and Total columns run off the right edge with no sign that it scrolls (All widgets page, picture `B-390-light-All_widgets.png`).
- **Served, dark:** Money and Stock are as light, nothing unreadable. The Visits pie has "cancelled" and "no show" in two colours near each other (phase 27's note stands).
- **Builder, 768 and 390:** the page list stacks over the canvas, so at 390 a person scrolls past thirteen pages to reach it, and the canvas is wider than the window (the third filter and the right of each widget are cut with nothing to say so). The inspector opens as "Settings" over everything with a close button, which is right. The 390 header holds the menu, the workspace, the app's name, the device switch, View as, undo, Preview and Publish on two rows.
- **Builder, dark:** taken (Money, Visits) and not looked at.

## Keyboard

- Walked: ⌘K opens the palette; `a` opens Add to page; Esc closes it; Enter on a focused widget selects it and the drawer follows; Alt+arrow moves it; Ctrl+Z undoes.
- **Tab stops:** each widget on the canvas has three or four (its card, its name, its content, its first button), and a table has one for each column heading, so a page of ten widgets is about forty stops before the inspector. Not wrong, but long.
- **F1** did not show anything that I could see.
- The approvals queue by keyboard alone is in the walk-through (`phase-28-approvals.spec.ts`): arrows through the list, Enter to the buttons, Esc out of the reason, Enter to approve, and the focus on the next row.

## States

- **Zero rows:** a table that matches nothing says "There is nothing here yet." at the top left of a tall empty card. It does not say that a filter narrowed it, or offer a way out. (The same table's "When empty" words can be set in Display; the default is generic.)
- **One row:** fine.
- **10,000 rows:** the table scrolls inside its card and offers "Show more"; the builder's sheet preview counts "1 of 12,772". **The drawer says "Rows at a time: 25, then pages", but the served table loaded 100 rows first.** `pageSize` is written and read by the drawer only; nothing uses it to limit what is read. The setting does nothing.
- **Long values:** a 100-character widget title is cut with "…" on a stat and without it on a table's heading (the text runs under the download button). A 110-character invoice number wraps in the served table, and in the builder's canvas it makes one row about twelve lines tall.
- **Slow network (Fast 3G profile, 400 ms latency, 400 kbit/s):** the served page shows the bare words "Loading…" at the top left, then the whole page at once. No layout shift (0.0005). **Not a true cold start:** the files were cached from the earlier visits, so this is a partial check. A double click on "Approve order" sent one request.
- **Back and a shared link (served):** Back steps through Money, Visits, Stock; a search typed in Visits is in the address (`?f.q="Biscuit"`) and a second person who opens the link sees it.
- **Not walked:** a person with no permission in the builder (the approvals walk-through covers a person with no approval standing, and an end user, in the app).

## Copy

Fixed above: "Show this approvals", "17 workflows wait for a decision". Left:
- "Whose" is written twice over the Approvals drawer's choice cards, and "A click opens" is offered for the Queue look, where a click opens nothing.
- The Approvals drawer lists every workflow in the workspace as a chip by its raw path when it has no title (`F3 mwrgi89s`).
- The Form drawer's first row is "It".
- The dashboard page says "Last refreshed …" with the dots left in (seen at 1440 and 390, after waiting).

## Approvals walk-through (`e2e/phase-28-approvals.spec.ts`)

13 tests, all passed on the run of 2026-11-22 (about 21 seconds), on the console's own address:
- a manager reads the queue and the request's fields; approves one (the flow's run finishes, the notice says who, the next opens with the focus on it); rejects one (the box asks why, empty is refused in the page and by the server, Esc leaves it); the Decided tab lists both; a reload keeps them;
- Devi Shah sees the requests with the buttons greyed and the reason as the buttons' description; the API says 403 and nothing changes;
- a member who may only open the app, and an end user, see nothing: no rows, no titles, and the read answers empty lists;
- two managers decide the same one: the second is told who and what ("Maya Brooks approved this a moment ago, as you meant to"), and the API says 409;
- 390 wide: no sideways scroll, the reason box whole; keyboard only; axe clean in light and dark (the queue, the reason box, Decided);
- the builder: "sign off" finds Approvals; the drawer writes the hidden field, the button's words and Ask why, and a reload keeps them.

A separate apps address is covered by `page-approvals.test.ts`, as the brief said.

## Open, ranked by how much a person would notice

1. **"Rows at a time" does nothing.** A table loads 100 rows whatever the drawer says. (`tableDrawer.tsx`, `pageSize` is not read anywhere else.)
2. **Add a form starts with every column ticked,** so a new form is long and has fields no one fills in. The board starts with the ones people fill in.
3. **The Pivot is cut off on a phone** with no sign that it scrolls.
4. **The builder at 390 and 768** stacks the page list over the canvas and cuts the canvas off at the right.
5. **The Text editor covers the builder's header** when it opens.
6. **A table that matches nothing** says only "There is nothing here yet." at the top left of a tall card.
7. **A row action's rule is said twice** in the table's Actions summary ("Status is unpaid and Status is unpaid").
8. **Many tab stops per widget** on the canvas.
9. **Small copy:** "Whose" twice, "A click opens" under Queue, "It", "Last refreshed …", raw flow paths as chips, a long table title cut without "…".
10. **Not looked at** (above): ten drawers, board 4, draft preview, draft history, 1440×640, the builder in dark.
