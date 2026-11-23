# Fact-check record: console/reference/queries/data-source-rows

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Source page, tables left, ?item=, rows right | Data:3754-3850 | writer, run | holds |
| Toolbar of a source: Keys (hidden when keyless), Columns, Compact rows, Rows must match, Add row; no CSV, no saved views, no checkboxes | Data:495-560 | writer, run | holds |
| Footer "N rows on this page" with no total for a source | Data:296-300,730-740 | writer, run | holds |
| No-key note and Add row shown, Keys hidden | Data:3846; Data:495 | writer, run | holds |
| Add row sheet: id needs a value even with a database default | `src:262-280`; run: "id needs a value." | writer, run | holds (see report) |
| Required groups, unsupported types not writable | src:241-262,280-294 | writer, code | holds |
| Delete row text "Delete this row? It is removed for everyone. This cannot be undone." | Data:690-700 | writer, run | holds |
| Tables are base tables only, listed by name | src:268-275 | writer, run | holds |
| Rows limit 1–1,000; insert 1–1,000; table name 1–63 bytes | rs:44-58,420-445; `apps/control-plane/src/routes/data.ts:52` | writer, code | holds |
| Not audited: the routes say so | rs:429,488,518 | writer, code | holds |
| Read only line "You can see the rows of this table, not change it. It needs data_source:write." | `apps/console/src/kit/Can.tsx:176-191`; Data:3848-3860 | writer, code | holds |
| Errors: unreachable 502, refused 502, slow 504 | src:200-236 | writer, run | holds (unreachable seen) |
