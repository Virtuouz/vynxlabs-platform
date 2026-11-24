# Run log: console/tutorials/docs-site-with-feedback

- Instance `http://localhost:8091`, commit `5ebf1c80`, 2026-11-23. Sam Reyes (doc writer) and Maya Brooks (second context). Fernhill Sandbox. Playwright headless, 1440 x 900, light.
- Done in scripts in the page's order, with these differences: the page's file name was `tut-swap-a-shift` (page title `Swap a shift`), not the default `swap-a-shift`; the feedback and the page were deployed in two deploys (the page was written after the first deploy), not one.
- **State differed from the brief.** The brief said no site had feedback on and the first turn-on would draft `docs-feedback`. By the time of the run another writer's work had made the table `docs-feedback` (it held a row for the site `d31-site`), so only the "already keeps" branch of the dialog was seen. The first-site branch ("A table, docs-feedback, that keeps the answers of every site...", button **Make the table and turn it on**) is from `Docs.tsx:1385-1430` and was not walked.

## Seen

1. Sam, `/docs`: "Documentation / Pages your team writes. Any top-level folder can be published as its own docs site." with the tree; **New folder**, **New page**, **Filter pages**; the sites marked **Site**; per-row buttons "Rename <x>", "More for <x>", "Close <x>".
2. **More for Fernhill rota guide** menu: New page here, New folder here, Rename F2, Move to…, Duplicate, "Turn on page feedback… Ask readers whether a page helped", "Stop publishing… Keeps its pages and its app", "Remove the site's app… Stops serving it; the pages stay", Delete folder…. Dialog "Ask readers of Fernhill rota guide whether a page helped" with the four points as quoted on the page; **Cancel**, **Turn it on**. After: "Fernhill rota guide will ask its readers when you deploy." and **Deploy 1 change**; the menu then offers "Turn off page feedback… Stop asking readers".
3. **New page here**: a row with a search box, **Page title**, **File name** (filled `swap-a-shift`), a **Type** select (None, Tutorial, How-to guide, Reference, Explanation), **Save**, **Cancel**. **Save** opened `/docs/edit/rota/tut-swap-a-shift` with the template (`---`, `## Goal`, `:::steps`, `## If it does not work`), a **Draft** label, **Preview in the app**, **Delete…**, **Done**, **Save draft**, **Discard**.
4. The edit (select from `## Goal` to the end and type) showed in the preview; the foot said "No problems / This page would deploy as it is."
5. **Deploy 1 change**: dialog "Deploy 1 change to the documentation? / Readers see them at once. Nothing but documentation is deployed." **Cancel**, **Deploy**.
6. The first deploy (feedback only): the site's home page `/apps/fernhill/sandbox/rota-site/` had no feedback form. After the page was deployed, its address `/apps/fernhill/sandbox/rota-site/tut-swap-a-shift` showed "HOW-TO GUIDE", the text, "Was this page helpful?" with **Yes** and **No**, and the site home listed "Swap a shift" under Collections > Uncategorized.
7. **Yes**: "Thank you for saying." (the `#feedback` paragraph, role status).
8. Maya, Tables > `docs-feedback`: columns site_key, site, page, helpful, version, at, created_at, updated_at, id; a row `rota-site`, `Fernhill rota guide`, `tut-swap-a-shift`, `Yes`; "2 rows on this page, of 2" (the other row was another writer's).
9. Supplies guide: the dialog said "The table docs-feedback already keeps the answers of this workspace's sites. It is used as it is: only the site changes."; **Turn it on**, **Deploy**; the menu then offered "Turn off page feedback…".

## Not run
The first-site case (making the table); a reader on a phone; Sam's refusal at tables (Sam sees a refusal on invoices in another app, not on `docs-feedback`); **Stop publishing**; 768 and 390 px; dark; keyboard-only.

## Product notes
- A site's home page (`index.md`) shows no feedback question although feedback is on for the site; its other pages do.

## Second check (2026-11-24)
Walked again as Sam, 1440 light, steps 1-4 (feedback on for the rota guide and the supplies guide, **New page here**, writing `swap-a-shift`), after turning feedback off on both sites (they had it on from the writer's run). STOPPED at step 5: Sam's **Deploy** answered "This needs the deployment:write permission" because an App Builder app `tut-visits` was drafted for removal and the docs screen counts it (see the record). A deploy by API was not made. Steps 6-9 are the writer's run; the served home page was seen to ask the question already (deployed earlier). The Fernhill rota guide now holds drafts of mine (`swap-a-shift`, feedback on again) that were not deployed. 390 px dark: the docs page has no sideways scroll.

## Third check (2026-11-24, walk p31, docs)
Instance `http://localhost:8091`, 1440 x 900, light. In a tenant of my own, `walk-docs` (workspace `walk-sandbox`, a dev workspace), as its tenant admin (the operator who made it), not as a doc writer and not in Fernhill: no `docs-feedback` table existed, so step 2 was the first-site branch. I made the site `walk-rota-site` ("Walk rota guide") and the page `swap-a-shift` (steps 2 to 4 as written; the editor's checks said "No problems / This page would deploy as it is."), then steps 5 to 9 as written.
- **5** Deploy 4 changes (as the button counted them). The dialog said "Readers see them at once. With the documentation goes the table docs-feedback, where a site keeps its readers' answers. Nothing else is deployed." (the page quoted only the sentence for the case where the table exists). The toast "The documentation is deployed." After it the button is gone and the site row says "0 found it helpful · 0 didn't". Page corrected.
- **6** `/apps/walk-docs/walk-sandbox/walk-rota-site/swap-a-shift`: HOW-TO GUIDE, my text, "Was this page helpful?" with Yes and No. The site home `/apps/walk-docs/walk-sandbox/walk-rota-site/` asks it too (the earlier product note is fixed).
- **7** Yes: "Thank you for saying.", still shown after a reload.
- **8** Data, Tables, `docs-feedback`: one row `walk-rota-site`, `Walk rota guide`, `swap-a-shift`, `Yes`, a time. Besides the six columns the table shows `created_at`, `updated_at` and `id`. Page corrected.
- **9** Second site `walk-supplies-site` (made and deployed first). Its dialog: "The table docs-feedback already keeps the answers of this workspace's sites. It is used as it is: only the site changes." **Turn it on**, then **Deploy 1 change**, "Readers see them at once. Nothing but documentation is deployed.". The menu then offered "Turn off page feedback… Stop asking readers", and the site's home page asks the question.
- Step 2 differs from the page: the sentence "Walk rota guide will ask its readers when you deploy." is a toast with **Undo** (it goes away), not text on the page; with the table to make the button read **Deploy 3 changes**. Page corrected.
- Not run: as a doc writer (Sam) or in Fernhill; 768 and 390 px; dark; a reader on a phone.
