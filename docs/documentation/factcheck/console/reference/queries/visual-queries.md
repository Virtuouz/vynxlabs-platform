# Fact-check record: console/reference/queries/visual-queries

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Limits: joins 6, filters 20, groupBy 4, measures 8, columns 50, sort 4, limit 10,000, table 255 | `packages/manifest/src/page.ts:63-175` | writer, code | holds |
| Operators and value shapes; in 1–200; contains; last count 1–1000; between | `packages/widget-sdk/src/page.ts:15-40`; qry/visual.ts:190-250; page.ts:826-868 | writer, code | holds |
| Json/file/enum_list take only is_null/not_null; order operators need an ordered type | qry/visual.ts:225-245,95-100 | writer, code | holds |
| Buckets and result name <column>_<bucket> | page.ts:693-696; visual.ts:265-290 | writer, code | holds |
| Measures: fn list; sum/avg need numbers; min/max ordered; avg rounded to 4 | visual.ts:300-330 | writer, code | holds |
| A joined column is via.column; one hop, left join | visual.ts:145-190,370-385 | writer, code | holds |
| Days are the reader's; no zone means UTC | visual.ts:200-215,120-135 | writer, code | holds |
| Two result columns of one name are refused | visual.ts:345-350 | writer, code | holds |
| Search: each word in one of the columns, 10 words, 200 letters | qry/filters.ts:123-130,180-195 | writer, code | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Limits confirmed in `packages/manifest/src/page.ts` (joins 6, filters 20, groupBy 4, measures 8, columns 50, sort 4); on the instance `queries/visual` bucketed by month gives `day_month`, avg rounded to 4 decimals (2.75), a `between` with the ends reversed and `sum` of a text column and a bucket on a text column are refused, `limit` over 10,000 refused.
