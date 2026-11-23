---
title: Publish a folder as a site
description: "Make a top-level folder of pages a docs site, deploy it, choose who may open it, preview drafts before readers see them, and stop or remove it."
subjects: [documentation, sites]
---

## Publish a folder as a site

By the end a top-level folder of pages is served at its own address, and you have decided who may open it.

## Before you start

- You are in a dev workspace and have `resource:write`, or `doc:write` alone.
- A top-level folder with at least one page in it. See [the Documentation screen](../../reference/screens/build/documentation). A site never serves a folder inside another, so only a top-level folder is offered.
- To let anyone but members open the site you need a :term[binding]{id=binding}. A doc writer cannot make one: ask a tenant admin, or see [Give someone access](../../../administer/how-to/access/give-access).

## Publish

:::steps
1. Open **Build**, then **Documentation**. Open the folder's menu (**More for <folder>**) and choose **Publish as a site…**.
2. In **Site title** type what the site is called. In **Address** type the last part of its address: lowercase letters, digits, hyphens and underscores. It starts as `<folder>-site`.
3. Press **Publish**. The console says "<folder> will be a site once deployed." The folder shows **Site, not published** until then.
4. Press **Deploy N changes**, then **Deploy**.
5. Choose a page of the site and press **Open as readers see it**. The site opens in a new tab at `/apps/<tenant>/<workspace>/<address>/`.
:::

## Preview drafts before readers see them

**Preview with drafts** opens the site with the workspace's drafts laid over it, at the site's address followed by `_draft/`. Only a member who may read the workspace's documentation (`doc:read` or `resource:read`) sees it; anyone else is told the page is not there, even if the site is public. The page says "A preview, with the workspace's drafts." and is marked `noindex`. Answers to "Was this page helpful?" are not kept in it. A picture is the deployed one, since a picture is not drafted in the console.

## Who may open the site

A docs app is opened as any app is: by a binding that gives a role to a person, a group, a service account or anonymous visitors. With none, a person outside the workspace's members cannot open it. The Documentation screen does not make bindings. A tenant admin gives access, as in [Give someone access](../../../administer/how-to/access/give-access), or the repository defines the binding with `defineBinding`.

## Stop it, bring it back, or remove it

| To | Choose | What happens |
| --- | --- | --- |
| Stop serving it for now | **Stop publishing…** then **Stop publishing** | After the next deploy readers are told there is nothing at its address. The pages and the app are kept. The badge reads **Site, not published**. |
| Serve it again | **Publish again…** then **Publish again** | Served again after the next deploy, with its pages and address as they were. |
| Remove its app | **Remove the site's app…** then **Remove** | Stops serving it after the next deploy. The pages stay, and the folder can be published again. |

Each says what it did, with an **Undo**.

## The result

The site's home page lists its collections and the pages updated most recently. Each page has a contents list, **Previous** and **Next**, "Copy as Markdown", "Last updated" and a search of the site. A page that is not under the site's folder is not served.

## If it does not work

- **"Something already has that path."** Another page or app has the address. Choose another.
- **"The address is lowercase letters, digits, hyphens and underscores: handbook."** Fix the address; it is checked as you type.
- **The site says there is no page.** The site is not deployed, or it is **Site, not published** and answers that there is nothing at its address. A reader with no binding cannot open it.
- **The deploy is refused naming a page.** A page has a problem or takes a name the product keeps. See [Fix a page that takes a name the product keeps](fix-a-name-the-product-keeps).
- **There is no "Publish as a site…" in the menu.** It is offered for top-level folders that are not already a site, in a dev workspace, to a member who may change pages.

## Related

- [How a docs app works](../../explanation/docs/how-a-docs-app-works)
- [Ask readers whether a page helped](ask-readers-whether-a-page-helped)
