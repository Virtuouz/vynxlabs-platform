---
title: Search a docs site
description: "Find a page of a served docs site from its search window or its search page, narrow it to a collection or a kind of page, and know what the console itself does not search."
subjects: [documentation, search]
---

## Search a docs site

By the end you have found the page, or the place on a page, you were looking for on a served site.

## Before you start

- The site is deployed and you may open it. The same search is in the preview with drafts, over the drafts.
- You do not need to be signed in to a public site. Nothing needs a script: the search page below works without one.

## Search from the window

:::steps
1. On any page of the site press :kbd[⌘K] (:kbd[Ctrl+K]), or :kbd[/] when you are not typing in a box, or press **Search** in the site's bar. A window opens with the cursor in its box.
2. Type. Results appear a moment after you stop. Each is a page, with the folders it is in under its title, and under it the headings and passages that match, marked with `#` for a heading. The window counts the pages: "3 pages".
3. Press :kbd[↓] and :kbd[↑] to move, :kbd[Enter] to open the one that is marked, and :kbd[Esc] to close.
:::

With nothing typed, the window lists the last five pages you opened on this site, under **Recently viewed**. They are kept in your own browser.

### Narrow it

- A site with two or more collections shows buttons **All** and each collection under **Where to search**. Press one to search only that collection.
- A site whose pages have types shows **Any kind** and a button for each type present (**Tutorials**, **How-to guides**, **Reference**, **Explanations**) under **Kind of page**. Press one to search only pages of that type.

## Search without the window

Open the site's `_search` address, `<site address>_search?q=<words>`, or press **Search** where the script is off. The page is headed "Search" and says "N pages for “<words>”", with the same results and a box to search again. With no match it says "Nothing here matches “<words>”." Add `&type=how-to` to narrow it to a type.

## What matches

- Every word you type must be found (AND), in a page's title, its headings, its description or its text.
- A word matches the start of a longer one (`refun` finds "refund").
- A word with a small spelling slip still matches.
- A title counts for more than a heading, a heading more than the description.
- Only the pages of the site are searched.

## The result

The page opens at the heading you chose.

## If it does not work

- **"Nothing here matches “…”."** Use fewer or shorter words: all of them must match.
- **"The search did not answer."** with **Open the full results**: the window could not reach the site's search. Press the link to open the search page.
- **The Documentation screen's box finds nothing in the text.** **Filter pages** in the console filters the titles of the tree only.
- **A page is missing.** It may be in a folder that is not under the site, or it is to be removed. Pages of a draft appear only in the preview.
- **The console has no search over all your sites.** An API call does: see [The documentation API](../../../develop/reference/documentation/documentation-api).

## Related

- [How a docs app works](../../explanation/docs/how-a-docs-app-works)
- [Give a page a type and subjects](give-a-page-a-type-and-subjects)
