# Fact-check record: develop/how-to/docs/keep-a-changelog-in-the-repository.md

Lines are current at commit `661a2ceb` (branch phase-33-docs-reading). Paths are under `packages/`. Written by the writer of M5; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| An entry is a page with a folder named `changelog` in its path, or the subject `changelog`; a folder's `index.md` never. | docs-engine/src/changelog.ts:52-59 | writer, run with `volvel deploy` on 8097 (workspace `m5-repo`), 2026-11-24 | holds as written |
| A day that begins or ends the file name dates it (`2026-11-24-new-intake`, `rota-swaps-2026-11-10`); `date:` wins; a day in the middle does not count. | changelog.ts:45-75 | writer, run (10 and 24 November, 30 October seen); middle: code only | holds as written |
| `date:` not on the calendar is refused by `volvel build`: "The date is not a day on the calendar: "2026-02-30". Write it as YYYY-MM-DD."; `30 October` is refused too ("date is not written as it should be"). | docs-engine/src/page.ts:175-181; schema.ts:165 | writer, run | holds as written |
| `::changelog{limit folder subject}`; `limit` 1 to 50, 10 when left out; `folder` is by the site's folder (`changelog/rota`); both narrow together. | markup/src/registry.ts:277-298; render.ts:632-639 | writer, run: `limit=2` drew two, `folder=changelog/rota` one, `subject=booking` one | holds as written |
| `volvel build` lists `doc handbook/changelog/…`; the deploy created them. | cli build output | writer, run | holds as written |
| "1 older entry, from Reminder wording" below the list. | markup/src/render.ts:684-690 | writer, run | holds as written |
| The head of every page links the feed; `changelog.xml` is RSS 2.0, newest first, with title, address, date and `description` or the start of the text; served to an anonymous reader on a site open to anyone; none without entries. | docs-site/src/render.ts:309; feed.ts:30-80; apps/control-plane/src/kernel/apps/front.ts:1125-1143,1308 | writer, run (curl without sign-in: 200 `application/rss+xml`, 3 then 5 items) | holds as written |
| The entry without a date or a name day takes the day it last changed; one with nothing at all comes first, undated. | changelog.ts:64-79, 85-110 | code; the first seen on the site | holds as written |
| The older-instance advice: "A page uses a key that this instance may not know: the instance may be older than this CLI. Upgrade the instance, or take type, subjects and moved_from out of the pages' top." | cli/src/cli.ts:132-151 | code only; not run (the instance is current) | not run |
| `volvel dev` draws the entries and links the feed, but `/changelog.xml` is 404 locally. | run: `volvel dev handbook`, curl on its port | writer, run | holds as written (a gap, reported) |
| The folder `changelog/` is no page: "There is no page here". | docs-site/src/render.ts:767 | writer, run (404) | holds as written |
