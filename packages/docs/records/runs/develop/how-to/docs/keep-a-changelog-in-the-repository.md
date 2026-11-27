# Run log: develop/how-to/docs/keep-a-changelog-in-the-repository.md

- Instance http://localhost:8097 (Fernhill seeded), commit `661a2ceb`, the CLI built from this checkout, a new folder from `volvel init` with `docs: [docs]`, a key of Maya's. Deployed to a dev workspace of my own, `m5-repo`, not Sandbox or Clinics (a deploy there would delete what the repository lacks).
1. `docs/handbook/changelog/` with `2026-11-24-new-intake.md`, `rota-swaps-2026-11-10.md`, `reminder-wording.md` (`date: 2026-10-30`), `docs/handbook/whats-new.md` with `::changelog{limit=2}`, `src/docs.ts` as in the earlier page and its export. `volvel build` listed the five docs, the app and the binding.
2. A `date` of `2026-02-30` made `volvel build` fail: "The date is not a day on the calendar: "2026-02-30". Write it as YYYY-MM-DD."; `30 October` failed with "date is not written as it should be".
3. `volvel deploy --tenant fernhill --workspace m5-repo`: "Deployed version 1 to m5-repo (dev): 9 created".
4. `/apps/fernhill/m5-repo/handbook/whats-new/`, no sign-in: entries dated 24 November 2026 and 10 November 2026, "1 older entry, from Reminder wording", the head's feed link. `changelog.xml` 200, `application/rss+xml`.
5. Added `changelog/rota/2026-11-20-shift-colors.md`, `notes/booking-rule.md` (`subjects: [changelog, booking]`, `date: 2026-11-18`), `rota-news.md` (`folder=changelog/rota`), `booking-news.md` (`subject=booking`) and deployed: rota-news listed "Shift colors", booking-news "A new booking rule", whats-new the newest two (24 and 20 November); the feed had five items.
6. `volvel dev handbook`: the page drew two entries and linked `/changelog.xml`, which answered 404. The page says so.
- Not run: the older-instance message; a day in the middle of a name; 768 and 390 px.

## Second check (phase 33, M5), 2026-11-24

- Second agent, instance http://localhost:8097, the CLI of this checkout, a dev workspace of my own (`chk33-repo`) and an API key of my own, `HOME` pointed at a scratch folder. Repository in `/home/gplascencia/.local/share/volvel-walk/chk33b/repo` (`volvel init`, SDK linked from `packages/sdk`, no internet).
1. `volvel.yaml`, `docs/handbook/index.md`, `src/docs.ts` and its export, then the entries as the page writes them: `changelog/2026-11-24-new-intake.md`, `changelog/rota-swaps-2026-11-10.md`, `changelog/reminder-wording.md` (`date: 2026-10-30`), `notes/booking-rule.md` (subjects `changelog`, `booking`), `whats-new.md`. `volvel build` listed the docs and drew the two subject warnings.
2. `date: 2026-02-30` and `date: 30 October` each stopped the build with the messages quoted.
3. Deployed to `chk33-repo`. With the optional narrowing pages and a `changelog/rota` entry, `rota-news` listed Shift colors and `booking-news` A new booking rule. Then removed those and deployed as the steps write them: the deploy stopped and named the three pages until `--allow-delete` was given for each. Result: 24 Nov and 18 Nov, "2 older entries, from Rota swaps" (the page had said "1 older entry, from Reminder wording": corrected).
4. `/apps/fernhill/chk33-repo/handbook/whats-new/`, no sign-in, 1440 and 390, light and dark: dated entries, no overflow; `changelog.xml` 200, five items newest first with `pubDate`.
5. `volvel dev handbook --port 5733`: the page draws, links `/changelog.xml`, which is 404.
- Not run: the older-instance message (code only); a day in the middle of a name (code only); 768 px.
