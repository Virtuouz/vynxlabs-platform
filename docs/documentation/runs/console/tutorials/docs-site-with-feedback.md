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
