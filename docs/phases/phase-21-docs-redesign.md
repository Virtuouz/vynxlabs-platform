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

## Built

- **Folders to any depth** (`docs-engine/src/set.ts`). The navigation is folders inside folders. `too_deep` is gone; `file_and_folder` stays. `trailOf` gives the folders a page is in, and `folderItems` what a page's folder holds.
- **`pages:`** on a folder's own page orders what is in the folder. What it does not list comes after, by title. A name it lists that is not there is a warning, not a refusal. `order:` is refused. The product's help, Fernhill and the tests were moved to `pages:` by a script that kept each folder's order; the help's reading order was compared before and after and is the same.
- **A site is a top-level folder.** A deploy refuses `docs: a/b`.
- **When a page last changed** is the resource's `updated_at`, which a deploy leaves alone for a resource it does not change. A served page says it, and the home page lists what changed last.
- **The tree's changes are planned in one place** (`docs-engine/src/ops.ts`): rename (title, name, or both), move into a folder or before or after a row, new page, new folder, copy, delete, and the inverse of each, for Undo. A move rewrites the relative links, to and from what moved, that would otherwise break the deploy.
- **`POST …/drafts/batch`** saves a plan as one transaction, each change audited as the save it is. A stale revision refuses all of it. Pages, and any other kind given whole, such as the app that publishes a folder, by the same narrow-write rules as one save.
- **Markup.** Every component nests in every other, proven through the HTML, React and text renderers by `fixtures/nesting.md`. A container knows its last line (`endLine`), and `containersAt` says which containers a line is in. `::pages` lists a folder. An editor's preview can be told the lines each block came from (`lines`). Each component says what an Insert menu shows and writes.
- **The served site.** A frame whose page column is the same width on every page, sidebar or not: the home page, search and a missing page were squeezed into the sidebar's column before. A navigation tree of folders that open where the page is, a collection switcher, breadcrumbs, on-this-page that follows the reader, previous and next, last updated, Copy as Markdown and Copy link. A home page of collections and what changed last. Search by section, as it is typed, in a dialog, narrowed to a collection, with what was viewed last when nothing is typed; the form and its page stay for a browser without script. On a phone, a top bar, a sheet for the navigation, and a bar for what is on the page. Icons are Lucide's, copied into the server by a script, with their notice.
- **The console's tree.** Every folder from the top, each row with its file's name under its title and a draft mark right of it, a grip, a pencil and a menu. Drag before, after or into; a closed folder held over opens. Rename in place with `F2`, the name made from the title until it is typed, and a fix offered for a name that is not one. New page and new folder in place. Move to…, Duplicate, Delete folder…, Publish as a site…, and Undo from the message that says what was done. A filter, and a way to close every folder.
- **The editor.** Undo and Redo, of what is typed and of what Page details writes, which goes through the editor's own history. Insert, from a button or `/` on an empty line, offering only what may go where the cursor is, written a level deeper inside a container and as deep as a list item's words. The containers the cursor is in, said in the toolbar. A preview that marks and follows the block the cursor is in. Source, Split and Preview. Page details as a tab beside the preview. The title and the file's name changed at the top, Move… beside them. The top of the page folded in the source, with what it holds said beside it. A status bar with the problems, the cursor's place, and Save.
- **Was this page helpful.** `feedback: { table }` on a docs app. Turning it on from a site's menu says first what it makes: a table, `<site>-feedback`, and a change to the site, both drafts. A served page asks; an answer is `POST <app>/_feedback`, from the app's own address, rate limited, ignored when a hidden field is filled, kept once for each page in the reader's own browser, and written as a row by the workspace, with nothing of who answered. The console shows how many found a page helpful.

## Findings

- **The home page's squeeze was the grid, not the page.** The frame had three fixed tracks and drew the sidebar only when a page was in a collection, so the content fell into the sidebar's track. The sidebar and the contents' track are now always drawn.
- **A move breaks links unless they move with it.** The deploy refuses a page whose link leads nowhere, so a rename without rewriting links would make every rename a broken deploy. The planner rewrites them; a link written from the root (`/…`) is left as it was written.
- **An index built before sections were indexed has no `kind`.** The help panel's index is built at release; a filter on `kind === "page"` found nothing in one built before. It filters out sections instead.
- **Monaco's `setValue` forgets the history.** A change from outside, such as the form's, is now an edit that keeps it.
- **Not run in a browser.** The walk-through, `e2e/documentation.spec.ts`, is changed for the new screens and was not run: the only instance on this machine was the owner's own, started before this work. The served site was drawn from the built code and looked at, at 1440 and 390 pixels wide, beside the drawings.
- **"Powered by Volvel"** in the drawing's footer was left out: a tenant's site says the tenant's name, and an operator may brand the instance as their own.
- **Geist** was not added. Its licence is not on the list, and a site takes its font from the workspace's theme.
- **Pagefind** was not used: it reads built HTML with a program of its own, and these pages are drawn on each request, from drafts too, for whoever may open them.
