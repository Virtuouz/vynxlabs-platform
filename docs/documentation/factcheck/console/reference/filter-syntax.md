# Fact-check record: console/reference/filter-syntax

Code as of commit `be324f78`, 2026-11-23. Written by the page's writer. "Checked by" ends with the second agent, who read each claim against the code (Checked by: second agent, 2026-11-23). Line numbers point at the block that holds the claim and were found by searching the file, not by reading each line again: the second agent confirms them. `GF` = `apps/console/src/screens/gridFilter.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Plain value: text contains; list-of-values has; one-of-a-list equals; others equal | `GF:33-39` | writer, run; second agent 2026-11-23 | holds |
| `> >= < <=` | `GF:40-44` | writer, run (`> 1`); second agent 2026-11-23 | holds |
| Ranges `10..20`, `10..`, `..20` for whole number, number, date, date and time | `GF:6,45-52` | writer, run (`1..3`, `..3`, dates); second agent 2026-11-23 | holds |
| `!x`, `!=x`, `not x`; refused for list of values and JSON | `GF:25-32` | writer, run (`!open`); second agent 2026-11-23 | holds |
| `!~x`, `not containing x`; text only; message | `GF:18-24` | writer, run; second agent 2026-11-23 | holds |
| `empty`, `null`, `!empty`, `!null`, `not empty`, `not null` | `GF:10-14` | writer, run (`!empty`); second agent 2026-11-23 | holds |
| `a \| b` is one `in` when all are equals, else `or` | `GF:60-75` | writer, run (`order \| call`); second agent 2026-11-23 | holds |
| `in` takes up to 200 values | `apps/control-plane/src/kernel/data/rows.ts:592-596` | writer; second agent 2026-11-23 | holds (line seen, limit not run) |
| 300 ms after typing; kept in the address as `filter`; page resets | `apps/console/src/kit/addressBox.ts:17`, `Data.tsx:236-250` | writer; second agent 2026-11-23 | holds |
| Rows must match every / any filter; appears with two or more boxes in use; `match=any` | `Data.tsx:495-509` | writer; second agent 2026-11-23 | holds (not run) |
| Unreadable box: red notice with column and reason, aria-invalid, nothing asked, CSV disabled | `Data.tsx:264-320,506-522` | writer, run; second agent 2026-11-23 | holds |
| Messages "Enter a number.", "Enter a whole number.", "Only text can be searched with !~.", list "not" message, reference message | `Grid.tsx:231-235`, `GF:21,29`, `Data.tsx:261-266` | writer, run (number, `!~` on date); second agent 2026-11-23 | holds |
| Reference boxes take IDs, empty, or ! of them | `Data.tsx:222-232` | writer; second agent 2026-11-23 | holds |
| Yes/no words | `Grid.tsx:237-241` | writer; second agent 2026-11-23 | holds |
| Moments in own clock or with a zone | `Grid.tsx:169-196` | writer; second agent 2026-11-23 | holds |
| JSON has no filter box | `Data.tsx:344-351` | writer, run; second agent 2026-11-23 | holds |
| Row policy applies to the filter | `routes/data.ts:647-654` | writer; second agent 2026-11-23 | holds |

## Second check, second agent, 2026-11-23

Every claim above was read against `gridFilter.ts` and `rows.ts`. Confirmed on the throwaway instance (`chk2-demo`): `alp | bet` on a text column finds both rows (each part contains, so it is "any of these", not "is one of"), `1 | 2` on a number, `!alp`, `>= 2`, two boxes giving **Rows must match** with **every filter** and **any filter**, and "n: Enter a number." for `abc` with no rows shown.

Corrected: "When every part is a plain value, the filter is one test, 'is one of'" held only for columns that compare whole values. On **Text**, each part is "contains", and on **Several of a list** it is "has", so those give "any of these" (`gridFilter.ts:60-75`, `rows.ts:575-600`).
