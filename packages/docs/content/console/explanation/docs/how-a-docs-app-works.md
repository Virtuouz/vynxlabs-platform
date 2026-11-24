---
title: How a docs app works
description: "What a page, a folder and a docs site are, why a change waits as a draft until it is deployed, who sees what, and where the pages are kept."
subjects: [documentation, sites, drafts, names, search]
---

A workspace's documentation is a set of pages that your team writes and serves as sites to staff, to customers or to anyone. This page explains what the pieces are and why they behave as they do. To do something with them, see [the guides](../../how-to/docs/index).

## The idea

A page is a Markdown file with a few lines about itself at its top. It is a :term[resource]{id=resource} of the :term[workspace]{id=workspace}, like a table or a script: it has a path, it is deployed with the workspace, and it travels from the dev workspace to production by promotion. Pages sit in folders, to any depth. A folder's own page is the `index` inside it, and it may list the order of what is in the folder.

A **docs app** serves a folder. It is an app, so it has a path, a title and an address, and who may open it is decided as for any app, by :term[bindings]{id=binding}. Every page under the folder is a page of the site: `index` is its home page, each folder directly under it is a collection, and folders inside them go as deep as they are written. A site never serves a folder inside another, which is why only a top-level folder is offered to **Publish as a site…**. A folder with no app is still there for writers and is served by nobody.

## Why a change is a draft first

Pages are written in a :term[dev workspace]{id=dev-workspace}. Saving a page makes a :term[draft]{id=draft}: the readers of the site see the deployed page until **Deploy** is pressed. The deploy sends only documentation, and the table a site keeps its readers' answers in: it does not carry a script or a flow along.

A draft is shared by everyone who may write the workspace. Whoever saves says which version of the draft they were looking at, and a save from an older version is refused, so two people cannot overwrite one another. The page editor says so and leaves what the second person wrote on the screen. See [Resolve a draft conflict](../../how-to/docs/resolve-a-draft-conflict).

A deploy holds the pages to rules a writer sees in the editor as problems: a link to a page or a heading that is not there, a term nobody defines, a component written wrongly. A page with problems saves as a draft and does not deploy. Problems about page types and subjects are warnings and never stop a deploy.

Production is read-only: the screen lists the pages and the site there, and a change is made in a dev workspace and promoted. The product's own help owns its term and topic ids, and a workspace's page may not take them. See [Fix a page that takes a name the product keeps](../../how-to/docs/fix-a-name-the-product-keeps).

## Where the pages are written

A page is written in the console, or as a Markdown file in the repository, in the folder of pages (`platform/docs`, or the folders `volvel.yaml` names). A page kept in the repository is read in the console and changed there, because what is pushed to the workspace's branch is what is shown. A page written in the console is changed in the console. The tree marks the first kind **repository**. See [Keep documentation in the repository](../../../develop/how-to/docs/keep-documentation-in-the-repository).

## What a reader sees, and what they are told

A site is drawn by the instance. It adds to each page a contents list, **On this page**, **Previous** and **Next**, "Last updated", a button **Copy as Markdown** that fetches the page's Markdown, a search that works with and without script, and "New in version X" when the page's `since` is set.

**On this page** lists the page's `##` and `###` headings, the second kind indented under the first (a `#` is listed too when a page writes one; `####` and deeper are not). It is a column beside the page from 1280 px wide, and a bar at the top of the page, which opens to the list, below that. Each heading carries a `#` link to itself that appears when you point at the heading or Tab to the link, and is always there on a screen with no pointer. Pressing it copies the address of the heading and says "Link copied", and the page goes there. A writer does not write these links: every heading from `##` down has one.

The text is 16 px on a phone and grows with the width of the window to 20 px, and the headings are larger than the text and each level is a size of its own, so that a reader can tell them apart. A site also has a **Color theme** control: **System**, **Light** and **Dark**. On a wide screen it is three buttons at the foot of the navigation; on a phone it is one button at the foot of the drawer that goes to the next choice each time it is pressed. The choice is kept in the browser and holds across pages and a reload, and the page takes it before it is first drawn. A site that is the product's own documentation, at `/docs`, keeps the choice in the same place as the console's theme, so a member who is signed in also has it kept with their settings. Nobody signed in has it in the browser only.

A site's changelog is made of pages. A page is an entry when it is in a folder named `changelog` or names the subject `changelog`; `::changelog` on any page lists the newest, and the site serves them as a feed at `changelog.xml`. See [Keep a changelog in your docs site](../../how-to/docs/keep-a-changelog-in-your-docs-site).

A **term** on a page shows what it means when the reader hovers or focuses it. The terms the site defines and the terms of the product's own help are told to everyone who can read the page. A term that names a table, a column, a script or another resource of the workspace is told only to a reader who may already use that resource. To anyone else, such as a visitor to a public site, it is the word alone, the same as when the resource has nothing to say. The page of a public site draws the same bytes for a table you may not read as for a table with no description.

If a page, or its folder, says a **type**, the page shows it over its title, a collection page shows a card for each type, and each page lists related pages of the other types. See [Give a page a type and subjects](../../how-to/docs/give-a-page-a-type-and-subjects).

A site can ask its readers whether a page helped. The answers are rows of an ordinary table, `docs-feedback`, in the workspace, and nothing about who answered is kept. See [Ask readers whether a page helped](../../how-to/docs/ask-readers-whether-a-page-helped).

## Moves, and the old address

A page's address follows its place. When a page is renamed or moved in the console and the change is deployed, its old address answers with a permanent redirect to the new one for 90 days. A preview with drafts has no redirects, since nothing was deployed.

## What is left to others

The console has no screen for who may open a site: that is a binding, given as any access is. It has no upload for pictures: a picture lives in the repository, beside the pages. It does not search all of a workspace's sites at once: an API call does.

## How it fits

- The screens: [Documentation](../../reference/screens/build/documentation) and [the page editor](../../reference/screens/build/documentation-editor).
- What a page may say at its top, and the components: [Writing documentation](../../../develop/reference/docs/index).
- Who may write them: a **doc writer** holds `doc:*` and may write pages, docs apps and the feedback table, and deploy them. See the [permissions reference](../../../administer/reference/permissions).
