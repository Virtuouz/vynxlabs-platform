# Fact-check record: console/how-to/docs/keep-a-changelog-in-your-docs-site.md

Lines are current at commit `661a2ceb` (branch phase-33-docs-reading). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of M5; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| **New page** has **Page title**, **Type** with **Changelog entry**; its hint "Goes in the site's changelog folder, named with today's date. A ::changelog on any page lists it." | D/Docs.tsx:1279-1288 | writer, run on 8097 2026-11-24, 1440 px light | holds as written |
| **File name** starts with today's date: `2026-11-24-new-intake-form`; a name typed in the row is used as typed (`reminder-wording-2026-10-30`). | docs-engine/src/ops.ts:137-167; D/Docs.tsx:1190-1214 | writer, run | holds as written |
| The entry is made under the site's `changelog/` folder (`m5-news/changelog/`) and the editor opens with a sentence, **What is new**, **What to do**. | ops.ts:147-167; docs-engine/src/diataxis.ts:202 | writer, run | holds as written |
| The tab **Page details** has **Date** (a date field); the value is written as `date: 2026-11-13`. | D/PageDetails.tsx:164-170 | writer, run (source read after) | holds as written |
| An entry's date is `date:`, else a day beginning or ending the file name, else the last update. | docs-engine/src/changelog.ts:45-75 | writer, run: three entries dated 24, 13 November and 30 October | holds as written |
| `::changelog{limit=…}`: 1 to 50, 10 when left out; `folder`, `subject` narrow. | markup/src/registry.ts:277-298; render.ts:632-639 | writer, run on the site (`limit=2` drew two) | holds as written |
| **Insert** does not offer `::changelog`. | the list as drawn on 8097 (Callout … Key) | writer, run | holds as written (a product gap, reported) |
| The preview draws the entries once the folder is a site; a page outside a site shows none. | D/model.ts:377-393 | writer, run: none before publishing, three after | holds as written |
| No date in the preview for an entry with neither; the served site shows the last update day. | D/model.ts:372-376 | code only | holds as written |
| After deploy: entries newest first with dates; "1 older entry, from Reminder wording" below; the title links to the entry. | markup/src/render.ts:632-695 | writer, run on `/apps/fernhill/sandbox/m5-news/what-s-new/` | holds as written |
| Every page has a feed link in its head; the feed at `changelog.xml` is RSS 2.0, newest first, `application/rss+xml`; none without entries. | docs-site/src/render.ts:309; feed.ts; apps/control-plane/src/kernel/apps/front.ts:1125-1143,1308 | writer, run (200, content-type, three items, dates) | holds as written |
| A page with the subject `changelog` is an entry anywhere. | docs-engine/src/changelog.ts:52-59 | writer, run on the repository site (booking rule listed, five feed items) | holds as written |
| The Problems panel says "The date is not a day on the calendar: "2026-02-30". Write it as YYYY-MM-DD." | docs-engine/src/page.ts:175-181 | writer, run in the editor | holds as written |
| The address of `changelog/` says "There is no page here". | docs-site/src/render.ts:767 | writer, run (404) | holds as written |
| Needs `resource:write`, or `doc:write` alone; a dev workspace only. | the Documentation reference, Permissions table | writer | holds as written |
| "The documentation is deployed." | the Documentation reference, Deploying | writer, run | holds as written |
