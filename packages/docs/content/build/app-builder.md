---
title: App Builder
topic: build-screens
description: "Apps made in the console: pages of widgets over tables, with filters that readers set."
---

An app made in the console is a set of **pages**. A page is a grid of **widgets**: a table, a list, a number, a chart, a pivot, a block of text. Each widget reads from a table (or from a saved query) and shows what the person who opened the app is allowed to see. Nobody writes code, and nobody makes a screen for each person: two people who open the same app are shown the rows their groups allow.

Apps made here and apps written in the repository are the same kind of thing once deployed. See [published apps](published-apps) for where an app is served and who may open it.

## What is on a page

- **Widgets** sit on a grid of twelve columns. Each has a place and a size. On a phone the widgets stack in one column, in the order of the page.
- **Filters** run along the top of the page: a clinic, a range of dates, a word. A person who opens the page sets them, and every widget that is bound to a filter asks again. A filter has a value it starts with, so the page always says what it is showing.
- A widget is bound to a filter on purpose. When you add a filter, or a widget, the builder binds every widget whose table has that filter's column, and says which. A widget over a table without the column is left alone.

## Making an app

**Make an app** on the App Builder screen asks for a name and an address. The address is where the app's interface is kept, and it does not change when the name does. The new app opens in [the builder](app-builder-editor) with an empty first page.

Nothing a person sees changes until the app is **published**. Until then the builder works on a draft, and a reload keeps it.

## What is not here yet

Pages show what is in the tables and do not change it. These come in the next phases, and the builder does not offer them until they work:

- **Record pages.** A page for one invoice or one visit, opened from a row.
- **Forms.** Adding a row, or changing one, from a form made from the table.
- **Buttons and steps.** A button that starts a script or a flow, with a question first and a result after.

Until then, an app that needs to change data is written in the repository, as before. A widget that is clicked does nothing yet; a table's rows are read, sorted and paged.

## Changing an app's title

**Rename** in the list of apps changes the title shown in the interface and in the app's own description. The app's address does not change, and the dialog says so: links and bookmarks keep working. Changing the address itself is not offered yet.
