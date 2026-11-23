# Fact-check record: console/how-to/queries/keep-a-dashboard-as-a-resource

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
