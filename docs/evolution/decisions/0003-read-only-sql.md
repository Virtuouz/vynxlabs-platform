# Decision 0003: read-only SQL over a workspace's tables

Status: **accepted as proposed** 2026-11-18. The owner asked for phase 18 to be built through M9 without stopping here, so the open decisions at the end were taken as recommended, and each is the owner's to change. Built as M7 to M9 of [phase 18](../../phases/phase-18-data-insight.md), which records where this text and the code disagree.
Date: 2026-11-18.
Prompted by: the owner's notes after phase 17. Dashboards read one table at a time, nothing can join two, and an analyst has no way to ask a question the row API was not built for.

## Summary

Phase 4 ruled SQL out, in three places, for one reason: who is asking is told to the database by `set_config`, and whoever can run SQL can say they are someone else (`apps/control-plane/src/kernel/data/rows.ts:184`). That reason is sound and this record keeps it for the row API.

It adds a second path, for questions only, behind five guards that each hold without the others:

1. **The text is parsed by Postgres's own parser and rebuilt from the tree.** Only what the tree is found to contain reaches the database, never the text as typed.
2. **Only one `SELECT`, over allowed relations, calling allowed functions.**
3. **It reads views, not tables**: one view per table, named as the table is called, in a schema made for queries.
4. **The caller needs `data:read` on every table the query names**, checked before it runs.
5. **Who is asking is signed.** The row policies stop trusting a setting anyone can write and check a signature the data role cannot make. This guard also covers the row API.

## Context

| Fact | Evidence |
| --- | --- |
| Rows are read as a role that owns nothing, so row policy always applies | `packages/db/src/datastore.ts:7-30` |
| The caller is told by five transaction settings: `app.principal`, `app.data_all`, `app.groups`, `app.attrs`, `statement_timeout` | `rows.ts:198-203` |
| A policy reads them with `current_setting` | `kernel/data/apply.ts:428-501` |
| The data role may select, insert, update and delete on every table of the schema. `data:read` held at one table is enforced by the route, not by a grant | `apply.ts:186`, `routes/data.ts:205-249` |
| A table's physical name is not its path, and a retired column is still in the table | `kernel/data/plan.ts:83-95` |
| A tenant's tables may be in a database of its own | `kernel/data/stores.ts:179-198` |
| Postgres 16 is the oldest supported. `security_invoker` views came in 15, `sha256` in 11 | `docs/self-hosting.md:12` |

Checked in M0 of phase 18: the parser runs in Node as WebAssembly (MIT, 1.8 MB, about 20 ms for the first parse and under 1 ms after), and a signed claim checked by a `SECURITY DEFINER` function is verified once per statement, not per row.

## Decision

### 1. Parse, walk, rebuild

`pgsql-parser` (with `libpg-query` and `pgsql-deparser`) parses the text. The tree is walked once, and anything not on this list refuses the query with the line and column it was found at:

- exactly one statement, a `SelectStmt`, with no `INTO` and no locking clause (`FOR UPDATE` and its kin);
- CTEs that are themselves selects. A data-changing CTE parses as part of a select, so every CTE's own statement is checked;
- joins, subqueries, set operations, grouping, window functions, `VALUES`, `LIMIT` and `OFFSET`;
- parameters `$1`…, bound by the driver, never spliced;
- no `TABLESAMPLE`, no function in `FROM` other than `unnest` and `generate_series`, no system column (`ctid`, `xmin`, `tableoid` and the rest), no cast to an object-identifier type (`regclass`, `regproc`, …).

The SQL sent is the deparsed tree.

### 2. Allowed relations and functions

- A relation is a name the query defines itself (a CTE or an alias), or a table of this workspace, written bare or as `"dir/name"`. A schema-qualified name is refused, so `pg_catalog.pg_class` and `information_schema.tables` are, and a bare `pg_class` is not a table of the workspace.
- A function is allowed by name from a list kept in one file: aggregates, window functions, maths, text, dates and times, JSON reading, arrays, `coalesce` and its kin, and casts to data types. Everything else is refused, which is how `set_config`, `current_setting`, `pg_sleep`, `pg_read_file`, `query_to_xml`, `dblink`, `lo_*`, `nextval` and `txid_current` are. A new function is added to the list by a change to the platform, never by a tenant.
- Operators are allowed. They can be slow, and the statement timeout is what answers that.

### 3. Views

Each workspace gets a schema `q_<workspace>` beside its `ws_<workspace>`. For each live table it holds a view named for the table's path, selecting the live columns under the names they have now, with `security_invoker = true`, so the table's row policy applies to whoever asks. Retired tables and columns are not there. The views are rebuilt at the end of every deploy that changes a table, and when a tenant is imported. The parsed tree's relations are rewritten to `q_<workspace>."<path>"`.

A table called `loans` and one called `lending/loans` are both written as their path: `loans`, `"lending/loans"`.

### 4. Each table's permission

Before running, every table the tree names is authorized for the caller as a row read is: `data:read` at that table's resource. A caller who may read one of two joined tables is refused, naming the other. `data_all:read` is honoured as it is for rows.

### 5. Signed identity

- Each database gets a random key in `vx.claim_key`, in a schema the data role cannot enter. The control plane keeps the same key, encrypted with the instance's master key.
- `withData` and the query path set one setting, `app.claim`: a JSON object (`principal`, `groups`, `attrs`, `all`, `exp`) followed by a signature, `sha256(key || sha256(key || claim))`.
- `vx.claim()` is `SECURITY DEFINER`, reads the setting, checks the signature and the expiry, and returns the object, or raises. A policy reads through it as `(select vx.claim())`, which the planner evaluates once per statement.
- Every existing table's policies are compiled again to read this way, by a step that runs once per database when the instance starts on this version. Until a database has taken that step its policies read the old settings, and `withData` sets both, so an upgrade has no moment where rows are unreadable.
- After the step, `app.principal` and the other old settings mean nothing. A query that reached `set_config` despite guards 1 and 2 would change nothing it could use.

### Limits

A query runs in a `READ ONLY` transaction on a pool of its own (2 connections for each database by default), behind the tenant gate, with its own statement timeout (`SQL_STATEMENT_TIMEOUT_MS`, 15 s by default), and returns at most 1,000 rows unless asked for more, never more than 10,000, and never more than 5 MB. A result cut short says so.

### Permission

A new kind, `sql`, with `read`. It is not app-facing, so an end user and a member signed in to apps only never hold it. It is marked explicit, as the permission to delete a production workspace is (phase 18, M4): `*:read` and `*:*` do not give it. The migration that adds it gives it by name to `tenant_admin`, `workspace_admin` and `developer`.

A saved query (M9) is run by whoever may read the query and its tables. They need no `sql:read`, since they choose its parameters and not its text.

### Audit

Running SQL that was typed is recorded: who, the workspace, a hash of the rebuilt text, the tables it named and how many rows came back. The text is kept in the entry, the result never. Running a saved query is a read like a row read and is not recorded.

## Consequences

- The row API is unchanged in what it accepts, and gains guard 5.
- A function an analyst wants and the list lacks is a refusal, and a platform change to add it.
- Queries share the tenant's database with its apps. The pool and the timeout bound what one query can take. A read replica is the next step if that is not enough, and nothing here blocks it.
- External data sources are not queried. No row policy exists there, and joining across databases is federation.
- A dedicated tenant database gets the same schema, key and views.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Pass the text through as a role with only `SELECT` | `set_config` is callable by any role, so the caller could claim another identity. This is the hole phase 4 named |
| A block list of dangerous functions | Postgres has thousands of functions and gains more with every release and extension. A list of what is allowed fails closed |
| A parser written in JavaScript (`node-sql-parser`) | It is not Postgres's grammar. Text it reads one way and Postgres another is exactly the gap an attacker looks for |
| A separate login role for each caller | Thousands of roles for end users, and connection pools for each |
| Sign with `pgcrypto`'s `hmac` | An extension the operator would have to install in every database. Two rounds of the built-in `sha256` with a fixed-shape claim serve |
| Leave the policies on plain settings and rely on guards 1 and 2 | One missed function would be a full bypass of row policy |
| A query engine of its own (DuckDB over exported data) | Stale data, a second copy of every table, and row policy written twice |

## Open decisions, taken as recommended

1. **Who holds `sql:read` at first.** Taken: `tenant_admin`, `workspace_admin` and `developer`, by name. Alternative: nobody, until given.
2. **Whether it is explicit.** Taken: yes. Otherwise `viewer` holds it through `*:read`.
3. **Caching of results.** Taken: not in M7 to M9. Dashboards (M10) are where a cache earns its keep, keyed by query, parameters and the caller's scope.
4. **Audit of typed SQL.** Taken: recorded, with its text.
5. **Row cap.** Taken: 1,000 by default, 10,000 at most.
