---
title: Queries, data sources and dashboards as code
description: "How a query, a data source and a dashboard are written in a repository, with the SDK or as YAML files, and what the console does to a resource it takes over."
subjects: [queries, dashboards, data-sources]
---

A query, a data source and a dashboard are resources of a workspace. In a tenant's repository each is written in one of two ways, and both are deployed with `volvel deploy`: a call to the SDK in the code that exports the workspace's resources, or a file named `<path>.<kind>.yaml` in the folder of console resources (`platform`, or the `resources` of `volvel.yaml`). A resource made in the console and kept is written to that folder too. A path is defined once: a path defined in the code and again in a file is refused at build.

What each body may say, field by field, is in [Query](../kinds/query), [Data source](../kinds/data-source) and [Dashboard](../kinds/dashboard). This page shows how each is written.

## A query

```ts
import { defineQuery } from "@volvel/sdk";

export const visitsSince = defineQuery({
  path: "reports/visits-since",
  description: "Visits for each clinic from a day on.",
  sql: `select clinic, count(*) as visits
    from appointments
    where starts_at::date >= $1::date
    group by clinic
    order by visits desc`,
  parameters: [{ name: "since", type: "date", label: "From", default: "2026-09-01" }],
});
```

`sql` is one `SELECT`: see [SQL in a query](sql-reference). A parameter is `$1`, `$2` and so on, in the order of `parameters`, which has at most 20 and whose names are lowercase letters, digits and underscores. Each parameter's fields are in [Query parameters](../../../console/reference/queries/query-parameters).

The same query as a file, `platform/reports/visits-since.query.yaml`:

```yaml title="platform/reports/visits-since.query.yaml"
schemaVersion: 1
body:
  description: Visits for each clinic from a day on.
  sql: |
    select clinic, count(*) as visits
    from appointments
    where starts_at::date >= $1::date
    group by clinic
    order by visits desc
  parameters:
    - name: since
      type: date
      label: From
      default: "2026-09-01"
```

A deploy checks that the text is one valid `SELECT`, that the number of parameters equals the highest `$n`, and that their names are different. It does not check that a table exists: that is checked when the query runs. A query defined this way is **managed in the repository**: the console shows "This query is managed in the tenant's repository. Saving a draft of it takes it over." A query whose text changes in a deploy from the repository is not asked for `sql:read`.

## A data source

```ts
import { defineDataSource } from "@volvel/sdk";

export const libraryLoans = defineDataSource({
  path: "library-loans",
  description: "The library's loans.",
});
```

The function is `defineDataSource`. Its body is `{ connector: "postgres", description }`. **The address and the password are not in code.** They are set under **Data sources** in each workspace, so a dev workspace and a production workspace can point at different databases. A declared source is **Not set up here** until someone with `data_source:write` connects it. See [Connect a Postgres database as a data source](../../../console/how-to/queries/connect-a-data-source).

```yaml title="platform/library-loans.data_source.yaml"
schemaVersion: 1
body:
  connector: postgres
  description: The library's loans.
```

A script uses a source by declaring it and reading a table by name:

```ts
const loans = ctx.source("library-loans").table("loans");
```

The table has `find`, `get`, `insert`, `update`, `delete` and `aggregate`. The script lists the sources it uses in the `sources` option of `defineScript`, which is `uses.sources` in its manifest.

## A dashboard

```ts
import { defineDashboard } from "@volvel/sdk";

export const clinicWeek = defineDashboard({
  path: "boards/clinic-week",
  title: "Clinic week",
  description: "Visits for the week.",
  refresh: 15,
  widgets: [
    {
      id: "visits",
      type: "core/stat",
      title: "Visits",
      at: { x: 0, y: 0, w: 3, h: 4 },
      data: {
        value: {
          source: { visual: { table: "appointments", measures: [{ fn: "count", as: "visits" }] } },
        },
      },
    },
    {
      id: "by-clinic",
      type: "core/table",
      title: "By clinic",
      at: { x: 3, y: 0, w: 9, h: 6 },
      data: { rows: { source: { query: "reports/visits-since" } } },
    },
  ],
});
```

A dashboard is `schemaVersion: 3`. Its body is `title`, `description`, `refresh` and `widgets`. `refresh` is how often it reads again while open, in minutes: `off`, 1, 5, 15 or 60, and 5 when left out. A widget has an `id`, a `type` such as `core/stat`, `core/chart`, `core/table`, `core/pivot`, `core/list`, `core/goal`, `core/text`, `core/section`, `core/tabs` or `core/filter`, an `at` on a grid of twelve columns (a row is 40 pixels, a widget is at most 40 cells tall), a `config` the widget defines, and `data`, which names each input's `source` and the page `filters` that narrow it. A page has at most 30 widgets and 8 filters. A widget's `source` is one of:

| `source` | Reads | Notes |
| --- | --- | --- |
| `visual` | A table, built from menus | See [Visual queries](../../../console/reference/queries/visual-queries). |
| `query` | A saved query, by path, with `values` for its parameters by name | The path is recorded with the query's key when the dashboard is deployed, so a rename does not break it. |
| `sql` | SQL written in the widget, with `values` for `$1`, `$2` | On a dashboard only. A save from the console needs `sql:read` of whoever saves it. A repository deploy is not asked. |

The file form, from the example `examples/higher-ed-devices/platform/reports/lending.dashboard.yaml`:

```yaml title="platform/reports/lending.dashboard.yaml"
schemaVersion: 3
body:
  title: Lending
  description: Loans out, by month, status and kind
  refresh: 15
  widgets:
    - id: filters
      type: core/filter
      at: { x: 0, y: 0, w: 12, h: 2 }
      config:
        reset: true
        filters:
          - { name: lent, label: Checked out, type: date_range, default: last_90_days }
    - id: lent
      type: core/stat
      title: Loans
      at: { x: 0, y: 2, w: 3, h: 4 }
      data:
        value:
          source:
            visual:
              table: loans
              measures: [{ fn: count, as: loans }]
          filters:
            - { filter: lent, column: checked_out_at }
    - id: saved
      type: core/table
      title: By month and kind, from the saved query
      at: { x: 0, y: 6, w: 12, h: 7 }
      data:
        rows:
          source:
            query: reports/loans-by-month
          filters:
            - { filter: lent, parameter: since, part: from }
```

A filter reaches a widget only where the widget binds it: to a `column` of a table written in menus, or to a `parameter` of a saved query or of the SQL. A date range gives a query two parameters with `part: from` and `part: to`.

Whoever opens a dashboard gets the rows each table's rules give them.

## Taking over

A resource defined in the repository is **managed in the repository**. In the console it can be looked at, and changing it saves a draft that takes it over: once deployed it is a file that the console and the repository both edit. Remove its definition from the code, or the next deploy from the repository takes it back. A query and a dashboard have this in the console; a draft that removes one of the repository's is refused, so **Remove** is not offered for it.

## Related

- [Query](../kinds/query), [Data source](../kinds/data-source) and [Dashboard](../kinds/dashboard): every field.
- [SQL in a query](sql-reference)
- [Dashboards the workspace keeps](../../../console/explanation/queries/dashboard-resources)
