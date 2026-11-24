# Fact-check record: console/how-to/queries/keep-a-dashboard-as-a-resource

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps as run on the instance | runs/console/how-to/queries/keep-a-dashboard-as-a-resource.md | writer, run | holds |
| Keep dialog and saved notice | DB:578-615 | writer, run | holds |
| List row of a draft resource | DB:96-130,226 | writer, run | holds |
| Edit, Done, Draft pill, Discard draft | DB:770-830 | writer, run | holds |
| Discard and Remove dialog texts | RD:19-36 | writer, run | holds |
| Repository notice | DB:850 | writer, code | holds |
| Deploy checks for a dashboard | `apps/control-plane/src/kernel/pages/standing.ts`; manifest checkDashboard | writer, code | holds (not run) |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Not-run items now run: **Keep this dashboard** after a removal ("Keep this dashboard?" then **Keep**), saving a rename (page moves to the new path; "A draft renames …"), the draft clash in the editor, the deploy refusal ("Stat needs a source to show", "The bundle's manifests are not valid."), 390 px and dark.
- Corrected: the page said the deploy refuses "a table or query that is not there". It does not: `bundle-check.ts` leaves a table that is not in the bundle alone, and a deploy that removed a query a dashboard names went through (the widget then says "The query … was not found."). Page and `dashboard-resources` corrected.
