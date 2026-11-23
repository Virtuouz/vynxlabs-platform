# Fact-check record: console/explanation/app-builder/how-an-app-is-made

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Make an app makes interface `screens/<address>` and app `<address>` with `interface:` | `screens/Interfaces.tsx:237-262` | writer (read, run) | |
| Dialog sentence about other builders | `Interfaces.tsx:227` | writer (read, run) | |
| Every save names the revision; stale or missing one is 409 draft_changed; no merge | `apps/control-plane/src/kernel/authoring.ts:292-315`; `kit/draftApi.ts:5-29` | writer (read) | |
| Notice leaves the change on the screen unsaved | `kit/DraftClash.tsx:64-66` | writer (read) | |
| Newest 30 versions kept | `kernel/authoring.ts:396,438` | writer (read) | |
| 700 ms save | `AppBuilder.tsx:206` | writer (read) | |
| Publish deploys the paths of the interface and its app, message Deploy <title> | `AppBuilder.tsx:316-323` | writer (read) | |
| Check checks tables, flows, scripts, groups and refusals | `screens/builder/PublishCheck.tsx:77-165` | writer (read) | |
| Production has no Make an app, Rename, Remove | `Interfaces.tsx:45-54,149` | writer (read) | |
| Canvas never runs actions; Preview runs them | `PageView.tsx:720`; `AppPreview.tsx:14-20` | writer (read) | |
| Preview uses the same component that serves the app | `AppPreview.tsx:14-20,113-120` | writer (read) | |
| Hiding is not security; row rules decide rows | `kit/inspector/RulesTab.tsx:358-377` | writer (read) | |
| Who can run it is checked on the server: Only … can do this | `kernel/pages/who.ts:94-105`; `RulesTab.tsx:235-250` | writer (read) | |
| Condition rechecked: It can't be done now: | `kernel/pages/act.ts:476-483` | writer (read) | |
| At most 200 records one action runs on | `act.ts:40,286-289` | writer (read) | |
| View as draws a group's view, rows stay yours | `PhoneFrame.tsx:357-363` | writer (read) | |
| Repository app read-only, Take over, next publish moves it out | `AppBuilder.tsx:556-569` | writer (read) | |
| No who-can-open setting, no theme setting in the builder; no Unpublish in the list; a page has no filters or rules | `screens/builder/*` (no such control); `Interfaces.tsx:149-213`; `PageSettings.tsx:233-263` | writer (read) | |
