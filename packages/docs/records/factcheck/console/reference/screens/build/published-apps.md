# Fact-check record: console/reference/screens/build/published-apps.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Nav label Apps under Build; help topic build-apps. | `apps/console/src/nav.ts:126` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| The selected app is in `?app=` by ID or by path; opening records Recent. | `screens/Apps.tsx:488-492` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (URL ?app=<id>) |
| Search box label "Find an app", placeholder "Find by name or path"; matches title or path, case-insensitive. | `Apps.tsx:495-499,550-556` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Built chips All, App Builder, Repository, Documentation with counts; sort on App and Built only. | `Apps.tsx:557-585,590-600` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (counts 3/1/1/1) |
| Columns App, Address, Open to, Built; Not published tag; Staff only; tags. | `Apps.tsx:586-634` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Open to lists the app's bindings then broader ones as "label (whole workspace|whole tenant)". | `Apps.tsx:63-71` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Empty and no-match texts. | `Apps.tsx:640-648` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| The unserved notice and its condition. | `Apps.tsx:519-528,517-521` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (text read on instance with no APPS_URL) |
| Inspector rows Address, Hostname / Hostname (off), Built, Files, Reads, Open to, with their texts. | `Apps.tsx:690-737` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run (Desk: Files 6, 659.3 KB; Reads visits) |
| Share, Remove, "Managed in the repository: the app is removed there.", Open the live app. | `Apps.tsx:650-684` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run for Share and the repository text; Remove not run |
| Remove title, text and the added sentence. | `kit/RemoveDraftButton.tsx:21-33`; `Apps.tsx:673` | writer, read in code, not run; second agent, 2026-11-23 | holds; not run (no console app removed) |
| Remove permission: resource:write, or interface:write / doc:write alone. | `Apps.tsx:481-487` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Notice "Anyone with the address can open it, without signing in." | `Apps.tsx:696-700` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Share sheet title, description, Done; tabs Who has access, What they can read. | `Apps.tsx:437-453` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Fixed row, under Access rows, binding rows may read / may read and change / as role, From repository, Nobody else yet. | `Apps.tsx:215-262` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run ("Front desk may read and change") |
| Stop sharing confirmation text and the kept-table sentence. | `Apps.tsx:262-308` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run for "Stop sharing Desk with Front desk? They lose the app, and their access to its 1 table goes with it."; the kept-table sentence not run |
| Add an audience: options, They may, Share, anonymous warning, line about tables. | `Apps.tsx:175-186,326-382` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run |
| Bindings are made one after the other, no rollback; existing ones skipped. | `Apps.tsx:310-326` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Groups fetched with limit=200. | `Apps.tsx:122-126` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Reads tab: card, policy tag, sentences, someone-in-group count (aggregate asGroup), empty texts, anonymous notice. | `Apps.tsx:384-436`; POLICY at `:50-54` | writer, run on the instance 2026-11-23; second agent, 2026-11-23 | holds as run for open policy; group count not run (needs a table with rules) |
| portal_reader = app:read, data:read; portal_user adds data:write. | `packages/db/migrations/0027_portal_reader.sql`; `0018_apps.sql:136-138` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| List needs app:read at the workspace. | `apps/control-plane/src/routes/apps.ts:313-317` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| Share needs binding:write; bindings need binding:read. | `Apps.tsx:477`; `routes/permissions.ts:338-345,430-436` | writer, read in code, not run; second agent, 2026-11-23 | holds |
| A draft preview of a docs app is at `_draft/`. | `kernel/apps/front.ts:845-850` | writer, read in code, not run; second agent, 2026-11-23 | holds |

## Second check, 2026-11-23 (Checked by: second agent, 2026-11-23)

Every row above was read against `apps/console/src/screens/Apps.tsx` (742 lines) and `apps/control-plane/src/routes/apps.ts:395-470`. Corrections and additions:

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Reads row: for an interface app it is the tables of the interface's widgets, not "Nothing declared" (the page said only repository apps had a list). | `routes/apps.ts:462` (`tablesOf`), `Apps.tsx:700-737` | second agent, 2026-11-23, run: Board's inspector shows Reads `visits` | corrected |
| Managed-in-repository text depends on `ownership === "code"`, not on the Built tag: an App Builder app defined by a repository file shows it instead of Remove. | `Apps.tsx:655-668`; `routes/apps.ts:454` | second agent, 2026-11-23, run: Board (deployed from files) shows "Managed in the repository..." | corrected |
| Stop sharing, kept-table sentence: "They lose the app. 1 table stays, for 1 other app that uses it: Board." (and only "They lose the app." when no table goes). Same people and same role at the other app. | `Apps.tsx:262-308` | second agent, 2026-11-23, run: Desk and Board both shared with Front desk (Read); Stop sharing Desk showed the sentence; after confirming, the binding at `visits` stayed | holds as run; page text extended |
| Reads tab card: sentences begin "Of its rows,"; "Its policy is not known here." when the policy is not read. | `Apps.tsx:384-405` | second agent, read in code | corrected |
| Reads tab with anyone binding shows the notice; list Open to turns amber; inspector shows the public notice. | `Apps.tsx:422-428,596,696` | second agent, 2026-11-23, run at 1440, 390 and dark | holds |
| A guest on a public App Builder app: Board shared with "Anyone, without signing in" opens at 200 with a Sign in link and the rows; a guest start of a flow or script is 403 "Sign in to start..." when an anonymous binding holds `flow_run:write`/`run:write` there, else 401. | `kernel/errors.ts:39-46`; `routes/flows.ts:920`; `routes/execution.ts:1336` | second agent, 2026-11-23, run | holds as run |
| Share sheet at 390 px and in dark: no horizontal scroll, tabs and buttons usable; Escape closes; Enter on **Share** opens with focus inside; reload keeps `?app=`. | `Apps.tsx` | second agent, 2026-11-23, run | fault fixed (fb): Apps reloads in place instead of remounting the list, so focus stays; confirmed in the code and test only (not re-run in a browser); the page does not describe it |

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| There is no "not served" notice on the Apps screen; `appsAddress` is `console` or `separate`. | `routes/instance.ts:33,67`; `apps/console/src/screens/Apps.tsx` | writer, read in code, not run, 2026-11-28 | holds |
| An app with an enabled and proved hostname is redirected to it from the shared address. | `kernel/apps/front.ts:960-990` | writer, read in code, not run, 2026-11-28 | holds |
