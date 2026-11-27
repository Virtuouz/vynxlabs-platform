# Run log: console/how-to/queries/rename-or-remove-a-query.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch `phase-31-write-the-docs`).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Everything made for this run starts `qry31`.

## The steps as followed
1. Opened `qry31/visits-since` (deployed by the previous run). **Name and path** opened "Name and path of qry31/visits-since" with Key, Path, Title and the text about 90 days. Set Path `qry31/visits-per-clinic`, Title `Visits per clinic`, **Save as a draft**. The list showed "Visits per clinic / qry31/visits-per-clinic / Renamed from qry31/visits-since, once deployed." Opened at the new address the query carried the **Draft** pill and **Discard draft**.
2. No dashboard named the query, so the dialog showed no list of dashboards. That list was not seen.
3. **Discard draft** on the renamed query: "Discard this draft? The query goes back to how it was last deployed. One that was never deployed is gone." After **Discard** the list had `qry31/visits-since` again.
4. **Remove** on the deployed query: "Remove this query? This saves a draft that removes it. Nothing changes until that draft is deployed." The header showed **Removing**, the notice "This query is removed in your drafts…" and **Keep this query**. **Keep this query** asked "Keep this query?" and **Keep** put it back.
5. A path that is taken (`reports/vet-workload`) was refused in the dialog: "reports/vet-workload is the path of a query. Choose another, or rename that one first." A path with capitals: "The manifest is not valid. /path: is written in lowercase letters, digits, hyphens and underscores, in folders".
## What differed from the brief or the code
- After **Save as a draft** the screen stayed at `?query=<old path>` and said "There is no query at <old path>." with a notice "There is no saved query at …". The list showed the renamed query. It was the same 6 s later. After **Discard draft** on the renamed query the screen again said "There is no query at <new path>." Opening the right address worked. The page says so under If it does not work. Whether the cause is the dialog's closed event not firing in headless Chromium was not found out.
## Not run
- A rename of a query that dashboards name, so the two lists were not seen. A repository query. Deploying the rename or the removal.

## Second run, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022`, headless Chromium. Done in a tenant of the checker's own, `qry31chk` (workspace Sandbox, dev): Ann Qry (`tenant_admin`), Vic Qry (`viewer`), Wes Qry (`app_maintainer`), a table `visits`, a data source on the local Postgres. Fernhill's people and data were not used.
- A rename of a query that a dashboard names: `chk/all-visits` read by the kept dashboard `chk/board`; Used by listed it; Name and path with a new Path listed "This dashboard is saved as a draft with the new path: Chk week chk/board" (singular, added); **Save as a draft** showed the notice "A draft renames chk/all-visits to chk/all-visits-2." The Deploy screen listed the query (RENAMED from the old path) and the dashboard (CHANGED); deployed together; the dashboard still showed its table. The screen stayed at the old address and said "There is no query at chk/all-visits." again: reproduced, a product fault.
- Remove: "Remove this query?"; Used by then listed both dashboards (one "in a draft"). Deploying the removal with the dashboard's draft: accepted; the dashboard's table then said "The query chk/all-visits-2 was not found."
- Not run: a repository query; the 90-day end of an old path.
