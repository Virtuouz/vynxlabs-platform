# Run log: console/how-to/queries/write-and-run-a-query.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch `phase-31-write-the-docs`).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Everything made for this run starts `qry31`.

## The steps as followed
1. **Data > Queries**: an empty editor and the line "Write a query and press Run, or Ctrl+Enter in the editor." Typed `select clinic, count(*) as visits from appointments where starts_at::date >= $1::date group by clinic order by visits desc` into the editor. A field labeled `$1` appeared under it.
2. **What each parameter is**: set Name `since`, Type `date`, Label `From`, Default `2026-09-01`. The field above became **From** with a date control holding 09/01/2026.
3. **Run**: "3 rows · 25 ms · read appointments", columns `clinic` and `visits` (riverside 1381, northside 1361, hilltop 966).
4. **Save as…**: the dialog "Save this query" with the text "It is kept by name as a resource of the workspace: a draft until it is deployed." and the field "Name, such as reports/fees". Typed `qry31/visits-since` and **Save**. The toast read "qry31/visits-since is saved as a draft. It can be run by name once it is deployed." with **Review and deploy**. A second try at the same name was refused on the field with "Something already exists at this path. Choose another, or open that one."
5. Opened `queries?query=qry31/visits-since`, typed in **What it is for**, pressed **Save**. **Used by** said "Nothing uses it, deployed or in a draft."
6. The query was deployed alone with `POST changes/deploy {paths:[...]}` (the page tells the reader to use the **Deploy** screen; the Sandbox held other writers' drafts, so the screen was not used).
## Refusals tried (all as written in the page)
`update clinics set name = 'x'` (Only SELECT…), `select * from nothing_here` (Line 1, column 15: There is no table…), `select pg_sleep(1)`, `select ctid from clinics`, `select 1; select 2` (One query at a time…), `select name from public.clinics`, `select cast(1 as regclass)`, `select current_user`. A query with no rows said "The query ran and gave no rows." `select 12345678901234567 as big, 1 as a, 2 as a` gave columns big, a, a and the first as 12345678901234567.
## The page got wrong (and was corrected)
- A first draft said the first name would be accepted in any case; the path must be lowercase (the manifest's pattern).
- The brief's "Mod+Enter" is Ctrl+Enter on Linux; the page gives both forms.
## Not run
- The **Review and deploy** screen. A person without `sql:read` (no member of Fernhill without it was available; Rowan Ellis has it). The "Leave without saving?" dialog. 390 px and dark.

## Second run, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022`, headless Chromium. Done in a tenant of the checker's own, `qry31chk` (workspace Sandbox, dev): Ann Qry (`tenant_admin`), Vic Qry (`viewer`), Wes Qry (`app_maintainer`), a table `visits`, a data source on the local Postgres. Fernhill's people and data were not used.
- A member without `sql:read` (Vic, viewer): the Queries screen shows "You can run queries here but not keep them…" and "You cannot write or run SQL…This query is deployed, so it can be run by name."; the editor takes no typing; a deployed query opened as `queries?query=chk/pets-since` ran by name with the field set (3 rows). Its parameter field reads **p1** (an unnamed parameter is saved as `p1`: added to the page).
- The query was saved by Ann as a draft; **Review and deploy** opened the **Deploy** screen with "Deploy 1 change"; deployed, the screen showed v1.
- "Leave without saving?": text "Your changes to chk/pets-since are not saved.", **Stay**, **Leave** (added).
- Draft clash: two tabs of Ann; the second save showed "Someone else saved this query after you opened it…" with **Copy what I wrote** and **Load their version** (added).
- Keyboard: Ctrl+Enter in the editor ran the query, Ctrl+S saved it; Tab stayed in the editor; Ctrl+M then Tab moved on (added).
- 390 px and dark: the Queries screen with a result: no overflow; Name and path dialog reads in dark.
- Not run: none of the earlier list remains except 'a person who has `resource:write` but not `sql:read`' (the built-in roles have none).
