---
title: Move, rename or delete a page
description: "Put a page or a folder somewhere else, give it a new title or file name, copy it, or delete it, and know what happens to the links and to readers of the old address."
subjects: [documentation, pages, links]
---

## Move, rename or delete a page

By the end a page or folder has a new place, name or none, the links that pointed at it still lead to it, and you know when readers of the old address are taken to the new one.

## Before you start

- You are in a dev workspace and have `resource:write`, or `doc:write` alone. See [the Documentation screen](../../reference/screens/build/documentation) for who may.
- A page kept in the repository's own folder is changed there. It has no pencil, **Move to…** or grip in the tree.
- A change is a draft until you press **Deploy N changes**. Nothing a reader sees changes before that.

## Rename

:::steps
1. Open **Build**, then **Documentation**. Press the pencil beside the page or folder (**Rename <title>**), choose **Rename** in its menu (**More for <title>**), or choose the page and press :kbd[F2].
2. Change the **Page title**, the **File name**, or both. A file name follows the title until you type in it. It is lowercase letters, digits, `-` and `_`, at most 80 characters, and a title is at most 120.
3. Press **Save**, or :kbd[Enter]. :kbd[Escape] cancels.
:::

The console says "Renamed <title>." A page named `index` keeps its name: it is the folder's own page.

## Move

:::steps
1. In the tree, drag the row by its grip onto a folder to put it inside, or between two rows to put it there. A closed folder opens when you hold a row over it.
2. Or open the row's menu, choose **Move to…**, pick the folder in **Into the folder** and press **Move**. The same dialog is in the page editor, beside the file name.
:::

The console says "Moved <title> into <folder>." (or "Put <title> in its new place." in the same folder). Both folders' lists of pages follow, and each relative link to or from what moved is rewritten so that it still leads where it did. A link by topic, such as `topic:support-refunds`, and a link that starts with `/` are left as they are.

A page goes in a folder: the top level holds folders, and each is a site. A top-level folder has no grip: it cannot be dragged.

## Copy

Open the menu and choose **Duplicate**. The copy is named "<title> (copy)", with `-copy` after the file name (`-copy-2` if that is taken). It takes no topic, terms or key, since those belong to one page.

## Delete

:::steps
1. Open the row's menu and choose **Delete…** (**Delete folder…** for a folder), or press **Delete…** in the page editor.
2. Read the question. A page: "Delete <title>?" and "It is gone once this is deployed." A folder: "Its N pages go with it, once this is deployed. Readers of the old addresses are told there is no page there."
3. Type the file name the dialog asks for and press **Delete**.
:::

The row shows **To be removed**. Press **Keep**, then **Keep** again, to throw away the draft that removes it. The page stays as it was last deployed.

## Undo

Each move, rename, copy and folder or page you make says what it did with an **Undo** in the message. Pressing it puts the pages back, including the links and the lists, and says "Undone." A page that is open follows a move and follows it back.

## The result

The tree shows the new place and name, with a draft mark. Press **Deploy N changes**, then **Deploy**. After the deploy, a reader who opens the old address of a page that was moved or renamed is taken to the new one with a permanent redirect for 90 days. Until then the old address still serves the old page.

## If it does not work

- **"There is already something named <name> here."** (a move says "…named <name> in <folder>.") A page or folder has that name in the folder. Choose another.
- **"A folder cannot go inside itself."** A folder cannot be moved into a folder under it.
- **"A page goes in a folder. Top-level folders are the sites."** Pages are not made or moved to the top level.
- **"Use lowercase letters, numbers, - and _."** Press **Use <name>** to take the suggested name.
- **Rename and Move to… are missing.** The page is repository-owned, or a draft removes it (press **Keep** first), or you are in a production workspace, or you lack the permission.
- **A reader still gets "There is no page here" at the old address after a deploy.** The redirect is made by a deploy of the rename, not by a draft: deploy first. The preview with drafts (`_draft/`) never redirects. A redirect lasts 90 days.
- **A link by an absolute address, or by a topic, was not rewritten.** Those are left as written. A topic stays valid when a page moves.

## Related

- [The Documentation screen](../../reference/screens/build/documentation)
- [Links, pictures and moved pages](../../../develop/reference/documentation/links-pictures-and-moved-pages)
- [How a docs app works](../../explanation/docs/how-a-docs-app-works)
