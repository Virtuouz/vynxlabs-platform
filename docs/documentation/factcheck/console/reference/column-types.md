# Fact-check record: console/reference/column-types

Code as of commit `be324f78`, 2026-11-23. Written by the page's writer. "Checked by" is left for the second agent. Line numbers point at the block that holds the claim and were found by searching the file, not by reading each line again: the second agent confirms them. `rows` = `apps/control-plane/src/kernel/data/rows.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The twelve types and their console names | `packages/manifest/src/kinds.ts:1305-1318`, `apps/console/src/screens/ColumnControls.tsx:19-32` | writer, run (Create table list) | holds |
| Postgres types | `apps/control-plane/src/kernel/data/apply.ts:21-35` | writer | holds |
| `id`, `created_at`, `updated_at` on every table; cannot be declared | `kinds.ts:1351`; `Data.tsx:1699` | writer | holds |
| Text refuses the NUL character; JSON too | `rows:370-372,387-389` | writer | holds |
| Whole number is a safe integer | `rows:373-375` | writer | holds |
| Number is finite | `rows:376-378` | writer | holds |
| Yes or no words in the console | `packages/ui/src/Grid.tsx:237-241` | writer, run | holds |
| Date and time: ISO 8601 with zone for the API, stored as UTC ISO string; console reads local time or a zone | `rows:384-388`, `Grid.tsx:169-196` | writer | holds |
| Date: a day that exists | `rows:389-391`, `Grid.tsx:243-256` | writer | holds |
| JSON "Enter valid JSON." | `Grid.tsx:253-258` | writer | holds |
| ID, reference, file are UUIDs | `rows:424-429` | writer | holds |
| File up to 25 MB; name kept to 255 characters | `kernel/data/files.ts:22,71` | writer | holds |
| File ID must be one the caller may read | inventory `tables.md` (data/files) | writer | not re-read |
| One of a list holds one of the values; a retired value kept on a row | `rows:394-404` | writer | holds |
| Several of a list: each once, in the order given | `rows:405-421` | writer | holds |
| Databases outside the product: numbers shown as text when not exact | `rows:432-451` | writer | holds |
| Filter per type | `apps/console/src/screens/gridFilter.ts:8-75` | writer, run (text, numbers, dates, enum) | holds |
| Text filter ignores case; a row with no value matches `!~x` | `rows:582-590` | writer, run (contains) | holds |
| Several of a list "has" finds a retired value | `rows:575-579` | writer | holds |
| Edit per type; yes/no cycle | `Data.tsx:788-800`, `Grid.tsx:318-325` | writer | holds (not run) |
| Sort not for JSON and list of values | `Data.tsx:344-351` | writer | holds |
| Unique not for JSON, file, list of values; no default for reference and file | `ColumnControls.tsx:41-42,238` | writer, run (dialog) | holds |
| Display column excludes JSON, file, list of values | `Data.tsx:2917-2921` | writer, run | holds |
| On delete options | `Data.tsx:2037-2054` | writer | holds |
| Type changes offered | `packages/manifest/src/table.ts:33-46`, `ColumnControls.tsx:296-305` | writer, run (whole number) | holds |
| Limits: name pattern and 55; 1-200 columns; values 1-200, 1-100 chars no comma/newline; colors; description 500; indexes 20 of 1-5; rules 20 | `kinds.ts:1342-1349,1364-1370,1387-1390,1572-1580`, `kinds.ts:1545` | writer | holds |
| A value's label is 100 characters | `kinds.ts:1432-1436` | writer | holds |
