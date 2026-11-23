# Fact-check record: administer/reference/queries/sql-and-source-permissions

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Permission table rows (sql:read, data:read, resource:*, data_source:*, dashboard:*, group:read) | rq:117,242,326,402,500; rs:60-290; rd:238-500 | writer, run | holds (SQL, schema, saved and run seen) |
| Explicit sql:read; wildcard | permissions.ts:368-376,470-495; permissions.md (generated) line for sql:read | writer, code | holds |
| Saver asked, reader not; repository deploy not asked | standing.ts:1-14,84-120; routes/authoring.ts:640,765,972,1082,1166; routes/git.ts:596 | writer, code | holds |
| Built-in roles and their permissions | `apps/console/src/builtinRoles.ts:6-90` | writer, code | holds |
| sql.run audited; saved not audited | rq:156-170,496-510 | writer, code | holds |
| Strangers told nothing (404) | rq:86-92 | writer, code | holds |
