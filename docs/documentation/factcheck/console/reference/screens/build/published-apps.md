# Fact-check record: console/reference/screens/build/published-apps.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Nav label Apps under Build; help topic build-apps. | `apps/console/src/nav.ts:126` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| The selected app is in `?app=` by ID or by path; opening records Recent. | `screens/Apps.tsx:488-492` | writer, run on the instance 2026-11-23; second agent pending | holds as run (URL ?app=<id>) |
| Search box label "Find an app", placeholder "Find by name or path"; matches title or path, case-insensitive. | `Apps.tsx:495-499,550-556` | writer, read in code, not run; second agent pending | holds |
| Built chips All, App Builder, Repository, Documentation with counts; sort on App and Built only. | `Apps.tsx:557-585,590-600` | writer, run on the instance 2026-11-23; second agent pending | holds as run (counts 3/1/1/1) |
| Columns App, Address, Open to, Built; Not published tag; Staff only; tags. | `Apps.tsx:586-634` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Open to lists the app's bindings then broader ones as "label (whole workspace|whole tenant)". | `Apps.tsx:63-71` | writer, read in code, not run; second agent pending | holds |
| Empty and no-match texts. | `Apps.tsx:640-648` | writer, read in code, not run; second agent pending | holds |
| The unserved notice and its condition. | `Apps.tsx:519-528,517-521` | writer, run on the instance 2026-11-23; second agent pending | holds as run (text read on instance with no APPS_URL) |
| Inspector rows Address, Hostname / Hostname (off), Built, Files, Reads, Open to, with their texts. | `Apps.tsx:690-737` | writer, run on the instance 2026-11-23; second agent pending | holds as run (Desk: Files 6, 659.3 KB; Reads visits) |
| Share, Remove, "Managed in the repository: the app is removed there.", Open the live app. | `Apps.tsx:650-684` | writer, run on the instance 2026-11-23; second agent pending | holds as run for Share and the repository text; Remove not run |
| Remove title, text and the added sentence. | `kit/RemoveDraftButton.tsx:21-33`; `Apps.tsx:673` | writer, read in code, not run; second agent pending | holds; not run (no console app removed) |
| Remove permission: resource:write, or interface:write / doc:write alone. | `Apps.tsx:481-487` | writer, read in code, not run; second agent pending | holds |
| Notice "Anyone with the address can open it, without signing in." | `Apps.tsx:696-700` | writer, read in code, not run; second agent pending | holds |
| Share sheet title, description, Done; tabs Who has access, What they can read. | `Apps.tsx:437-453` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Fixed row, under Access rows, binding rows may read / may read and change / as role, From repository, Nobody else yet. | `Apps.tsx:215-262` | writer, run on the instance 2026-11-23; second agent pending | holds as run ("Front desk may read and change") |
| Stop sharing confirmation text and the kept-table sentence. | `Apps.tsx:262-308` | writer, run on the instance 2026-11-23; second agent pending | holds as run for "Stop sharing Desk with Front desk? They lose the app, and their access to its 1 table goes with it."; the kept-table sentence not run |
| Add an audience: options, They may, Share, anonymous warning, line about tables. | `Apps.tsx:175-186,326-382` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Bindings are made one after the other, no rollback; existing ones skipped. | `Apps.tsx:310-326` | writer, read in code, not run; second agent pending | holds |
| Groups fetched with limit=200. | `Apps.tsx:122-126` | writer, read in code, not run; second agent pending | holds |
| Reads tab: card, policy tag, sentences, someone-in-group count (aggregate asGroup), empty texts, anonymous notice. | `Apps.tsx:384-436`; POLICY at `:50-54` | writer, run on the instance 2026-11-23; second agent pending | holds as run for open policy; group count not run (needs a table with rules) |
| portal_reader = app:read, data:read; portal_user adds data:write. | `packages/db/migrations/0027_portal_reader.sql`; `0018_apps.sql:136-138` | writer, read in code, not run; second agent pending | holds |
| List needs app:read at the workspace. | `apps/control-plane/src/routes/apps.ts:313-317` | writer, read in code, not run; second agent pending | holds |
| Share needs binding:write; bindings need binding:read. | `Apps.tsx:477`; `routes/permissions.ts:338-345,430-436` | writer, read in code, not run; second agent pending | holds |
| A draft preview of a docs app is at `_draft/`. | `kernel/apps/front.ts:845-850` | writer, read in code, not run; second agent pending | holds |
