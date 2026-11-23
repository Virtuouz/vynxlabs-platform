# Fact-check record: console/how-to/queries/write-and-run-a-query

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps as run on the instance | runs/console/how-to/queries/write-and-run-a-query.md | writer, run | holds |
| Parameter panel labels | Q:720-790 | writer, run | holds |
| Result line | Q:798-808 | writer, run | holds |
| Save dialog, notice, pill | Q:498-515,287,549 | writer, run | holds |
| Refusal messages in If it does not work | qry/parse.ts:189,217,232,308,321,346; Q:415,431 | writer, run | holds |
| Path pattern (lowercase letters, digits, - and _, slashes) | `packages/manifest/src/envelope.ts:4` | writer, code | holds |
| Taken name message | Q:498-515; `apps/console/src/ask.tsx` | writer, run | holds |
| sql:read roles | `apps/console/src/builtinRoles.ts` | writer, code | holds |
