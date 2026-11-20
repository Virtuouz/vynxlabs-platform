---
title: Documentation
order: 12
topic: build-docs
description: Pages your team writes, served as sites to staff, to customers or to anyone.
---

A workspace's documentation is made of pages. A page is Markdown with a few lines about itself at its top, and is a :term[resource]{id=resource} like any other: it has a path, it is deployed, and it travels with the workspace.

A **docs app** serves the pages under one folder as a site. Who may open the site is decided as for any app, by :term[bindings]{id=binding}: staff only, your own customers, or anyone.

## Folders are the structure

There is no file that lists the pages. Under the app's folder, `index` is the home page, each folder is a collection, and each folder inside a collection is a group. Pages sort by `order`, then by title.

## Two ways to write

A page can be written here, in a :term[dev workspace]{id=dev-workspace}, or kept in the repository as a Markdown file in the folder of pages. A page kept in a folder of the repository's own is read here and changed there.

Either way a change is a :term[draft]{id=draft} until it is deployed. See [the page editor](documentation-editor), and [what a page is made of](../reference/docs/index).

::screenshot{name=console/documentation alt="The Documentation section: the pages as a tree on the left, and the chosen page drawn on the right."}
