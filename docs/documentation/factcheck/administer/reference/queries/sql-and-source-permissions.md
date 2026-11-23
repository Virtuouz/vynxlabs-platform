# Fact-check record: administer/reference/queries/sql-and-source-permissions

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Permission table rows (sql:read, data:read, resource:*, data_source:*, dashboard:*, group:read) | rq:117,242,326,402,500; rs:60-290; rd:238-500 | writer, run | holds (SQL, schema, saved and run seen) |
| Explicit sql:read; wildcard | permissions.ts:368-376,470-495; permissions.md (generated) line for sql:read | writer, code | holds |
| Saver asked, reader not; repository deploy not asked | standing.ts:1-14,84-120; routes/authoring.ts:640,765,972,1082,1166; routes/git.ts:596 | writer, code | holds |
| Built-in roles and their permissions | `apps/console/src/builtinRoles.ts:6-90` | writer, code | holds |
| sql.run audited; saved not audited | rq:156-170,496-510 | writer, code | holds |
| Strangers told nothing (404) | rq:86-92 | writer, code | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- The built-in role table was checked against `apps/console/src/builtinRoles.ts` (held to the migrations by a test), and on the instance in tenant qry31chk: viewer (no `sql:read`, `resource:write`, `dashboard:write`) can list queries, run by name, see sources, test a source, and is refused `POST queries/run` and `POST dashboards`; app_maintainer is refused `resource:read` and `data_source:read` and may make a dashboard.
- Corrected with the screens: the list disables **Test** without `data_source:write`; the source's own page does not (fault: see data-sources).
