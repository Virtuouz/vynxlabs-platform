# Fact-check record: console/how-to/data/retired-data.md

Lines are current at commit `be324f78` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Retire this table: button Retire table, confirm text, goes to the list, retired pill. | `screens/Data.tsx:3079-3090`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Retire refused while another table points to it: "The table "X" cannot be deleted: "Y" (column "Z") refers to it. Delete or change those references first." | run; `apps/control-plane/src/kernel/data/apply.ts:1071-1130` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Retired table page text; Bring back only for ownership ui; repository text "Deploying a definition with this name brings it back." | `screens/Data.tsx:1864-1872`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Bring back saves columns, rules, defaults, references, values, who sees rows, display, indexes; not the description; says "The table X is back, with its rows." | `screens/Data.tsx:1930-1992` (bodyOfRetired, BringBackButton); run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Bring back needs `resource:write`; Delete for good needs `table:write` and is grayed with the reason. | `screens/Data.tsx:1958-1962,2010-2025` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Rows pointing to a row that is gone are left as they are; new rows are held to the key. | `apps/control-plane/src/kernel/data/apply.ts:927-960` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Retire column: confirm "It is hidden and its data kept. You can bring it back."; Retired columns table Column, Held, Still holds ("1 value"), Bring back, Delete for good. | `screens/Data.tsx:2673-2690,2843-2905`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Retiring a column drops required, unique, default and the key in the database. | `apps/control-plane/src/kernel/data/apply.ts:385-396` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Column Bring back writes type, table and every value; not the rules. | `screens/Data.tsx:2873-2890` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Delete for good: type the name; button off until it matches; text "Delete the retired table "X" and everything in it? This is the one action that destroys data, and it cannot be undone."; audit `table.purged`. | `screens/Data.tsx:2012-2030`; `apps/control-plane/src/routes/data.ts:628-636`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| A table another table still points to: "Another table still refers to "X". Remove that reference column first." | `apps/control-plane/src/kernel/data/apply.ts:1232` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Two retired tables of one name are told apart by `?id=`. | `screens/Data.tsx:1806-1809`; run (address carries ?id=) | writer, run on the instance 2026-11-23; second agent pending | holds as run |
