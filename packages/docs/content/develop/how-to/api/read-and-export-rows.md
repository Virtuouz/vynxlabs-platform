---
title: Read, filter and total a table's rows
description: Filter and sort rows over the API, count and sum them, export them as CSV, and add and delete rows.
subjects: [api, rows]
---

## Read, filter and total a table's rows

By the end you will have read rows with a filter, totalled them by a column, exported them as a CSV file, added rows and deleted one.

## Before you start

- A key and the instance's address, as in [Call the API with an API key](call-the-api-with-a-key). In the examples `$WS` is `$VOLVEL_URL/api/v1/tenants/<tenant id>/workspaces/<workspace id>`.
- A table in the workspace. The examples use `api-visits`, with the columns `pet` (text), `species` (a choice of dog, cat or rabbit), `weight_kg` (number) and `seen` (date).
- Reading needs `data:read` on the workspace or on the table; adding, changing and deleting needs `data:write`. The table's row rules then decide which rows you see or may change. See the [permissions reference](../../../administer/reference/permissions) and [Who sees which rows](../../../console/how-to/data/row-rules).

## Read rows

:::steps
1. Read the first rows. Every row carries `id`, `created_at` and `updated_at` besides the table's columns.

   ```bash
   curl -s -H "authorization: Bearer $VOLVEL_KEY" "$WS/rows/api-visits?limit=2&sort=pet"
   ```

2. Add a filter. `filter` is a JSON string, so give it URL-encoded. One condition is `{"column": ..., "op": ..., "value": ...}`. This finds the pets whose name does not contain the letter o.

   ```bash
   curl -s -G -H "authorization: Bearer $VOLVEL_KEY" "$WS/rows/api-visits" \
     --data-urlencode 'filter={"column":"pet","op":"not_contains","value":"o"}' \
     --data-urlencode 'sort=pet'
   ```

   The answer lists Biscuit and Pickle.
3. Join conditions with `and` or `or`. A filter holds at most 50 conditions. This finds the dogs and cats that have no `seen` date.

   ```json
   {
     "and": [
       { "column": "species", "op": "in", "value": ["dog", "cat"] },
       { "column": "seen", "op": "is_null" }
     ]
   }
   ```

4. Sort with `sort=-weight_kg,pet`: column names separated by commas, a minus for downwards.
5. Expand a reference. `expand=owner` (up to five reference columns, separated by commas) adds `expanded` to the answer, beside `items`. For each column it maps the ID of each row pointed to onto what stands for it: `{"owner": {"<owner id>": "Ann"}}`. A column that is not a reference is refused with 400, "\"pet\" is not a reference column of api-visits.", and six columns with "At most five columns can be expanded."
6. Page. See [Page through a list](page-through-a-list).
:::

### The operators

| `op` | Finds | Notes |
| --- | --- | --- |
| `eq`, `ne` | Equal, not equal. | `eq` is the default when `op` is left out. A `value` of `null` tests for no value. |
| `gt`, `gte`, `lt`, `lte` | Greater, at least, less, at most. | Not for JSON columns. A time stands for its whole millisecond. |
| `in` | Equal to one of 1 to 200 values. | `value` is a list. |
| `contains` | Text that contains the value, ignoring capitals. | Text columns only. |
| `not_contains` | Text that does not contain the value. | Text columns only. A row with no text is among those found. |
| `has` | A list-of-values column that holds the value. | `value` is one string. A list-of-values column takes only `has` and `is_null`. |
| `is_null` | No value; with `"value": false`, any value. | |

A `has` on a column that is not a list of values answers `"has" works on a list of values, with one value to look for`, and an `in` of more than 200 values answers `"in" needs a list of 1 to 200 values`. A column that does not exist, an operator that is not in the list, a `value` of the wrong type for the column, or a `contains` on a column that is not text is refused with 400 `validation_failed`, and `errors` names the part.

## Total rows

`aggregate` counts and sums over the rows you may see, with the same `filter`.

```bash
curl -s -G -H "authorization: Bearer $VOLVEL_KEY" "$WS/aggregate/api-visits" \
  --data-urlencode 'group=species' \
  --data-urlencode 'measure=count,sum:weight_kg,avg:weight_kg' \
  --data-urlencode 'sort=-count'
```

```json
{
  "items": [
    { "by": { "species": "dog" }, "values": { "count": 3, "sum:weight_kg": 74.7, "avg:weight_kg": 24.900000000000002 } },
    { "by": { "species": "cat" }, "values": { "count": 2, "sum:weight_kg": 9.3, "avg:weight_kg": 4.65 } },
    { "by": { "species": "rabbit" }, "values": { "count": 1, "sum:weight_kg": 1.5, "avg:weight_kg": 1.5 } }
  ],
  "truncated": false
}
```

- `group` is up to three columns. A date or a time can be grouped as `seen:month` (also day, week and year, from midnight UTC).
- `measure` is up to five of `count`, `count:<column>`, `sum:<column>`, `avg:<column>`, `min:<column>` and `max:<column>`. Left out, it counts rows.
- With no `group` the answer is one item with an empty `by`.
- `limit` is 1 to 1,000 and 200 by default. `truncated` is `true` when there were more groups than that.
- A request that runs longer than 5 seconds is refused.

## Export rows as CSV

```bash
curl -s -G -H "authorization: Bearer $VOLVEL_KEY" "$WS/rows-export/api-visits" \
  --data-urlencode 'filter={"column":"species","op":"eq","value":"dog"}' \
  --data-urlencode 'sort=pet' -o api-visits.csv
```

The file has a header line of the table's column names, then a line for each row. It takes `filter` and `sort` as the rows route does, and sends at most 100,000 rows; when there are more, the last line says so. A value that a spreadsheet would run as a formula starts with an apostrophe.

## Add and delete rows

:::steps
1. Add rows. Send one row as the body, or `{"rows": [...]}` for 1 to 1,000. Either all are added or none. The answer is 201 with the rows as stored.

   ```bash
   curl -s -X POST -H "authorization: Bearer $VOLVEL_KEY" -H 'content-type: application/json' \
     "$WS/rows/api-visits" \
     -d '{"rows":[{"pet":"Biscuit","species":"dog","weight_kg":24.5,"seen":"2026-03-02"}]}'
   ```

2. Change one row's values: `PATCH $WS/row/<row id>/api-visits` with the columns to change. Only those change.
3. Delete one row with `DELETE $WS/row/<row id>/api-visits` (204), or up to 1,000 with `POST $WS/row-deletions/api-visits` and `{"ids": [...]}`. The answer lists `deleted` and `missing`: keys that name no row, or a row the table's rules do not let you delete.
:::

Rows are business data, so adding, changing and deleting them is not written to the audit log one by one. Each change is announced as a `platform/row-changed` event.

## Read as someone else

To check a table's row rules, a caller who holds `data_all:read` can add `as=<end user id>` or `asGroup=<group id>` to a read, a total or an export and see what that person, or someone in that group who owns no row, would see.

## The result

You have the rows you asked for, the totals, a CSV file and the changes made.

## If it does not work

- **400 "The filter must be JSON."** The `filter` is not valid JSON. Use `--data-urlencode`, so that braces and quotes survive.
- **400 on `filter`, with `errors`.** The `message` says what to use instead, such as "there is no operator "like". Use eq, ne, gt, gte, lt, lte, in, has, contains, not_contains or is_null".
- **400 "`as` is not an end user of this tenant."** The ID is not an end user's of this tenant.
- **404.** The table, or the workspace, is not there for you. A table you may not read answers the same way.
- **A row is missing from `rows` that you know is there.** The table's row rules hide it from this key's owner.
