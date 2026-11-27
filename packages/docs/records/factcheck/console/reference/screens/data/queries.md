# Fact-check record: console/reference/screens/data/queries

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Opening labels: New query, Name and path, Save as…/Save, Run | Q:558-620 | writer, run | holds |
| State pills Draft, never deployed / Draft / Removing | Q:549-555 | writer, run | holds |
| Remove / Discard draft / Keep this query words and dialog texts | RD:19-36 | writer, run | holds |
| A repository query shows "Managed in the repository: the query is removed there." | RD:76 | writer, code | holds |
| Save dialog "Save this query", field "Name, such as reports/fees", Save | Q:498-515 | writer, run | holds |
| Saved notice "<path> is saved as a draft. It can be run by name once it is deployed." with Review and deploy | Q:287-290 | writer, run | holds |
| "Leave without saving?" Leave/Stay, text "Your changes to <path> are not saved." | Q:326-335 | writer, code | holds |
| Name and path dialog: Key, Path (max 255), Title (max 200), Save as a draft, 90 days | RI:20-75,125-334 | writer, run | holds |
| Name and path is off with reasons (repository, removing, "Save the draft first.") | RI:20-35,115-122 | writer, run | holds |
| Rename lists dashboards drafted with the new path and the repository's | RI:55-90 | writer, code | holds |
| What it is for max 500; shown in the list | Q:667-675,838-880 | writer, run | holds |
| Parameter fields: label else name else $n; boolean menu Not set/Yes/No; date field; type hint; "Must be a whole number."; "A value is needed." | Q:84-195,411-420,700-760 | writer, run | holds |
| What each parameter is: Name (max 55), Type, Label (max 100), Default, "Parameter n is needed" | Q:720-790 | writer, run | holds |
| Counting of $n skips strings and comments, cap 20 | `apps/console/src/kit/sqlParameters.ts:1-60` | writer, code | holds |
| Rows to return 1 to 10,000, start 1,000, message "Must be a whole number from 1 to 10,000." | Q:119,429-432,782 | writer, run | holds |
| Result line "N rows … · N ms · read <tables>" and "and there were more: the result was cut short" | Q:798-808 | writer, run | holds |
| "The query ran and gave no rows." | Q:807 | writer, run | holds |
| Refusal shown as "Line n, column n: …", editor scrolls | Q:100-110,520-535,812 | writer, run | holds |
| Editor keys Ctrl+Enter run, Ctrl+S save, Ctrl+K palette, F1 help | `apps/console/src/editor/CodeEditor.tsx:188-200` | writer, code | holds |
| Aside lists Saved queries, Used by, Tables (columns, → reference, inSql false left out) | Q:822-905; `apps/console/src/kit/references.tsx:84-137` | writer, run | holds |
| Notices: no query at X; removing; repository; cannot keep; production; cannot write SQL; empty hint | Q:545-660,820-826 | writer, run | holds (production and no-SQL not run) |
| Run by name without sql:read for a deployed query with no draft and no unsaved change | Q:430-470 | writer, code | holds |
| SQL needs `sql:read`; a wildcard does not give it; built-in roles with it | `packages/manifest/src/permissions.ts:368-376,470-495`; `apps/console/src/builtinRoles.ts:20-90` | writer, code | holds |
| List needs resource:read; run is audited sql.run (SQL, hash, tables, rows, never results); saved run is not audited | rq:114-170,399-402,496-510 | writer, code | holds |
| Limits: SQL 20,000; rows 1,000/10,000; 5 MB; timeout 15 s default, 1 s–10 min | rq:130-133; qry/run.ts:21-23; `apps/control-plane/src/config.ts:350` | writer, code | holds |
| A result's column order, same-name columns kept, big integers as text, UTC day | qry/run.ts:63-100,205-253 | writer, run | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Confirmed on the instance (tenant qry31chk, a tenant of the checker's own; tenant_admin Ann, viewer Vic, app_maintainer Wes): a member without `sql:read` and `resource:write` (Vic) sees both notices word for word, the editor takes no typing, and **Run** of a deployed query by name works with a value typed in its field (3 rows). Wes (no `resource:read`) sees "Could not load saved queries. This needs the resource:read permission." and the rest of the screen works.
- Confirmed: **Review and deploy** opens the Deploy screen (`/release`) with the draft and "Deploy 1 change"; the draft-clash notice reads "Someone else saved this query after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." with **Copy what I wrote** and **Load their version** (page corrected); "Leave without saving?" with **Stay** and **Leave**; Ctrl+S in the editor saves, Ctrl+Enter runs; Ctrl+M turns Tab-indent off (added); an unnamed parameter is saved as `p1` (added, `Queries.tsx:149`).
- Confirmed: Name and path lists "This dashboard is saved as a draft with the new path:" (singular, page corrected) and the rename deployed with its dashboard (Deploy screen shows RENAMED from the old path; the dashboard still ran).
- fault fixed (fb): after a rename the screen moves to the new path (and a discard of a renamed query to the old one), confirmed on the instance; the page no longer says the screen stays.
- fault fixed (fc): a line under the focused editor says "Tab indents. Press Ctrl+M, then Tab, to move on.", confirmed on the instance; the page quotes it.
- Walked at 390 px and in dark: no horizontal overflow; header buttons wrap; the Name and path dialog reads in dark. Keyboard: Tab order reaches fields; the editor holds focus as above.
