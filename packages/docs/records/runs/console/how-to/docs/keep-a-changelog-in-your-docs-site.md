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

## Second check (phase 33, M5), 2026-11-24

- Second agent, instance http://localhost:8097, Maya Brooks, Fernhill's Sandbox, names `chk33-`. Headless Playwright; shots in `/home/gplascencia/.local/share/volvel-walk/chk33b/`.
1. **Documentation**, **New folder** `chk33 News`, **Publish as a site…** (address `chk33-news-site`: the dialog starts it as `<folder>-site`; the page now says the steps use `m5-news`).
2. Chose the folder, **New page**, **Page title** `New intake form`, **Type** **Changelog entry**: hint as the page says, **File name** `2026-11-24-new-intake-form`. **Save**: made, editor open on `chk33-news/changelog/…` with the outline. Replaced the source, **Save draft**.
3. Second entry `Swaps in the rota app`, **Page details** **Date** `2026-11-13`, **Save draft**. Third entry `Reminder wording`, file name typed `reminder-wording-2026-10-30`. Typing a title already used says "There is already an entry named 2026-11-24-new-intake-form. Change its title or its name." (chosen folder `changelog` itself: the page is made there).
4. `what-s-new` (name made `what-s-new`), **Insert** has no changelog, typed `::changelog{limit=2}`; preview drew the two newest with dates and "1 older entry, from Reminder wording".
5. **Deploy 6 changes**, **Deploy**. `/apps/fernhill/sandbox/chk33-news-site/what-s-new/` (signed in; with no sign-in 303 to the sign-in page) showed 24 and 13 November and the older-entry link; `changelog.xml` 200 `application/rss+xml`, three items; `changelog/` 404.
6. 390 dark: New page row, editor and Page details read; `date: 2026-02-30` typed in the source gave the Problems line as the page words it. A fourth entry made for the walk was deleted (type its name to confirm).
- Not run: the console at 1440 dark and 768; the keyboard path of New page; a reader who is not a member.
