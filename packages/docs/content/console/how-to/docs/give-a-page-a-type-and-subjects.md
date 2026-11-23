---
title: Give a page a type and subjects
description: "Say what a page is for, so a docs site shows its type, groups its collections by what the reader is doing, and lists related pages of the other types."
subjects: [documentation, page-types]
---

## Give a page a type and subjects

By the end a page says whether it is a tutorial, a how-to guide, a reference or an explanation, and names what it is about, so the served site shows the type over its title and the related pages under it.

## Before you start

- You are in a dev workspace and have `resource:write`, or `doc:write` alone.
- The page is in a folder, in the workspace's pages. A site that sets no types is drawn as it always was: nothing below changes it until a page or a folder says a type.
- Pages of **different** types need a subject in common to be shown to each other. Pick the words a reader would look for, and write them the same on every page about the thing.

## Say the type of a folder, and of a page

:::steps
1. Open **Build**, then **Documentation**, then choose a folder's own page (the row with `/ · index.md` under its title) and press **Edit**.
2. Open the tab **Page details**. In **Type** choose the type of every page under this folder, such as **How-to guide**. A folder's own page has no type itself: the list reads "None: the pages under it say their own".
3. Press **Save draft**. Pages under the folder that say no type of their own now have it.
4. To make a page of a different type in that folder, choose it, press **Edit**, open **Page details** and choose its own type in **Type**. A page with none reads **Use the folder's (How-to guide)**.
:::

To start a new page from a type, press **New page** or choose **New page here** in a folder's menu, fill **Page title**, and choose **Tutorial**, **How-to guide**, **Reference** or **Explanation** in **Type**. The page starts from an outline for that type. If the folder already says the type, the list reads **Folder: How-to guide** and the page says nothing of its own.

## Give a page subjects

:::steps
1. In the page's **Page details**, find **Add a subject**.
2. Type a short name, such as `refunds`, and press :kbd[Enter] or **Subject**. It is written in lowercase, with a hyphen where you typed a space. Press a button under "On other pages of this site:" to add one the site already uses.
3. Add up to five. At five the field is disabled and says "Five is the most a page uses. Remove one to add another." Remove one with its **Remove <subject>** button.
4. Press **Save draft**.
:::

::screenshot{name=docs/page-details-type alt="Page details with Type set to How-to guide, two subjects shown as chips, and buttons to add subjects other pages of the site use."}

## The result

The editor's preview shows what the served page will show: the type over the title (**Tutorial**, **How-to guide**, **Reference** or **Explanation**), and, under the page, **Related**, which lists up to four pages of each of the other types that share a subject with it, or are `about` the same resource. Pages that share the most subjects come first, then those in the same collection.

After a deploy the served site also shows, on a collection's own page and on the site's home page, **What do you want to do?** with a card for each type among its pages, when there are two or more. Each card says what the type is for ("Learn by building something, one step at a time.", "Get one task done.", "Look up how something is, exactly.", "Understand how it works and why.") and takes the reader to the first page of that type. The search window of the site gets a row of buttons **Any kind** and each type, so a reader can search only how-to guides.

## If it does not work

The problems below are warnings: they are listed under the editor with the other problems, and a page with only warnings still deploys.

- **"A how-to is followed in order, and this page has no numbered steps."** Write the steps as a numbered list or a `:::steps` block. A reference or explanation with steps is told the opposite: "Move the steps to a how-to and link to it."
- **"A how-to's title says what the reader will do…"** A tutorial's or how-to's title says a task ("Connect a table to a flow"). It does not start with About, Overview, Introduction, Understanding, What is or Why, and does not end in "?".
- **"A how-to opens with a heading that says its goal, then gives the steps."** Add a `##` heading.
- **"The type "…" is none of tutorial, how-to, reference, explanation."** The page is treated as having no type. Choose one in **Type**: a value that is none of them is shown as "<value> (not a type)".
- **"This page names 6 subjects, and the first 5 are used."** Remove the ones a reader would look for last.
- **"The subject "…" is on no other page, so it relates this page to nothing."** Said by a deploy and the build, not the editor. Use the subject on a page of another type, or remove it.
- **"This page says it is a … in a folder whose index says no type."** Said by a deploy and the build. Put the type on the folder's own page so every page in it has it.
- **No cards or Related appear on the served site.** Cards need two types among a collection's pages. Related needs a shared subject, or the same `about`, on pages of different types.

## Related

- [The page editor](../../reference/screens/build/documentation-editor)
- [How a docs app works](../../explanation/docs/how-a-docs-app-works)
- [Search a docs site](search-a-docs-site)
