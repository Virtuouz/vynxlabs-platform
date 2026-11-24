---
title: Visual queries
description: "The query a widget's Data tab builds from menus: its joins, conditions, groups, measures, sort and limit, what each accepts, and how days and periods are counted."
subjects: [queries, widgets]
---

A widget does not have to read a saved query or write SQL. In its **Data** tab, choosing a table and then **Only include**, **Break down by** and a value builds a **visual query**: a description of one question over one table, written as data. It is what a dashboard's YAML holds under `source: visual:`. Volvel writes the SQL itself, with every value as a parameter, and runs it the way it runs SQL someone typed, so each table's rules for who sees which rows apply to the person looking.

```yaml
source:
  visual:
    table: invoices
    filters: [{ column: status, op: eq, value: unpaid }]
    groupBy: [{ column: issued_on, bucket: month }]
    measures: [{ fn: sum, column: total, as: owed }]
    sort: [{ by: issued_on_month }]
```

## The parts

| Part | Takes | Limit |
| --- | --- | --- |
| `table` | The path of the table to read. Required. | 255 characters |
| `joins` | Reference columns of the table to follow, so the columns of what they point to can be read. Each is a left join, one hop. A joined column is written `via.column`. | 6 |
| `filters` | What to keep. A row stays when **all** of them hold. | 20 |
| `groupBy` | What to break the values down by: a column, and for a date or a time a `bucket`. | 4 |
| `measures` | The values to work out for each group. | 8 |
| `columns` | For rows with nothing worked out, the columns to read. All of them when left out. | 50 |
| `sort` | The order of the result: `by` a column or the name of a measure, and `descending`. | 4 |
| `limit` | At most this many rows. | 1 to 10,000 |

A table's own columns include `id`, `created_at` and `updated_at`.

## Conditions

A condition is a `column`, an `op` and a `value`.

| `op` | Keeps rows where the column | `value` |
| --- | --- | --- |
| `eq`, `ne` | equals, or does not equal, the value | one text, number or true or false |
| `gt`, `gte`, `lt`, `lte` | is above, at least, below or at most the value. Not for a JSON, file or several-of-a-list column | one value, of a column that has an order: number, date, time, text or choice |
| `in` | is any of the values, compared as text | a list of 1 to 200 |
| `contains` | holds the text, ignoring capitals | text |
| `is_null`, `not_null` | is empty, or is not | none |
| `last` | falls in the last so many days, weeks, months, quarters or years, today included | `{ count, unit }`, `count` 1 to 1,000 and `unit` one of day, week, month, quarter, year. For a date or time column |
| `between` | is from one end to the other, both included | `[from, to]`, two days written `2026-01-31` or two numbers, the first not after the second |

A JSON, file or several-of-a-list column takes only `is_null` and `not_null`.

## Groups and measures

A `groupBy` on a date or time column takes a `bucket` of `day`, `week`, `month`, `quarter` or `year`. The result column is named `<column>_<bucket>`, such as `issued_on_month`, and holds the first day of the period. A JSON, file or several-of-a-list column cannot be grouped, and only a date or time takes a bucket.

A measure is `fn`, `as` and, except for a count of rows, `column`.

| `fn` | Works out | Of |
| --- | --- | --- |
| `count` | The number of rows, or of rows with a value in `column`. | Any column, or none |
| `count_distinct` | The number of different values. | A column |
| `sum` | The total. | A number column |
| `avg` | The average, rounded to 4 decimals. | A number column |
| `min`, `max` | The least or the most. | A number, date, time, text or choice column |

`as` is lowercase letters, digits and underscores, starting with a letter, up to 55 characters. Two columns of the result may not share a name. A result with measures or groups can be sorted only by one of its own columns.

## Days are the reader's

The day a time falls on is **the reader's**: the console sends the reader's time zone with every read. `last`, `between` and a day written in a condition on a time column begin at the start of the reader's day. A query read without a zone, such as the SQL you run on the **Queries** screen and the `queries/visual` route, counts days in UTC.

A date column has no time of day and is not shifted.

## Page filters

A widget's `filters` bind page filters to a column: `{ filter: lent, column: checked_out_at }`. A date range keeps the rows from its first day to its last, both included, counted in the reader's days. A search filter looks for each word in at least one of the columns it names, ignoring capitals; a search is at most 10 words and 200 letters. Page filters are added to the query's own conditions, so a row must satisfy both. A filter bound to a saved query or to SQL is bound to a parameter instead: see [Query parameters](query-parameters).

## What it cannot do

A visual query reads one table and the tables its reference columns point to, one hop. It has no `or` between conditions, no joins by a column that is not a reference, no `having` and no computed column. Write SQL for those, in a [saved query](../screens/data/queries).

## Related

- [Query parameters](query-parameters): the other way to narrow a query.
- [Building a dashboard](../screens/data/dashboard-builder)
- [Data as code](../../../develop/reference/queries/data-as-code)
