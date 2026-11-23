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
