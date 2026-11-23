---
title: Ask readers whether a page helped
description: "Turn on Was this page helpful? for a docs site, read the answers, and turn it off again without losing them."
subjects: [documentation, feedback]
---

## Ask readers whether a page helped

By the end each page of a site ends with "Was this page helpful?" and **Yes** and **No** buttons, and each answer is a row of a table in your workspace.

## Before you start

- You are in a dev workspace and have `resource:write`, or `doc:write` alone. A doc writer may make the table `docs-feedback`, and only that table, so a developer need not have made it first.
- A folder is published as a site. If not, see [Publish a folder as a site](publish-a-folder-as-a-site).
- To read the counts you also need to read the table `docs-feedback` (`data:read`).

## Turn it on

:::steps
1. Open **Build**, then **Documentation**. Open the menu of the site's folder (**More for <title>**) and choose **Turn on page feedback…**.
2. Read the dialog **Ask readers of <site> whether a page helped**. It says what will be made: the table `docs-feedback` with the columns `site_key`, `site`, `page`, `helpful`, `version` and `at`, if the workspace has none, and a change to the site. Where the table already exists the dialog says it is used as it is.
3. Press **Make the table and turn it on** (or **Turn it on**). The console says "<site> will ask its readers when you deploy."
4. Press **Deploy N changes**, then **Deploy**. The question says "With the documentation goes the table docs-feedback, where a site keeps its readers' answers."
:::

## What a reader sees and what is kept

Each page of the site ends with "Was this page helpful?", **Yes** and **No**. After an answer the form says "Thank you for saying." and the reader's own browser remembers it for a year, so the page asks once for each page. Another browser is asked again. A row is added to `docs-feedback`:

| Column | What it holds |
| --- | --- |
| `site_key` | The key of the site's app. A rename of the site keeps it. |
| `site` | The site's title when the reader answered. |
| `page` | The page, by its path in the site. |
| `helpful` | Yes or no. |
| `version` | The deployed version the reader read. |
| `at` | When they answered. |

Nothing about who answered is kept: no name and no address. One table keeps the answers of every site of the workspace. To read one site's answers, filter on `site_key`.

## Read the answers

- On the Documentation screen, a page of a deployed site that asks shows "N found it helpful · M didn't" under its file name, when you may read the table.
- Open **Data**, then **Tables**, then `docs-feedback`. It is a table like any other: filter, sort and export it, or query it. See [Work with a table's rows](../data/table-rows).
- In the **Preview with drafts** view the buttons are disabled and the page says "Answers are not kept in a preview."

## Turn it off

Open the site's menu and choose **Turn off page feedback…**, then **Turn off**. After the next deploy its pages stop asking. The table and the answers in it are kept. Turning it on for another site later uses the same table.

## The result

The site's pages ask, and the table fills as readers answer.

## If it does not work

- **The dialog says "Something already has the path docs-feedback." and the button is disabled.** A page or app has that path. Rename it, or delete it, then try again.
- **A deploy is refused because the table is missing or has other columns.** A site that names a table that is not there, or one whose columns are not these six, is refused. A table of any other kind at that path is also refused.
- **"Too many answers. Wait a minute and try again."** A reader's address may answer at most 30 times a minute for the workspace.
- **"Your answer could not be kept. Try again later."** The table could not be written. The reader's answer is not remembered.
- **No answers appear.** The form is on the pages of the deployed site. Deploy the site with feedback on first.
- A table per site (`<site>-feedback`) is no longer made, and one made before is not read.

## Related

- [How a docs app works](../../explanation/docs/how-a-docs-app-works)
- [The Documentation screen](../../reference/screens/build/documentation)
