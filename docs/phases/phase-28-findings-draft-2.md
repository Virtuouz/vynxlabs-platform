# Phase 28: the second walk (draft)

For the integrator to fold into the phase document's Findings, and then delete.
Written 2026-11-22 by the J3 agent, on branch `p28-j3`. No product code was changed.

This walk looks at what `phase-28-findings-draft.md` (F3) did not. Each line says what was opened. What is not listed as opened is not claimed.

## What was walked

- **Instance:** a throwaway one on port 8106, database `walkj3`, seeded by `examples/fernhill/setup/setup.mjs`.
- **My own copy of Clinic performance** (`screens/j3walk`, app `j3walk`) in the sandbox workspace, with F3's four extra pages (All widgets, Long values, No rows, Ten thousand). The ten-thousand-row insert failed, so that page has about 2,750 invoices, not 10,000.
- **People used so far:** `maya.brooks` (builder), `rowan.ellis` (served app).
- **Pictures:** `/tmp/claude-1000/-home-gplascencia-repos-vynxlabs-platform/245bb64d-bb75-475b-b0b0-52fadfa941d4/scratchpad/j3/`. Boards: `.../scratchpad/boards2/board-N.png`. Below, `j3/` means the first folder.
- **My script's mistake, not the product's:** my click on a "Goal" row hit the "Goal month" follow chip and switched it off, so the Goal tile reads $360,674.11 (180.3%) in later pictures where the first ones read $135,253.11 (67.6%).

## Walk table (so far)

| Item | Picture(s) | Result |
|---|---|---|
| Drawers at 1440 dark: Stat, Goal, Pivot, List, Record detail, Form, Button, Action group, Section, Search and filter, Text (every tab) | `j3/DR-dark-stat.png`, `-goal`, `-pivot`, `-list`, `-detail`, `-form`, `-button`, `-actions`, `-section`, `-filter`, `-text` | Opened and compared to boards 14 to 19. Matches in shape; differences below. |
| Drawer of Tabs | `j3/DR-dark-tabs.png` | **Not opened.** My script picked the Stat called "Visits", so that picture is the Stat's. Not claimed. |
| One editor open in each | `j3/ED-dark-stat.png`, `-goal`, `-pivot`, `-button`, `-actions`, `-tabs` (it shows the Table in the tabs), `-filter` | Stat, Pivot and Button editors opened. Goal, Actions and Filter pictures opened, but no editor showed in Goal's and Filter's. List, Record detail and Form: no row was clicked (script found none). **Not claimed.** |
| One light pass of the drawers | none | **Not done yet.** |
| Board 3, row click sheet preview | `j3/B3-table-actions.png`, beside `board-3.png` and `board-13.png` | Opened. Differences below. |
| Board 4, confirm preview | `j3/B4-markpaid.png`, `j3/B4-step1.png` | Opened. **Not there** (below). |
| Board 9, steps, Rules, Layout | `j3/B4-markpaid.png`, `j3/B4c-*` | Steps and Rules tab opened on the Stat and Button; Layout not yet. |
| Builder dark 1440x900 | `j3/FR-dark-1440x900-Money.png`, `-Visits.png` (others taken, not opened) | Opened Money and Visits. |
| Builder dark 1440x640 | `j3/FR-dark-1440x640-Money.png` | Opened. |
| Builder dark 1024x768 | `j3/FR-dark-1024x768-Money.png` | Opened. |
| Served app dark 1440, rowan, Visits | `j3/S-rowan-1440-dark-Visits.png` | Opened. The other six pages were taken, not opened. |

## Differences, ranked by how much a person would notice

1. **The builder's canvas paints a Tabs widget over a Section's stats** (`j3/FR-dark-1440x900-Visits.png`). On Visits, with the inspector open, the canvas is about 710 px wide, so the four stats of "At the clinics" wrap to two rows. The Section does not grow, so the Tabs strip "Visits / By status / By reason / Every visit" and the pie chart are drawn on top of "In the clinic" and "Done". The served app at 1440 (`j3/S-rowan-1440-dark-Visits.png`) puts the stats in one row and shows nothing wrong. A person editing sees a page that is not the page they will publish. Repro: open Visits in the builder at 1440, select nothing.
2. **Board 4's "What people will see · Step 1" is not built.** Mark paid's row action (Money, Invoices table, Actions, Mark paid) opens a popover with the steps, and clicking "Ask to confirm" only shows a close button (`j3/B4-step1.png`). Nothing is drawn over the canvas, and the text "Written from the steps" is nowhere on the page. The step reads "Mark as paid?" with no field token ("Mark [Number] as paid?"), and the steps sit in a popover, not in the inspector as the board draws them (`j3/B4-markpaid.png`, `board-4.png`).
3. **The builder at 1024 cuts the canvas at its right edge with no sign it scrolls** (`j3/FR-dark-1024x768-Money.png`). The third stat ends mid-letter ("Ave"), and the filter bar is cut. I measured the scroll area: 416 px wide, 736 px of content. This repeats F3's item 4 (768 and 390) at 1024. The top bar there also shortens "Sandbox" to "S" and "App Builder" to "A".
4. **The size chip of a selected widget wraps to two lines** on narrow widgets ("3 × 3 · col 10 ·" then "row 6", `j3/ED-dark-goal.png`; "3 × 2 · col 1 · row" then "1", `j3/ED-dark-button.png`), and it covers the widget's last line ("of a $200,000 goal"). The board draws it on one line.
5. **At 1440x640 the outline is out of sight** (`j3/FR-dark-1440x640-Money.png`). The page list takes the left pane, "Add to page" sits under it, and "ON THIS PAGE" starts at y 587. The pane scrolls (531 px shown of 940), but nothing says so, and the hint is cut at the foot.
6. **Row click sheet preview (board 3):** the title is cut ("Preview of Invoice detail for INV-9…") because "Edit layout" takes the room; the sheet is about 415 px wide and 720 px tall, where the board's is taller and spans the canvas; it previews the first row (INV-9001), not a clicked one (`j3/B3-table-actions.png`). The inspector does match board 13 (Do and Opens as as two rows, row actions, buttons above, select rows).
7. **A row action's rule is said twice** in the table's Actions note: "Can be pressed when Status is unpaid and Status is unpaid" (`j3/B3-table-actions-side.png`). Repeats F3 item 7. The board's second row action says "Asks to confirm" where the console says "Only when Status is unpaid" for Void too.
8. **Button and Action group drawers have fewer tabs than the board.** Button shows Display, Actions, Rules and Action group shows Display, Rules, where boards 17 draw all four (Data greyed). Button's Actions steps are expanded cards ("Show a message" with "Show 'Hello'" under it), where board 17 shows one line per step with a number and a chevron (`j3/DR-dark-button.png`, `board-17.png`). Each step's title is repeated as its line ("Close / Close", "Show the rows behind" twice). Repeats F3's board 10 and 11 note.
9. **Record detail and Form name the same column differently.** "Total" is "Text" in Record detail's Fields and "Number" in Form's (`j3/DR-dark-detail.png`, `-form.png`). The boards show "Money", "Picker", "Date" and "Required · picker". Form's first row is still "It" with "Makes a new record" drawn as a lighter block, not as a chosen option.
10. **Goal's drawer:** board 14 draws Preview, then Progress (Value, Goal, Over), then Look in the Data tab. The console puts "Rows it uses" before Progress and moves the Look rows to Display. Goal shows $200,000.00 where the board shows $200,000.
11. **Pivot Display:** "Shade cells by size" is off, but the preview on the Data tab is shaded (`j3/DR-dark-pivot.png`). The preview does not follow the switch.
12. **List:** "Open The visit chosen" (capital T) in the click row (`j3/DR-dark-list.png`); the slot names in the sample row are in the monospace face, where board 15 uses the body face with the sample value.
13. **Text:** the Note tile has a blue stripe, where board 19 draws Note without one and gives stripes to Warning and Tip only (`j3/DR-dark-text.png`).
14. **Outline:** the Invoice detail sheet lists "Action group" and "Record detail" but not the buttons nested under the group, where board 4 lists them (`j3/B4c-detail-page.png`).
15. **Extras the boards do not draw** (left, small): "Where each one goes" and "More display options" disclosures on Stat, List and Goal; "Starts folded" on Section; "Offer Clear" on Search and filter; a nine-position grid on Button and Action group; a Record header group on Record detail; Rules tabs that show "Can be pressed when" and "Who can run it" on a Stat, a List and a Form.

## Matches (opened)

- **Stat (board 14):** header, four tabs with dots, follow chips with a dashed one, the condition chip, Compare as one switch with Show change as and Going up is, the preview above. Same in dark.
- **Section and Search and filter and Text (boards 18, 19):** Holds, Look, Plain or Card, filters each with a line of what it does, Filters sit, Text styles and "Edit on the page".
- **Button style tiles (board 17):** Main, Normal, Quiet and Danger drawn as the board draws them, the chosen one outlined.
- **Table Actions (board 13):** as item 6 says.

## Still to walk

Everything else in the brief: the light pass; Tabs, List, Record detail, Form and Filter editors; draft history; the draft preview; View as; the publish popover; Tablet with a drag; sheet and modal sizes; folded panes; page inspectors; dashboards; the served app at 768 and 390 for every page, sheet, modal and form; Back and shared links; people with no permission; slow network; zoom, reduced motion, forced colors; the five walk-throughs. This file will say what each found as it is done.
