---
title: SQL in a query
description: "What the SQL of a query may contain, the messages it is refused with, how a result is shaped, and the limits of running it."
subjects: [sql, queries]
---

A query is one `SELECT` over a workspace's tables. It is read by Postgres's own parser, checked against a list of what is allowed, and written again from the parse tree before it runs. Only what was found and allowed reaches the database, never the text as typed. A query runs in a transaction that can only read, with a time limit and a cap on what comes back, and each table it reads is held to the person's permission to read its rows and to the table's row rules.

This page is the contract. The functions it allows are in [SQL functions](../sql-functions), generated from the list the instance checks. For the screen, see [Queries](../../../console/reference/screens/data/queries). For the values a query takes, see [Query parameters](../../../console/reference/queries/query-parameters).

## What is allowed

- **One statement**, a `SELECT`, with a trailing `;` if you like.
- `WITH` queries, including `WITH RECURSIVE`, set operations (`UNION`, `INTERSECT`, `EXCEPT`), subqueries, joins, `GROUP BY` with grouping sets, window functions and `ORDER BY`, `LIMIT` and `OFFSET`.
- Expressions: `CASE`, `COALESCE`, `NULLIF`, `GREATEST` and `LEAST`, `IS NULL` and the boolean tests, arrays and indexing, `ROW`, casts, and named arguments.
- The date and time keywords `CURRENT_DATE`, `CURRENT_TIME`, `CURRENT_TIMESTAMP`, `LOCALTIME` and `LOCALTIMESTAMP`.
- Functions on the generated list: aggregates, window functions, and functions for numbers, text, dates and times, arrays and JSON, and `gen_random_uuid`.
- Casts to these types: `text`, `varchar`, `bpchar`, `char`, `name`, `int2`, `int4`, `int8`, `smallint`, `integer`, `int`, `bigint`, `numeric`, `decimal`, `float4`, `float8`, `real`, `bool`, `boolean`, `date`, `time`, `timetz`, `timestamp`, `timestamptz`, `interval`, `uuid`, `json`, `jsonb` and `bytea`.
- Parameters `$1`, `$2` and so on. A cast gives the database the type: `$1::date`.

## Tables and columns

A table is named by its **path**, in double quotes when it has a `/` or a `-`: `"supply/orders"`. A table is not named with a schema. Every table has the columns `id`, `created_at` and `updated_at`, then its own. A column has the name it has now. A retired table is not queryable.

A table whose path is longer than 63 bytes cannot be written in SQL, because Postgres keeps no more of a name. The Queries screen leaves it out, `GET queries/schema` gives it `inSql: false`, and it can still be put on a page.

A table you may not read is refused by name: "The query reads the table "<name>", which needs the data:read permission there." (403).

## What is refused

| What | Message |
| --- | --- |
| Anything other than `SELECT`, such as `UPDATE`, `INSERT`, `DELETE`, `CREATE`, `SET` or `COPY` | "Only SELECT is allowed. A query reads, and changes nothing." |
| More than one statement | "One query at a time: this holds several." |
| Nothing | "There is no query." |
| `SELECT … INTO` | "SELECT … INTO makes a table. A query only reads." |
| `FOR UPDATE`, `FOR SHARE` | "FOR UPDATE and FOR SHARE lock rows. A query only reads." |
| `SEARCH` or `CYCLE` in a `WITH` query | "SEARCH is not supported in a WITH query." and "CYCLE is not supported in a WITH query." |
| `TABLESAMPLE` | "TABLESAMPLE is not supported." |
| A function with a column list, such as `AS t(a int)` | "A function that returns a record with a column list is not supported." |
| A system column: `ctid`, `xmin`, `xmax`, `cmin`, `cmax`, `tableoid` | ""ctid" is a system column, which a query may not read." |
| A table named with a schema | "A table is named by its path alone, such as "clinics". A schema may not be named." |
| A table that does not exist, or a typo | "There is no table "x" in this workspace. A table is named by its path, in double quotes when it has a "/" or a "-"." |
| A function not on the list | "The function pg_sleep() is not one a query may call. Aggregates, window functions and the functions for numbers, text, dates, arrays and JSON are." |
| A function or an operator named with a schema other than `pg_catalog` | "A function may not be named with a schema." and "An operator may not be named with a schema." |
| A cast to a type not on the list, such as `regclass` | "A value may not be cast to regclass." |
| A type named with a schema | "A type may not be named with a schema." |
| `CURRENT_USER`, `SESSION_USER`, `CURRENT_ROLE`, `CURRENT_SCHEMA`, `CURRENT_CATALOG` | "Only the date and time keywords are allowed here, such as CURRENT_DATE. Who is asking is not something a query reads." |
| `$0` | "A parameter is written $1, $2 and so on." |
| Any other kind of expression the parser knows and this list does not | "<Kind> is not supported in a query." |
| A syntax error | Postgres's own words, for example `syntax error at or near "="` |

A refusal comes with the **line and column** where it was found, counting from 1. The API answers 400 `The query cannot be run.` with the place in the error's `path`, `/sql/<line>:<column>`. The console shows "Line n, column n: …" and moves the editor there. A query that is allowed and fails in the database, such as a column that is not there or a division by zero, is a 400 with the database's own words.

## How a result is shaped

```json
{
  "columns": [{ "name": "clinic", "type": "text" }, { "name": "visits", "type": "number" }],
  "rows": [["riverside", 1381], ["northside", 1361]],
  "truncated": false,
  "tables": ["appointments"],
  "sql": "SELECT clinic, count(*) AS visits FROM …"
}
```

- `columns` keep the order of the `select`. **Two columns with one name are both kept**, in order; give them names with `AS` to tell them apart.
- A column's `type` is read from its first value that is not null: `number`, `boolean`, `list`, `json`, `timestamp`, `date`, `text`, or `unknown` when every value is null.
- A whole number too large for a number to hold exactly (above 2^53) comes back as **text**.
- A query that gives no rows still gives its `columns`.
- `truncated` is true when there were more rows than `limit`, or the rows weigh more than 5 MB as JSON. The rows are cut at that point.
- `tables` lists the paths the query read, and `sql` is the query as it ran, written again from its parse tree.
- A day, month or hour taken from a time in SQL is **UTC**: the session's time zone is UTC.
- Rows come back as JSON text written by Postgres, so a date is the text `2026-01-31` and a time is an ISO text.

## Limits

| Limit | Value |
| --- | --- |
| Text of the query | 20,000 characters |
| Parameters of a saved query | 20 |
| Values in a `POST queries/run` | 50 |
| Rows | `limit`: 1 to 10,000, 1,000 when left out |
| Size of the rows | 5 MB as JSON |
| Time | 15 seconds by default. The operator sets `SQL_STATEMENT_TIMEOUT_MS` from 1,000 to 600,000 milliseconds |

## The routes

| Route | Does | Needs |
| --- | --- | --- |
| `POST …/queries/run` | Runs SQL with `{ sql, params?, limit? }`. Audited as `sql.run`. | `sql:read` and `data:read` on each table |
| `GET …/queries/saved/<path>` | Runs a saved query with `params` (JSON by name) and `limit`. Not audited. | `data:read` on each table |
| `GET …/queries/schema` | The tables the caller may read with their columns, the functions, and `maySql` and `maySave`. | `data:read` |
| `GET …/queries/visual?query=<json>` | Runs a [visual query](../../../console/reference/queries/visual-queries) of up to 8,000 characters of JSON. | `data:read` on each table |
| `GET …/queries` | The saved queries with their drafts. | `resource:read` |

See [SQL and data source permissions](../../../administer/reference/queries/sql-and-source-permissions).

## Related

- [SQL functions](../sql-functions)
- [Data as code](data-as-code): `defineQuery`.
