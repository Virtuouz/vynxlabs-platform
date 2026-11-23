# Fact-check record: console/reference/filter-syntax

Code as of commit `be324f78`, 2026-11-23. Written by the page's writer. "Checked by" is left for the second agent. Line numbers point at the block that holds the claim and were found by searching the file, not by reading each line again: the second agent confirms them. `GF` = `apps/console/src/screens/gridFilter.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Plain value: text contains; list-of-values has; one-of-a-list equals; others equal | `GF:33-39` | writer, run | holds |
| `> >= < <=` | `GF:40-44` | writer, run (`> 1`) | holds |
| Ranges `10..20`, `10..`, `..20` for whole number, number, date, date and time | `GF:6,45-52` | writer, run (`1..3`, `..3`, dates) | holds |
| `!x`, `!=x`, `not x`; refused for list of values and JSON | `GF:25-32` | writer, run (`!open`) | holds |
| `!~x`, `not containing x`; text only; message | `GF:18-24` | writer, run | holds |
| `empty`, `null`, `!empty`, `!null`, `not empty`, `not null` | `GF:10-14` | writer, run (`!empty`) | holds |
| `a \| b` is one `in` when all are equals, else `or` | `GF:60-75` | writer, run (`order \| call`) | holds |
| `in` takes up to 200 values | `apps/control-plane/src/kernel/data/rows.ts:592-596` | writer | holds (line seen, limit not run) |
| 300 ms after typing; kept in the address as `filter`; page resets | `apps/console/src/kit/addressBox.ts:17`, `Data.tsx:236-250` | writer | holds |
| Rows must match every / any filter; appears with two or more boxes in use; `match=any` | `Data.tsx:495-509` | writer | holds (not run) |
| Unreadable box: red notice with column and reason, aria-invalid, nothing asked, CSV disabled | `Data.tsx:264-320,506-522` | writer, run | holds |
| Messages "Enter a number.", "Enter a whole number.", "Only text can be searched with !~.", list "not" message, reference message | `Grid.tsx:231-235`, `GF:21,29`, `Data.tsx:261-266` | writer, run (number, `!~` on date) | holds |
| Reference boxes take IDs, empty, or ! of them | `Data.tsx:222-232` | writer | holds |
| Yes/no words | `Grid.tsx:237-241` | writer | holds |
| Moments in own clock or with a zone | `Grid.tsx:169-196` | writer | holds |
| JSON has no filter box | `Data.tsx:344-351` | writer, run | holds |
| Row policy applies to the filter | `routes/data.ts:647-654` | writer | holds |
