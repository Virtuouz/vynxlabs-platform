---
title: Fix a page that takes a name the product keeps
description: "A page defines a term or a topic that Volvel's own help already has, or one that starts with volvel-: find the page, give it another id, or add notes to the product's topic instead."
subjects: [documentation, names]
---

## Fix a page that takes a name the product keeps

By the end no page of the workspace defines a term or a topic that the product's own help owns, and the documentation deploys.

## Before you start

- You are in a dev workspace and have `resource:write`, or `doc:write` alone.
- Volvel's own help has terms and topics. A workspace's pages may use the product's terms, and add notes to its topics, but may not take their names. After an upgrade a name can become the product's: a page that defined it before is then in the way.

## Find the page

The Documentation screen shows a notice over the tree: "A page takes a term or a topic that the product's own help has, so a site leaves it out and a deploy is refused: <pages>. Give it another id in the page." (With several: "N pages take…".) The editor shows the same as an error on the page's first line:

- "The term "<id>" is one of the product's own, and cannot be defined again. Give yours another id."
- "The topic "<id>" is one of the product's own. A page can add notes to it with extends: [<id>], and cannot take its name."

A deploy is refused with "The bundle's manifests are not valid." and the page and the problem. A page that was deployed before the product took the name loses the name on its served site silently: the notice is how you learn of it.

## Give the page another id

:::steps
1. Choose the page named in the notice and press **Edit**.
2. Open **Page details**. For a topic, change **Topic** to an id of your own, such as `front-desk-walk-in`. For a term, change **Id** in **Terms it defines**.
3. Find each place in the workspace's pages that uses the old id, such as `:term[word]{id=old}` and `[text](topic:old)`, and change it.
4. The first line's problem goes, and the problems panel says **No problems** (or only the warnings it had). Press **Save draft**.
5. Back on the Documentation screen the notice is gone. Press **Deploy N changes**, then **Deploy**.
:::

A topic or term id of your own must not start with `volvel-`: that prefix is the product's, and the editor refuses it with the same words.

## Add your notes to the product's topic instead

If you meant to add to the product's help, keep the page's own topic and, under **Notes on the product's help**, choose the product's topic in **Add this page's notes to**. The page is then shown under "From your team" in the console's help for that topic, and it does not take the topic's name.

## The result

The page deploys. Its site draws every page of the folder, and the page you fixed has its own id.

## If it does not work

- **The notice stays after you saved.** It is drawn from the deployed and the draft pages together. Deploy, or find another page named in it.
- **The notice names a page you did not touch.** The product took the name in an upgrade. Fix that page as above.
- **The deploy still fails.** Read the page and problem it names. Other problems (a link to a page that is not there, a term nobody defines) are listed under the editor.

## Related

- [The Documentation screen](../../reference/screens/build/documentation)
- [The page editor](../../reference/screens/build/documentation-editor)
- [How a docs app works](../../explanation/docs/how-a-docs-app-works)
