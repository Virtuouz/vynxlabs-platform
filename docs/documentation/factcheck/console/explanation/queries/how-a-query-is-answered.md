# Fact-check record: console/explanation/queries/how-a-query-is-answered

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Runs as the asker; row policy applies | qry/run.ts:1-20,133-160; rq:114-170 | writer, run | holds |
| Parse, allow-list, rewrite, read-only transaction, limits | qry/parse.ts:1-15; run.ts:140-175 | writer, code | holds |
| A function is on the list when it only works on the values given | qry/allowed.ts:1-12 | writer, code | holds |
| sql:read is explicit; data:read per table | permissions.ts:368-376,470-495 | writer, code | holds |
| Saved query by name asks no SQL right | rq:496-545 | writer, run | holds |
| Parameters checked in the same words by screen, API, widget | qry/parameters.ts; kinds.ts:1210 | writer, code | holds |
| A visual query asks no sql:read; days are the reader's | rq:322-345; visual.ts | writer, code | holds |
| Source rows are the database's; not audited; list not total; a query cannot name them | rs:429; qry/parse.ts:283-295; Data.tsx sources | writer, code | holds |
