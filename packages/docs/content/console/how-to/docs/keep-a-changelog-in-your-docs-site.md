---
title: Keep a changelog in your docs site
description: "Write changelog entries as pages in the console, list the newest on any page with ::changelog, and let readers follow them in a feed."
subjects: [documentation, sites]
---

## Keep a changelog in your docs site

By the end your site lists its newest changes, each with its date, on a page of your choice, and readers of feeds can follow them at `changelog.xml`.

## Before you start

- A dev workspace with a folder published as a site. See [Publish a folder as a site](publish-a-folder-as-a-site). The steps use a site in the folder `m5-news` of Fernhill's Sandbox, signed in as Maya Brooks. See [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).
- `resource:write`, or `doc:write` alone, which a doc writer has. Pages are changed in a dev workspace only.

## Write the entries

:::steps
1. Open **Build**, then **Documentation**. Choose the site's folder, then press **New page**.
2. Type the title in **Page title**, for example `New intake form`. Under **Type** choose **Changelog entry**. Its hint reads "Goes in the site's changelog folder, named with today's date. A ::changelog on any page lists it."
3. Look at **File name**. It starts with today's date, as in `2026-11-24-new-intake-form`. Press **Save**. The page is made under the site's `changelog/` folder (`m5-news/changelog/`), and the editor opens with a short outline: a sentence, **What is new** and **What to do**.
4. Write what changed, and delete a heading you do not need. Press **Save draft**.
5. To make an entry about a different day, open the tab **Page details** and fill **Date** with that day. It is written to the top of the page as `date: 2026-11-13`.
6. Make a second entry the same way. To name the day in the file name instead, type the name yourself in the row, ending with the day: `reminder-wording-2026-10-30`.
:::

An entry's date is the first of these that applies: **Date**, a day that begins or ends the file name (`2026-11-24-…`, `…-2026-10-30`), and the day the page last changed.

## List the entries on a page

:::steps
1. Make a page in the site's folder, for example **What's new** (the file `what-s-new.md`), or open one that is there.
2. In the editor, write the line below on a line of its own. The **Insert** list does not offer it, so type it. `limit` is how many entries it shows, 10 when left out, from 1 to 50.

   ```md
   ::changelog{limit=2}
   ```

3. Press **Save draft**. The preview beside the source draws the newest entries, each with its title, its date and the whole of its page.
4. Narrow it when a site has more than one kind of change. `::changelog{folder=changelog/rota}` shows only the entries under that folder of the site, and `::changelog{subject=booking}` only those that name that subject.
:::

## Deploy

:::steps
1. Press **Deploy N changes**, then **Deploy**. The notice says "The documentation is deployed."
2. Open the site's page, `/apps/fernhill/sandbox/m5-news/what-s-new/`. The newest entry is first, with its date beside its title.
:::

## The result

The page lists the newest `limit` entries, newest first. Below them it says how many are left ("1 older entry, from Reminder wording"), linking to the next entry. Each entry's title links to its own page, and its own headings come under it.

Every page of the site now has a feed link in its head, and the feed is at `changelog.xml` beside the site's pages: `/apps/fernhill/sandbox/m5-news/changelog.xml`. It is RSS 2.0, newest first, with each entry's title, address, date and the start of its text. A site with no entries has no feed.

## If it does not work

- **The preview draws no entries.** The folder is not a site yet, or the page is outside its folder. Publish the folder first.
- **An entry has no date in the editor's preview.** It has no **Date** and no day in its file name. The served site shows the day the page last changed.
- **An entry comes first, with no date, on the site.** Nothing dates it, so it counts as not released.
- **A page is listed that is not in `changelog/`.** A page that names the subject `changelog` is an entry wherever it is. Remove the subject from **Page details** if it is not one.
- **The Problems panel says "The date is not a day on the calendar: "2026-02-30". Write it as YYYY-MM-DD."** The page cannot be deployed until the day is real. Choose it again in **Date**, or mend the line in the source.
- **The address of the `changelog/` folder says "There is no page here".** Only its entries are pages. Link to the page that holds `::changelog`.

## Related

- [Publish a folder as a site](publish-a-folder-as-a-site)
- [The page editor](../../reference/screens/build/documentation-editor): **Page details** and **Date**
- [The Documentation screen](../../reference/screens/build/documentation): **New page**
- [Keep a changelog from the repository](../../../develop/how-to/docs/keep-a-changelog-in-the-repository)
