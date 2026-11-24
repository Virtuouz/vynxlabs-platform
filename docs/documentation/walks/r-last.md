# Walk r-last (phase 29)

Instance localhost:8091. Own data: app `r-last-app` and script `r-last/hello` (Sandbox), tenants `r-last tenant` (workspace `rldev`) and `r-last two`. Shots: `~/.local/share/volvel-walk/shots29/r-last/`. Scripts: `~/.local/share/volvel-walk/r-last-scripts/`. Widths 1440, 768, 390 (800 and 844 high for the Save bar), light and dark, keyboard, reload.

## fix-close

- WID-27 Goal: RIGHT as to roles (plain goal has no role or tab stop; with a click it is a button, Enter opens the page, Back and reload keep it). WRONG: the pressable Goal's bar is 16 px shorter than the plain one at every width (bar 95..505 vs 547..941; 390: 31..359 vs 31..343). `-m-2` does not widen a `w-full` box. `packages/widgets-core/views/goal.tsx:66` (Stat, `stat.tsx:63`, has no `w-full`). Shot `p1-390-light.png`.
- WID-28 heatmap Colors: RIGHT. App theme, Cool, Warm and Grays redraw the ramp in light and dark; Esc closes and returns focus to Colors; Legend offers Automatic and Never (`d4-*`, `d6-legend.png`). Dark Grays: the highest cells are close to the page colour (`d4-dark-Grays.png`).
- WID-29 table with no heading: RIGHT. Download sits in the corner at 1440, 768 and 390 and takes no row. Its box overlaps the header text box by 4 to 5 px at 768 and 1440, and by 1 px of the first row at 390, with no glyphs touching (`p5-768-light.png`, `p3-390-light.png`).
- WID-30 Action group Look: RIGHT. Left gives the 3 by 3 grid; Right and Spread give Top, Middle, Bottom; the stored column is kept (`a3-*`, 1440 light and 390 dark).
- WID-31 editable detail: RIGHT. Native buttons named "Edit Phone: (503) 555-0183", Enter opens the editor, Esc cancels. WRONG: after Esc or stop, focus falls to BODY, not back to the field's button, at all widths. `detail.tsx:406` (`stop` only clears `editing`; nothing refocuses). Shot `e2-b-390-light.png`.
- MP-1 script Settings, dev: RIGHT. Fields, native refusal for 0 seconds, Enter saves, "Saved as a draft... Open the draft", a second open reads the draft (`w5-*`). Production (Clinics): RIGHT, read-only with "reach production by promotion". WRONG: after the save and a reload the page shows the deployed values with no hint that a draft is waiting. WRONG: a script that has only a draft (no deployed version) shows "Could not load the settings of this script. The resource was not found." on the Settings tab (`c6-a.png`). `ObjectPages.tsx:838-845` (reads `/resources/<path>` only). Repository-held: NOT WALKED (no script here has ownership `repository`; no repository can be connected offline).
- ACC-27 Access check: RIGHT in wording ("It comes only from operator access, which ends when the grant does", 1440 and 390 dark). WRONG: the word "Allowed" is cut to "A" at 390 and "Allo" at 768 (box 10 px and 35 px wide, text 52 px). `Access.tsx:190` (`<p class="flex ... gap-2">`, no wrap) with `StatePill` `truncate` (`kit/status.tsx:155`). Shot `m9-390-dark.png`.

## yaml-folder (D65)

- Repository page, no repository connected: RIGHT at 1440, 768, 390. Folder editable, hint "A resources folder named in volvel.yaml wins over this."; no overflow (`g1-*`).
- NOT WALKED: read-only Folder with "Set in volvel.yaml", and the "not read yet" hint. Connect needs a token and a reachable HTTPS repository; there is no internet.

## Not walked since their fixes

- SSO Settings save bar (own OIDC provider with a local discovery document): positioned `sticky; bottom: 0` inside the form, inside `#main` (`overflow-y: auto`). 390x800: innerHeight 800, bar top 721 bottom 800 (h 79); `#main` top 48 bottom 800, scrollHeight 1661, clientHeight 752; document scrollHeight 800 (the window does not scroll). 390x844: bar 765..844; `#main` 48..844, scrollHeight 1661, clientHeight 796; document 844. Flush with the window bottom at every scroll position but the end. RIGHT for covering and reach; WRONG in one detail: at the end of the scroll the bar rests at the form's end, 24 px above the window bottom (bottom 776, 820, 876), with page colour below it. `kit/SaveBar.tsx:34` (`sticky bottom-0` inside a form that has `#main`'s bottom padding under it). Ctrl+S saves and a reload keeps it; Discard works but focus falls to BODY. Shots `s4-*`.
- Chart axis words: after "Along the bottom" is Reason, the help reads "Reason along the bottom, Visits up the side": the bottom word follows. WRONG for a heatmap: the side title drawn is "Clinic", not "Visits". `chartDrawer.tsx:514-517`. Also WRONG: "Drawn as a heatmap; 21 clinics" counts result rows (3 clinics by 7 reasons), and "28 reasons" for 4 species by 7 reasons. `chartDrawer.tsx:154-158` (`count` is rows, `noun` the first breakdown). Shots `d7-light.png`, `d1.png`.
- Sorting by a joined breakdown (Pet species): RIGHT. No "Needs fixing", the chart sorts, reload is clean.
- "Also from" clash chip: RIGHT at 1440 light and 390 dark. "Name" is disabled with "Name is not offered: Appointments already has a column called pet_name..." (`d11-1440-light.png`, `d12-b.png`).
- Form "Starts as: A value": RIGHT on text and integer fields. No early error, Publish stays enabled, "0 to fix", the value survives a reload (`f9-int-light.png`, `f10-*`).

## Environment (not a code finding)

Sandbox's stored Fernhill bundle still holds `legend: "shown"` and `labs/goal`, so every deploy in Sandbox is refused: "The bundle's manifests are not valid" (`screens/operations`, `screens/performance`), even for an unrelated path. I deployed in my own workspace instead. Header showed "Reconnecting" (stream cap, shared walkers).
