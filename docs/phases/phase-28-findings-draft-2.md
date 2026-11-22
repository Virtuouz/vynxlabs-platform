# Phase 28: the second walk (draft)

For the integrator to fold into the phase document's Findings, and then delete.
Written 2026-11-22 by the J3 agent, on branch `p28-j3`. No product code was changed.

This walk looks at what `phase-28-findings-draft.md` (F3) did not. Each line says what was opened. What is not listed as opened is not claimed.

## What was walked

- **Instance:** a throwaway one on port 8106, database `walkj3`, seeded by `examples/fernhill/setup/setup.mjs`.
- **My own copy of Clinic performance** (`screens/j3walk`, app `j3walk`) in the sandbox workspace, with F3's four extra pages (All widgets, Long values, No rows, Ten thousand). The ten-thousand-row insert failed, so that page has about 2,750 invoices, not 10,000.
- **People:** `maya.brooks` (builder), `rowan.ellis`, `devi.shah`, `amara.okafor` (viewer). `jess.morgan` was not reached.
- **Pictures:** `/tmp/claude-1000/-home-gplascencia-repos-vynxlabs-platform/245bb64d-bb75-475b-b0b0-52fadfa941d4/scratchpad/j3/`. Boards: `.../scratchpad/boards2/board-N.png`. Below, `j3/` means the first folder.
- **My script's mistake, not the product's:** my click on a "Goal" row hit the "Goal month" follow chip and switched it off, so the Goal tile reads $360,674.11 (180.3%) in later pictures where the first ones read $135,253.11 (67.6%).

## Differences, ranked by how much a person would notice

`j3/` is the scratchpad folder named above.

1. **A viewer sees a builder that looks editable, and its widgets say a garbled sentence.** `amara.okafor` (console viewer) opens the builder and every control is on: Publish, Preview, Add to page, Rename, Restore an earlier draft (`j3/V-amara.okafor-builder.png`). Every widget on the canvas is replaced by "You may not see this. This needs the to edit this page, in a dev workspace, which a draft is read or run by permission." The sentence is broken ("needs the to edit"), and the stats' cards cut it off. Nothing says "read only". The first edit (rename) is applied on screen and then a raw red line appears in the header: "Not saved: This needs the resource:write permission. Request ID 01a20281-…" (`j3/V2-rename.png`). The server is right: the viewer's DELETE of the draft answered 403, and a reload shows the old name. Repro: sign in as amara.okafor, open Build, the Clinic performance copy, rename the app. Not checked: the viewer in Preview, and in history beyond the list opening (it lists Maya's saves).
2. **The builder canvas paints a Tabs widget over a Section's stats** (`j3/FR-dark-1440x900-Visits.png`). On Visits with the inspector open, the canvas is about 710 px wide, so the four stats of "At the clinics" wrap to two rows. The Section does not grow, so the Tabs strip and the pie chart are drawn over "In the clinic" and "Done". The served app at 1440 (`j3/S-rowan-1440-dark-Visits.png`) shows one row and nothing wrong. A person editing sees a page that is not the page they publish.
3. **Cold start on a slow network is a blank screen.** New context, cache off, 500 kbit/s and 2 s latency, after signing in (`j3/SL-app-12s.png`): the served app is a blank dark page for about 18 s, then "Loading…", then the page at 20 s. The builder shows the console frame at 17 s and a blank canvas until 33 s (`j3/SL-builder-23s.png`), with no skeleton or words. F3's slow test used cached files; this one did not.
4. **Board 4's "What people will see · Step 1" is not built.** Mark paid's row action (Money, Invoices, Actions, Mark paid) opens a popover with the steps, and clicking "Ask to confirm" only shows a close button (`j3/B4-step1.png`). Nothing is drawn over the canvas and "Written from the steps" is nowhere on the page. The step reads "Mark as paid?" with no field token ("Mark [Number] as paid?"), and the steps sit in a popover, not in the inspector as board 4 draws them (`j3/B4-markpaid.png`, `board-4.png`). The Button widget's own Actions tab (`j3/DR-dark-button.png`) shows steps as cards with a repeated title and line, not one line per step.
5. **The builder at 1024 cuts the canvas at its right edge with no sign it scrolls** (`j3/FR-dark-1024x768-Money.png`). The third stat ends mid-letter ("Ave") and the filter bar is cut. I measured the scroll area: 416 px wide, 736 px of content. Repeats F3's item 4 (768 and 390). The top bar there also shortens "Sandbox" to "S" and "App Builder" to "A".
6. **Phone preview, a selected widget:** the size chip "3 × 3 · col 1 · row 5" is drawn over the next widget's title ("Average invoice", `j3/H2-phone-select.png`). On the desktop canvas the chip wraps to two lines on narrow widgets ("3 × 3 · col 10 ·" then "row 6", `j3/ED-dark-goal.png`; "3 × 2 · col 1 · row" then "1", `j3/ED-dark-button.png`) and covers the widget's last line. The board draws it on one line.
7. **Forced colors (Windows high contrast) lose what is selected.** In the builder (`j3/M-forced-builder.png`) the selected page "Money", the chosen device "Desktop", the active tab "Display" and the chosen page type "Page" look the same as their neighbours. In the served app (`j3/M-forced-app.png`) every page tab has an underline, so the current page cannot be told. Nothing is unreadable.
8. **Zoom 200 % (720 CSS px) on the builder:** the pinned "Add to page" button sits over the page list and hides "Reorder stock" and the rows below it (`j3/M-zoom200-builder.png`). No sideways scroll at 720 in the builder or the app (measured 720/720).
9. **At 1440×640 the outline is out of sight** (`j3/FR-dark-1440x640-Money.png`). The page list fills the left pane, "Add to page" sits under it, and "ON THIS PAGE" starts at y 587. The pane scrolls (531 px shown of 940) but nothing says so, and the hint at the foot is cut.
10. **Row click sheet preview (board 3):** the title is cut ("Preview of Invoice detail for INV-9…") because "Edit layout" takes the room; the sheet is about 415 px wide and 720 px tall; it previews the first row (INV-9001), not a clicked one (`j3/B3-table-actions.png`). The inspector does match board 13 (Do and Opens as as two rows, row actions, buttons above the table, select rows).
11. **A row action's rule is said twice** in the table's Actions note: "Can be pressed when Status is unpaid and Status is unpaid" (`j3/B3-table-actions-side.png`). Repeats F3's item 7. Void says "Only when Status is unpaid" where the board says "Asks to confirm".
12. **The served sheet's stepper says "3 of 100"** for an invoice table of about 2,750 rows (`j3/SH-390-sheet.png`). It counts what was loaded. Same root as F3's item 1 (the table loads 100 rows).
13. **Button and Action group drawers have fewer tabs than board 17** (Button: Display, Actions, Rules; Action group: Display, Rules; the board draws four with Data greyed). Each step's title is repeated as its line ("Close / Close", "Show the rows behind" twice).
14. **Record detail and Form name the same column differently.** "Total" is "Text" in Record detail's Fields and "Number" in Form's (`j3/DR-dark-detail.png`, `-form.png`). The boards show "Money", "Picker", "Date" and "Required · picker". Form's first row is still "It", and the chosen "Makes a new record" is a lighter block, not a clearly chosen option.
15. **Restoring a draft says only "Saved. Not published yet."** There is no "Restored" notice (`j3/HI-restored.png`). Restore and Undo both worked: the name went from "Walk J3 c" to "Walk J3 b" and back, and a reload kept it. The dialog's lists read "Changed goal This month on Money" (the name is not quoted).
16. **Goal's drawer:** board 14 draws Preview, Progress (Value, Goal, Over), Look in the Data tab. The console puts "Rows it uses" before Progress and moves Look to Display. Goal shows $200,000.00 where the board shows $200,000.
17. **Pivot Display:** "Shade cells by size" is off, but the preview on the Data tab is shaded (`j3/DR-dark-pivot.png`).
18. **Small copy and drawing:** List's click row says "Open The visit chosen" (capital T); the sample row's slot names are in the monospace face; Text's Note tile has a blue stripe where board 19 draws none; the outline of a side sheet lists "Action group" but not the buttons under it (board 4 does, `j3/B4c-detail-page.png`); the dashboard page says "A dashboard the workspace keeps, at boards/clinic-visits. It is changed where resources are, and reaches production by promotion." to a person who only wants to read it (`j3/Z-view-1440-dark.png`), with "Last refreshed …" still (F3's note).
19. **Extras the boards do not draw** (left): "Where each one goes" and "More display options" on Stat, List and Goal; "Starts folded" on Section; "Offer Clear" on Search and filter; a nine-position grid on Button and Action group; a Record header group on Record detail; Rules tabs that show "Can be pressed when" and "Who can run it" on a Stat, a List and a Form.

Repeats of F3's list (no new cause found): the Pivot is cut at 390 in the served app (`j3/S-rowan-390-dark-All_widgets.png`, the "To…" column); the table loads 100 rows whatever "Rows at a time" says; "Last refreshed …".

## Matches (opened)

- **Stat (board 14):** header, four tabs with dots, follow chips with a dashed one, the condition chip, Compare as one switch with Show change as and Going up is, the preview above.
- **Section, Search and filter, Text (boards 18, 19):** Holds, Look, Plain or Card, filters each with a line of what it does, Filters sit, Text styles and "Edit on the page".
- **Button style tiles (board 17):** Main, Normal, Quiet and Danger as the board draws them, the chosen one outlined.
- **Table Actions (board 13)**, as item 10 says.
- **Publish popover (board 6):** the checks, the changes, "Try as Practice managers first", "Publish 1 change".
- **Served sheet and modal at 390, reload, Back, shared link:** all work (walk table).

## Walk table

| Item | Picture(s) | Result |
|---|---|---|
| Drawers at 1440 dark: Stat, Goal, Pivot, List, Record detail, Form, Button, Action group, Section, Search and filter, Text (every tab) | `j3/DR-dark-stat.png`, `-goal`, `-pivot`, `-list`, `-detail`, `-form`, `-button`, `-actions`, `-section`, `-filter`, `-text` beside `board-14.png` to `board-19.png` | Opened and compared. Match in shape; differences are items 4, 13, 14, 16, 17, 18, 19. |
| Drawer of Tabs | `j3/DR-dark-tabs.png` | **Not opened.** My script picked the Stat called "Visits". Not claimed. |
| One editor open in each | `j3/ED-dark-stat.png`, `-pivot`, `-button` | Stat, Pivot (a Columns picker that sits over the device switch) and Button ("The button says") editors opened. Goal, Action group and Filter: the picture shows no editor. List, Record detail, Form, Section, Tabs: no editor opened. **Not claimed.** |
| One light pass of the drawers | none | **Not done.** |
| Board 3, row click sheet preview | `j3/B3-table-actions.png` | Opened; item 10. |
| Board 4, confirm preview | `j3/B4-markpaid.png`, `j3/B4-step1.png` | Opened; **absent**, item 4. |
| Board 9, steps and Rules | `j3/DR-dark-stat.png`, `j3/DR-dark-button.png` (Actions and Rules tabs) | Steps and Rules opened. **Layout (⋯ then Layout) not opened.** |
| Draft history (list, preview, restore) | `j3/HI-list.png`, `j3/HI-preview.png`, `j3/HI-restored.png` | Opened; works; item 15. Keyboard not tried. |
| Draft preview page | `j3/H3-preview.png` | Opened. It opens in a new tab with "Preview of the draft", a device switch and Close. No fault seen at 1440 dark. |
| View as with each group | `j3/VA-money-Front_desk.png`, `j3/VA-stock-hilltop.png` (Billing, Practice managers, Front desk and hilltop taken for Money and Stock; two opened) | Banner "Rows are yours: View as shows what hilltop sees of the page, not their rows." The sandbox copy has no group rules, so every group sees the same page; **a widget hidden for a group was not tested.** |
| Publish popover | `j3/H-m-publish.png` | Opened. Opens under the button, over the canvas and the inspector. Content matches board 6. |
| Tablet with a drag | none | **Not walked.** The Tablet and Phone switches were clicked; `j3/H2-tablet.png` taken, not opened; `j3/H2-phone-select.png` opened (item 6). |
| Sheets and modals sized by handle and keyboard | `j3/B4c-detail-page.png` | Only the sheet page opened (a size select "Large" and a handle at the right edge). **Handle and keyboard not walked.** |
| Builder dark 1440×900 | `j3/FR-dark-1440x900-Money.png`, `-Visits.png` | Opened. Other pages taken (`-Stock`, `-Invoice_detail`, `-New_invoice`, `-Reorder_stock`, `-All_widgets`), not opened. |
| Builder dark 1440×640 | `j3/FR-dark-1440x640-Money.png` | Opened; item 9. |
| Builder dark 1024×768 | `j3/FR-dark-1024x768-Money.png` | Opened; item 5. |
| Folded panes | none | **Not walked.** |
| Page inspectors (page, record page, sheet, modal) | `j3/FR-dark-1440x900-Money.png` (page), `j3/B4c-detail-page.png` (sheet) | Page and side sheet opened; record page and modal not. The page shows four type tiles, "Title in the app menu", Icon and Help; the sheet shows Title and Size. |
| Dashboards in dark, edit and view; a member's own | `j3/Z-view-1440-dark.png`, `j3/Z-view-390-dark.png` | View opened at 1440 and 390; 768 taken (`j3/Z-view-768-dark.png`), not opened. **Edit not reached** (the dashboard is kept by the workspace and offers no Edit); a member's own dashboard not made. |
| Served app dark, 1440 | `j3/S-rowan-1440-dark-Visits.png` | Visits opened; no fault. The other six pages are `j3/S-rowan-1440-dark-*.png`, not opened. |
| Served app dark, 768 and 390 | `j3/S-rowan-768-dark-Visits.png`, `j3/S-rowan-390-dark-Visits.png`, `-All_widgets.png` | Opened. No sideways scroll on any page at 390 or 768 (measured). At 390 the page tabs show four of seven and scroll with no sign. Light not done. |
| Served sheet and modal at 390, reload, Back, shared link | `j3/SH-390-sheet.png`, `j3/SH-390-modal.png`, `j3/SH-390-modal-shared.png` | Opened. The sheet is full screen (`?sheet=invoice&record=…`); a reload keeps it; Back closes it; a second person (Devi Shah) who opens the address gets the same record. The modal (`?modal=reorder-stock`) behaves the same. Forms and 768 not walked. |
| A person with no permission | `j3/V-amara.okafor-builder.png`, `j3/V2-rename.png`, `j3/S-amara-1440-dark-Stock.png`, `j3/S-devi-1440-dark-Stock.png` | Viewer in the builder: item 1. Publish is on until the first failed save and off after it; Preview not walked. Amara and Devi in the served app see Stock with an empty approvals card about 450 px tall for one line. "Someone outside every group" not separate from Amara; the end user (jess.morgan) timed out on the page tabs in my script, **not walked**. |
| Slow network | `j3/SL-app-12s.png`, `j3/SL-builder-23s.png` | Opened; item 3. |
| Zoom 200 %, reduced motion, forced colors | `j3/M-zoom200-builder.png`, `j3/M-forced-builder.png`, `j3/M-forced-app.png` | Zoom (builder) and forced colors (both) opened: items 7, 8. Reduced motion: `j3/M-reduced-*.png` taken, **not opened**. `j3/M-zoom200-app.png` taken, not opened. |
| The five acceptance walk-throughs by hand | none | **Not walked by hand in this pass.** Only approvals has a run on file (F3's e2e). What I touched of the others: invoices (the sheet, Mark paid's steps, item 4) and the analytics dashboard (view only). Not claimed. |
