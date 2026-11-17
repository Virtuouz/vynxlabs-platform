# Phase 15: advanced expert efficiency (UI/UX audit P3)

Status: planned, on branch `phase-15-uiux-p3`, off `main`. Milestone 0 done.
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
