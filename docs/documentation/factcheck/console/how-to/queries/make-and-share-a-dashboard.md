# Fact-check record: console/how-to/queries/make-and-share-a-dashboard

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps as run on the instance | runs/console/how-to/queries/make-and-share-a-dashboard.md | writer, run | holds |
| New dashboard dialog and name limit | DB:145-180 | writer, run | holds |
| Add to page dialog and key A | seen on the instance | writer, run | holds |
| Where it reads from list | rowsItUses.tsx:332-378 | writer, run | holds |
| Refresh options and default | DB:50,688-695 | writer, run | holds |
| Freshness line | DB:868-895 | writer, run | holds |
| Share dialog | DB:640-660 | writer, run | holds |
| Download menu | Frame.tsx:310-340 | writer, run | holds |
| Delete confirm | DB:608-625 | writer, code | holds |
| 20 per member | rd:14,310 | writer, code | holds |
| Roles with dashboard:write | builtinRoles.ts | writer, code | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- Not-run items now run: choosing groups (pick "Floor staff", Seen by followed), the 20-dashboard limit (API and dialog), a member with `dashboard:read` only (Vic; list and a shared dashboard), the refresh timer, a reload after editing, 390 px and dark.
- Corrected: the too-long name message carries "This is N."; group names in the Seen by line are lower case (fault fixed (fc): names are kept as written, confirmed in the code; the page now says so).
