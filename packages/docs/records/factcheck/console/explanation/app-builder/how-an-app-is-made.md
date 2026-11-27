# Fact-check record: console/explanation/app-builder/how-an-app-is-made

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`packages/docs/records/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

Checked by: second agent, 2026-11-23. The files were read at commit `87000022` (lines cited at `5ebf1c80` moved by a few lines; the claims hold at the places named unless a row says otherwise). Each label was also searched for in the console source; screen behavior was run on http://localhost:8091 as Maya Brooks, as a member with only interface:write, as a viewer and on a production workspace.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Make an app makes interface `screens/<address>` and app `<address>` with `interface:` | `screens/Interfaces.tsx:237-262` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Dialog sentence about other builders | `Interfaces.tsx:227` | second agent, 2026-11-23 | holds (code read at 87000022; seen on the instance) |
| Every save names the revision; stale or missing one is 409 draft_changed; no merge | `apps/control-plane/src/kernel/authoring.ts:292-315`; `kit/draftApi.ts:5-29` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Notice leaves the change on the screen unsaved | `kit/DraftClash.tsx:64-66` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Newest 30 versions kept | `kernel/authoring.ts:396,438` | second agent, 2026-11-23 | holds (code read at 87000022) |
| 700 ms save | `AppBuilder.tsx:206` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Publish deploys the paths of the interface and its app, message Deploy <title> | `AppBuilder.tsx:316-323` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Check checks tables, flows, scripts, groups and refusals | `screens/builder/PublishCheck.tsx:77-165` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Production has no Make an app, Rename, Remove | `Interfaces.tsx:45-54,149` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Canvas never runs actions; Preview runs them | `PageView.tsx:720`; `AppPreview.tsx:14-20` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Preview uses the same component that serves the app | `AppPreview.tsx:14-20,113-120` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Hiding is not security; row rules decide rows | `kit/inspector/RulesTab.tsx:358-377` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Who can run it is checked on the server: Only … can do this | `kernel/pages/who.ts:94-105`; `RulesTab.tsx:235-250` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Condition rechecked: It can't be done now: | `kernel/pages/act.ts:476-483` | second agent, 2026-11-23 | holds (code read at 87000022) |
| At most 200 records one action runs on | `act.ts:40,286-289` | second agent, 2026-11-23 | holds (code read at 87000022) |
| View as draws a group's view, rows stay yours | `PhoneFrame.tsx:357-363` | second agent, 2026-11-23 | holds (code read at 87000022) |
| Repository app read-only, Take over, next publish moves it out | `AppBuilder.tsx:556-569` | second agent, 2026-11-23 | holds (code read at 87000022) |
| No who-can-open setting, no theme setting in the builder; no Unpublish in the list; a page has no filters or rules | `screens/builder/*` (no such control); `Interfaces.tsx:149-213`; `PageSettings.tsx:233-263` | second agent, 2026-11-23 | holds (code read at 87000022) |
