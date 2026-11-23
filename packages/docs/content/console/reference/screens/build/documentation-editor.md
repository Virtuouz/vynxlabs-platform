---
title: The page editor
topic: build-docs-editor
description: Where a page of documentation is written, beside the page as it will be served.
moved_from:
  - build/documentation-editor
---

The page's source is on one side and the page as its readers will see it on the other. The preview is drawn by the same code that serves the page, so what you see is what is served. It follows the cursor: the part of the page you are writing in is marked, and kept in view. **Source**, **Split** and **Preview** choose what is shown.

## Writing

- **Undo** and **Redo** take back any change and make it again, whether it was typed or made by **Page details**.
- **Insert**, or :kbd[/] on an empty line, puts a component where the cursor is. Inside a component it is written one level deeper, so it reads as inside it. The bar says where the cursor is, such as `tabs › tab "Cash"`.
- The page's title and its file's name are changed at the top. **Move…** puts the page in another folder.
- **Page details** is a form for the top of the page: its title, description, topic, its type and subjects, the terms it defines and what it is about. The top of the page is folded in the source, and says what it holds.

## Type and subjects

A site can sort its pages by what the reader is doing: **Tutorial** (learning by doing), **How-to guide** (getting a task done), **Reference** (looking a fact up) and **Explanation** (understanding why). In **Page details**, **Type** sets it for the page. Where the folder's own page already says a type, a page that says none has the folder's, and the choice reads **Use the folder's** with its name. On a folder's own page, a type is the type of every page under it, and that page has none itself.

**Subjects** are up to five short names, such as `refunds`, that are the same on every page about the thing. They are written in lowercase, with a hyphen for a space. The subjects other pages of the site use are offered to add with one press. Pages of different types that share a subject, or that are about the same resource, are shown to each other as **Related**.

A site that sets no types is drawn as it always was.

The preview shows what the served page will show: the type over the title, a card for each type on a collection's own page when its pages are of two types or more, and the related pages under the page. Problems about a page's type are warnings, never errors: a how-to with no numbered steps, a title that does not say a task, a subject used on one page only. They are listed with the other problems, and a page with only warnings still deploys.

## Problems and saving

Problems are marked on their lines as you type, by the rules a deploy holds the page to: a link to a page that is not there, a term nobody defines, a component written wrongly. A page with problems can be saved as a draft and cannot be deployed.

Saving makes a :term[draft]{id=draft}. If someone else saved the page after you opened it, your save is refused and nothing of theirs is overwritten.

See [components](../../../../develop/reference/docs/components) for callouts, tabs, steps, terms and the rest, and [the top of a page](../../../../develop/reference/docs/frontmatter) for its title, topic and order.

::screenshot{name=console/page-editor alt="The page editor: the page's Markdown on the left, the page as it will be served on the right, and its problems listed under."}
