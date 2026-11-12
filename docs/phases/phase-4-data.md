# Phase 4: data

Status: built and verified locally on 2026-11-11. Not yet run in CI or on Fly.io
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
- **Row-level security hides why a unique value was refused.** The restricted role may not see other people's rows, so Postgres withholds the detail of a unique violation. The data API works out the column from the constraint's name instead.
- **Rolling back a rename.** A bundle that renames a column, rolled back to the bundle before it, declares the old name with no `renamedFrom`. Read naively that is a new, empty column, and the values would drop out of view. The catalog therefore remembers every name a column or table has had, and a definition that uses an earlier name gets the same column back.
- **A rollback could be blocked by rows written after the change.** Found on the Compose stack, not in the tests. Production was promoted to a definition without `currency`, an order arrived, and rolling back was refused because `currency` is required and the new row had none. Nothing was lost, but the rows could not be filled either, because the column was retired and hidden. A column returning from retirement now always comes back. Where rows have a gap, the rule is put in place as a check that applies to every later write, and Postgres is told not to hold the existing rows to it. Making an ordinary column required while rows lack a value is still refused, because there the author can fill the rows first.
- **Columns are shown in the order they were created, then by name.** Columns made in the same deploy therefore appear alphabetically, not in the order the definition lists them. The catalog does not record a position.
- **A file column holds an ID and nothing more.** Deleting a file does not change the rows that point at it, and deleting a row does not delete its file.
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
| A retired column that comes back as required, when rows written meanwhile have no value for it | Brought back. It is required of every row written or changed from then on. The rows with a gap keep it until they are next changed, when a value must be given |
| A retired column declared again with another type | A new column. The retired one stays retired |
| integer to number, or anything to text | Widened in place |
| Any other type change | Refused |
| A new required column on a table with rows, with no default | Refused |
| A column made unique whose values collide | Refused |

A refused deploy changes nothing, and names the table and column.

A deployment's summary lists what it did to the data, one sentence per change, and the CLI prints it: "Table orders: column total renamed to amount. Its values are kept."

Dropping retired data is the purge route: explicit, audited, permission `table:write`.

## Row policies

- Every workspace table has row-level security enabled. It is not forced: the platform's own role owns the tables and is not subject to the policies, which is what lets a deploy change them. The restricted role never owns a table, so the policies always apply to it.
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
| `/data-source-tables/{path...}` | GET | `data_source:read` |
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

A Tables tab in the console:

- the list of tables, with row counts, who sees rows, and whether each is managed in the repository or the console;
- a grid of rows with sorting, a filter under each heading, paging, editing in place, adding and deleting. A file column uploads and downloads;
- the definition, with retired columns, how many values each still holds, and "Delete for good";
- for tables managed in the console: create, add a column, rename, retire, bring back, change who sees rows. A table from the repository is read-only here and says so.

A Data sources tab: connect a database, browse its tables, and read and write their rows in the same grid. A table with no primary key can be read and added to, not changed.

The grid is a new component in `packages/ui`.

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

Checked on 2026-11-11 against the build on the `phase-4-data` branch.

### Guiding principles

| Principle | Result |
| --- | --- |
| 1. One platform, one experience | Met. Tables, sources and files use the same identity, permission check, audit path, API and console as everything else |
| 2. Everything is a resource | Met. `table` and `data_source` are kinds with the common envelope. A stored file is not a resource: it is data, like a row |
| 3. Code first, git as the source of truth | Met. A table is declared in the repository and changed by a deploy. Tables made in the console are marked as such and a deploy leaves them alone |
| 4. Language-neutral core | Met. A table definition is JSON. Scripts reach data through the worker protocol, which is documented and does not assume TypeScript. The tests speak it with hand-built bundles |
| 5. Same software everywhere | Met. Nothing was added to the deployment |
| 6. Minimal footprint | Met. Tenant data lives in the same Postgres, files in the same object store. No container was added |
| 7. No central dependency | Met. Nothing new makes an outbound call, except to a data source a tenant binds |
| 8. Tenant portability | Strengthened. A workspace's tables are one Postgres schema with readable names, and the console says where each table is stored |
| 9. The core uses its own SDK | Met where it applies: scripts use `ctx.table`, the same client the example uses. The studio uses only the public API |
| 10. Reuse libraries and engines, not applications | Met. Row policies are Postgres row-level security. No library was added for the grid |
| 11. Keep the end-user version possible | Met. Definitions are data that a visual editor can read and write, and the console already edits console-managed tables that way |
| 12. Kernel before features | Met. No generated screens, no reporting, no connector beyond Postgres |

### Ownership promise

Strengthened. A deploy cannot destroy tenant data. A rollback cannot destroy it and cannot be blocked by it. The only code that drops anything is one explicit, audited route. A tenant's rows are ordinary Postgres tables they can read directly. A data source's password is encrypted with the tenant's key and never returned.

### Verification

| Check | Result |
| --- | --- |
| Lint, type check, schema, migration and licence checks | Passed |
| Every test on Postgres 16 and 18 | Passed |
| The example, built with the SDK and deployed by the CLI: the order flow writes each order it sends to the `orders` table | Passed, in `packages/cli/src/example.test.ts` and on the Compose stack |
| **Exit criterion on the single-host stack.** A dev workspace with 5 orders and a production workspace with 7, written by the flow and through the API. The repository's table was changed to add a column, rename one and remove one. The bundle was deployed to dev, then the same bundle (same digest) to production | Passed. Every row and value was intact in both, checked through the API and by reading the tables directly in Postgres. The removed column was still there, retired, holding its values |
| Rolling production back to the first bundle, after a new order had been written under the new definition | Passed after the fix described under Findings. The removed column came back with its values, the renamed one under its old name, and the added one was retired with its values kept |
| Two ordinary members, each bound to a role with `data:read` and `data:write` only | Passed. Each saw only their own orders, in the studio and through the API. Reading, changing or deleting another person's row answered 404, and inserting a row owned by someone else answered 403 |
| An external Postgres in a separate container, connected from the studio | Passed. Tables listed, rows browsed, a value changed, a row added. A table with no primary key was read-only |
| A file uploaded with a row in the studio, then downloaded | Passed. The same bytes and the same name |
| A table created in the console: column added, renamed, retired, brought back with its value | Passed |
| The studio in a real browser, at desktop and phone width, with no page errors | Passed |

### Known gaps

- Policies beyond the owner rule.
- A separate login role and connection pool for data requests. Until then row-level security guards against mistakes in our own queries, not against an injection, which is why no route accepts SQL.
- Column order follows creation, not the definition.
- An owner is one principal. A group can be given access to a table, but cannot own rows.
- Deleting a file does not check for rows that point at it.
- An allow-list for the addresses a data source may be bound to.
- Data sources other than Postgres. Dedicated databases per tenant (phase 5). Masking of personal data, and retention.

## Proposed deviations

None.
