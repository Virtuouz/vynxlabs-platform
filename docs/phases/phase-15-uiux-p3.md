# Phase 15: advanced expert efficiency (UI/UX audit P3)

Status: Milestones 0–3 built, on branch `phase-15-uiux-p3`, off `main`.
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
