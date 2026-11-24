# Run log: console/how-to/docs/keep-a-changelog-in-your-docs-site.md

- Instance http://localhost:8097 (Fernhill seeded), commit `661a2ceb`, Maya Brooks, Sandbox, 1440 px, light, headless Playwright. The site is the folder `M5 Product news` (`m5-news`); nothing was deployed to Clinics.
1. **Build > Documentation**, chose the new folder, **New page**: **Page title** `New intake form`, **Type** **Changelog entry**. **File name** became `2026-11-24-new-intake-form`; the hint read as the page says. **Save**: "Made New intake form." The editor opened on `m5-news/changelog/2026-11-24-new-intake-form` with the outline.
2. Replaced the source with the entry text and pressed **Save draft** ("Saved as a draft. Deploy it from Documentation when it is ready.").
3. Second entry `Swaps in the rota app`: **Page details**, **Date** `2026-11-13`; the source gained `date: 2026-11-13`. Third entry with the file name typed as `reminder-wording-2026-10-30`; it was kept.
4. Made `what-s-new` with `::changelog{limit=2}`. **Insert** did not list a changelog, so it was typed. Before the folder was a site the preview drew nothing; after **Publish as a site…** (address `m5-news`) it drew the two newest entries with dates, and the page read view did too.
5. **Deploy 6 changes**, **Deploy**: "The documentation is deployed." `/apps/fernhill/sandbox/m5-news/what-s-new/` showed New intake form (24 November 2026), Swaps in the rota app (13 November 2026) and "1 older entry, from Reminder wording". The head had the feed link. `changelog.xml` answered 200 `application/rss+xml` with three items. `changelog/` answered 404 "There is no page here"; its entries answered 200.
6. Typed `date: 2026-02-30` in the source: Problems said "1 problem", line 3, "The date is not a day on the calendar: "2026-02-30". Write it as YYYY-MM-DD." (discarded).
- The page was corrected: the Insert list is not used for `::changelog`; the 404 and date messages as the product words them.
- Not run: 768 and 390 px and dark of the console screens, the keyboard path of New page, a reader who is not a member.
