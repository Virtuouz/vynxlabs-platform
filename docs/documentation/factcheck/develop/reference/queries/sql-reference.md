# Fact-check record: develop/reference/queries/sql-reference

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| One SELECT; refusal messages and their texts | qry/parse.ts:122-135,189-232,283-352 | writer, run | holds |
| Allowed nodes | qry/parse.ts:62-108 | writer, code | holds |
| Allowed casts | qry/allowed.ts:99-106 | writer, code | holds |
| Function groups and the generated list | qry/allowed.ts:21-97; generated/develop/reference/sql-functions.md | writer, code | holds |
| Result shape; column order and duplicates; big integers; zero rows keep columns; type guess; 5 MB; truncated | qry/run.ts:21-80,205-253 | writer, run | holds |
| Limits 20,000; 50; 10,000; timeout | rq:124-135; run.ts:21-23; config.ts:350 | writer, code | holds |
| Table longer than 63 bytes | qry/view-name.ts:1-20; rq:200-210 | writer, code | holds |
| A table you may not read, 403 text | rq:94-108 | writer, code | holds |
| Routes and access | rq:114-117,176-186,322-345,399-402,496-510 | writer, code | holds |
| Line and column reported as /sql/<line>:<column> | qry/run.ts:131-140 | writer, run | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Confirmed on the instance through `POST queries/run` (tenant qry31chk): TABLESAMPLE, `$0`, `ctid`, a schema-named table, `regclass` casts, `current_schema`, `pg_sleep`, `select … into`, `for update`, several statements, `update`, blank text ("There is no query."), `with recursive` and a window function all answer as the page says, with line and column; limit over 10,000 refused.
- Added: `$1::date` given "nope" answers 400 "A value does not fit its column." with no place (`kernel/data/rows.ts:297`).
