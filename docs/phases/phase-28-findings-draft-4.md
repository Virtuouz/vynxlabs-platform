# Phase 28: the fourth walk (draft)

For the integrator to fold into the phase document's Findings, and then delete.
Written 2026-11-22 by the M2 agent, on branch `p28-m2` (from `phase-28-the-boards` at fa2e1c3). Instance: port 8112, database `walkm2`, seeded by `setup.mjs`.

Pictures are in `/tmp/claude-1000/-home-gplascencia-repos-vynxlabs-platform/245bb64d-bb75-475b-b0b0-52fadfa941d4/scratchpad/m2/` (`m2/` below). What is not in the "opened" table was not opened and is not claimed.

## Fixed (each in the shared piece; commit `c49c2bb` and the one after it)

1. **An empty page offers the table starters.** "A list of Invoices" and "A record page for ..." are buttons beside "Add to page" on the empty canvas, and the first suggestions in Add to page. Either opens "Add a page" with the start and table already chosen, and the empty page becomes the start (it is not left behind). Shared: `starters.ts` (`STARTS`), `PageEditor.tsx`, `AppBuilder.tsx`, `NewPageDialog.tsx`. Test: `builder-composition.test.tsx`, "an empty page offers the table starters...". Seen: `m2/a1-empty-1440.png`, `m2/a2-made.png`.
2. **Enter in Add to page takes a widget typed by name** ("table" gave "A list of Appointments" once the starters were suggestions). Same file, `AddToPage.tsx`.
3. **After placing a widget the focus is on that widget**, not "Rename the app" (checked: active element is the widget's card; Tab then reaches the resize handle, "More about Table" and the Data tab). Any widget placed through Add to page or a suggestion.
4. **The Source editor** (shared `ChoiceList` and `DrawerEditor`): starts on a named search ("Find a table or query"), arrow keys move over the list, Enter applies, a click applies; Tab wraps inside the editor; Escape returns to the row. Every small editor of the drawers (`DrawerEditor`) now starts on its first field or the chosen row, not on Close, and keeps Tab inside. Seen by script (`m2/a4.mjs`, `a5.mjs`), not by a person with a screen reader.
5. **Builder canvas at 700 to 1024:** the sideways-scroll sign waited until the canvas was 24 px too wide; at 700 and 768 it was 12 to 16 px too wide with no sign. Now 2 px. Measured at 700, 768, 900, 1024: the sign shows at 700, 768 and 1024 and not at 900 (where it fits). `SidewaysScroll.tsx`.
6. **Copy:** a saved query is shown by its name ("Visits by clinic") with its description or path beside it, not "Query: reports/visits-by-clinic"; a workflow in a "Run a workflow" step is "Title (path)"; the first row action's field is "What it does", not "What Action does"; a new Pivot is shaded (Shade cells by size on, as board 15); a List's row actions are the Table's card (rows and a dashed "Row action"), with the sub-view, not a separate "Add an action" card.
7. **Not changed, checked:** Goal's Data tab already reads Preview, Progress (Value, Goal, Over), Look, as board 14 draws it; Rows it uses follows (the board draws no source). The Approvals drawer already shows a workflow chip as its title with the path under it; I did not find a chip that shows both run together.

Checks: `tsc -b`, `-p packages/ui`, `-p apps/console`; vitest `apps/console/src/kit`, `builder-composition`, `add-to-page`, `widget-selector`, and all of `packages/ui` pass. Biome run with --write on my 14 files only (4 older warnings left, not mine).

## Opened

| What | Widths and theme | Result | Pictures |
|---|---|---|---|
| New app, empty page | 1440 dark | starters shown | `a1-empty-1440.png` |
| A list started from the empty page | 1440 dark | dialog preset; page made; empty page gone | `a2-dialog.png`, `a2-made.png` |
| Keyboard: place a Table, Tab on, Source editor | 1440 dark | see Fixed 3, 4 | `a3-placed.png`, `a3-source.png`, `a4-*.png`, `a5-find.png` |
| Builder at 700, 768, 900, 1024 | light | see Fixed 5 | `w1-builder-<width>.png` |
| Drawers: List, Pivot, Goal (Data, Display, Actions) | 1440 light | as above | `dr/mont-List.png`, `mont-Pivot.png`, `mont-Goal.png` |
| Drawers: Table (Data, Actions), Stat (Data, Display) | 1440 light | fine | `dr/m-TableStat.png` |
| Reduced motion, builder and served Clinic performance | 1440 light | no infinite animation running; nothing wrong in the pictures I took | `c1-rm-*.png` (taken; only counts of animations read) |
| 200 % (720 x 450 at scale 2), builder and served | light | no sideways page scroll (document 720 wide); the builder shows its compact bar and "Pages and widgets" | `c1-zoom-*.png`, `c1-mont.png` |
| Forced colors, builder and served | light | both draw and read; I looked at them small, not by control | `c1-fc-*.png` |
| Cold slow network, served (new context, cache off, 500 kbit/s, 2 s latency) | 1440 | nothing at 7 s; the page at 12 s; no layout shift looked for | printed marks only, no picture opened |

Taken but **not looked at**: the drawers at 768 and 390 (my script's settings sheet did not close after the first widget at 768, so only Table was captured; `dr/light-768-*`), the light pictures of Chart, Record detail, Button, Action group, Approvals, Section, Tabs, Search and filter and Text (`dr/m-*.png` were built and not opened).

## Not opened, so not claimed

Tablet with a drag; sheet and modal sizes by handle and keyboard; folded panes; record-page and modal inspectors; a widget hidden from a group under View as and the same person in the served app; every Markdown component in a Text widget; Text's Content tab and the Form drawer; Layout beside board 9; the served app's sheets, modals and forms at 768 and 390; the analytics dashboard built by hand and shared with a member; the pet owners' portal on a phone; the keyboard-only journey past placing a widget and the Source editor (set a column, a row action with a confirm, preview, publish). The phase is not shown as keyboard-clean or as fully walked.

## Ranked, what I saw and did not fix

1. The Stat's "More display options" line is cut mid-sentence ("A line of how it went, by"); Goal's reads "Good news is, colour by how close" (`dr/m-TableStat.png`, `mont-Goal.png`).
2. List, Pivot and Goal drawers have no preview (board 15 draws a sample row and a shaded grid); a new List says None in every slot (M1's list places).
3. The Table's note on row actions still says "on hover" (M1).
4. The served page shows no text for the first seconds on a 500 kbit/s, 2 s link (7 s blank; content at 12 s); nothing says it is loading before that.
5. The Source editor's Tab loop is made by script, not by the library's own trap (it let focus reach the "Skip to content" link when I only used `modal`); the same trap is not on the other dialogs.
6. Widgets and the builder: Tab stops and the Text editor covering the header remain from draft 1.
