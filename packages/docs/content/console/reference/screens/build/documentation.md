---
title: Documentation
topic: build-docs
description: "Every control, state and permission of the Documentation screen: the tree of pages, the page beside it, publishing a folder as a site, page feedback and deploying."
moved_from:
  - build/documentation
subjects: [documentation, sites, feedback, pages, names]
---

The **Documentation** screen lists the pages of one workspace as a tree of folders, and shows the page you choose beside it. A page is Markdown with a few lines about itself at its top. It is a :term[resource]{id=resource} like a table or a script: it has a path, it is deployed, and it travels with the workspace. A top-level folder can be **published as a site**, which is a docs app that serves the pages in that folder. Who may open the site is decided by :term[bindings]{id=binding}, as for any app.

The screen is reached from **Build**, then **Documentation**. F1 (**Help for this page**) opens the help topic `build-docs`. The page editor is a screen of its own: see [the page editor](documentation-editor). For the ideas, see [how a docs app works](../../../explanation/docs/how-a-docs-app-works).

::screenshot{name=console/documentation alt="The Documentation screen: the tree of pages on the left, with draft marks and a Site badge on a published folder, and the chosen page drawn on the right."}

## Where pages are changed

Pages are changed in a :term[dev workspace]{id=dev-workspace} only. In a production workspace the screen lists and shows pages and offers none of the controls below, and a link to a page's editor shows "This is a production workspace. Pages are changed in a dev workspace and reach production by promotion." (it names the linked dev workspace and links to the page in it when there is one).

In a dev workspace without the permission to change pages, the screen draws the same read-only and a line says "You can see this workspace's pages, not change it. It needs `resource:write`, or doc:write alone." followed by how to ask for access.

A page kept in a folder of the repository's own is read here and changed there: it shows a **repository** label in the tree and has no pencil, no **More for** menu, no grip and no **Edit** button.

## The header

| Control | What it does |
| --- | --- |
| **New folder** | Starts a new folder row at the top of the tree. |
| **New page** | Starts a new page row in the folder of the page that is chosen. It is disabled, with the tooltip "Make a folder first: a page goes in a folder.", while there is no folder. Pressed with a chosen page at the top level, it says "A page goes in a folder. Make a folder first." |
| **Deploy N changes** | Shown while anything is not deployed. Opens the deploy question, see [Deploying](#deploying). |

Below the header, a notice appears when pages take a term or a topic the product's own help already has: "A page takes a term or a topic that the product's own help has, so a site leaves it out and a deploy is refused: <pages>. Give it another id in the page." With more than one it says "N pages take". See [Fix a page that takes a name the product keeps](../../../how-to/docs/fix-a-name-the-product-keeps).

## The tree of pages

The panel above the tree has a box labeled **Filter pages**, which keeps the rows whose title matches, and a button that reads **Close every folder** or **Open every folder**. The tree is labeled **Pages**. Folders open and close; a folder with a page of its own (its `index.md`) opens that page when chosen. From the keyboard, :kbd[↑] and :kbd[↓] move between rows, :kbd[←] and :kbd[→] close and open a folder, :kbd[Enter] chooses a row, and :kbd[F2] renames the row that has the focus.

Each row shows:

| Part | What it shows |
| --- | --- |
| Title | The page's or folder's title. |
| File name | Under the title: `name.md` for a page, `name/` for a folder, `name/ · index.md` for a folder that has a page of its own. |
| Draft mark | A pen icon, with its words for a screen reader and as a tooltip: **Draft · not deployed** (the page changed since the deploy), **New · not deployed**, **To be removed**. A deployed page has none. |
| Badge | **Site** on a top-level folder that is published; **Site, not published** on one whose site is switched off; **repository** on a page kept in the repository's own folder. |
| Rename (pencil) | Labeled **Rename <title>**. Opens the row to edit. |
| **More for <title>** | The row's menu, below. It opens with :kbd[Enter] on the button. |

A page that is to be removed has a **Keep** button in place of the pencil and the menu.

### The row's menu

| Item | When it is there | What it does |
| --- | --- | --- |
| **New page here**, **New folder here** | A folder | Opens a new row inside it. |
| **Rename** (F2) | Always | Edits the title and the file name together. |
| **Move to…** | Always | Opens the move dialog. |
| **Duplicate** | Always | Makes a copy named "<title> (copy)" and its file name with `-copy`. |
| **Publish as a site…** | A top-level folder that is not a site. Detail: "Top-level folders only". | Opens the publish dialog. |
| **Turn on page feedback…** | A site that does not ask | Opens the feedback dialog. Detail: "Ask readers whether a page helped". |
| **Turn off page feedback…** | A site that asks | Asks first; keeps the table and its answers. Detail: "Stop asking readers". |
| **Stop publishing…** / **Publish again…** | A site | Switches the site off or on. Details: "Keeps its pages and its app" and "Served again once deployed". |
| **Remove the site's app…** | A site | Stops serving it once deployed; the pages stay. See [Questions the menu asks](#questions-the-menu-asks). |
| **Delete…**, **Delete folder…** | Always | Asks you to type the file name. |

### New page and new folder

A new row has a title field (**Page title** or **Folder title**), a field **File name** that ends in `.md` or `/` and is made from the title until you type in it, **Save** and **Cancel**. :kbd[Enter] saves and :kbd[Escape] cancels. A new page also has **Type**, a list: **None** (or **Folder: <type>** when the folder's own page already says one), **Tutorial**, **How-to guide**, **Reference**, **Explanation** and **Changelog entry**. A page made with a type starts from that type's outline, and `type:` is written on the page only when the folder does not already say it. A page made with no type has only its title.

| Limit or rule | What is said |
| --- | --- |
| A title is at most 120 characters, a file name at most 80. | A count appears past the limit. "Shorten what is past its limit first." |
| A file name is lowercase letters, digits, `-` and `_`. | "Use lowercase letters, numbers, - and _." with a button **Use <name>** that puts the fixed name in. |
| Empty title or file name. | "A title is needed." / "A file name is needed." |
| A page named `index`. | "Naming a page index makes it the folder's own page. A folder can have one." |
| Renaming a page. | "Renaming the file moves its address. The old address leads to the new one for 90 days." |

**Changelog entry** is not a type of page. Its hint reads "Goes in the site's changelog folder, named with today's date. A ::changelog on any page lists it." Choosing it puts today's date at the start of **File name** (`2026-11-24-new-intake-form`, made from the title until you type in the box; a name you type is used as typed). The page is made in the `changelog/` folder of the top-level folder that holds the chosen folder, or in the `changelog` folder the chosen folder is inside. The page has the title and an outline: a sentence, **What is new** and **What to do**. It writes no `type:`. A name already taken says "There is already an entry named <name>. Change its title or its name." See [Keep a changelog in your docs site](../../../how-to/docs/keep-a-changelog-in-your-docs-site).

A new page opens in [the page editor](documentation-editor) once it is saved. A new folder says "Made the folder <title>." and a new page "Made <title>."

### Dragging

A row has a grip. Drag it onto a folder to put it inside, or between two rows to put it there. A folder that is held over for a moment opens. The footer of the panel says "Drag to reorder or move into a folder. F2 renames." These are refused: a row onto itself, a folder into itself or into a folder under it, and a row beside a top-level row (a page goes in a folder). A top-level folder cannot be dragged, and neither can a folder holding a page that is repository-owned or to be removed. The message says "Put <title> in its new place." for the same folder and "Moved <title> into <folder>." otherwise.

Every change to the tree is saved as drafts at once and says what it did, with an **Undo** that puts the pages back ("Undone."). A move or rename that changes the page that is open follows it to its new address.

### Move dialog

**Move <title>**: "Its address changes with its folder. The old one leads to the new one for 90 days." A list **Into the folder** and the buttons **Cancel** and **Move**. A refused move shows its reason in the dialog.

### Publish dialog

**Publish <folder> as a site**: "Every page in the folder is a page of the site. Nobody outside sees it until you deploy it and say who may open it."

| Field | What it takes |
| --- | --- |
| **Site title** | Required, at most 120 characters. Starts as the folder's title. |
| **Address** | Required. Lowercase letters, digits, hyphens and underscores; the last part of the site's address and the app's path. Starts as `<folder>-site`. "The address is lowercase letters, digits, hyphens and underscores: handbook." or "Something already has that path." |

**Publish** makes a draft app. It says "<folder> will be a site once deployed." with **Undo**.

### Feedback dialog

**Ask readers of <site> whether a page helped**: "Each page ends with “Was this page helpful? Yes / No”. Here is what turning it on does." It lists what will be made: the table `docs-feedback` with the columns `site_key`, `site`, `page`, `helpful`, `version` and `at` when the workspace has none (the button reads **Make the table and turn it on**), or the existing table, which is used as it is (**Turn it on**); the change to the site; that nothing about who answered is kept and a reader answers once for each page, remembered by their own browser; and that both are drafts until you deploy. If something else already has the path `docs-feedback` the dialog says so and the button is disabled. See [Ask readers whether a page helped](../../../how-to/docs/ask-readers-whether-a-page-helped).

### Questions the menu asks

| Item | Question | Buttons |
| --- | --- | --- |
| **Stop publishing…** | "Stop publishing <site>?" Once deployed, readers are told there is nothing at its address; its pages and app are kept. | **Stop publishing**, **Cancel** |
| **Publish again…** | "Publish <site> again?" Served again once deployed; pages and address as they were. | **Publish again** |
| **Remove the site's app…** | "Remove the app of <site>?" With a deployed site: stops being served once deployed and its pages stay. Never deployed: nothing is being served. | **Remove** |
| **Turn off page feedback…** | "Turn off page feedback on <site>?" The pages stop asking once deployed; the table and its answers are kept. | **Turn off** |
| **Delete…** | "Delete <title>?" "It is gone once this is deployed." A folder: "Delete the folder <title>?" "Its N pages go with it, once this is deployed. Readers of the old addresses are told there is no page there." Type the file name to confirm. | **Delete** |
| **Keep** | "Keep <title>?" "This throws away the draft that removes it. The page stays as it was last deployed." | **Keep** |

Each of these says what it did ("<site> will stop being served when you deploy." and so on) with an **Undo**, except **Delete** and **Keep**, which are taken back with **Keep** and by deleting again.

**Remove the site's app…** makes a draft that removes the app. The folder then shows no **Site** badge and offers **Publish as a site…** again. **Deploy N changes** counts the removal, so with no other change the button is there for it alone, and the deploy stops the site.

## The page beside the tree

Choosing a page draws it as its readers see it, with the same code: the product's terms, the workspace's terms, `::pages`, `::glossary`, `::changelog` (the entries of the page's own site), diagrams, the page's type shown over its title, and the pages related to it below. At the top:

- the folders the page is in, with ` › ` between them;
- the title, and a pill with the page's state when it is not deployed;
- the file name `<path>.md`, with " · no site publishes this page" when no site's folder holds it;
- when the page's site asks readers and you may read the answers: "N found it helpful · M didn't".

| Button | When | What it does |
| --- | --- | --- |
| **Compare with deployed** | A page you may change, whose state is a draft over a deployed page | Opens the editor with the changes shown. |
| **Open as readers see it** | The site is deployed and the page is not new | Opens the served page in a new tab. |
| **Preview with drafts** | A page or its site is not deployed as it is, and you may change pages | Opens the preview in a new tab; see [A docs app](../../../explanation/docs/how-a-docs-app-works). |
| **Edit** | A page you may change, not repository-owned, not to be removed | Opens the editor. |

Notices above the page: for a repository page, "This page lives in the repository, at <file>. Change it there: what is pushed to the workspace's branch is what is shown here."; for a page to be removed, "A draft removes this page. It is gone once that is deployed." with **Keep this page**; for a page that would not deploy, "This page has N problem(s) and would not deploy as it is." and the first problem.

## States

| State | What the screen shows |
| --- | --- |
| Loading | A loading line. |
| The list failed | The error with a retry. |
| No pages and no sites | **No documentation yet**: "A folder of pages, published as a site, serves your staff, your customers or anyone, as you choose. Pages are written here, or as Markdown files in the repository." With **New folder** where you may change pages. |
| An address that is not a page | "There is no page at <path>. Choose one from the list." |
| No page chosen | "Choose a page from the list, or make one." |
| A filter that finds nothing | The tree is empty. |

## Deploying

**Deploy N changes** counts each page and docs app that is not deployed as it is, and each draft table a site keeps its answers in. It asks "Deploy N changes to the documentation?" and says "Readers see them at once. Nothing but documentation is deployed." When a table goes along it says "Readers see them at once. With the documentation goes the table <name>, where a site keeps its readers' answers. Nothing else is deployed." The buttons are **Deploy** and **Cancel**. Success says "The documentation is deployed." A page with problems is refused by the deploy, which names the page and the problem.

## Permissions

| Action | Needs |
| --- | --- |
| See the screen, the pages and the sites | `resource:read` in the workspace, or `doc:read` alone |
| New folder, New page, rename, move, duplicate, delete, drag, publish, page feedback, Edit, Deploy | A dev workspace, and `resource:write`, or `doc:write` alone |
| Read the "found it helpful" line | Reading the table `docs-feedback` (`data:read` on it) |

A **doc writer** holds `doc:*`, `app:read`, `table:read` and `workspace:read`. It may write pages, docs apps and the table `docs-feedback` with exactly its columns, and deploy them, and nothing else. A **workspace admin** also holds `doc:*`. See the [permissions reference](../../../../administer/reference/permissions).

## Related

- [The page editor](documentation-editor)
- [How a docs app works](../../../explanation/docs/how-a-docs-app-works)
- [Resolve a draft conflict](../../../how-to/docs/resolve-a-draft-conflict)
- [Move, rename or delete a page](../../../how-to/docs/move-rename-or-delete-a-page)
- [Publish a folder as a site](../../../how-to/docs/publish-a-folder-as-a-site)
- [Keep a changelog in your docs site](../../../how-to/docs/keep-a-changelog-in-your-docs-site)
- [Writing documentation](../../../../develop/reference/docs/index): the top of a page, and components
