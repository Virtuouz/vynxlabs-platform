# Fact-check record: console/how-to/widgets/show-columns-from-another-table.md

Code as of the working tree of branch `phase-31-write-the-docs`, 2026-11-23. Paths are under `apps/console/src` unless they start with `packages` or `apps/control-plane`. Second check: every row below was read in the code and, where it says run, done on http://localhost:8091.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Also from: one chip per table the source points to ("Pets by pet"); up to six | `kit/inspector/rowsItUses.tsx:238-250`; `kit/inspector/model.ts:428-443` | second agent, 2026-11-23 | holds as run; six is code only (only one reference in Appointments) |
| Checking the chip offers chips for the other table's columns; a column whose result name exists is not offered, with the stated note | `rowsItUses.tsx:252-296`; `model.ts:201-202` | second agent, 2026-11-23 | holds as run (Name disabled with the note) |
| Pet breed added in Display with + Column; joined columns also offered by Only include, Sorted by, For each, measures; run: condition "Pet weight lb is more than 5" worked, a sort by a joined column listed | `rowsItUses.tsx:186-200` | second agent, 2026-11-23 | holds as run |
| Unfollowing removes the conditions and sorts that used it; a column added in Display stays in the list and is drawn (as "—") | `rowsItUses.tsx:215-227` | second agent, 2026-11-23 | fault fixed (fc, fe): unfollowing drops the table's columns from Display and every setting that names them, confirmed in the code (`withoutColumns`); the page now says so |
| Chip grayed with "<Table> is used by Breakdown and/or Values: change that to stop following it" (only a chart's For each and measures count) | `rowsItUses.tsx:189-195,258-266` | second agent, 2026-11-23 | holds as run (Chart) |
| Stat, Goal, List, Pivot, Chart show Also from; no column chips for summaries | `rowsItUses.tsx:208-310` | second agent, 2026-11-23 | holds as run (Stat, Pivot, List, Goal show the chip) |
| Scatter is grayed "needs a number" for a number column that comes through Also from; fine for a column of the table itself | `kit/inspector/widgets/chartDrawer.tsx:83-86` | second agent, 2026-11-23 | fault fixed (fb): a column from Also from has its type, so Scatter takes it (`chartShared.tsx` `columnsNamed`), confirmed in the code; the page's troubleshooting item is removed (and chart-your-rows no longer excludes it) |
| Reader needs data:read; hiding is not security | `apps/control-plane/src/kernel/pages/standing.ts:7-12` | second agent, 2026-11-23 | holds |

Checked by: second agent, 2026-11-23
