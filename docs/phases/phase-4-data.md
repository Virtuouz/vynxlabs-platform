# Phase 4: data

Status: in progress
Last updated: 2026-11-11

Phase 4 adds tenant-owned data: custom tables defined as resources, changed through deploys, protected by row policies, and reachable from scripts, the API and a studio in the console.

**Exit criterion:** a table change is promoted from dev to production with no data loss.

## Spec sections implemented

| Master spec section | What phase 4 delivers |
| --- | --- |
| Data layer: custom tables, schema changes, access | Tables as resources, a schema per workspace, changes applied on deploy, typed access from scripts, the data API |
| Identity and permissions: row-level policies | The owner-column rule, enforced by Postgres |
| Data layer: data sources | External Postgres |
| Data layer: files | File storage under the same permission model |
| Data layer: database studio | Browse and edit rows, see definitions, manage UI-managed tables |
| Extensibility: data source | Workspace tables and external Postgres behind one set of row operations |

Not in this phase: policies beyond the owner rule, dedicated databases per tenant, data sources other than Postgres, generated screens, masking, retention.

## Owner decisions

| Area | Decision |
| --- | --- |
| Table changes | Declared in the repository. The platform compares and applies the difference on deploy |
| Removals | Retire, never drop |
| Script access | Through the control plane, over the worker protocol |
| Row policies | Postgres row-level security, switching to a restricted role inside each transaction |

## Row-level security spike

Run on Postgres 16 and 18, as an ordinary non-superuser owner with the create-role right.

| Point | Result |
| --- | --- |
| The owner can create the restricted role in a migration | Passed |
| A transaction that switches to it and states who is asking sees only that person's rows, and cannot write someone else's | Passed, including a query whose filter was left off on purpose |
| A deploy that changes tables and then fails rolls back whole | Passed |
| The restricted role cannot switch back or claim to be someone else | Failed. Within a session, `RESET ROLE` returns to the platform's role, and the setting that says who is asking can be changed by whoever runs SQL |

The owner's decision after the spike: switch role per transaction on the platform's own connection. Row-level security protects against mistakes in our own query code, which is what it was chosen for. It does not contain an SQL injection, so the data API must never accept SQL: every statement is built from names checked against the catalog and from bound values. A separate login role and connection pool for data requests is recorded as hardening for phase 5.

## Findings

- **`*:read` includes reading every row.** The built-in `viewer` and `developer` roles hold `*:read`, which matches `data_all:read`. So staff with those roles see all rows of an owner-policy table. That is intended for staff. The owner rule bites for principals bound to a role that holds `data:read` and `data:write` only, which is what end users will get in phase 6.
- **Numbers are stored as double precision.** JSON has one number type, and a value must come back exactly as it went in. Money should be stored as an integer of the smallest unit.
- **An external source's row policies are its own.** The platform connects with the credentials it was given and sees what they allow.
- **Binding an external source lets the control plane connect to an address a tenant admin chose.** On a shared instance that is a path into the operator's network. It is the same trust already extended to connections, and operators can restrict egress at the network. An allow-list setting is left for later.

## Tables

The `table` kind. A table's path is its name. Its body:

- `description`
- `columns`: a map from column name to `{ type, required, unique, default, references, renamedFrom }`
- `policy`: `{ type: "open" }` or `{ type: "owner", column }`
- `indexes`: lists of column names
- `renamedFrom`: the table's previous path

| Column type | Stored as | In JSON |
| --- | --- | --- |
| `text` | text | string |
| `integer` | bigint | number |
| `number` | double precision | number |
| `boolean` | boolean | boolean |
| `timestamp` | timestamptz | ISO 8601 string |
| `date` | date | `YYYY-MM-DD` string |
| `json` | jsonb | any JSON |
| `uuid` | uuid | string |
| `reference` | uuid, with a foreign key to another table's `id` | string |
| `file` | uuid of a stored file | string |

Every table also has `id` (UUIDv7), `created_at` and `updated_at`, which a definition cannot declare.

### Where it lives

- Each workspace has its own Postgres schema, created on first use.
- A catalog in the platform database records each workspace's tables and columns, their names in the database, and whether each is active or retired.

### What a deploy does to a table

The control plane compares each table's definition with the catalog and applies the steps in the deploy's own transaction.

| Change in the definition | What happens |
| --- | --- |
| New table or column | Created |
| `renamedFrom` on a table or column | Renamed. Data untouched |
| Column or table no longer declared | Retired: hidden from the API and scripts, data kept, and no longer required or unique so that new rows can still be written |
| A retired column or table declared again with the same type | Brought back, with its data |
| A retired column declared again with another type | A new column. The retired one stays retired |
| integer to number, or anything to text | Widened in place |
| Any other type change | Refused |
| A new required column on a table with rows, with no default | Refused |
| A column made unique whose values collide | Refused |

A refused deploy changes nothing, and names the table and column.

Dropping retired data is the purge route: explicit, audited, permission `table:write`.

## Row policies

- Every workspace table has row-level security forced on.
- A data request runs in a transaction that switches to the restricted role and states the principal and whether they may see every row.
- `open`: permissions alone decide.
- `owner`: a caller sees and changes only rows whose owner column holds their ID. A row inserted without an owner gets the caller's. Holders of `data_all` see and change every row.
- A script acts as the workspace and sees every row. `ctx.table(t).as(principalId)` applies that person's policy.

### Permissions

| Permission | Allows |
| --- | --- |
| `data:read`, `data:write` | Rows, subject to the table's policy. Bindable at the workspace or at one table |
| `data_all:read`, `data_all:write` | Every row, whatever the policy |
| `table:read`, `table:write` | Definitions, and purging retired data |
| `data_source:read`, `data_source:write` | Binding and using external sources |
| `file:read`, `file:write` | Stored files |

## Data API

Under `/api/v1/tenants/{t}/workspaces/{w}`.

| Route | Methods | Permission |
| --- | --- | --- |
| `/tables` | GET | `table:read` |
| `/tables/{path...}` | GET | `table:read` |
| `/table-purges` | POST | `table:write` |
| `/rows/{path...}` | GET, POST | `data:read`, `data:write` |
| `/row/{id}/{path...}` | GET, PATCH, DELETE | `data:read`, `data:write` |
| `/data-source-bindings`, `/data-source-bindings/{path...}` | GET, PUT, DELETE | `data_source:*` |
| `/data-sources/{path...}/tables` | GET | `data_source:read` |
| `/source-rows/{table}/{path...}`, `/source-row/{table}/{key}/{path...}` | GET, POST, PATCH, DELETE | `data_source:*` |
| `/files`, `/files/{id}`, `/files/{id}/content` | GET, POST, DELETE | `file:*` |

- Listing rows takes `filter`, `sort`, `limit` and `cursor`.
- A filter is JSON: `{ "column": "total", "op": "gt", "value": 100 }`, or `{ "and": [...] }`, or `{ "or": [...] }`. Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `is_null`.
- `POST /rows/…` takes one row or up to 1,000.
- No route accepts SQL.

## Scripts

- A script declares the tables and data sources it uses. The deploy refuses a bundle whose script names a table that is not in it.
- `ctx.table(orders)` gives `find`, `get`, `insert`, `insertMany`, `update` and `delete`, typed from the table's definition.
- `ctx.source("erp").table("customers")` gives the same on an external source, untyped.
- `ctx.files.put(name, bytes)` and `ctx.files.get(id)`.
- These are additions to the worker protocol.

## External Postgres

- The `data_source` kind: `{ connector: "postgres", description }`.
- Bound per workspace: host, port, database, user, schema, TLS, and a password encrypted with the tenant's key.
- The control plane lists the source's tables and columns and serves row operations on them. A table needs a single-column primary key to be written.
- The platform never changes an external source's schema.

## Files

- A stored file has a name, a content type, a size and a place in the object store, under the workspace.
- Uploads are limited to 25 MB.
- A `file` column on a custom table holds a file's ID.

## Studio

A Tables tab in the console: the list, a grid of rows with sorting, filtering and paging, add, edit and delete for those allowed, the definition with retired columns and a purge action, and creating and changing UI-managed tables. A Data sources tab: bind a source and browse its tables.

## Schemas

Migrations 0012 onward.

| Table | Purpose |
| --- | --- |
| `data_table`, `data_column` | The catalog |
| `data_source_binding` | Per workspace: where an external source is, and its encrypted password |
| `file` | Stored files |

And the restricted database role, `platform_data`.

## Tests

| Area | Test |
| --- | --- |
| Comparison | Every kind of step, alone and combined. Rename against drop-and-add. Bring back. Refusals. The same definition twice gives no steps |
| Deploy | A table change and a script change succeed or fail together. A refused deploy changes no table |
| Exit criterion | Dev and production both hold rows. A bundle that adds, renames and removes a column goes to dev, then the same bundle to production. Every value is intact. Rolling back brings the removed column's data back |
| Retire and purge | Retired data is invisible, survives further deploys, and is dropped only by the purge route |
| Row policies | Owner sees and changes only their rows. `data_all` sees everything. A script acting for a person is limited like that person. A query built wrongly on purpose leaks nothing |
| Data API | Filters, sorting, paging, each column type, validation, references, unique violations, batch insert |
| Scripts | Typed access with a real worker. An undeclared table is refused |
| External Postgres | Bind, list, read and write on a second database. An unbound source refuses the deploy. The password is never returned |
| Files | Upload, download, size limit, permission, a file column, a script reading a file |
| Isolation | Another workspace and another tenant reach nothing |
| Existing guards | Every route declares access. Every change by a principal is audited |

## Check against the master spec

To be completed when the build is verified.

## Proposed deviations

None.
