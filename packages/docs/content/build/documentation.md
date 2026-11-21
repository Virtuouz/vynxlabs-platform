---
title: Documentation
topic: build-docs
description: Pages your team writes, served as sites to staff, to customers or to anyone.
---

A workspace's documentation is made of pages. A page is Markdown with a few lines about itself at its top, and is a :term[resource]{id=resource} like any other: it has a path, it is deployed, and it travels with the workspace.

Any top-level folder can be **published as a site**: a docs app that serves the pages in that folder. Who may open the site is decided as for any app, by :term[bindings]{id=binding}: staff only, your own customers, or anyone.

## Folders are the structure

A folder's own page is the `index` page inside it. Under a site's folder, `index` is the home page, each folder is a collection, and folders inside them go as deep as you make them.

A folder's own page can list the order of what is in it, with `pages:`. Anything it does not list comes after, by title. A folder's own page with nothing written in it shows what is in the folder, and `::pages` does the same anywhere on a page. `::glossary` lists every term the collection's pages define, and a block of code written as `mermaid` is a diagram the reader can move and zoom.

## The tree of pages

In a :term[dev workspace]{id=dev-workspace} the tree is where pages and folders are made, named and put in order, without opening a page:

- Drag a row by its grip: a line between two rows puts it there, a folder that fills in puts it inside. A closed folder held over for a moment opens.
- Press the pencil, or :kbd[F2], to change a title and a file's name together. Renaming a file moves its address, and the old one leads to the new one for 90 days.
- A folder's menu makes a page or a folder in it, moves it, copies it, deletes it with everything in it, and publishes a top-level folder as a site.
- A change can be undone from the message that says it was made.

The file's name is under each title. A page that is not deployed as it is carries a draft mark beside its title.

## Asking readers

A site can end each page with "Was this page helpful?". Turning it on makes one table of the workspace's, `docs-feedback`, the first time, and every site of the workspace keeps its answers there as rows: the site, the page, whether it helped, the version read and when. When the table is there, turning it on for another site changes only that site. Nothing about who answered is kept, and a reader answers once for each page. The table is queried like any other.

## Two ways to write

A page can be written here, or kept in the repository as a Markdown file in the folder of pages. A page kept in a folder of the repository's own is read here and changed there.

Either way a change is a :term[draft]{id=draft} until it is deployed. See [the page editor](documentation-editor), and [what a page is made of](../reference/docs/index).

::screenshot{name=console/documentation alt="The Documentation section: the pages as a tree on the left, and the chosen page drawn on the right."}

## Publishing, and taking it back

A site has a **publishing switch**. Turning it off stops serving the site and keeps its pages and its app; turning it on serves it again at the next deploy. Removing the site's app also stops it, and says so first. Page feedback is turned off from the site's menu, and asks first. A page drafted for removal offers **Keep this page**, and a move or a publish can be undone from the message that says it happened.

Deploying a site that asks readers for feedback also deploys the table that holds the answers, and the count says so.

A member with the **doc writer** role may draft and deploy the table `docs-feedback`, and only that table, so a developer need not have made it first. A table of any other kind, or one whose columns are not the feedback columns, is still refused.

### Answers from more than one site

The feedback table has the columns `site_key`, `site`, `page`, `helpful`, `version` and `at`. `site_key` is the site app's key, which a rename keeps, so a site that is renamed or moved still owns its answers; `site` is its name when the answer was given, for people to read. To read one site's answers, filter on `site_key`. A table per site (`<site>-feedback`) is no longer made, and one made before is not read.
