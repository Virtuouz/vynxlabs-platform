---
title: Add a page to a docs site and ask readers if it helped
description: As a doc writer, turn on page feedback for Fernhill's rota guide, add a page, deploy, answer the question as a reader, see the answer in the table, and turn feedback on for a second site.
subjects: [documentation, feedback]
---

You will have a page in Fernhill's rota guide that ends with "Was this page helpful?", an answer to it that you gave as a reader, and a second site that keeps its answers in the same table. It takes about 25 minutes.

## Before you start

- You can sign in to the console as Sam Reyes, `sam.reyes@fernhill.example`, a doc writer in Fernhill's Sandbox. The seeded password is `fernhill-demo-2026`. A doc writer writes documentation and deploys it, and only that.
- You can sign in as Maya Brooks, `maya.brooks@fernhill.example`, in a second window, to read the answers: a tenant admin may read the table.
- Fernhill is set up, with the sites **Fernhill rota guide** and **Fernhill supplies guide** in the Sandbox, both with page feedback off.
- A browser at least as wide as a laptop screen.

:::steps
1. **Open the documentation.** Sign in as Sam in the Sandbox. Press **Build**, then choose **Documentation** in the menu beside it. The list is headed "Pages your team writes. Any top-level folder can be published as its own docs site.". The folders **Fernhill handbook**, **Fernhill rota guide** and **Fernhill supplies guide** are marked **Site**.

2. **Turn feedback on for the rota guide.** Press **More for Fernhill rota guide**, then **Turn on page feedback…**, which says "Ask readers whether a page helped". The dialog says "Each page ends with “Was this page helpful? Yes / No”." and lists what turning it on does: it makes or uses a table `docs-feedback` that keeps the answers of every site of the workspace, it changes the site `rota-site`, "Nothing about who answered is kept: no name, no address", and the change is a draft until you deploy. In a workspace that has no `docs-feedback` the button reads **Make the table and turn it on**. Where the table exists it reads **Turn it on**. Press the button. A message says "Fernhill rota guide will ask its readers when you deploy." (with **Undo**) and a button **Deploy 1 change** appears. Where the table is made too, the button counts it: it reads **Deploy 3 changes**.

3. **Add a page.** Press **More for Fernhill rota guide**, then **New page here**. A row opens with **Page title**, **File name**, a **Type** menu and **Save**. Type `Swap a shift` as the title. The file name fills in as `swap-a-shift`. Choose **How-to guide** in **Type** and press **Save**. The editor opens on the page with a template: `## Do the thing`, `## Before you start`, a `:::steps` block, `## The result` and `## If it does not work`.

4. **Write it.** Click in the template at the line `## Do the thing`, press :kbd[Home], then :kbd[Ctrl+Shift+End] to select to the end of the text, and replace it with:

   ```markdown
   ## Swap a shift with a colleague

   You will have your shift swapped and the practice manager told.

   :::steps
   1. Find a colleague who is free on the day.
   2. Ask the practice manager to change the rota.
   :::

   ## If it does not work

   If nobody is free, ask the practice manager for cover.
   ```

   The preview shows the steps as a list. At the foot the panel says "No problems" and "This page would deploy as it is." Press **Save draft**, then **Done**. The page is in the list under **Fernhill rota guide**.

5. **Deploy.** Back on the list, press the **Deploy** button at the top, which says how many changes it deploys. The dialog says "Readers see them at once. Nothing but documentation is deployed." Where this deploy makes the table `docs-feedback`, it says instead "Readers see them at once. With the documentation goes the table docs-feedback, where a site keeps its readers' answers. Nothing else is deployed." Press **Deploy**.

6. **Read it as a reader.** Open `/apps/fernhill/sandbox/rota-site/swap-a-shift` on the instance. The page shows **Swap a shift**, the label **HOW-TO GUIDE**, your text, and at the foot "Was this page helpful?" with **Yes** and **No**. The site's home page, `/apps/fernhill/sandbox/rota-site/`, asks it too.

   ::screenshot{name=console/tut-docs-feedback alt="The rota guide's Swap a shift page ending with Was this page helpful, with Yes and No buttons"}

7. **Answer it.** Press **Yes**. The question is replaced by "Thank you for saying."

8. **See the answer.** In the second window, as Maya, press **Data**, then **Tables**, and open `docs-feedback`. A row reads `rota-site`, **Fernhill rota guide**, `swap-a-shift`, **Yes**, with a time. The columns are `site_key`, `site`, `page`, `helpful`, `version` and `at`, then the `created_at`, `updated_at` and `id` every table has. None holds a name or an address.

9. **Turn it on for the second site.** As Sam, press **More for Fernhill supplies guide**, then **Turn on page feedback…**. The dialog says "The table docs-feedback already keeps the answers of this workspace's sites. It is used as it is: only the site changes." Press **Turn it on**, then **Deploy** the change. The menu of **Fernhill supplies guide** now offers **Turn off page feedback…**, "Stop asking readers".
:::

## What you built

- A page `swap-a-shift` in `rota/`, a how-to guide, live in the Sandbox.
- Page feedback on two sites, both keeping their answers in the one table `docs-feedback`. Turning it off later keeps the table and what is in it.
- One answer, in a table you can query like any other.

The answer you gave is a row in Fernhill's Sandbox. Delete it from **Data**, **Tables**, `docs-feedback` if you want the table as it was.
