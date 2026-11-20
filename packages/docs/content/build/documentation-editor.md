---
title: The page editor
topic: build-docs-editor
description: Where a page of documentation is written, beside the page as it will be served.
---

The page's source is on one side and the page as its readers will see it on the other. The preview is drawn by the same code that serves the page, so what you see is what is served. It follows the cursor: the part of the page you are writing in is marked, and kept in view. **Source**, **Split** and **Preview** choose what is shown.

## Writing

- **Undo** and **Redo** take back any change and make it again, whether it was typed or made by **Page details**.
- **Insert**, or :kbd[/] on an empty line, puts a component where the cursor is. Inside a component it is written one level deeper, so it reads as inside it. The bar says where the cursor is, such as `tabs › tab "Cash"`.
- The page's title and its file's name are changed at the top. **Move…** puts the page in another folder.
- **Page details** is a form for the top of the page: its title, description, topic, the terms it defines and what it is about. The top of the page is folded in the source, and says what it holds.

## Problems and saving

Problems are marked on their lines as you type, by the rules a deploy holds the page to: a link to a page that is not there, a term nobody defines, a component written wrongly. A page with problems can be saved as a draft and cannot be deployed.

Saving makes a :term[draft]{id=draft}. If someone else saved the page after you opened it, your save is refused and nothing of theirs is overwritten.

See [components](../reference/docs/components) for callouts, tabs, steps, terms and the rest, and [the top of a page](../reference/docs/frontmatter) for its title, topic and order.

::screenshot{name=console/page-editor alt="The page editor: the page's Markdown on the left, the page as it will be served on the right, and its problems listed under."}
