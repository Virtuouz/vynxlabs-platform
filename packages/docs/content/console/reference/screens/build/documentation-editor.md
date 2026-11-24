---
title: The page editor
topic: build-docs-editor
description: "Every control, state and key of the page editor: the source and the page as served side by side, Page details, problems, saving, comparing, moving and deleting."
moved_from:
  - build/documentation-editor
subjects: [documentation, drafts, page-types, pages]
---

The page editor is where one page of documentation is written. The page's Markdown is on one side and the page as its readers will see it is on the other. The preview is drawn by the same code that serves the page, so it shows the type over the title, the cards of a collection's own page, the related pages below, the product's terms and the workspace's terms. It follows the cursor: the part of the page you are writing in is marked and kept in view. A `::changelog` line draws the entries of the page's own site, newest first, once the page's folder is published as a site; a page not in a site shows none. An entry with no `date` and no day in its name shows no date here, where the served site shows the day it last changed.

The editor opens from **Edit** on the [Documentation screen](documentation), from a new page's row, and from the **Edit** link of a page listed on a resource's screen. F1 (**Help for this page**) opens the help topic `build-docs-editor`. It is changed in a :term[dev workspace]{id=dev-workspace} only: in a production workspace the address shows "This is a production workspace. Pages are changed in a dev workspace and reach production by promotion."

::screenshot{name=console/page-editor alt="The page editor: the page's Markdown on the left, the page as it will be served on the right, and the problems listed under both."}

## The header

| Part | What it shows or does |
| --- | --- |
| Path above the title | **Documentation** (a link back) and the folders the page is in, with ` › ` between them. |
| Title | The page's title as it is typed in the source. The pencil, labeled **Change the title**, opens a field **Page title**: :kbd[Enter] or leaving the field keeps it and :kbd[Escape] drops it. A count shows past 120 characters, and a longer title is not kept. If the top of the page cannot be read, "The top of this page cannot be read. Mend it in the source first." |
| State pill | **Not saved yet** for a page not yet made; **Draft** for a page with a draft; **To be removed** for a page a draft removes. A deployed page has none. |
| File name | `folder/` then the file's name in a box that ends in `.md`, and **Move…**. Typing a new name and pressing :kbd[Enter] (or leaving the box) renames the file. A name that is not lowercase letters, digits, `-` and `_` says "Use lowercase letters, numbers, - and _." The name `index` is locked. Success says "Renamed to <name>.md." and the address follows. |
| **Path** (a new page only) | "Where the page is: its folder, then its file's name. A page goes in a folder." It refuses "A path is lowercase letters, digits, hyphens and underscores, in folders.", "There is a page at that path already." and "A page goes in a folder: handbook/refunds." Save is disabled until it is a good path. |
| **Compare with deployed** / **Hide what is deployed** | For a page that has been deployed. Shows **What changes** under the editor, **Deployed** against **As it is here**, or "Nothing: this is what is deployed." The Documentation screen's **Compare with deployed** opens it already on. |
| **Preview in the app** | For a page of a site, not a new page. Opens the site's preview with drafts in a new tab. |
| **Delete…** | Asks you to type the file name, then saves a draft that removes the page, and goes back to the Documentation screen. |
| **Done** / **Close** | Goes to the page on the Documentation screen, or to the screen itself for a page not yet saved. It reads **Close** while there are unsaved changes, and leaving asks "Your changes to the page <path> are not saved." |

## The writing area

A toolbar labeled **Write** has, in order:

| Control | What it does |
| --- | --- |
| **Undo**, **Redo** | Take back and make again any change, whether typed or made by **Page details**. |
| **Insert** (:kbd[/]) | Opens the component list at the cursor; see below. :kbd[/] on an empty line opens it too. |
| **Heading**, **Bold**, **Italic**, **Link**, **List**, **Code** | Write `## `, `**…**`, `_…_`, `[…](address)`, `- ` and `` `…` `` around the selection. :kbd[⌘B], :kbd[⌘I] and :kbd[⌘K] (:kbd[Ctrl] on other systems) do the first three and the link. |
| "Cursor in …" | Names the containers the cursor is inside, such as `tabs › tab "Cash"`. |
| **Source**, **Split**, **Preview** | What is shown. **Split** is offered at 1024 px and wider, and is where it opens at that width. |
| Tabs **Preview** and **Page details** (labeled **Beside the source**) | The two things the right-hand side can show. In **Source** it is hidden; in **Split** it is beside the source at 1024 px and wider, and in **Preview** it fills the width. The preview says "Following the cursor · <container>" under the page while the cursor is in a container, and "Nothing written yet." while the source is empty. |

The lines between the two `---` at the top are folded in the source, and a line beside them says what they hold, such as "Title, description, topic, 2 terms · Edit in Page details". The source is Monaco: it has line numbers, and a problem is marked on its line.

### Insert

A search box **Find a component** filters the list, which has **Blocks** and **Inline**. It offers the components the `docs` profile has and that can go where the cursor is: **Callout**, **Tabs**, **Tab**, **Steps**, **Details**, **Code tabs**, **File tree**, **Pages in this folder**, **Glossary**, **Field**, **Term** and **Key**. Inside **Tabs** only **Tab** is offered, inside **Code tabs** nothing, and **Tab** only inside **Tabs**. A search that finds nothing says "Nothing is called that." A footer says "Inserts at the cursor", and "inside" the container it is in. :kbd[↑], :kbd[↓] and :kbd[Enter] choose, and :kbd[Escape] closes the list and returns to the source. Inside a component the new one is written one level deeper. The product's own `product` and `screenshot` components are not offered: no tenant page may use them. `::changelog` is not in the list either: type it. What each takes is in [Writing documentation](../../../../develop/reference/docs/components).

## Page details

The tab **Page details** is a form for the top of the page. It writes the page's own source, the lines a person would have typed, and leaves what it does not show as it was; each change is a step that **Undo** takes back. If the lines cannot be read it says so and offers nothing until they are mended in the source.

| Field | What it takes |
| --- | --- |
| **Title** | Required, at most 120 characters. |
| **Topic** | At most 80 characters; lowercase letters, digits, `-` and `_`. A name that stays when the page moves. |
| **Description** | At most 500 characters. |
| **Date** | A day, chosen from the browser's date field, optional. For a changelog entry: the day it is about, written as `date: YYYY-MM-DD`. Without it the entry takes a day that begins or ends its file name, else the day the page last changed. |
| **Icon** | Only on a folder's own page (`index`), or where one is already written. At most 40 characters. |
| **Type** | A list: **None** (on a folder's own page, "None: the pages under it say their own"; on another, **Use the folder's (<type>)** when the folder says one), **Tutorial**, **How-to guide**, **Reference**, **Explanation**. A written type that is none of them is kept and shown as "<value> (not a type)". |
| **Add a subject** | A short name, at most 80 characters, written lowercase with a `-` for a space. :kbd[Enter] or **Subject** adds it. At most five count: the field is disabled with "Five is the most a page uses. Remove one to add another." A sixth written in the source is struck through and the form says "Only the first 5 are used." Each chosen subject has a button **Remove <subject>**. Subjects other pages of the site use are offered as buttons **Add <subject>** under "On other pages of this site:". |
| **Terms it defines** | A row per term: **Term**, **Id**, **Also written** (separated by commas, at most 10) and **What it means** (at most 500 characters), and **Remove <term>**. **Term** adds a row. At most 50. |
| **What it is about** | A row per resource: **Kind** (table, script, flow, app, connection, query) and **Path**, with a remove button. **Resource** adds one. At most 50. |
| **Notes on the product's help** | **Add this page's notes to** lists the topics of the product's help, "Choose a topic of the help…". Each chosen one shows by its title with a remove button. At most 20. |

A page's place among the others is not here: drag it in the tree, or list it in `pages:` on its folder's own page. The top of the page also takes `key`, `since` and `moved_from`, written in the source only. See [what the top of a page says](../../../../develop/reference/docs/frontmatter).

## Problems

The panel under the editor is labeled **Problems**. It lists each by its **Line** and its words; pressing one moves the cursor to the line. Its heading reads **No problems** or "N problem(s)", and a line says "This page would deploy as it is." or "Mend these before it can be deployed." Beside them are the cursor's line and column, as **Ln** and **Col**.

Problems are the rules a deploy holds the page to: a link to a page, topic or heading that is not there, a term nobody defines, a component written wrongly, a path an `about` names that is not a resource you may see, a term or topic the product keeps. A page with an error can be saved as a draft and cannot be deployed. The problems about types and subjects are warnings, and a page with only warnings deploys: a type with the wrong kind of page (steps in a reference, no steps in a tutorial or how-to), a title that does not say a task, a how-to with no heading, an unknown type, more than five subjects. A subject used on one page only, and a type written on a page in a folder that says none, are said by the deploy, not here.

## Saving

| Control | What it does |
| --- | --- |
| **Save draft** (:kbd[⌘S] or :kbd[Ctrl+S]) | Saves what is typed as the page's draft. It says "Saved as a draft. Deploy it from Documentation when it is ready." or, with errors, "Saved as a draft. It has problems to mend before it can be deployed." Disabled while nothing is changed or a save is under way. What is typed while a save is under way is saved after it. |
| **Discard** | Puts back the text as it was last saved. |
| "Unsaved changes" | Shown beside them while the text differs from the saved one. |

A draft is shared by everyone who may write the workspace. A save from a page someone else saved since you opened it is refused, and a banner says "Someone else saved this page after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." with **Copy what I wrote** and **Load their version**. **Load their version** asks "Load their version?" ("What you changed since you opened the page is replaced by what they saved. Copy it first if you want to keep it.") and takes **Load theirs** or **Cancel**. See [Resolve a draft conflict](../../../how-to/docs/resolve-a-draft-conflict).

A page to be removed shows "A draft removes this page. It is gone once that is deployed. What is shown is what is deployed now; keep the page to change it." with **Keep this page**. Its source is read-only until it is kept, and saving is refused.

Deploying is done from the [Documentation screen](documentation), never from the editor.

## States

| State | What the editor shows |
| --- | --- |
| Loading | A loading line. |
| The page or the list failed | The error with a retry. |
| A new page (`/docs/new`) | The title "New page", **Not saved yet**, the **Path** field and a starter: the title, an empty description and "Write here." |
| A deployed page with no draft | The page, no pill, **Compare with deployed**. |
| A draft | **Draft**, and **Save draft** once changed. |
| A page to be removed | See above. |
| Someone else saved | See above. |

## Permissions

| Action | Needs |
| --- | --- |
| Open the editor | A dev workspace, and `resource:read`, or `doc:read` alone, to read the page |
| Save a draft, rename, move, delete | `resource:write`, or `doc:write` alone |
| Preview in the app | Being a member who may read the workspace's documentation |

## Related

- [The Documentation screen](documentation)
- [Keep a changelog in your docs site](../../../how-to/docs/keep-a-changelog-in-your-docs-site)
- [Resolve a draft conflict](../../../how-to/docs/resolve-a-draft-conflict)
- [Give a page a type and subjects](../../../how-to/docs/give-a-page-a-type-and-subjects)
- [Writing documentation](../../../../develop/reference/docs/index)
