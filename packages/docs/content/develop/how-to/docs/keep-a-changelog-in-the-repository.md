---
title: Keep a changelog in the repository
description: "Write changelog entries as Markdown files in a changelog folder, date them in the name or in the page, list the newest with ::changelog, and deploy the site with its feed."
subjects: [documentation, sites]
---

## Keep a changelog in the repository

By the end the repository holds a changelog as files, a page lists its newest entries with their dates, and the deployed site serves a feed of them at `changelog.xml`.

## Before you start

- A repository with a docs app, as in [Keep documentation in the repository](keep-documentation-in-the-repository). The steps use the app `handbook` over `docs/handbook`, and Fernhill's workspace `sandbox`. See [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).
- A login that may deploy to a dev workspace: see [the volvel command](../../reference/cli). A deploy makes the workspace what the repository holds, and it stops before it deletes a page the repository no longer has: deploy to a dev workspace of your own, and name a page that should go with `--allow-delete`.

## Write the entries

:::steps
1. Make a folder named `changelog` inside the site's folder, `docs/handbook/changelog/`. A page is an entry when any folder in its path is named `changelog`, or when its `subjects` name `changelog`. A folder's own `index.md` is never an entry.
2. Put each entry in a file. Begin the file name with its day, or end it with its day:

   ```md title=docs/handbook/changelog/2026-11-24-new-intake.md
   ---
   title: New intake form
   ---

   The front desk's intake form now asks for a mobile number.

   ## What is new

   - A client can give a mobile number when they register.
   ```

   `rota-swaps-2026-11-10.md` is dated the 10th of November in the same way. The day must be real: `2026-02-30` is not a name that dates anything.
3. To date an entry by something else than its name, write `date:` at the top of the page. It wins over the name:

   ```md title=docs/handbook/changelog/reminder-wording.md
   ---
   title: Reminder wording
   date: 2026-10-30
   ---

   Reminders now name the clinic.
   ```

4. To keep an entry somewhere else, give it the subject `changelog`. This page is an entry although no folder of its path is named `changelog`:

   ```md title=docs/handbook/notes/booking-rule.md
   ---
   title: A new booking rule
   date: 2026-11-18
   subjects: [changelog, booking]
   ---

   A booking can no longer start in the past.
   ```
:::

An entry's day is the first of these that applies: `date:`, a day at the start or end of its file name, and the day it last changed. `volvel build` refuses a `date` that is not a day on the calendar ("The date is not a day on the calendar: "2026-02-30". Write it as YYYY-MM-DD.") and one that is not written `YYYY-MM-DD` (`date: 30 October` stops with "date is not written as it should be").

## List the entries on a page

:::steps
1. Add the component to a page, for example `docs/handbook/whats-new.md`:

   ```md title=docs/handbook/whats-new.md
   ---
   title: What's new
   description: The newest changes to the intake form and the apps.
   ---

   ::changelog{limit=2}
   ```

   `limit` is how many entries, from 1 to 50, and 10 when left out. It shows each entry with its title, its date and the whole of its page, newest first.
2. To list some of the entries, narrow it. A path is by the site's folder, so `docs/handbook/changelog/rota/` is `changelog/rota`:

   ```md
   ::changelog{folder=changelog/rota}
   ::changelog{subject=booking}
   ```

   These two are examples: the steps here make no `changelog/rota` folder, and `subject=booking` lists the entry of step 4.

   `folder` takes the entries under a folder, `subject` the entries that name it. Both together take the entries that match both.
:::

## Deploy

:::steps
1. Check it: `volvel build`. The entries are listed as `doc handbook/changelog/…`. The page of step 4 draws two warnings, that the subjects `changelog` and `booking` are on no other page; they do not stop the build or the deploy.
2. Deploy: `volvel deploy --tenant fernhill --workspace sandbox`.
3. Open the site. For `/apps/fernhill/sandbox/handbook/whats-new/` the newest two entries come first, New intake form (24 November 2026) and A new booking rule (18 November 2026), each with its date, and "2 older entries, from Rota swaps" below.
:::

## The result

Every page of the deployed site has a link to the feed in its head, and the feed is at `changelog.xml` beside the pages: `/apps/fernhill/sandbox/handbook/changelog.xml`. It is RSS 2.0, newest first. Each item has the entry's title, its address and its date, and its `description`, or else the start of its text. A site with no entries has no feed. A site that is open to anyone serves it to anyone, as it serves its pages.

## If it does not work

- **`volvel build` stops at a `date` line.** Write the day as `YYYY-MM-DD`, in plain text, and make sure it is a day on the calendar.
- **An entry is dated the day it last changed.** Nothing else dated it: it has no `date:` and no day at the start or end of its name. A day in the middle of a name does not count.
- **An entry comes first, with no date.** The page has no `date:`, no day in its name, and no last update; it counts as not released.
- **The deploy says "A page uses a key that this instance may not know: the instance may be older than this CLI."** The instance does not know `date` yet. Upgrade the instance, or take `date:` out of the pages' top.
- **A page you did not mean to list appears.** It names the subject `changelog`, or sits in a folder named `changelog`.
- **The `changelog/` folder has no page of its own.** Its address shows the folder's entries as a list, as `::changelog` does. To word it yourself, add `changelog/index.md`.

## Related

- [Keep documentation in the repository](keep-documentation-in-the-repository)
- [What the top of a page says](../../reference/docs/frontmatter): `date`
- [Writing documentation: components](../../reference/docs/components): `::changelog`
- [Keep a changelog in the console](../../../console/how-to/docs/keep-a-changelog-in-your-docs-site)
