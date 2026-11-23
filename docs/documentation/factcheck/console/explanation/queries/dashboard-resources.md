# Fact-check record: console/explanation/queries/dashboard-resources

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A member's dashboard is kept in member_dashboard, never deployed | rd:60-110; rd:200-215 (comment: "It is never deployed") | writer, code | holds |
| A resource: path, key, open to everyone with dashboard:read | rd:155-175 | writer, code | holds |
| Keep it saves a draft copy; yours stays | DB:578-615 | writer, run | holds |
| A resource is drafted on a revision; clash choice | DB:230-300,450-520 | writer, run | holds |
| Removing is a draft; Keep this dashboard; never-deployed discard | RD:19-80 | writer, run | holds |
| Production: looked at, not changed | DB:395-410 (editable) | writer, code | holds |
| Key never changes; path alias 90 days | RI:195-200 | writer, code | holds |
| Widgets record the query's key at deploy and follow it | `apps/control-plane/src/kernel/dashboard-queries.ts:1-60` | writer, code | holds |
| Renaming a query drafts the console's dashboards; discard sets them aside unless changed | RI:55-90; brief D (dashboard-follow test) | writer, code | holds (the page's text of discard is from the test) |
| Repository dashboards: takeover and no Remove | DB:850; RD:60-80 | writer, code | holds |
| Reader needs dashboard:read and data:read; saver needs sql:read / data_source:read | standing.ts:1-14,84-120 | writer, code | holds |
