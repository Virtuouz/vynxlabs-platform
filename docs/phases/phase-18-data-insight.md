# Phase 18: data you can ask questions of, and a console that gets out of the way

Status: planned, on branch `phase-18-data-insight`, off `main` at a52d967. The owner answered the decisions on 2026-11-18. M0 to M4 built. M1 to M9 are built first, one after another, and the work then stops for the owner before M10.
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

Answered by the owner on 2026-11-18.

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-18-data-insight`, one phase, commits `Phase 18: …`. M1 to M9 are built in order, and the work stops there for the owner before the dashboards of M10 to M12 |
| SQL | Read only. No write and no delete by SQL in this phase. A write by SQL would skip what the row API does around one: checking types, filling the owner column, the audit entry and the events a change publishes |
| SQL permission | One new kind, `sql`, with `read` only. Not app-facing, so an end user never holds it. No `delete` verb until SQL writes need one |
| Decision record | Decision 0003 is written before M7 is built, and waits for the owner's answer, as 0002 did. It reverses a rule phase 4 states three times: "No route accepts SQL" |
| Enum storage | `text` with a `CHECK` constraint, not a Postgres `ENUM`, which cannot lose a value |
| Enum strictness | The database refuses a value the column does not have. Grist only marks such a cell as invalid; here scripts, flows and agents write rows too |
| Many choices in one cell | Built, as a second type: `enum` holds one value and `enum_list` several, as Grist's Choice and Choice List |
| Enum colours | A value's colour is one of the kit's palette names or any hex colour. Its text is black or white, whichever contrasts more with it, worked out and not chosen |
| A reference's label | A table names its `display` column once. A widget's `show` still overrides it |
| Table columns | Any column of a table's rows can be dragged to any place, the first included. Locking the first column is a switch, so the locked column is whichever one is first. Only the reordering control is shared with the runs and audit lists |
| Dragging | `@dnd-kit` for the columns list, with the arrows kept for the keyboard, if its licence passes the dependency policy in M0 |
| Text areas | Each field keeps the fewest rows it has now. It grows with what it holds up to a limit, then scrolls. The handle that drags it taller stays, and a field the user has dragged stops sizing itself |
| Deploying in dev | Deploy stays the moment a change takes effect in a dev workspace, as a commit is. Every list shows drafts, marked, and a draft can be opened, edited and deployed by itself from where it is listed. A draft trigger does not fire |
| Approvals | An approval belongs to its workspace and is shown and decided there. A flow's approval step can say it also surfaces to the tenant's page. A step that says nothing is its workspace's only |
| Deleting production | A permission of its own, `workspace_production:write`, that no wildcard gives: not `*:*`, not `workspace:*`. No role holds it until someone is given it by name |
| Dashboards | Rebuilt around a saved query, in their own editor. A member's, as now, and a dashboard can also be saved as a resource. Looked at again at the pause after M9 |
| Favicons | First find out what it takes with no new package. The two `@realfavicongenerator` packages bring `sharp`, a native module, and are the fallback |
| Telemetry | The platform speaks the formats: OpenTelemetry by OTLP, and Prometheus text. It ships no collector, no Prometheus and no dashboard of its own |

## Milestones

| # | Milestone | Size |
| --- | --- | --- |
| M0 | Branch, this document, and the checks listed under "To check before building" | S |
| M1 | Console: the drawer's motion, the runs scroll, text areas, end-user groups as a tab | S |
| M2 | Console: one columns control, dragged, on runs, audit and a table's rows; the first column locked or not | M |
| M3 | Drafts in every list; triggers listed, edited and deployed from the Triggers screen | M |
| M4 | Access: deleting a production workspace by its own permission; approvals in a workspace, surfaced to the tenant when a step says so | M |
| M5 | Enum columns, one value or several | M |
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
- **Text areas.** `TextAreaField` keeps `rows` as the fewest lines it shows, grows with its text to 12, then scrolls. Its resize handle stays, and once it has been dragged the field keeps the height it was given. A table's row form uses it for `json` and for text that already holds a line break or more than 200 characters, with JSON shown indented.
- **End-user groups** become the second tab of End users, in the way `ACCESS_TABS` does it. The old address goes to the new one, and the palette's and other screens' links are moved.

#### Built

- **The drawer** (`apps/console/src/kit/layout.tsx`). `Docking` gives the docked inspector its room over `motion-slow` and takes it away again; the panel keeps its own width and is uncovered, so its text does not reflow as it moves. `Inspector` keeps what it last showed for as long as it is shutting, since a screen stops passing the title and the details the moment nothing is chosen. `MasterDetail` keeps the last inspector a screen gave and tells it it is shut, for the screens that give none when nothing is chosen (runs, events, triggers, approvals, flows, scripts, apps). Focus goes back to the row as the panel starts to shut, and the panel is inert while it does.
- **The runs list** has one scroller: `MasterDetail fill` gives the list its height and does not scroll as well.
- **Text areas** (`packages/ui/src/Fields.tsx`): `useGrowing` measures the text and sets the height between `rows` and `maxRows` (12). A field whose height is not the one last given was dragged, and is left alone.
- **A table's row** shows `json`, and text over 200 characters or over several lines, in a text area, with JSON indented. Adding a row does the same for `json`.
- **End users** has two tabs, End users and Groups, each at the address it had. The palette still finds "End-user groups".

#### Findings

- **The second scroll bar was not seen.** In Chromium at 100 % with 40 runs in a 700 px window, the layout `main` had two scrollers one inside the other, but only the outer one had anything to scroll: one bar. What that layout did show: the header was stuck to the inner one, so it scrolled away, and the list's virtualising watched a scroller that never moved. A display scaled to 125 % or 150 % can leave the inner one a fraction of a pixel short, which is the likeliest way a second bar appeared. With one scroller there is nothing left to show a second. **The owner should look at it on the screen where it was seen.**
- **A panel that is on the page when it loads slides in as well**, since "arriving open" and "opened" are the same to it.
- **`e2e/drawer.spec.ts`** watches the panel's room frame by frame: it grows once, does not change for a second run, and shrinks once; under reduced motion it is there or not.
- **The browser tests failed 23 of 51 the first time, and none of it was the change.** The instance lists the console's files when it starts. The console was rebuilt after it had started, so every new file answered with the page itself. The instance is restarted after each build now.

### M2: columns

- `ColumnsMenu` reorders by dragging a row between two others, which part to leave the gap. The arrows stay for the keyboard and for a screen reader.
- A table's rows use it in place of their own menu, with every column in it: any column can be put first. The address carries `cols`, as runs and audit do. A saved view or a link that says `hide` is still read.
- Locking the first column is a switch in the same control, on by default. With it on, whichever column is first stays in view. The choice is kept with the view.
- The runs and audit lists keep their key column first and get the dragging only.

#### Built

- **`ColumnsMenu`** (`apps/console/src/kit/views.tsx`) orders its list with `@dnd-kit` (core 6.3.1, sortable 10.0.0, modifiers, utilities; MIT, and `check:licenses` passes). A dragged row stays in the list and the rows it passes move to leave its place. Each row has a handle; Move up and Move down stay.
- **A table's rows** (`screens/Data.tsx`) use it, with every column in it. The address carries `cols` and, when the first column is not locked, `unlock=1`. `hide` is read and no longer written. `Grid` takes `lockFirst`.
- `e2e/columns.spec.ts`: a drag that parts the rows, the same from the keyboard, lock and unlock, and an old `hide` link.

#### Findings

- **The library's own keyboard dragging did not work inside the dialog**: Space picked a column up, and the arrows then moved nothing. It was not chased further. On a column's handle the up and down arrows move it one place, with no picking up, and say where it now is. That is fewer presses than the library's way.
- **What is said aloud has to be inside the dialog.** The library puts its announcements at the end of the page, which a modal dialog hides from a screen reader. They are given a place inside it.
- **A table's columns come in the order the table keeps them**, which is by name, not the order they were written in. Being able to put them in order is therefore worth more than it looked.
- **Not done: the column widths.** The grid still sizes columns by their content.

### M3: drafts are listed, and triggers are worked on where they are listed

- `GET …/triggers`, `…/tables`, `…/variable-values` and `…/apps` list what is drafted and not deployed, marked as scripts and flows mark it.
- The Triggers inspector gets Edit, and Deploy for a draft, through the `DeployMenu` there is. An object link to a trigger or a schedule that is only a draft opens its editor.
- A draft schedule shows when it would next fire. A draft webhook or form says the address it will have.
- The empty state and the "saved as a draft" notice say the same thing in the same words on every kind.

#### Built

- **`GET …/triggers`** lists a schedule or a trigger that has only a draft, with `draft: "new"`, no address, and the time it would first fire were it deployed now. A deployed one that a draft changes or removes says `changed` or `removed`, and still shows what is deployed, since that is what fires. Each says its `resourceKind`.
- **The Triggers screen** marks them, and its panel has Edit for every trigger in a dev workspace (a flow's trigger node opens the flow's editor) and, for a draft, Deploy. A draft says that it starts nothing until it is deployed.
- **`GET …/variable-values`** lists a drafted variable the same way, and the Variables list marks it and opens its editor.
- Tests: three in `authoring.test.ts`.

#### Findings

- **Tables and published apps had no hidden drafts to show.** The console makes and changes a table at once (`PUT …/resources`), not through a draft, and an app made in the console is an interface, whose list already says "Not published". Nothing was changed for either.
- **A draft webhook has no address until it is deployed**: the address is made from what a deploy registers. The panel says so.
- **Connection groups list their drafts too.** A group that is only a draft cannot be given members, since its members are kept by the deployed group; its panel opens the draft instead.
- **Events needed nothing.** The Events screen lists what was published, not definitions, so there is no list a drafted event is missing from.
- **One test compared the variables list exactly** and was given the new field.
- **A draft trigger can be checked in the list with the rest.** Pausing leaves it out, since it fires nothing.

### M4: access

- **Deleting production.** `deleteWorkspace` allows a production workspace when the caller holds `workspace_production:write` there. It still asks for the slug, still refuses while runs are in progress, and still unlinks the dev workspaces that promote to it. The console offers an export first. The catalog marks the permission as explicit, and `authorize` does not let a wildcard match an explicit permission. No migration gives it to anyone.
- **Approvals in a workspace.** Operate gets Approvals, fed by the workspace's route, which is brought level with the tenant's: what waits for me, and what was decided. The workspace's overview and flows pages link to it.
- **Approvals that surface.** An approval step says `surface: tenant` to be listed on the tenant's page as well. A step that says nothing is listed in its workspace only. What a step says is kept on it when it starts to wait, and a migration marks every step already waiting as `tenant`, so nothing that waits today leaves the tenant's page. A deploy says once that approvals are now their workspace's unless a step says otherwise.

#### Built

- **Explicit permissions.** `PermissionKind.explicit` marks a permission that only its own name gives. `grants()` (`kernel/authorize.ts`) answers for one by looking for exactly that name, so `*:*`, `*:write` and `workspace_production:*` do not give it. The catalog route says which are explicit, and the role editor says so beside them.
- **`workspace_production:write`** deletes a production workspace. `DELETE …/workspaces/:w` asks for it as well as `workspace:write` when the workspace is production. The slug, the refusal while runs go and the unlinking are as for a dev workspace, and the audit entry says the type. No migration gives it to anyone. Workspace settings offers the deletion with what it needs and a link to export first.
- **`surface` on an approval step** (`workspace` or `tenant`), in the manifest, the schema, the SDK and the flow editor. The engine keeps `surface: tenant` on the step when it starts to wait.
- **The tenant's two routes** list only what was surfaced. **The workspace's** list every approval of the workspace; `?mine=true` gives those the caller may decide, and `…/approvals/decided` is new.
- **Migration 0076** marks every approval there was, waiting or decided, as surfaced, so the tenant's page and its history are as they were.
- **The console**: Approvals under a workspace's Operate, the same screen given a workspace. The overview, the flows page and the `g a` shortcut go to the workspace's when in one.
- Tests: `environments.test.ts` (an administrator refused, a wildcard role refused, the named role given at one workspace reaching only that one), `operations.test.ts` (an approval that is its workspace's only).

#### Findings

- **An operator is refused too**, with "not found": they have no standing in a tenant that has not let them in, and an access grant gives a role by wildcard.
- **Whoever may write roles and bindings can give themselves the permission.** That is the design: it is a deliberate act, by name, and it is in the audit log. It is not a second person's approval.
- **Not built: the deploy's one-time notice** that approvals are now their workspace's. A notice on every deploy of every flow with an approval step would be noise, and there is no place that remembers it was said. The changelog says it.
- **Seven tests assumed the old rules** and were changed: four flows' approval steps now say `surface: "tenant"`, and the two that tried deleting production expect the new refusal.


```yaml
status:
  type: enum
  values:
    - new
    - { value: on_loan, label: On loan, color: blue }
    - { value: returned, renamedFrom: back }
accessories:
  type: enum_list
  values: [charger, case, { value: dock, color: "#7c3aed" }]
```

- `enum` holds one value and is stored as `text`. `enum_list` holds several, in the order given, and is stored as `text[]` with a `CHECK` that every item is one of the column's values.
- A `color` is a palette name or a hex colour. A value is drawn on its colour with black or white text, whichever `contrastRatio` (`packages/ui/src/contrast.ts`) says is easier to read.

- The `CHECK` lists every value the column has had and not purged. A value taken out of the definition is retired: rows keep it, nothing offers it, a write of it is refused by the API, and purging it is the explicit, audited action there is for columns.
- `renamedFrom` on a value rewrites the rows that hold the old one, in the deploy's transaction.
- The order of `values` is the order they sort and are offered in.
- New plan steps `set_values` and `rename_value`. The catalog's `data_column` gets `options jsonb` (a migration, and the same in a dedicated database).
- Widenings: `enum` to `text` always. `text` to `enum` only when every row already holds one of the values, checked at deploy and refused naming the values that are in the way.
- Touched: `COLUMN_TYPES` and both table schemas, `SQL_TYPE`, `planTable`, `toDatabase`, the filter grammar (`eq`, `ne`, `in`, and `has` for a list), `column.enum([...])` in the SDK typed as a union, the console's type picker and column editor, the rows grid and row form, `FORM_TYPES` and the value filter in `packages/screens`, CSV export, tenant export and import, and an external Postgres enum read as an enum that cannot be changed.

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

A logo gives the console, the portal's sign-in pages and a generated app's page an icon: `favicon.ico`, a 32 px PNG, a 180 px touch icon, 192 and 512 px icons and a web manifest, kept in object storage beside the logo. An app with its own files keeps its own. An instance with no logo gets the product's default.

**Without a new package first.** The server has no image library, and none is needed if the sizes are made where the logo is chosen: the console draws it onto a canvas at each size and uploads the results with it; an SVG logo is also served as the icon as it is; and an `.ico` is a PNG behind a 22-byte header. What this cannot do is make icons for a logo set through the API alone, which would get the logo itself as its icon. If that falls short, the two `@realfavicongenerator` packages and `sharp` are the fallback. Settled when M12 is planned.

### M13: telemetry

- Traces: an HTTP request, the run or flow run it starts, the queue wait, the worker's execution and each flow step are one trace. The trace's ID is carried in the worker protocol and shown on the run page beside the request ID.
- Nothing is shipped beside the platform: no collector, no Prometheus, no dashboards. It sends OTLP to whatever endpoint the operator names, loads no OpenTelemetry code when none is named, and answers a Prometheus scrape.
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
| Phase 3, approvals | Every waiting approval is listed for the tenant | For its workspace, and for the tenant when its step says so |
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
- **Retargeting a reference keeps the old constraint: confirmed in the code.** `reconcileReferences` skips a column whose `fk_` constraint exists by name, and the name is made from the table and the column, not the target (`apply.ts:595-600`). `set_reference` changes only the catalog. A failing test comes first in M6.
- **Postgres's parser runs in Node.** `pgsql-parser` 18.3.5 with `libpg-query` 18.2.4 and `pgsql-deparser`, all MIT: a 1.8 MB WebAssembly module, no native build. It parsed and rebuilt a query with a CTE, a join, `FILTER`, a window function, casts, parameters and a `UNION`; the first parse took about 20 ms and later ones under 1 ms. A data-changing CTE and `FOR UPDATE` both parse as a `SelectStmt`, so the kind of statement is not enough and the tree is walked. A CTE's name appears as a relation, so the walk has to know the names a query defines. A syntax error carries its position.
- **A signed identity works with nothing but what Postgres has.** On Postgres 18.6: a `security_invoker` view over a table with a row policy, the policy reading the caller from a `SECURITY DEFINER` function that checks `sha256(key || sha256(key || claim))` against a key in a schema the data role cannot enter. The signed claim gave its own rows, a forged one was refused, no claim gave none, and the key could not be read. Written as `(select fn())` the check ran once for the query, not once for each row. No extension is needed. Postgres 16 is tried by CI when M7 lands.
- **`@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0 are MIT.** `check:licenses` is run when they are added in M2.
- **Monaco's SQL highlighting ships with the package** (`basic-languages/sql`) and the console imports the whole editor, so M8 adds completion and no tokenizer.
- **A text area is sized by measuring it**, not by `field-sizing: content`, which not every browser the console supports has.
- **The runs page's two scroll bars are looked at in a browser as M1's first step**, where the fix is made.
