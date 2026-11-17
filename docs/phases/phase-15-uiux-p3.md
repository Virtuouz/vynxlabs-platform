# Phase 15: advanced expert efficiency (UI/UX audit P3)

Status: Milestones 0–9 built, on branch `phase-15-uiux-p3`, off `main`.
Last updated: 2026-11-17

The UI/UX audit ranks eight items as P3 in [09-prioritized-uiux-roadmap.md](../uiux/09-prioritized-uiux-roadmap.md). They make experienced users faster. The roadmap puts them last because each is cheap once there is one list and one registry, and phases 13 and 14 built those. Each item was re-checked against `main` after phase 14.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Keyboard (P3-1) | The `?` sheet lists 9 of about 30 shortcuts, and nothing in the interface opens it. Single-key shortcuts can't be turned off. There are no go-to chords and no `/`. ⌘K does nothing inside the code editor. There is no tooltip; about 31 native `title`s stand in | Every handler is written by hand, with four different "is the user typing?" checks |
| Palette (P3-2) | No commands for the open object, and no pins. A failed search reads "Nothing matches". ⌘↵ re-runs without asking. Scripts open in the editor; apps, triggers and people open only their lists | The palette knows a page's name, not its object. Actions live inside screens |
| Batch (P3-3) | `DataTable` can check rows, but no screen lets you. Release's "Deploy N changes" always deploys everything | No batch endpoints beyond row deletes and cancel-queued |
| Saved views (P3-4) | No saved filters and no column choice. The Triggers and Events filters are lost on reload. Density is kept per browser | No per-member storage beyond recents |
| Panes (P3-5) | The flow editor's inspector, the run page, list inspectors and Release are fixed widths, and nothing collapses. The selected step, canvas position and run page tabs are forgotten | `SplitPane` is used in two places, and keeps sizes per browser |
| Flow canvas (P3-6) | No copy, paste, duplicate or context menu. Several selected steps show only the first. **Renaming a branch case leaves its connections on the old name** | Only one step can be selected at a time; there is no clipboard model |
| Run comparison (P3-7) | A failed run doesn't say what changed since the last success | No "previous success" query or index, and no shared diff view |
| Wide screens (P3-8) | At 2200 px the runs list's Target column takes the slack, the run page never shows logs and input together, and the overview has two columns | No breakpoint above `lg` for these layouts |

Some of the roadmap's evidence is out of date:
- `DataTable` already moves by `j`/`k` and arrows, checks rows with `x` and Shift, and has a batch bar.
- ⌘S already works in the script editor and on settings pages.
- The palette has a Close button on phones.
- Branch cases already reorder.
- The flow editor already deletes and moves several selected steps.

**Exit criterion:** the Acceptance rows of P3-1 to P3-8 pass. In short:
- every shortcut in the sheet has a test, every action with a shortcut shows it, and single-key shortcuts can be turned off;
- with a run open, "Re-run" is the first palette result, every result opens an object, and a failed search says so;
- 25 runs can be re-run in 3 interactions, with a result for each;
- a saved view restores filters, sort and columns, and its link opens the same view for another member;
- pane sizes survive reload, and every divider works from the keyboard;
- duplicating a step gives a valid, uniquely named step in one action, covered by undo;
- a failed run whose last success was on another version shows the change and a diff;
- at 2200 × 1100 no column is more than twice its content, and the run page shows logs and input together.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-15-uiux-p3`, with the milestones built one after another, one commit each `Phase 15: …` |
| Scope | All eight items |
| Preferences | Kept on the server for each member, and not audited, through the existing preference allowlist. The browser keeps a copy so pages draw at once |
| Saved views | Private to the member who makes them. A view's link carries its state, so anyone who can see the list opens the same view |
| Batch | Server endpoints that take up to 100 IDs and answer for each one. Each item gets the same permission check and its own audit entry, as a single action does |

## Milestones

| # | Milestone | Items |
| --- | --- | --- |
| 0 | Branch and this document | |
| 1 | Member preferences and saved views on the server (migration 0066) | P3-4, P3-5 foundations |
| 2 | One keyboard registry, tooltips, the sheet, go-to chords, `/`, ⌘K in the editor | P3-1 |
| 3 | Palette: the open object's commands, pins, every result an object, loading and failure | P3-2 |
| 4 | Selection on the lists that need it, batch endpoints, results for each item | P3-3 |
| 5 | Saved views, column choice and order | P3-4 |
| 6 | Resizable, collapsible, remembered panes; the selected step, canvas and tabs kept | P3-5 |
| 7 | Copy, paste, duplicate, context menus, several steps selected; the case-rename fix | P3-6 |
| 8 | The last success, what changed, and a shared diff view (migration 0067) | P3-7 |
| 9 | Layouts from 1920 px, pictures at 2200 × 1100 | P3-8 |
| 10 | Keyboard journeys, the kit sheet, the changelog and wrap-up | |

## Findings

### Milestone 0
- PR #10 merged into `phase-13-uiux-p1` instead of `main`. The owner merged phase 14 into `main` as #11, so this phase starts from `main`.

### Milestone 1: member preferences and saved views
- **Migration 0066** adds `member_preference`, keyed by member and setting, and `member_saved_view`, keyed by member, tenant, workspace and list.
  - **`member_preference` is an instance table,** like `member_recovery_code`, because a member's settings cross tenants.
  - **`member_saved_view` is tenant-owned** but never exported, like the recents.
- **Six preference routes** (the reads and five writes) go through `ctx.keepPreference()`. The writes join the `PREFERENCE_ROUTES` allowlist, and that file's test lists them, so they can't write without an audit entry by accident.
  - A preference's key must match one the console keeps, so the table can't become storage for anything else.
  - Service accounts and API keys get 403 on writes, and an empty list on reads.
- **`prefs.ts`** is the console's side. A setting is read from this browser and changed there first, then sent after 400 ms. When it loads, the server's copy replaces the browser's, except for a change still waiting to be sent.
  - Theme, list density, split sizes, the shell's panel and the script editor's tabs moved onto it.
  - What browsers had stored under the old keys (`vx-theme`, `vx-density:*`, `vx-split:*`, `vx-panel`, `vx-editor-*`) moves on the first page load. Being newer, it is sent to the server even when the server already has a value.
  - The theme is still applied before the first paint, from this browser's copy.
- **A side effect:** the shell and the command palette each kept their own theme state. Now one store serves both, so changing the theme in one shows in the other at once.
- **A flaky builder test** looked for the Publish button before the publish dialog had loaded its summary. It failed about one run in three, before this phase too. It now waits for the button.
- The redesign e2e spec resets the admin's theme when it ends, because a theme kept on the server would otherwise carry into the specs after it.

### Milestone 2: one keyboard registry
- **`kit/shortcuts.ts`** declares all 25 shortcuts, each with its keys, scope and label. Ten are handled inside a kit part (`DataTable`, the palette, the log viewer) and marked `handledBy`, so the sheet still lists them truthfully.
- **`kit/keys.ts`** serves every other binding from one window listener, through `useShortcut(id, handler)`.
  - The binding made last wins.
  - A handler can return `false` to let the key go on. The inspector's Esc does this while a dialog or menu is open.
  - Chords (`g r`) wait one second for their second key.
  - Single keys are ignored while typing and when the member has turned them off.
- **Moved onto the registry:**
  - ⌘K;
  - `?`;
  - ⌘S in the script editor and the SaveBar;
  - ⌘↵;
  - undo and redo in the flow editor and the builder;
  - the inspector's Esc.
  
  `typingIn`, `inField` and the sheet's own check are gone. One `isTyping` remains, and `DataTable` uses it too.
- **Found while doing it:** Chromium's Monaco types through an EditContext `div`, not a textarea, so a "typing?" check that looks at the tag misses it. Typing `//note` in the script editor jumped to the list's search on the `/`. Typing `?` in the editor would have opened the sheet before this phase too. `isTyping` now also treats anything inside `.monaco-editor`, or with role `textbox` or `combobox`, as typing.
- **⌘K inside the editor:** Monaco keeps ⌘K as the start of its own chords, so the page never saw it. The editor now binds ⌘K to open the palette. The e2e checks it.
- **New shortcuts:**
  - `g o/r/f/s/t/a` go to the overview, runs, flows, scripts, triggers and approvals.
  - `/` focuses the screen's search box, or opens the palette where there is none.
  - ⌘S saves at once in the flow editor, the app builder and dashboards. The builders' autosave is hurried rather than run a second time, so there is never a second PUT in flight.
- **The sheet:**
  - It is drawn from the registry and grouped by scope.
  - It opens from the account menu ("Keyboard shortcuts"), from the palette and from `?`.
  - It holds the switch for single-key shortcuts (WCAG 2.1.4), a member preference from Milestone 1.
- **Tooltips:** `Tooltip` and `Kbd` were added to the kit, and `Button` gained `tooltip` and `keys`.
  - Undo, redo, copy, the starters and the production-trigger notice moved off native `title`s.
  - The avatar's `title` became the first line of the account menu, "Signed in as …".
  - `title` stays on truncated text, where it shows the whole value.
- **Tests:**
  - `keys.test.tsx` presses every shortcut the console binds itself and checks it reaches its handler. It fails if a new binding is declared without a press.
  - It also checks single keys while typing and when turned off, the chord window, and how keys are written on a Mac and elsewhere.
  - It checks that the sheet lists every label.
  - A rule fails on any `addEventListener("keydown"` outside the registry; the inspector's Esc was the last.
  - The e2e covers ⌘K from the code editor, `g r`, `/`, and the sheet from the account menu with its switch, with axe.
- **The theme race:** a setting moved from an old key waited 400 ms to be sent, so a page load inside that time took the server's older copy (the redesign spec's dark run). Moved settings are now sent at once, and anything still waiting is sent with `keepalive` on `pagehide`.

### Milestone 3: command palette v2
- **`kit/current.ts`:** a page tells the palette what it shows with `useCurrentObject`, or `<Current object={…}/>` from inside its JSX, where its actions are already defined.
  - Run pages offer Run again (same input, or the version deployed now), Retry from the failed step (and on a fix's version, when one can take it), Cancel, Open in the editor and Copy the run ID.
  - Script and flow pages offer Open the code or Edit, Start…, and See its runs.
  - The triggers inspector offers Pause…, Resume and Fire now; the approvals inspector offers Approve… and Reject….
  
  Every command that changes something asks first, as its button does, because it calls the same function. The trigger's pause and resume were inline in two buttons; they are named functions now.
- **Not done as planned:** pulling the actions out into `actions/*.ts`. The page passes its own functions to the palette, so nothing is shared that a module would hold. Release's Deploy and Promote don't register yet. Release becomes a list with selection in Milestone 4, and registers then.
- **The empty query:**
  1. the open object's commands, under its heading ("This run");
  2. Pinned;
  3. Recent;
  4. Screens;
  5. Actions.
- **Pins** are a member preference per tenant (`palette.pins:<tenant>`), at most 12. ⌘P pins or unpins the chosen result, and "Pin to the palette" is offered for the open object. A pin is matched by kind and path, because search gives resource IDs and pages know paths.
- **Results:**
  - They are grouped (`role="group"`, named by the heading).
  - A script opens its page, not its editor; ⌘↵ still runs it.
  - A member opens `/members/:id`, an end user `end-users?user=`, and an app its list with `?app=`.
  - Apps have no page of their own; making one is left for later, as its list already has an inspector.
  - The chosen row shows its ⌘P and ⌘↵ in the computer's own way of writing keys.
- **States:** "Searching…" shows after 300 ms. A failed search shows an alert with the request ID and Try again, instead of "Nothing matches". On phones the list height uses `dvh`.
- **Recents** are now recorded on a script's page and on connection and event pages, not only in editors and runs.
- **⌘↵ "Run again"** in the palette asks first, like the button on the run page.

### Milestone 4: multi-select and batch actions
- **Five batch routes** (`routes/batch.ts`), each up to 100 items. Each item is done by replaying its single action's own route in-process (`request.server.inject`), with the caller's own headers.
  - So each item is resolved, permission-checked, done and audited by the very code that does it alone. A batch can do nothing its caller couldn't do one at a time, and leaves the same record: three cancels write three `run.cancelled` entries.
  - Items run one after another, never as a burst on the database.
  - The plan's single `batch_id` in each entry's details was dropped. The entries are the single actions' own, unchanged, and they share a request ID prefix only by time.
- **The write-path guard:** the batch route marks itself as having changed things, because its items did, through the write path.
  - `t.unexercised` leaves batch routes out of each area's coverage check, because `batch.test.ts` exercises them.
  - The test also checks that a viewer's batch cancels nothing, that a missing run is reported 404 with its reason, and that 101 items are refused whole.
- **`DataTable`:** Shift-click now checks a range from the last row checked. In happy-dom the change event still fires after the click's `preventDefault`, and overwrote the range; the change handler now ignores the one event a range click handled. The flag clears itself, since a browser sends no change.
- **`useBatch` and `BatchResult`:** when every item is done, a toast says so. When any is not, a dialog lists each with its reason, its request ID with Copy, and "Retry the N not done", which sends only those.
- **Screens:**
  - **Runs:** Cancel, and Run again. A script runs again on its version; a failed flow retries from its failed step; another flow restarts. Each goes in one batch per kind.
  - **Approvals:** Approve or Reject, with one comment for all.
  - **Triggers:** Pause, with one reason, and Resume. The kind filter moved into the address.
  - **Release:** drafts get a checkbox. The preview and the deploy take the chosen `paths`, and "Set aside the N chosen" discards them in one batch. None chosen deploys all, as before.
  
  The palette's "This release" command deploys what is chosen, which was left from Milestone 3.
- **Not done:**
  - "Select all N matching". The runs list's existing "Cancel N queued" already acts on the filter on the server, and no other batch here needs to reach past the rows shown.
  - Release stays a list of panels rather than a `DataTable`. The checkbox is all the selection it needed.
  - The table rows' batch delete keeps its own answer (`deleted`, `missing`).
- **e2e (`batch.spec.ts`):** 25 runs are run again in three interactions: check all shown, Run again, confirm. The toast reports 25, and the workspace then holds 50 runs. Axe runs on the list with rows checked.

### Milestone 5: saved views and columns
- **A view is the list's address.** It keeps the query, less the open row, plus the density. That needs no schema per list: any list whose state is in the address can have views. Choosing a view navigates to it, so Back returns to what was there before. "Copy a link to this view" copies that address, and because the link carries the whole view, anyone who may see the list opens it the same while the view stays private to its maker.
- **Found by the e2e:** `viewQuery` first sorted every value, which reordered `cols`, and the order of columns is the choice itself. It now sorts names only and keeps a name's values in order. A unit test holds it.
- **`ViewsMenu`** (`kit/views.tsx`):
  - lists the member's views of this list and marks the one showing;
  - offers "Save this view…", "Save over" the last one chosen when the list has moved on from it, and Rename and Delete for the view showing;
  - lists views per tenant and workspace, or per tenant for the audit log.
  
  A table's rows have views named for the table (`rows-<table>`), so a filter from one table is never offered on another.
- **Columns:** `DataTable` takes `columnsShown`, keys in order. The first column, which says what a row is, always shows. `ColumnsMenu` checks columns on and off and moves them with Move up and Move down, so the order changes as easily by keyboard as by pointer. Every column in its defined order is no choice at all and is kept out of the address. The runs list and the audit log have it, in the address as `cols`.
- **Events:** the name filter moved from component state into the address (`?name=`).
- **Not done as planned:** reordering a table's rows' columns through `Grid`. Hiding them was already in the address, and the views menu now saves it. Density is saved in a view when the list has a density control (runs); elsewhere it stays the member's preference.
- **e2e (`views.spec.ts`):**
  1. A failed run is seeded.
  2. The list is filtered to failed, sorted by duration, with Trigger and Attempt hidden, and saved as "Slow failures".
  3. Opening the plain list and choosing the view restores the filter, sort and columns.
  4. A second member opens the link and sees the same list, while their own menu lists no views.
- **A false alarm:** a fresh browser drew a blank page during the run. The console had been rebuilt while the instance served it, and the instance keeps `index.html` from when it started, which named assets that no longer existed. After a restart, the spec passed. Restarting after every rebuild is in the verification steps for this reason.

### Milestone 6: resizable, remembered panes
- **`SplitPane`** gained:
  - a vertical orientation;
  - folding a pane away: Enter on the divider (the WAI-ARIA window splitter) folds it, and its rail's "Show …" button opens it again;
  - least sizes in pixels as well as percent, so neither pane is dragged out of sight.
  
  Size and fold are one member setting, `split:<id>`. A bare number, as Milestone 1 kept it, still opens.
- **Adopted:**
  - The flow editor: canvas beside the step settings, which can fold. When testing, the canvas and test run split top and bottom, instead of a test panel fixed at 45% of the window.
  - The run page: attempts beside details; the attempts can fold.
  - Release: drafts beside the deploy panel.
  - Every list's docked inspector: its left edge drags, or moves with the arrow keys, from 288 to 720 px, and a double-click restores its own width. It is one width for every list, `split:inspector`, because the inspector is the same panel everywhere.
- **Not adopted:** the App Builder's outline column stays fixed. Its canvas and settings were already a split, and the outline holds only names.
- **Remembered:**
  - The flow editor's chosen step is in the address (`?step=`). Until the flow is drawn with it chosen, the canvas's own "nothing chosen" is ignored, so it doesn't wipe the address on load.
  - The canvas position is kept for the session (`sessionStorage`, per flow) and restored instead of fitting the view.
  - A run's Input or Output tab (`?io=`) and a flow run's Timeline or Graph (`?view=`) are in the address.
- **Found while building it:**
  - **React error #310:** a hook added for the canvas position landed below the editor's early return. The e2e found it at once; it is now above.
  - **The runs list lost a row** (19 at 1440 × 900, where the bar is 20) because Columns, Density and Views wrapped beside eight filter chips. All three are icon buttons with tooltips now, and Views names the view only when one is showing.
  - **Settings forgotten elsewhere weren't forgotten here.** A setting turned off in one run of the keyboard spec and deleted on the server stayed off, because loading only wrote what the server had. Loading now also forgets what the server no longer keeps, except changes still waiting to be sent. The keyboard spec resets the setting at its start and in a `finally`.
  - **A small picture change wasn't retaken.** A difference within the comparison threshold is not rewritten by `--update-snapshots`, so the phone pictures kept a first version of an icon's color. They were deleted and taken again.
- **Tests:**
  - `SplitPane.test.tsx`: the keyboard, double-click reset, the setting kept, folding and opening, and an old bare size.
  - `panes.spec.ts`: the flow editor's divider moves, survives a reload, folds and survives a reload folded; the run page's divider and its Output tab survive a reload.
  - The whole e2e suite passed: 33 tests.

### Milestone 7: flow canvas power tools
- **The clipboard is the browser's own.** The flow editor listens for `copy`, `cut` and `paste`, not for keys.
  - A field being typed in, or text chosen on the page, keeps ⌘C and ⌘V as they always were.
  - Chosen steps are written as plain JSON marked `vynxlabsFlowSteps: 1`, so pasting into another flow, in this tab or another, needs no clipboard permission.
  - The context menu's Copy and Paste use `navigator.clipboard`, which may ask.
- **`flowClipboard.ts`** (pure, tested):
  - Copy keeps only the connections between the steps copied.
  - Paste renames taken names with `_2`, `_3`, as adding a step does, and moves the steps by 40 px.
  - Every reference between the pasted steps is rewritten in two passes, through names no step can have, so `a → a_2` and `b → b_2` never chain. References to steps outside the paste are left alone.
- **⌘D** duplicates the chosen steps: copy and paste in one, one step to undo. It is in the registry under "Flow editor", with copy and paste and the menu keys listed.
- **`ContextMenu`** was added to the kit (Base UI `context-menu`, with `Menu`'s item shape; items take `keys`).
  - On a step: Duplicate, Copy, Rename… (references follow, as before), Remove.
  - On the canvas: Paste, Select every step, Fit the flow in view.
  - On several chosen steps, it acts on all of them.
- **Several steps chosen:** the panel names them and offers Duplicate and Remove, rather than showing the first one's settings. Dragging the selection box records one undo step (`onSelectionDragStart`), as dragging a step did.
- **The case-rename bug** found in planning is fixed. Renaming a branch's case moves the connection leaving it (`case:<old>` → `case:<new>`) in the same undo step. Before, a renamed case's connection dangled, and the flow saved a broken edge.
- **Not done:** an Align command for several steps. The canvas snaps nothing, so lining up is by dragging, as before.
- **e2e (`flow-editor.spec.ts`):**
  - two steps chosen with ⌘-click and duplicated with ⌘D; the copy's expression reads `steps.totals_2`, and one ⌘Z undoes it;
  - the two copied with ⌘C and pasted with ⌘V into another flow;
  - a step duplicated from its right-click menu;
  - a branch case renamed, after which the saved draft's edge names the new case.

### Milestone 8: run comparison
- **`GET runs/:id/previous-success` and `GET flow-runs/:id/previous-success`** (`routes/compare.ts`) give the newest succeeded run of the same script or flow, in the same workspace, older than this one.
  - Run IDs are time-ordered, so that is `id < this`. A flow run started by another flow's step doesn't count.
  - They say whether the version differs, and whether the input does. The input is compared in the database (`is not distinct from`); an input too large to be kept inline gives `null`, which reads "too large to compare here", rather than a guess from its reference.
- **Migration 0067** adds two partial indexes, on succeeded runs only, newest first per path. They make that read a few rows however long the history.
- **`DiffView`** (`kit/DiffView.tsx`) is the one diff the console draws: removed lines in red with −, added in green with +, long runs of what stayed folded to a count. Drift's own renderer was replaced by it. It takes text, or any value, which it compares as sorted JSON.
- **`RunCompare`** shows on a failed or canceled run's page, script or flow:
  - when it last succeeded, linked to that run, and on which version;
  - the input (the same, different, or too large to compare), then the version, then how long each took;
  - "Show the input's difference", which loads the last success's input and diffs it;
  - "Compare the source" or "Compare the flow", which opens `runs/:id/compare/:other`. For a script, that diffs each file of the two versions' source; for a flow, the two definitions.
  
  A run that never succeeded says so in one line.
- **Palette:** "Compare with the last success" is one of a run page's commands.
- **Tests:**
  - server (`compare.test.ts`): none before, the same version and input, and after a deploy with other input;
  - console: the panel's wording, link and input diff;
  - e2e (`compare.spec.ts`): a script works on v1 and fails on v2; its page says "v1 then, v2 now" with the same input, passes axe, and the source diff shows the old and new code.

### Milestone 9: wide-screen layouts
- **A `3xl` breakpoint at 1920 px**, in the console's own theme.
- **From 1920 px:**
  - **Script run page:** the log and the run's input, output and comparison stand side by side (3 : 2) beside the attempts column, three panes in all.
  - **Flow run page:** the timeline or graph stands beside the chosen step's facts, logs, input and output.
  - **Overview:** three columns (what needs you; runs and release; what starts work). The shell's width cap rises from 1440 to 1920 px for overviews only.
  - **Runs list:** Target takes 26rem and Result the rest. The docked inspector's own width is 32rem, unless the member set one.
- **The run page's scroll**, suspected in planning, was real. `runs/<id>` counts as a workbench, so `main` does not scroll, and the run page's wrapper didn't either. On a short window the input and output were out of reach. The run page and the compare page now scroll themselves. The e2e holds this at 1440 × 640.
- **Found in a picture:** a failed run's attempts read "#1 succeeded" when the script threw without logging an error line. That has been so since phase 9, because the insight counted only error-level log lines. A failed run's last attempt is now failed whatever it logged. `operations.test.ts` holds it.
- **e2e (`wide.spec.ts`)** at 2200 × 1100:
  - On the runs list with a run open, no column that grows is more than twice its content plus padding. Fixed-width columns such as State are sized for their longest value and are left out.
  - The run page's log is left of its input tabs, both in view.
  - The overview is pictured, along with both other screens, in light and dark (6 new pictures). Axe runs on the wide runs list.
  - A run page scrolls on a short window.
  
  The whole e2e suite passed: 38 tests.
