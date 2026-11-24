# Walk r-build (phase 29, re-walk after fixes)

Instance localhost:8091 (restarted 21:58, after the fix build). My own dev workspace `r-build dev` (slug r-build-dev), made in the Fernhill tenant as Maya Brooks. Shots: `~/.local/share/volvel-walk/shots29/r-build/`. Scripts: `~/.local/share/volvel-walk/r-build/`. Widths 1440 and 390 (768 for the queries page), light and dark spread across them, keyboard for each action, reload where it mattered. Drafts were made through the console's own draft API from the page (not by typing each manifest); every deploy, pause, retire and publish was done in the UI with the keyboard.

## The key test: drafts deployed together (OP found)
Drafts in one workspace: script `rb/z-script`, webhook trigger `rb/a-hook` (sorts before the script), schedule `rb/b-clock` to the script, flow `rb/m-flow`, schedule `rb/a-flowclock` to the flow (sorts before the flow). Release page showed "Deploy 5 changes"; Enter on it: deployed at once, version v2, "0 changes" left, same after reload. FIXED. a8-deployed-1440-light.png, a7-release.png. The deployed script then ran (run succeeded in 146 ms).

## fix-flowops
- OP-2 pause reason: "Paused just now by Maya Brooks: Checking the weekly run first. Nothing it would start is started until it is resumed." FIXED, 390 dark. b3-paused-390-dark.png.
- OP-3 window ends before it starts: notice "The end is before the start." and "Nothing ran in this time", old rows gone. FIXED, 390 light. c3-between-backwards-390-light.png. (The chip counts above still show the unfiltered 2/1/1; minor.)
- OP-4 run later: dialog says "A later run is listed as waiting until its time, and starts then."; run page says "Waiting until 2026-11-23 01:01:15" at 390 dark and 1440. FIXED. c9-run-dialog-390-dark.png, c4-runpage-390-dark.png. (Odd beside it: "waited 0 ms".)
- OP-1 runs list at 390 light and dark: Waiting/Succeeded no longer overlap Target (State is cut to "Succeed…", "Waiting u…" with an ellipsis). FIXED for overlap. c2-runs-390-light.png, c2-runs-390-dark.png.
- FL-1 (flow step, "Run a flow" with no flow): "subflow has no flow chosen." FIXED. d7-runflow-1440-light.png. The interface action "When click" case was NOT walked.
- FL-2 duplicate field names: both rows say "Another field has this name." and the form says the JSON keeps the last saved schema meanwhile; 1440 light and 390 dark. FIXED. d5-dup-1440-light.png.
- FL-3 schema with `title`: no "cannot show"; "Label of field 1" row appears. FIXED.
- FL-4 paste: text that is no steps says "What is on the clipboard is not steps copied from a flow."; a copied step with a bad type says "Nothing was pasted: no step on the clipboard can be used. run: "nonesuch" is not a kind of step." FIXED. e2-paste-bad-1440-light.png.
- FL-6 event filter `trigger.x`: "start's filter reads trigger, which an event start does not have. Read the event instead: event.payload or event.name." FIXED. e1-filter-1440-light.png.
- FL-7 role picker: each role once in the list (agent_runner ... workspace_admin). FIXED. d9-roles-1440-light.png.
- OP-7 words (Remove from here, "N not set up", connection text): NOT walked (no connection in my workspace).
- OP-6 platform event hint at 390, OP-5 viewer buttons: not in the fix list, not walked.

## fix-databuild
- w-data 1 retired table indexes: retired page lists both indexes (reload too); Bring back (Enter) returns the table with both indexes. FIXED. f7-retired-page-1440-light.png.
- w-data 3 Queries header at 390 light and dark: "Draft, never deployed", "New query", "Name and path" no longer overlap; no page overflow at 390 or 768. FIXED. h3-saved-390-light.png, h4-query-390-dark.png.
- w-data 4 prompt maxLength: 101 characters stay, field says "Use at most 100 characters. This is 101.", action off; at 100 it is on; Esc returns focus to New dashboard. FIXED, 390 dark. j1-101-390-dark.png.
- w-data 6 disabled reason: Delete on a file named by a row is a focus stop (Tab); keyboard focus shows "A row still names this file. Change the row first."; a tap on a touch device shows it too. FIXED. i5-kbd-390-dark.png, i6-tap-390-dark.png.
- w-data 7 text default: shown as `open`, not quoted. Add column dialog has no "Optional." line under "optional" labels. FIXED. g2-def-1440-dark.png, g1-addcol-1440-light.png.
- w-data 2 picker hint hides name, w-data 5 group count: NOT walked (needs a chart/list source picker and an end-user table with rules).
- w-builder 1 Recent app: palette Recent "rb-app · App" opens `apps?app=rb-app` and the app's panel opens. FIXED. k7-opened-1440-light.png.
- w-builder 7: new flow field shows no "Give the field a name." before typing (d4-field-new-1440-light.png); script Settings reads "Never: a failed run is not tried again" (c9-settings-390-dark.png). FIXED.
- w-builder 6 publish check: my app's publish check passed with no "labs/goal" line (but the original case, two dashboards, was not rebuilt). Not proven.
- w-builder 2, 3, 4, 5 (chart axis words, sorted by joined breakdown, Also from clash chip, form Starts as): NOT walked; the chart and form widget set-up did not complete in the time I had.

## Seen, not in either list
- Table Definition at 1440 (light and dark): the row actions column is cut at the card's right edge ("Describ…"; Rename and Retire not visible without scrolling the card). g2-def-1440-dark.png.
- "Add a field" in the flow editor does not move focus to the new field's name.
- Workspace made as dev starts Paused; every trigger reads "Workspace paused" (correct, said in words).

## Could not walk
OP-7 words, FL-1 interface action, w-data 2 and 5, w-builder 2 to 5, viewer gating, 768 interactions beyond the queries page.
