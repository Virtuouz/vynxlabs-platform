# Fact-check record: console/reference/column-types

Code as of commit `be324f78`, 2026-11-23. Written by the page's writer. "Checked by" ends with the second agent, who read each claim against the code (Checked by: second agent, 2026-11-23). Line numbers point at the block that holds the claim and were found by searching the file, not by reading each line again: the second agent confirms them. `rows` = `apps/control-plane/src/kernel/data/rows.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The twelve types and their console names | `packages/manifest/src/kinds.ts:1305-1318`, `apps/console/src/screens/ColumnControls.tsx:19-32` | writer, run (Create table list); second agent 2026-11-23 | holds |
| Postgres types | `apps/control-plane/src/kernel/data/apply.ts:21-35` | writer; second agent 2026-11-23 | holds |
| `id`, `created_at`, `updated_at` on every table; cannot be declared | `kinds.ts:1351`; `Data.tsx:1699` | writer; second agent 2026-11-23 | holds |
| Text refuses the NUL character; JSON too | `rows:370-372,387-389` | writer; second agent 2026-11-23 | holds |
| Whole number is a safe integer | `rows:373-375` | writer; second agent 2026-11-23 | holds |
| Number is finite | `rows:376-378` | writer; second agent 2026-11-23 | holds |
| Yes or no words in the console | `packages/ui/src/Grid.tsx:237-241` | writer, run; second agent 2026-11-23 | holds |
| Date and time: ISO 8601 with zone for the API, stored as UTC ISO string; console reads local time or a zone | `rows:384-388`, `Grid.tsx:169-196` | writer; second agent 2026-11-23 | holds |
| Date: a day that exists | `rows:389-391`, `Grid.tsx:243-256` | writer; second agent 2026-11-23 | holds |
| JSON "Enter valid JSON." | `Grid.tsx:253-258` | writer; second agent 2026-11-23 | holds |
| ID, reference, file are UUIDs | `rows:424-429` | writer; second agent 2026-11-23 | holds |
| File up to 25 MB; name kept to 255 characters | `kernel/data/files.ts:22,71` | writer; second agent 2026-11-23 | holds |
| File ID must be one the caller may read | inventory `tables.md` (data/files) | writer; second agent 2026-11-23 | not re-read |
| One of a list holds one of the values; a retired value kept on a row | `rows:394-404` | writer; second agent 2026-11-23 | holds |
| Several of a list: each once, in the order given | `rows:405-421` | writer; second agent 2026-11-23 | holds |
| Databases outside the product: numbers shown as text when not exact | `rows:432-451` | writer; second agent 2026-11-23 | holds |
| Filter per type | `apps/console/src/screens/gridFilter.ts:8-75` | writer, run (text, numbers, dates, enum); second agent 2026-11-23 | holds |
| Text filter ignores case; a row with no value matches `!~x` | `rows:582-590` | writer, run (contains); second agent 2026-11-23 | holds |
| Several of a list "has" finds a retired value | `rows:575-579` | writer; second agent 2026-11-23 | holds |
| Edit per type; yes/no cycle | `Data.tsx:788-800`, `Grid.tsx:318-325` | writer; second agent 2026-11-23 | holds (not run) |
| Sort not for JSON and list of values | `Data.tsx:344-351` | writer; second agent 2026-11-23 | holds |
| Unique not for JSON, file, list of values; no default for reference and file | `ColumnControls.tsx:41-42,238` | writer, run (dialog); second agent 2026-11-23 | holds |
| Display column excludes JSON, file, list of values | `Data.tsx:2917-2921` | writer, run; second agent 2026-11-23 | holds |
| On delete options | `Data.tsx:2037-2054` | writer; second agent 2026-11-23 | holds |
| Type changes offered | `packages/manifest/src/table.ts:33-46`, `ColumnControls.tsx:296-305` | writer, run (whole number); second agent 2026-11-23 | holds |
| Limits: name pattern and 55; 1-200 columns; values 1-200, 1-100 chars no comma/newline; colors; description 500; indexes 20 of 1-5; rules 20 | `kinds.ts:1342-1349,1364-1370,1387-1390,1572-1580`, `kinds.ts:1545` | writer; second agent 2026-11-23 | holds |
| A value's label is 100 characters | `kinds.ts:1432-1436` | writer; second agent 2026-11-23 | holds |

## Second check, second agent, 2026-11-23

Every claim above was read against `rows.ts`, `apply.ts`, `kinds.ts`, `table.ts`, `Grid.tsx`, `gridFilter.ts`, `ColumnControls.tsx` and `Data.tsx`. The limits (55, 200, 1-200 values, 100, nine colors, 20 indexes of 1 to 5, 20 rules, 500) are in `packages/manifest/src/kinds.ts:1344-1580`; the 25 MB is `files.ts:22`. The "may not read" refusal for a file is `files.ts:188-255`. Confirmed on the throwaway instance (`chk2-demo`): the type list in Create table, the type names on the Definition view, the **Replace** button on a row with no file, and the number and list filters.

Corrected: the File row of "How each type is edited" said the inspector has **Replace** and **Remove**; **Remove** is shown only when there is a file, and **Replace** is shown with none (a product fault, reported: the Add row sheet says **Choose a file** for that case; `Data:1127-1146`, `Data:1539`).
