# Phase 28: the third walk (draft)

For the integrator to fold into the phase document's Findings, and then delete.
Written 2026-11-22 by the N1 agent, on branch `p28-n1` (from `phase-28-the-boards` at 912f161, after the canvas fix).

Pictures are in `/tmp/claude-1000/-home-gplascencia-repos-vynxlabs-platform/245bb64d-bb75-475b-b0b0-52fadfa941d4/scratchpad/n1/` (`n1/` below). Instance: port 8110, database `walkn1`, seeded by `setup.mjs`, rebuilt after the coordinator's canvas fix. What is not listed as opened is not claimed.

## Fixed in this walk (each with its check; commits on `p28-n1`)

1. **The columns a table, list or record draws when none are chosen** (`packages/widgets-core/views/cells.tsx`, `defaultColumns`). They came in the table's alphabetical order, so a new Invoices table began with "Appointment", the record sheet's title was the appointment code `C-1001` instead of `INV-9001`, and the starter Appointments table cut off Starts at and Status. The column that names a row (name, title, number, code), then status and the date, now come first. The table's Display list and its "n of n shown" count list what the page draws (they listed Id, Created at and Updated at, "14 of 14 shown"). Unit test `apps/console/src/default-columns.test.ts`; seen on the rebuilt instance (`n1/v1-columns.png`).
2. **A dialog opened by keyboard put the focus on Close**, so a person who opened "Make an app", typed a name and pressed Enter closed it and lost the name (`packages/ui/src/Dialog.tsx`). A dialog that has a field to type in now opens with the focus in the first one. Unit tests in `dialogFocus.test.tsx`. Every dialog uses it (a list of the others is not made: any dialog with a text field changes; one with none keeps Close).
3. **A record detail with no record** said "Nothing is open." to Jess Morgan at the pet owners' portal. It says "There is nothing here for you yet."
4. **"Last refreshed03:41:02"** on a dashboard: the space is back (`Dashboards.tsx`).
5. **The Button drawer carried the board's annotation as copy**: "Actions and Rules: the shared tabs." is gone.
6. **"1 more columns are hidden"** (record fields list): "1 more column is hidden" (`fieldsList.tsx`, test updated).
7. **The action group's Data tab said "What it does is on the Actions tab"**, a tab it has none of; it points at each button's own Actions tab.

## The five journeys (from an empty new app in Sandbox, no code)

Steps are counted from "Make an app" to the thing used.

### 1. Invoices: works, with stumbles

Built: list, detail sheet, edit in place (not walked in the served app: see below), create, row action for Billing and Practice managers, published, used.

- A new app opens on an empty page that offers only "Add to page". The starter that does most of it in one step ("A list of Invoices: a search, the table, a side sheet that shows a row, and a button that adds one") is only in "Add a page", so a person starting from the empty page builds it in about 22 steps (add table, source, hide 7 columns, Money, row click, row action, steps, group, form, publish) where the starter takes 4. (`n1/t4-new-app.png`, `n1/a2-addpage.png`.) Ranked 2 below.
- First table: alphabetical columns with Id, Created at and Updated at in the Display list (fixed, 1). The Total is plain "6,500", not money; the Display tab has Money and "Stored in cents", but nothing says the column is in cents, and the Form beside it says "What is owed, in cents" and refuses "123.45" ("Enter a whole number.", `n1/u2-created.png`). The table's Money format with "Stored in cents" off draws $6,500.00 for a 65.00 invoice: a person cannot tell which is right. Ranked 3.
- The row click made "Invoice detail" with the right sheet; the sheet's title was `C-1001` (fixed, 1); its Total is "6,500" where the table says "$6,500.00" (the detail does not carry the table's format). Ranked 5.
- Row action "Mark paid": add a step, "Update the record", "Set another field", Status, "becomes", type `paid`; the chip then reads "Paid" (the stored value is `paid`; a reader may think it is "Paid"). Group: Billing and Practice managers by a checkbox list. All of it works first time (`n1/i11-group.png`, `n1/i12-form.png`).
- Publish: the check's three passes and six changes read well; "Try as Billing first" is offered (`n1/i13-publish.png`).
- Used as Rowan Ellis (a Practice manager and in Billing): Mark paid works and the row turns "paid" (`n1/u2-markpaid.png`). As Amara Okafor (outside both groups): the button is there and greyed, with no reason (`n1/u1-amara.okafor-hover.png`; `disabled`, no title). Ranked 6.
- **Row actions are on hover only, and the detail sheet has none** in the served app, although the drawer says "Shown at the end of the row on hover, and in the detail sheet" (`n1/u1-rowan.ellis-sheet.png`: no Mark paid in the sheet). At 390 the list shows "Mark paid" on every row, paid ones too (`n1/u3-390-light.png`), because nothing makes it "only when unpaid". Ranked 4.
- The served table is a fixed 12 x 8 box: seven rows and a cut sixth line, then 450 px of empty page (`n1/i14-rowan.ellis.png`). Ranked 7.
- The form modal is about 600 px tall for a form 330 px tall (`n1/u2-created.png`).
- The builder at 1440 now fits beside the settings (the coordinator's fix; `n1/i7-do.png`).
- When a row action is open the sheet preview and the confirm preview are both drawn over the table (`n1/a6-confirm.png`), so the table being edited is covered.

### 2. Appointments: works, except "by day"

The "A list of Appointments" starter gives a search, a table, a sheet and a New appointment button at once (`n1/a3-schedule.png`). Check in (Update, "Checked in at" becomes "Now") and Cancel (Ask to confirm, then Status becomes) were built in about 14 steps; published; as Rowan: the search finds the pet by name and the address carries it (`?f.search_appointments=%22Pepper%22`), Check in set the time (`n1/a8-search.png`), Cancel asked "Are you sure?".

- **A calendar-like list by day cannot be built.** List and Table have no grouping by a date (the List's Display has slots and Rows: List or Cards; the Table's has none). The nearest, a Pivot or Chart by day, is not a list of visits. Ranked 1.
- The confirm dialog for an action called "Cancel" has two buttons, "Cancel" and "Confirm", and the body only "Are you sure?" with nothing named (`n1/a8-cancel-confirm.png`). A person cannot tell "Cancel" the appointment from "Cancel" the dialog. Ranked 8.
- A new List over Appointments draws only the first column (a timestamp, one row blank) and its drawer says "None" for every slot; Publish passed ("Added list") with nothing placed (`n1/a1-list-display.png`, `n1/a7-rowan.png`). Ranked 9.
- "Check in" stays on a row already checked in.

### 3. Approvals: works

An Approvals widget needs no setting: "Reorder inventory/reorder" is chosen and "Theirs to decide" is on (`n1/p1-approvals.png`). Published; Rowan saw one waiting request, opened it (a side sheet with the facts, Approve and Reject, "1 of 1"), approved it: "Approved "Approve a stock order" as Rowan Ellis." and "Nothing waits for you." (`n1/p4-rowan-open.png`). Amara (who may not decide) sees "Nothing waits for you." with no hint that this is because she cannot decide. Raw `inventory/reorder` is drawn in the workflow chip. A request had to be started by an API call; there is no way to start one from the console in the walk (the flow takes a row id).

### 4. The pet owners' portal: works

George Lewis (a pet owner) at 390, light: signs in at `/portal/fernhill/`, opens "My Fernhill account", sees his details, with three tabs and no sideways scroll (`n1/j1-george-app.png`). Jess Morgan (front desk, an end user without a client record) sees the portal list with "Front desk", the handbook and the account, and "Nothing is open." in Your details (fixed, 3; `n1/j1-jess-app.png`). Pets, invoices and the visit request were not walked here (the e2e has them).

### 5. An analytics dashboard: partly walked

Dashboards are under **Data**, apps under **Build**; a person looking for "dashboard" under Build does not find it (`n1/d1-dashboards.png`). "New dashboard" asks only for a name and opens the editor (canvas fits at 1440, `n1/d2-made.png`). A Chart added over Invoices draws one bar (weekly by "Created at": all rows were made on one day, `n1/d3-chart.png`). Share has "Show it to everyone in this workspace" and a group field; the dashboard opens in view mode with Share and Edit (`n1/d4-share.png`). **Not walked:** the Stat's source (my script failed on it), a measure of Sum of Total for each clinic, the date filter, and a member who is shared with. Not claimed.

## Drawers (B)

Opened at 1440 dark, each tab, one picture per tab combined by widget (`n1/dr/mont-dark-<Widget>.png`; the montage lists Actions, Data, Display, Rules in file order): Table, List, Record detail, Stat, Chart, Pivot, Goal, Button, Action group, Approvals, Section, Tabs, Search and filter, Text (only its Rules tab: the Content tab was missed by my script, so Text's Content tab is **not opened**). Compared with boards: 8, 10, 11 (chart) match closely (`mont-dark-Chart.png` beside `board-11.png`: the same questions, greyed types with reasons, Look and Over time); 14 (Stat), 15 (Pivot), 16 (Record detail), 17 (Button), 18 (Tabs) and 19 (Search and filter) match in shape. Differences found:

- **Tabs (never walked before): matches board 18** in order and copy (First, Second, "Opens first", + Tab, Style Underline/Pills, "Remember the last tab"); the icon is a window where the board draws a folder.
- Pivot: a new one reads "Choose rows and columns to see the grid." where board 15 draws a shaded preview; "Shade cells by size" starts off (the board draws it on).
- List: slots all "None" (board 15 draws a sample row with Title, Under the title, Right, Badge filled); Actions says "Add an action" in a card where the Table's says "Row action" with a "+" chip: two equivalent screens differ.
- Record detail on a plain page: none of "Shows" is selected (the first is greyed); "Total" is "Number" in its Fields where the board draws Money.
- Goal: Rows it uses sits under Look; the board has Preview, Progress, Look.
- Button: the Data tab is a sentence; the board draws it greyed. An extra nine-position grid ("Where the button sits when its cell is bigger than it").
- Search and filter: a new one says "Looks in Client code, Clinic, Number, Payment r…" (cut mid-word).
- Not done: a light pass of the drawers, and the drawers at 768 and 390. The builder at 768 and 390 was looked at on the Money-like page (below).
- Form drawer, Layout (⋯, Layout) beside board 9: **not opened**.

## C. Not yet walked: what was and was not done

| Item | Done | Result |
|---|---|---|
| Tabs drawer | yes | matches board 18 |
| Layout beside board 9 | no | |
| Tablet with a drag | no | |
| Sheet and modal sizes by handle and keyboard | no | |
| Folded panes | no | |
| Record-page and modal inspectors | no | |
| Dashboard edit and a member's own, three widths | 1440 dark only; view and Share opened | see journey 5 |
| Served app in light at 768 and 390 with every sheet, modal and form | 390 light: list, sheet; 390 form taken, not opened | see journey 1 |
| The end user | yes (George at 390 light, Jess) | journey 4 |
| A widget hidden from a group under View as | no | |
| Reduced motion, 200 % zoom, forced colors | no | |
| A cold slow network | no | |
| Draft preview at 768 and 390 | 390 light opened, 768 dark taken (`n1/w1-preview-768-dark.png`) not opened | 390: "Preview of the draft · Sandbox. Actions change Sandbox's rows.", the page as a phone sees it, no sideways scroll |
| A person with no permission at all | Amara at the served apps only | she sees the pages and greyed buttons |
| Markdown components in Text | no | |
| Builder at 768 and 390 | opened | at 768 the table runs past the right edge ("New invoice" cut) with no hint; at 390 the hint "Wider than this window: scroll sideways to see all of it." shows (`n1/w1-builder-768-dark.png`, `n1/w1-builder-390-light.png`); top bar names truncated ("Sandb…", "screens/invoices-…") |

## D. Keyboard only, one journey: partly walked

Walked by Tab, Enter, arrows and typing, counting presses (about 160 for what follows): Make an app (2 Tabs to the button, Enter, **then focus was on Close and the name typed went nowhere: fixed, 2**), the builder, "a" opens "Add to page", typing "table" and Enter places a Table; **focus then lands on "Rename the app" in the header** (the new widget and its settings are 18 Tabs away); the Source row opens a popover whose focus starts on Close, whose list is one unnamed input (a radio group: arrow keys choose, and choosing applies at once; typing a name does nothing; Enter closes with nothing chosen), and Tab leaves the popover for the page ("Skip to content"), so it is not a focus trap. The settings tabs are one stop with arrow keys. **Not walked by keyboard:** setting a column, a row action with a confirm, Preview, Publish. The journey was not finished; the phase is not shown as keyboard-clean.

## Ranked list of what is left

1. **A calendar-like list by day cannot be built** (journey 2). Needs a "Group by" on List and Table for a date column (by day, week, month), with its heading rows. A feature, not a polish.
2. **An empty new app does not offer the table starters** ("A list of Invoices"), which build the journey in 4 steps instead of about 22. Put the same choice on the empty page ("Start from a table") and say it in "Nothing on this page yet".
3. **Money and cents.** A column holding cents draws and edits as plain numbers; the Form says "in cents" and refuses 123.45. The table, detail and form should take the column's unit from the table once, and the form should take dollars when the column is Money.
4. **Row actions are reachable only by hover**, and the detail sheet shows none although the drawer promises it; on a phone every row shows every action, even "Mark paid" on a paid invoice. Offer the actions in the sheet and set "only when" by the status when the action is made ("Mark paid" for unpaid).
5. The auto-made detail does not carry the table's formats (Total "6,500").
6. A button greyed because the person is outside the group has no reason ("Only Billing and Practice managers can do this").
7. The served table is a fixed 12 x 8 box with a cut line and 450 px of empty page below.
8. A confirm for "Cancel" says "Are you sure?" with "Cancel" and "Confirm" buttons: name the thing, and call the dismiss "Keep it" or "Go back".
9. A List with nothing placed publishes with a passing check and shows one raw column (the drawer says None); a new List should place a title, a line under it and a badge from the table.
10. After placing a widget by keyboard the focus goes to "Rename the app"; the Source popover is not a focus trap and its input is unnamed.
11. Dashboards live under Data, apps under Build.
12. The builder at 768 lets the canvas run past the edge without a hint (390 has the hint).
13. Small copy: "Reorder inventory/reorder" (a raw path in a workflow chip), "Query: reports/visits-by-clinic", "Nothing on this page yet" on a dashboard, the stored `paid` shown as "Paid", "Action" as the first row action's name ("What Action does"), "Check in" left on a checked-in row.
14. Items the earlier drafts list that this walk did not re-measure: the builder's top-bar names at 768, forced colors, zoom 200 %, the cold slow network.
