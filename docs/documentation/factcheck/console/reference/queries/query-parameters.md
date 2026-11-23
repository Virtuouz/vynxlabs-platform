# Fact-check record: console/reference/queries/query-parameters

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Parameter fields name, type, label, default, required; max 20; name pattern and 55; label 1–100 | `packages/manifest/src/kinds.ts:1238-1291` | writer, code | holds |
| Six types and their misfit words | kinds.ts:1196-1231 | writer, code | holds |
| Console reading of typed values: empty is null; numbers; boolean menu | Q:84-110 | writer, run | holds |
| Unnamed parameters are $1, saved as p1 | Q:125-155 | writer, code | holds |
| Empty label, empty default, false required are not saved | Q:140-155 | writer, code | holds |
| Saved-query route: params JSON by name, max 8,000, "The parameters must be JSON."/object | rq:500-545 | writer, run | holds (400s seen on the instance) |
| Missing/null becomes default then null; required missing "A parameter is missing."; misfit "A parameter does not fit."; unknown name "The query has no such parameter." | qry/parameters.ts:7-48 | writer, run | holds |
| Run route: params list max 50; "The query takes N parameters, $1 to $N, and M was given." / "takes no parameters" | rq:124-140; qry/run.ts:178-187 | writer, run | holds |
| Widget: "Choose <label>." for a missing needed value | qry/widget.ts:285-300 | writer, code | holds |
| Running by name needs data:read per table, workspace-level data:read for a query with no table; not audited | rq:496-585 | writer, code | holds |
