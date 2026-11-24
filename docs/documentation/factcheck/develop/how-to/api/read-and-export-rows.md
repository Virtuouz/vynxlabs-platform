# Fact-check record: develop/how-to/api/read-and-export-rows.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Row routes: `GET rows/<table>`, `GET aggregate/<table>`, `GET rows-export/<table>`, `POST rows/<table>`, `GET|PATCH|DELETE row/<id>/<table>`, `POST row-deletions/<table>`, all under `/tenants/:t/workspaces/:w`. | `routes/data.ts:261,642,827,891,952,976,1015,1081,1134` | second agent, 2026-11-23 | checked |
| `data:read` reads, `data:write` writes; the table's row policy decides which rows. | `routes/data.ts:646-650,897-900` | second agent, 2026-11-23 | checked |
| `filter` is a JSON string; up to 50 conditions; `and`/`or`. | `kernel/data/rows.ts:508,520-540` | second agent, 2026-11-23 | checked |
| Operators eq, ne, gt, gte, lt, lte, in (1 to 200), has, contains, not_contains, is_null; `op` default eq. | `kernel/data/rows.ts:550-620` | second agent, 2026-11-23 | checked |
| `contains`/`not_contains` work on text only; a row with no text is among the not-contained. | `kernel/data/rows.ts:581-589`; run (not_contains on a number: 400) | second agent, 2026-11-23 | checked |
| `has` takes one string; a list-of-values column takes only has and is_null; a JSON column only is_null. | `kernel/data/rows.ts:570-580,616` | second agent, 2026-11-23 | checked |
| A time stands for its whole millisecond. | `kernel/data/rows.ts:517-538` | second agent, 2026-11-23 | checked |
| `not_contains o` found Biscuit and Pickle; the and/in/is_null example found Olive. | run | second agent, 2026-11-23 | checked |
| `sort` is names separated by commas with a leading minus; `expand` at most five columns. | `routes/data.ts:54-57,672-680` | second agent, 2026-11-23 | checked |
| Aggregate: `group` up to three columns, `created_at:month` style (day, week, month, year, midnight UTC); `measure` up to five of count, count:col, sum, avg, min, max; no group gives one item; `limit` 1 to 1000 default 200; `truncated`; refused after 5 s. | `routes/data.ts:839-870`; run (`seen:month` gave 2026-03-01 and null) | second agent, 2026-11-23 | checked |
| The aggregate answer shape and numbers. | run (dog 3, 74.7, 24.900000000000002; cat 2, 9.3, 4.65; rabbit 1, 1.5, 1.5) | second agent, 2026-11-23 | checked |
| Export: `filter` and `sort`; at most 100,000 rows with a last line saying more; formula-looking values start with an apostrophe; attachment `<table>.csv`. | `routes/data.ts:134,1025-1075`; run (3 dog rows) | second agent, 2026-11-23 | checked |
| Insert: a row, or `{rows:[…]}` of 1 to 1,000, all or none, 201; 400 "Send between 1 and 1,000 rows." | `routes/data.ts:900-935`; run | second agent, 2026-11-23 | checked |
| PATCH changes only the columns sent. DELETE a row answers 204. | `routes/data.ts:976-1010,1134-1160`; run | second agent, 2026-11-23 | checked |
| `row-deletions` takes 1 to 1,000 unique `ids`; answers `deleted` and `missing`. | `routes/data.ts:1081-1130`; run (`missing: ["not-a-row"]`) | second agent, 2026-11-23 | checked |
| Row changes are not audited one by one; each is announced as `platform/row-changed`. | `routes/data.ts:934-940,982-984` | second agent, 2026-11-23 | checked |
| `as` and `asGroup` need `data_all:read`; `as` not an end user: 400 "`as` is not an end user of this tenant." | `routes/data.ts:672-695`; run | second agent, 2026-11-23 | checked |
| Missing column: 400 "there is no column "nope" in api-visits"; wrong value type: "the value for "weight_kg" must be a number". | run | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run on the instance (table `api-visits` and `owners` in `agent-ws`): `expand` (the answer has `expanded` beside `items`, a map of id to label; non-reference column 400; six columns 400 "At most five columns can be expanded."), `has` (and on a text column: 400 `"has" works on a list of values, with one value to look for`), `in` of 201 values (400), `count:<column>`, `min`, `max`, six measures (400), a CSV of 100,003 rows (100,000 rows and the last line "There were more than 100000 rows. Narrow the filter to export the rest.").
- Corrected: `expanded` is not per row.
- Not run: `asGroup`, a row policy that hides rows, an `aggregate` over 5 seconds (100,003 rows did not reach it).
