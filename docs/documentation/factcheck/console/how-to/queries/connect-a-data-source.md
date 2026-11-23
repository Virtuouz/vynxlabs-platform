# Fact-check record: console/how-to/queries/connect-a-data-source

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps as run on the instance | runs/console/how-to/queries/connect-a-data-source.md | writer, run | holds |
| Declare source editor and Deploy menu | ResourceEditor.tsx:440-470; DeployMenu.tsx:40-80 | writer, run | holds |
| Connect and Change dialogs and labels | Data:3370-3500 | writer, run | holds |
| Encrypt the connection default and hint | Data:3390-3400 | writer, run | holds |
| Password dropped message | Data:3488-3495 | writer, run | holds |
| Remove from here confirm | Data:3739 | writer, run | holds |
| Failure messages | src:200-236 | writer, run | holds (unreachable seen) |
| Health about every 10 min; 15 s statement | health.ts:9; external.ts:50 | writer, code | holds |
| Only base tables | src:268 | writer, run | holds |
