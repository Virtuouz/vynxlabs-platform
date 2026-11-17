# Phase 15: advanced expert efficiency (UI/UX audit P3)

Status: Milestones 0–1 built, on branch `phase-15-uiux-p3`, off `main`.
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
