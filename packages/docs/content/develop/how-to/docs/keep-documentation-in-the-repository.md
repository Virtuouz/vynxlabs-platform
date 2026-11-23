---
title: Keep documentation in the repository
description: "Write a workspace's pages as Markdown files beside the code, serve them with a docs app, check them with the build and deploy them with the rest."
subjects: [documentation, repository]
---

## Keep documentation in the repository

By the end your pages are files in the repository, a docs app serves them, `volvel build` checks them, and a deploy sends them with everything else.

## Before you start

- A repository the `volvel` command reads, and a login that may deploy to a dev workspace. See [the volvel command](../../reference/cli).
- A page that is a file is read-only in the console: it shows **repository** in the tree and "This page lives in the repository, at <file>. Change it there."

## Write the pages

:::steps
1. Make the folder of pages. It is `platform/docs` unless `volvel.yaml` names others:

   ```yaml title=volvel.yaml
   docs: [docs]
   ```

   The folders `volvel.yaml` names are the places Markdown is read. Markdown anywhere else in the repository is nobody's page.
2. Put each page in a file whose path is the page's path: `docs/handbook/support/refunds.md` is the page `handbook/support/refunds`. File and folder names are lowercase letters, digits, hyphens and underscores, and are never changed to make them fit.
3. Begin each file with the lines that say what the page is:

   ```md title=docs/handbook/support/refunds.md
   ---
   title: Refund an order
   description: How support issues a full or partial refund.
   topic: support-refunds
   ---

   Ask for the RMA first.
   ```

   The fields are listed in [the top of a page](../../reference/docs/frontmatter). A folder's own page is `index.md` and lists the order of what is in the folder with `pages:`.
4. Serve the top-level folder with an app and let people open it. Write it in a file the entry file exports, such as `src/docs.ts` with `export * from "./docs.ts";` in `src/index.ts`: only what the entry file exports counts.

   ```ts title=src/docs.ts
   import { defineApp, defineBinding } from "@volvel/sdk";

   export const handbook = defineApp({ path: "handbook", title: "Handbook", docs: "handbook" });
   export const open = defineBinding({
     path: "access/handbook",
     role: "portal_user",
     principal: { type: "anonymous" },
     resource: handbook,
   });
   ```

   Every page whose path is under `handbook` is a page of the site. A site never serves a folder inside another. Who may open it is decided by bindings: nobody outside without one.
5. Add a picture beside the pages, such as `docs/handbook/img/till.png`, and write it `![The till](img/till.png)` from the home page. Pictures are files of the repository; the console has no upload. See [Links, pictures and moved pages](../../reference/documentation/links-pictures-and-moved-pages).
6. Check it: `volvel build`. It reads the pages, and refuses a workspace whose links, headings, terms and `about` do not hold together. It does not check that a picture is there, or the product's own terms and topics; the deploy does.
7. Deploy: `volvel deploy --tenant <slug> --workspace <slug>`.
:::

## When you move or rename a file

The file's path is the page's address. To keep a moved page the same page, add `key:` with the path it had, and add `moved_from` with the paths it had, inside the site (`support/returns` for a page that was `handbook/support/returns`), if readers may use the old address. See [Links, pictures and moved pages](../../reference/documentation/links-pictures-and-moved-pages).

## The result

The pages are in the workspace, and the console's Documentation screen lists them with **repository**. The site is served at its address, `/apps/<tenant>/<workspace>/handbook/`. A page's links, topics and terms were checked by the build, and its pictures and the product's names by the deploy.

## If it does not work

`volvel build` and every deploy refuse a workspace whose documentation does not hold together, naming each problem with its page and line. The build does not know the product's own terms and topics, apart from the prefix `volvel-`, or whether a picture is there: the deploy refuses those ("The picture "img/absent.png" is not there: no file at img/absent.png."):

- a page that does not read, such as a `title` over 120 characters or a key the top does not take;
- a link to a page or a heading that is not there;
- a term nobody defines;
- a page about a resource that is not there (`about`);
- two apps serving the same pages;
- a term or a topic the product's own help already has, or that starts with `volvel-`;
- a site that names a feedback table that is not there.

Warnings about page types and subjects are printed and do not stop the build or the deploy. An older instance may not know `type`, `subjects` or `moved_from`: the deploy then says "the instance may be older".

- **"This deploy would delete N resources made in the console, because this repository has no file for them."** The workspace holds pages or other resources written in the console. Run `volvel pull` to bring them into `platform/`, or deploy again with `--allow-delete <path>` for each one that may go.
- **The page's picture does not show.** A picture is found only in the folder of pages of the app that serves it. A picture by an `https` address is allowed, and is not drawn offline.

## Related

- [Run a docs app locally](run-a-docs-app-locally)
- [The Documentation screen](../../../console/reference/screens/build/documentation)
- [Writing documentation](../../reference/docs/index)
