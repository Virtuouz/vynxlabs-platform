# Walk w-builder (phase 29)
Instance localhost:8091, my own app "w-builder app" and dashboard "boards/w-builder-board" in Sandbox. Shots: ~/.local/share/volvel-walk/shots29/w-builder/.

## Right
- Make an app, page settings: "13 of 100" count (a2-builder.png). Remove page lists the opener, Show it selects it (i3-remove, i3-show).
- Also from (joins): chips, "Columns from" chips, keyboard Enter, reload keeps them, disabled with reason "Pets is used by Breakdown and Values" (b2-cols, a13). Joined columns offered in measures and breakdowns. 390 px OK (b2-390).
- Chart: Add another measure, Along the bottom (swaps), Up the side, Scatter tile, "needs a number" reasons (a13-a15).
- Table: Drawn as Bar, Badge and Badge colors (b6).
- Form field Starts as: Nothing/Now, stored as initial today; preview shows it after reload (g5).
- Manual start fields: form writes JSON, half JSON disables form with a reason, text kept after choosing another step (e4).
- Dashboard clash notice with Copy what I wrote / Load their version at 1440 and 390 dark; clipboard refusal is said (c6, c9).
- Palette Recent lists an app, a trigger and a schedule; trigger and schedule open the right page (d2).
- Script page Settings tab (f1). Catalog refused: editor says so, Publish says "Could not check ... Publishing is not held" (h2).

## Wrong
1. Recent app opens nothing: link is apps?app=<path>, Apps matches on id. Apps.tsx:485-488 (writes open?.path). d4-appperf.png, 1440 light.
2. Chart "Show axis titles" help says "Pet species along the bottom" after Along the bottom is set to Pet clinic; the summary sentence too. chartDrawer.tsx:502 (ignores config.x/y). a15-after.png.
3. Chart Sorted by a joined breakdown (Pet species): Needs fixing "pet_species is not in appointments any more". tabProblems.ts:152-156 compares group.column (pet.species), not the group's name. a16-sort1.png.
4. Also from "Name" on a table whose table has its own pet_name: widget shows "The query cannot be run" (server: two columns called pet_name); no warning at the chip. rowsItUses.tsx:201 (AlsoFrom). b3-display.png.
5. Form "Starts as: A value" shows an error ("does not fit the integer column") at once, before a value is typed; Publish disabled. fieldStart.tsx. g5-value.png.
6. Publish check on my app says "there is no widget called labs/goal" twice; the app has no Goal. A Goal sits (removed since) on my dashboard; source unproven. page.ts:1055. h2n-publish.png.
7. Adding a flow field shows "Give the field a name." in red before typing (e3-field.png). Script Settings reads "0 times ... waiting longer each time" (f1).
8. Header shows "Reconnecting"/"Offline": 429 too_many_streams (cap 5, shared walkers).

## Not walked
Pivot Then by, action "When it is done, say", Compare across, list Only include on a record page, money "is between", saved query values, detail badges, resource editor draft clash, approval with a gone group, builder header rename, German axis (table dates were German; chart had no locale-visible numbers), 768 px anywhere, dark for most drawers.
