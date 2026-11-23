# Fact-check record: console/how-to/queries/connect-a-data-source

Checked by: second agent, 2026-11-23.

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

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Not-run items now run: **Encrypt Yes** against a database with no SSL (Failed "The server does not support SSL connections", added); a member with `data_source:read` only (list and page, see the screen record); the screen at 390 px and in dark (Change drawer, list, source page: no overflow; row clipped at 390, see the screen record's fault).
- Still not run: Encrypt Yes against a database that has a certificate (no TLS Postgres on this machine; no internet), a source in a production workspace.
- fault: Internal Server Error on the source's page with Yes against a non-SSL server (see data-sources).
