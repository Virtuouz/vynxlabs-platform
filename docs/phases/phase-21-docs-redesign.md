# Phase 21: documentation that reads and writes like a documentation product

Status: in progress, on branch `phase-21-docs-redesign`, off `phase-20-documentation`.
Last updated: 2026-11-19

The owner drew a redesign of the documentation, the served docs app and the console's Documentation section, after the polish of projects that only do documentation (fumadocs). The drawing is `temp/Volvel Docs redesign.html`, which is not kept in git. It has seven frames: a served page, search, a docs app's home, a page on a phone, the console's tree and page, the page editor, and the tree's states.

**Exit criterion.** On `examples/fernhill`:

- a page four folders deep is served, in the navigation, and found by search as you type;
- the home page, a search page and a missing page are as wide as any other page;
- in the console a folder is made, renamed, moved and deleted, and a page is dragged between two others, without opening a page;
- the editor has undo, redo and an Insert menu that puts a component where the cursor is, inside the component the cursor is in;
- a reader of a public site says whether a page helped, once, and the vote is a row of a table of the workspace's.

## Owner decisions

Answered by the owner on 2026-11-19.

| Area | Decision |
|---|---|
| A folder | Held by its `index` page. A new folder is a new `index` page. An `index` page with nothing written in it lists what is in its folder, and the component `::pages` does the same on purpose. |
| Order | A folder's `index` page lists its pages and folders, `pages:`. What it does not list comes after, by title. A page's own `order` is gone. |
| Sites | Only a top-level folder is published as a site. |
| Feedback | Built. The app writes each vote into a workspace table. Turning it on says, before anything is made, what will be made. |
| Search | The server's index, not pagefind. Results by section, as you type, in a dialog. The form stays for a browser without script. |

## Milestones

| # | Milestone |
|---|---|
| M1 | The engine: folders to any depth, `pages:`, sites are top-level, when a page last changed, and the planner of tree changes |
| M2 | Markup: nesting proven in every renderer, `::pages`, where a block ends |
| M3 | The served site: frame, navigation, home, search dialog, phone, copy as Markdown |
| M4 | The console's tree: rows, rename in place, folders, drag between, menus, one batch route |
| M5 | The editor: undo and redo, Insert, the cursor, the preview that follows it |
| M6 | Was this page helpful |
| M7 | Guides, example, changelog |
