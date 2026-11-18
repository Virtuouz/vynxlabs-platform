# Phase 18: data you can ask questions of, and a console that gets out of the way

Status: planned, on branch `phase-18-data-insight`, off `main` at a52d967. This document is milestone 0. Nothing is built, and the owner decisions below are proposals until the owner answers them.
Last updated: 2026-11-18

After phase 17 the owner used the test instance and wrote down what was in the way. The notes fall into four groups: the console's lists and forms, what a table can say and be asked, who decides what in a workspace, and what an operator can see. Each item was checked against `main`. "Read" means read in the code and not yet run.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Drawers | On a wide screen the drawer beside a list appears and disappears at once. Below 1280 px it slides | One `Inspector` serves every list (`apps/console/src/kit/layout.tsx:48`). Its docked form has no transition and is unmounted on close; only the sheet form animates (`packages/ui/src/SideSheet.tsx:45`) |
| Columns | The runs and audit lists reorder columns with up and down arrows. A table's rows hide columns from another menu and cannot reorder them. The first column of a table is always frozen | `ColumnsMenu` (`kit/views.tsx:191`) swaps neighbours on a click. The rows grid has its own menu and a `hide` parameter (`screens/Data.tsx:223`), and pins the first column with no way to release it (`packages/ui/src/Grid.tsx:392`) |
| Long text | A JSON or long text value in a table's row is edited on one line. Elsewhere a text area is 2 to 14 rows and never grows | `RowEditor` and `AddRow` draw every column as a `TextField` (`Data.tsx:425`, `:519`). `TextAreaField` has fixed `rows`, 4 by default (`packages/ui/src/Fields.tsx:168`) |
| Runs | Two vertical scroll bars once there are enough runs | Read, not yet seen: the table's own scroller (`kit/DataTable.tsx:645`, from `fill`) sits inside the list pane's (`kit/layout.tsx:281`). Runs is the only list that passes `fill` |
| End users | "End users" and "End-user groups" are two entries in the tenant's navigation | `nav.ts:157-158`. Members & access already keeps its groups as a tab (`screens/Members.tsx:17`) |
| Triggers | A trigger made in a dev workspace is not in the Triggers list until it is deployed, and nothing on the list edits one | The list reads `trigger_state`, which a deploy writes (`routes/execution.ts:1688`); it never reads drafts. Scripts, flows, interfaces and connections do list their drafts. The editor exists (`ResourceEditor`), but the Triggers inspector does not link to it, and a draft trigger is reachable only by its address |
| Enums | A column that holds one of a few values is `text`. Nothing offers the values, checks them or colours them | `COLUMN_TYPES` has ten types and none is a choice (`packages/manifest/src/kinds.ts:888`) |
| References | A reference shows as a UUID in the rows grid. Deleting a referenced row is always refused. Joins on a reference scan the table | The foreign key has no `ON DELETE` and no index (`kernel/data/apply.ts:601`). What to show in place of the ID is set per widget, not on the table (`packages/manifest/src/interface.ts:80`) |
| Questions across tables | Nothing can join two tables. A chart reads one table, grouped by at most 3 columns with 5 measures | Every read is one table through `findRows` or `aggregateRows` (`kernel/data/rows.ts:491`, `:564`). No route takes SQL, on purpose: "whoever can run SQL can also say they are someone else" (`rows.ts:184`) |
| Dashboards | A dashboard is an app page without forms: 12 widgets, four chart marks, two kinds of filter, no pivot, no drill-through, no saved query | It is one `interface` page kept per member (`member_dashboard`, migration 0028), drawn by the app renderer (`packages/screens`) |
| Deleting production | A production workspace cannot be deleted except with its tenant | `kernel/tenancy/remove.ts:75` refuses it for everyone. The rule is phase 5's, not the master spec's |
| Approvals | Approvals are one tenant-wide page. A workspace has none in its Operate section, and the page cannot be narrowed to one | `nav.ts:144`. `GET /tenants/:t/approvals` takes no filter. `GET …/workspaces/:w/approvals` exists and the console never calls it (`routes/flows.ts:1423`) |
| Favicon | The console, the portal's sign-in pages and generated apps have no icon. `/favicon.ico` answers with the console's HTML | Nothing emits `<link rel="icon">`, and nothing is made from the logo (`routes/branding.ts`, `kernel/apps/pages.ts:98`) |
| Operators | Metrics need an instance permission to scrape and say nothing about HTTP requests. There are no traces | `GET /api/v1/metrics` is hand-written Prometheus text behind `instance:read` (`routes/execution.ts:3215`). No OpenTelemetry package is installed |

Some of the notes are already so, or are not what they seemed:

- **Foreign keys exist.** A `reference` column is a `uuid` with a real constraint to the target's `id`. What is missing is listed above.
- **A drawer does not replay when a second item is clicked.** Nothing keys `Inspector` by its item. The work is the first open and the close.
- **The first column of a table's rows is already locked.** The work is the unlock.
- **Text areas already start at 4 rows** where the shared field is used with no `rows`. About a dozen call sites ask for 2 or 3.
- **Triggers can be edited**, at `…/resources/edit/trigger/<path>`. Nothing on the Triggers screen goes there.
- **A script or a flow can be run from its draft** before any deploy (`POST …/test-runs`). A trigger cannot be tried that way.
- **Prometheus is supported** in the sense that the endpoint speaks its format.
- **Sharing a table between workspaces** is in the master spec and was never built. A reference to another workspace's table is therefore not in this phase.

**Exit criterion.** On `examples/higher-ed-devices`, deployed to the test instance:

- a loan's `status` is an enum. A write of a value it does not have is refused by the API and by the database, the rows grid offers the values in their colours, and a value taken out of the definition stays on the rows that hold it;
- a loan's device shows by its name in the rows grid, and what happens to loans when a device is deleted is what the table says;
- a member who holds `sql:read` writes a query in the console that joins loans to devices, with tables and columns completed as they type. A member without it is refused. A member who may read only one of the two tables is refused, naming the other;
- the same query, saved and put on a dashboard, gives a borrower's end user only their own loans;
- a query that calls `set_config`, reads `pg_catalog`, writes, or holds two statements is refused before it reaches the database, and a test tries each;
- someone who has never written SQL builds a pivot of loans by month and status from menus, and changing the dashboard's date filter changes every widget on it;
- a trigger made in the dev workspace is in the Triggers list at once, marked as a draft, and opens in its editor from there;
- the drawer on each of the eight lists slides open and closed, and does not move when a second item is chosen;
- a logo uploaded for the instance gives the console an icon in the browser's tab;
- one request to start a run can be followed in an OpenTelemetry collector from the HTTP request to the worker's last log line.

## Owner decisions

All proposed. The first three decide how large this phase is.

| Area | Proposal | Why |
| --- | --- | --- |
| Shape | One branch, `phase-18-data-insight`, milestones one after another, commits `Phase 18: …`. **If the phase is to be split, the line falls after M9**: M1 to M9 stand on their own, and the dashboards of M10 to M12 need M7 to M9 | The dashboard work is about as large as everything before it |
| SQL | Read only. No write and no delete by SQL in this phase | A write by SQL would skip what the row API does around one: checking types, filling the owner column, the audit entry and the events a change publishes. Bulk changes are a script's work |
| SQL permission | One new kind, `sql`, with `read` only: "Run read-only SQL across the workspace's tables, held to each table's row policy." Not app-facing, so an end user never holds it | The catalog's verbs are `read` and `write`. A `delete` verb is a change to every role and is not needed until SQL writes are |
| Decision record | Write [Decision 0003](../evolution/decisions/) for SQL before M7 is built, as 0002 was for identity | It reverses a rule phase 4 states three times: "No route accepts SQL" |
| Enum storage | `text` with a `CHECK` constraint, not a Postgres `ENUM` | A native enum cannot lose a value, which fights "a deploy never drops data" |
| Enum strictness | The database refuses a value the column does not have. Grist only marks such a cell as invalid | Scripts, flows and agents write rows here, not only a person at a grid |
| Many choices in one cell | Not in this phase (Grist's "Choice List") | It is a second type with its own filters and joins |
| A reference's label | A table names its `display` column once. A widget's `show` still overrides it | Grist asks per reference column. Here the same answer is wanted in the grid, in forms, in SQL completion and in dashboards |
| Dashboards | Rebuilt around a saved query, in their own editor. They stop being an app page | An app is for doing something. A dashboard is for asking |
| Who owns a dashboard | A member's, as now, and a dashboard can also be saved as a resource so it is versioned and promoted | Phase 7 decided "dashboards are a member's". A report a business depends on has to reach production the way everything else does |
| Deleting production | A permission of its own, `workspace_production:write`, that no wildcard gives. Not `*:*`, not `workspace:*`. It is bound to a person by name, and binding it is audited | The owner's rule: the user decides, and nobody holds it without being given it. Today `tenant_admin` holds every permission by `*:*`, so the catalog needs a mark for "never by wildcard" |
| Approvals | The workspace's Operate section gets an Approvals page of that workspace's approvals. The tenant's page stays, as everything waiting for me anywhere, and can be narrowed to a workspace | Read as: where approvals are seen and decided. If the owner meant who may approve, a flow step already names its approvers, and a role bound at one workspace already limits them to it |
| Deploying in dev | Deploy stays the moment a change takes effect in a dev workspace, as a commit is. What changes: every list shows drafts, marked, and a draft can be opened, tried where that means something, and deployed by itself from where it is listed | A trigger that fired from a draft would mean two definitions of one resource running. Scripts and flows already work this way and the owner did not find them confusing |
| Text areas | At least 4 rows everywhere the shared field is used, growing with what it holds to 12, then scrolling | The owner's rule. It raises the dozen call sites that ask for 2 or 3 |
| Dragging | `@dnd-kit` for the columns list, with the arrows kept for the keyboard | It gives the gap animation and keyboard sorting. The alternative is pointer handling by hand, as the pane dividers do. Its licence is checked against the dependency policy in M0 |
| Favicons | Made when a logo is uploaded, with `@realfavicongenerator/generate-favicon` and `image-adapter-node` (both ISC, 0.9.0), for the instance's console and each tenant's portal and generated apps | The adapter brings `sharp`, a native module and the first image library in the build. Checked in M0, with a fallback of serving the logo as the icon |
| Telemetry | OpenTelemetry traces and metrics sent by OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and nothing loaded when it is not. The Prometheus endpoint stays, gains HTTP series, and can be scraped with a token of its own | The spec asks for "standard formats … ordinary tools" |

## Milestones

| # | Milestone | Size |
| --- | --- | --- |
| M0 | Branch, this document, and the checks listed under "To check before building" | S |
| M1 | Console: the drawer's motion, the runs scroll, text areas, end-user groups as a tab | S |
| M2 | Console: one columns control, dragged, on runs, audit and a table's rows; the first column locked or not | M |
| M3 | Drafts in every list; triggers listed, edited and deployed from the Triggers screen | M |
| M4 | Access: deleting a production workspace by its own permission; approvals in a workspace | M |
| M5 | Enum columns (migration 0076) | M |
| M6 | References: `onDelete`, an index, a display column, labels in the grid, `expand` in the row API | M |
| M7 | Decision 0003, then the query layer: parse, allow, views, identity that cannot be claimed, limits | L |
| M8 | `sql:read`, the query route, and the SQL editor with completion | M |
| M9 | Saved queries as a resource kind, with parameters | M |
| M10 | Dashboards on queries: the visual query builder, pivot and figure widgets, filters that fill parameters | L |
| M11 | Dashboards: drill-through, export, a dashboard as a resource, the old ones carried over | L |
| M12 | Favicons | S |
| M13 | OpenTelemetry, HTTP metrics, a scrape token | M |
| M14 | The example, the guides, the changelog and the walk-through on the test instance | M |

## What each milestone holds

### M1: the drawer, the scroll, text areas, end-user groups

- **The drawer.** `DockedInspector` slides in over `motion-slow` and out again, staying mounted until its closing motion ends. Changing its contents moves nothing. The sheet form is left as it is. The new motion is a transition on tokens, so `enforce.test.ts` needs no new keyframe; the global reduced-motion rule (`tokens.css:289`) already turns it off. It applies to every list, not only the eight named, since they share the component.
- **The runs scroll.** One scroller for the list. Seen in a browser first, then fixed, and the virtualised list and the sticky header checked against the scroller that is left.
- **Text areas.** `TextAreaField` grows with its text between 4 and 12 lines. A table's row form uses it for `json` and for text that already holds a line break or more than 200 characters, with JSON shown indented.
- **End-user groups** become the second tab of End users, in the way `ACCESS_TABS` does it. The old address goes to the new one, and the palette's and other screens' links are moved.

### M2: columns

- `ColumnsMenu` reorders by dragging a row between two others, which part to leave the gap. The arrows stay for the keyboard and for a screen reader.
- A table's rows use it in place of their own menu. The address carries `cols`, as runs and audit do. A saved view or a link that says `hide` is still read.
- The first column of a table's rows can be unlocked and locked from the same control. The choice is kept with the view.
- "Rows" in the owner's note is read as columns: rows have no order of their own beyond the sort.

### M3: drafts are listed, and triggers are worked on where they are listed

- `GET …/triggers`, `…/tables`, `…/variable-values` and `…/apps` list what is drafted and not deployed, marked as scripts and flows mark it.
- The Triggers inspector gets Edit, and Deploy for a draft, through the `DeployMenu` there is. An object link to a trigger or a schedule that is only a draft opens its editor.
- A draft schedule shows when it would next fire. A draft webhook or form says the address it will have.
- The empty state and the "saved as a draft" notice say the same thing in the same words on every kind.

### M4: access

- **Deleting production.** `deleteWorkspace` allows a production workspace when the caller holds `workspace_production:write` there. It still asks for the slug, still refuses while runs are in progress, and still unlinks the dev workspaces that promote to it. The console offers an export first. The catalog marks the permission as explicit, and `authorize` does not let a wildcard match an explicit permission. No migration gives it to anyone.
- **Approvals in a workspace.** Operate gets Approvals, fed by the workspace's route, which is brought level with the tenant's: what waits for me, and what was decided. The tenant's page takes a workspace filter, and the workspace's overview and flows pages link to their own.

### M5: enum columns

```yaml
status:
  type: enum
  values:
    - new
    - { value: on_loan, label: On loan, color: blue }
    - { value: returned, renamedFrom: back }
```

- Stored as `text` with a `CHECK` that lists every value the column has had and not purged. A value taken out of the definition is retired: rows keep it, nothing offers it, a write of it is refused by the API, and purging it is the explicit, audited action there is for columns.
- `renamedFrom` on a value rewrites the rows that hold the old one, in the deploy's transaction.
- The order of `values` is the order they sort and are offered in.
- New plan steps `set_values` and `rename_value`. The catalog's `data_column` gets `options jsonb` (migration 0076, and the same in a dedicated database).
- Widenings: `enum` to `text` always. `text` to `enum` only when every row already holds one of the values, checked at deploy and refused naming the values that are in the way.
- Touched: `COLUMN_TYPES` and both table schemas, `SQL_TYPE`, `planTable`, `toDatabase`, the filter grammar (`eq`, `ne`, `in`), `column.enum([...])` in the SDK typed as a union, the console's type picker and column editor, the rows grid and row form, `FORM_TYPES` and the value filter in `packages/screens`, CSV export, tenant export and import, and an external Postgres enum read as an enum that cannot be changed.

### M6: references

- `onDelete: restrict | set_null | cascade` on a reference column, `restrict` by default as now. `cascade` is named in the deploy's summary as a change that can delete rows.
- Every reference column gets an index.
- A table's `display` names the column that stands for a row. The rows grid, the row form's picker and `expand` use it.
- `GET …/rows/<table>?expand=device` returns the referenced row's ID and label beside the ID.
- Pointing a reference at another table replaces its constraint, and a reference can be taken away. Both are read as broken today (`apply.ts:383`, `:595`; `plan.ts:294`) and are tried first.

### M7: the query layer

The rule that no route takes SQL is right for the row API and stays there. A query is a different path with its own guards, each of which holds alone:

1. **Parsed, never passed through.** The text is parsed with Postgres's own parser and rebuilt from the tree. One statement. `SELECT` only, with joins, CTEs, set operations, subqueries and window functions. No `FOR UPDATE`, no `INTO`, no data-changing CTE.
2. **Only what is allowed.** Every relation must be a view in the workspace's query schema. Every function must be on a list: aggregates, date, text, maths, JSON and window functions. `set_config`, `current_setting`, `pg_sleep`, `query_to_xml`, `dblink`, large objects and everything else in `pg_catalog` are not on it.
3. **Views, not tables.** A schema `q_<workspace>` holds one view per table, named for the table's path and its columns as they are called now, made `security_invoker` so the row policy of the table beneath still applies. Retired columns are not in it. The views are rebuilt on each deploy.
4. **Each table's permission.** `data:read` can be held at one table, and the database's grants do not know that. The relations in the tree are each checked for the caller before the query runs.
5. **Identity that cannot be claimed.** The principal, groups and attributes are passed with a signature the data role cannot make, and the policies read them through a function that checks it. A query that reached `set_config` despite 1 and 2 would change nothing.
6. **Limits.** A read-only transaction, a statement timeout, a cap on rows and bytes returned, a pool of its own smaller than the row API's, and the tenant gate.

Results are cached by the query, its parameters and the caller's scope: never across scopes. A query against an external data source is not in this phase, since no row policy exists there.

### M8: SQL in the console

- `POST …/workspaces/:w/queries/run` with `{ sql, params, limit }`, behind `sql:read`. It answers with columns, their types and the rows, or with a refusal that names the line and what was not allowed. Each run is audited with the query's hash, not its result.
- A SQL workspace under Data: the code editor with a `sql` language, completion of tables, columns, enum values and joins along references, the result in the grid, and the plan's cost before a slow query is run.

### M9: saved queries

- A `query` resource kind: `sql` or a visual definition, `parameters` with a type and a default each, and a description. It is a file like any other kind, so it is drafted, deployed, promoted and synced.
- A saved query runs under the scope of whoever looks, so a viewer needs `data:read` on its tables and not `sql:read`. That is how an end user sees a dashboard.
- Parameters are bound, never spliced into the text.

### M10: dashboards on queries

```
tables ─▶ query (built from menus, or written) ─▶ result ─▶ widgets
                        ▲
            the dashboard's filters fill its parameters
```

- **The visual query.** Pick a table, follow its references to bring in another's columns, filter, group, choose measures, sort. It compiles to the same SQL through the same guards, and can be turned into written SQL, one way.
- **Calculated columns** are SQL expressions checked by M7. There is no formula language.
- **Widgets:** pivot table, figure with a comparison to the period before, table, and the chart with more marks (stacked and grouped bars, scatter, combined bar and line), all still Vega-Lite inside the kit.
- **Filters** belong to the dashboard, fill parameters by name, and apply to every widget whose query has that parameter. Date ranges are relative ("last 30 days") as well as fixed.

### M11: dashboards as something to rely on

- Clicking a mark or a pivot cell opens the rows behind it, or another dashboard with the filter carried.
- Export of a widget's result to CSV and XLSX, and of a dashboard to PDF if it comes cheaply; otherwise not.
- A dashboard can be saved as a `dashboard` resource. The member's own stay as they are.
- Each `member_dashboard` there is today is carried over: every widget's one-table read becomes a visual query that says the same.
- `dashboard:read` and `dashboard:write` keep their meaning. An end user may be shown a dashboard through an app, which is where `dashboard` becoming app-facing is decided.

### M12: favicons

Uploading a logo makes `favicon.ico`, a 32 px PNG, a 180 px touch icon, 192 and 512 px icons and a web manifest, kept in object storage beside the logo. The console's page, the portal's sign-in pages and a generated app's page link to them. An app with its own files keeps its own. An instance with no logo gets the product's default.

### M13: telemetry

- Traces: an HTTP request, the run or flow run it starts, the queue wait, the worker's execution and each flow step are one trace. The trace's ID is carried in the worker protocol and shown on the run page beside the request ID.
- Metrics by OTLP: the series the Prometheus endpoint has, under the same names.
- Prometheus: request count and duration by route and status, and a scrape token set in the environment so a scraper needs no member.
- A worker inside a client's network sends nothing unless it is configured to.

## Where this meets the master spec

Sections this phase builds on or adds to: Data layer (Custom tables, Schema changes, Access, Database studio), Identity and permissions (Permission model, Rules), Environments (Editing in dev workspaces, Workspace types), Apps and user interface (Admin console, Branding, Two tiers of app), Observability and audit (Operator health).

Proposed changes to the spec and to earlier phases, each to be agreed before its milestone and written into the spec first:

| Where | Says now | Would say |
| --- | --- | --- |
| Data layer, Access | Nothing about SQL. Phase 4: "No route accepts SQL" | Read-only SQL over a workspace's tables is a route of its own, with the guards of M7. The row API still takes none |
| Phase 7, decisions | "Dashboards are a member's" | A member's, or a resource |
| Two tiers of app | Generated apps cover "table, detail, form and chart views" | Dashboards are named as their own thing beside the two tiers |
| Non-goals | "A spreadsheet formula engine" | Unchanged. Calculated columns are SQL expressions |
| Phase 5 | A production workspace is deleted only with its tenant | By whoever holds the permission for it, which nobody holds unless given |
| Permission model | A wildcard gives every permission of its kind | Except a permission marked explicit |
| Operator health | "metrics and structured logs in standard formats" | And traces |

The master spec does not mention dashboards at all. This phase adds them.

## To check before building (M0)

- The runs page's two scroll bars, in a browser at a size that shows them.
- Retargeting and removing a reference, against a real database.
- That Postgres's parser runs in the control plane's Node as WebAssembly, its licence, its size, and that a rebuilt tree round-trips the queries the visual builder will write.
- That `security_invoker` views and the signed identity behave the same on Postgres 16 and 18, the two CI runs.
- `sharp` and `@dnd-kit` against the dependency policy, and `sharp` in the image the Dockerfile builds.
- Whether Monaco's SQL highlighting is already in the console's bundle.
- How the shared field can grow with its text in every browser the console supports.

## Tests

- Each guard of M7 has tests of its own that try to get past it, against a real database, including a table whose policy is `owner`, `rules` and `open`, a retired column, and a caller who holds `data:read` at one table only.
- Enum and reference plans are tested as `planTable` is: the same input, the same plan. A deploy, a rollback and a promotion of each are run against data that would be lost if it were done wrong.
- The drawer, the columns control and the dragging are covered by the browser tests, with the keyboard doing the same reorder.
- Every new screen has its reviewed picture at a phone's width and wide, and passes axe, as phase 14 set.
- A tenant export from before this phase imports after it.

## Findings

### Milestone 0

- The owner's notes ask for the columns control to be the audit log's. It is on runs as well, and a table's rows have a second, lesser one.
- `TENANT_ALIASES` (`nav.ts:254`) has no entry for `releases`, so the Releases tab of Members & access does not light its entry in the navigation. Fixed with M1's navigation change.
- The evolution documents say the metrics endpoint has "4 gauges". It has about twenty series.
