# Fact-check record: console/how-to/queries/rename-or-remove-a-query

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps as run on the instance | runs/console/how-to/queries/rename-or-remove-a-query.md | writer, run | holds |
| Name and path dialog and notices | RI:20-334 | writer, run | holds |
| Draft rename notice "A draft renames <old> to <new>." | RI:236-241 | writer, code | holds |
| Renamed from … once deployed in the list | Q:870-880 | writer, run | holds |
| Remove/Keep/Discard dialogs | RD:19-36 | writer, run | holds |
| Path taken and invalid path messages | seen on the instance (400) | writer, run | holds |
| Old path answers 90 days; widgets recorded by key | `apps/control-plane/src/kernel/dashboard-queries.ts:1-12` | writer, code | holds |
| After rename or Discard of a renamed draft the screen stays at the old path | observed on the instance | writer, run | holds (product fault) |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Not-run items now run: renaming a query that a dashboard names (the dialog lists "This dashboard is saved as a draft with the new path:"; Used by shows the dashboard; both deployed together, the dashboard still ran), and removing a query a dashboard names (the removal and the dashboard's draft deployed together without refusal; the widget then says "The query … was not found.").
- fault fixed (fb): after Save as a draft the screen moves to the query at its new path, and Discard draft of a renamed query goes to the old path; confirmed on the instance (a new query renamed and discarded); the page no longer has the workaround.
