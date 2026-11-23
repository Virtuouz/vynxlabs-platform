# Inventory: queries sources dashboards

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings/README.md).

Abbreviations: Q = `apps/console/src/screens/Queries.tsx`, DB = `.../Dashboards.tsx`, D = `.../Data.tsx`, rq/rs/rd = `apps/control-plane/src/routes/{queries,sources,dashboards}.ts`, qry/ = `apps/control-plane/src/kernel/data/query/`, src = `apps/control-plane/src/kernel/data/sources.ts`, mp = `packages/manifest/src/page.ts`, mk = `packages/manifest/src/kinds.ts`, sp = `packages/widget-sdk/src/page.ts`, PE = `apps/console/src/screens/builder/PageEditor.tsx`. All paths are under `.`. Read from code and tests; nothing was run.

## A. Proposed pages (under packages/docs/content)

| Path | Status, topic | Purpose |
|---|---|---|
| data/queries.md | existing, `data-queries` | Screen: write, run, save, deploy, rename, remove |
| data/sql-reference.md | new | Allowed SQL, functions, casts, refusals, limits |
| data/visual-queries.md | new | Menu queries: conditions, groups, measures, JSON |
| data/data-sources.md | existing, `data-sources` | Declare, connect, test, browse, network |
| data/dashboards.md | existing, `data-dashboards` | List, view, share, refresh, download |
| data/dashboard-builder.md | existing, `data-dashboards-editor` | Editor differences only |
| data/dashboard-resources.md | new | Member vs workspace dashboards; deploy, follow |
| data/files.md | new | Files API (no console screen) |
| build/data-as-code.md | new | SDK and YAML |

Help topics: `nav.ts:130-132,298`. `sources/<path>` has no topic of its own. `dashboards/<id>` always opens the *editor* topic, even when only viewing. No Reports/schedule feature exists: dashboards have no scheduled email, publish/draft cycle or public link.

## B. Per page

**queries.md**
- Layout: editor left; aside "Saved queries" and "Tables" (expandable; a reference shows `→ table`) Q:438-512. URL `?query=<path>`.
- Header: path or "A new query"; pills "Draft, never deployed" / "Draft" / "Removing" Q:295-304.
- Buttons: "New query", "Name and path", "Remove" / "Discard draft" / "Keep this query" (code-owned: "Managed in the repository: the query is removed there."), "Save as…" or "Save", "Run" Q:306-363; `kit/RemoveDraftButton.tsx`.
- Shortcuts: Mod+Enter runs, Mod+S saves, Mod+K palette, F1 help (`editor/CodeEditor.tsx:188-200`). The editor completes tables, columns and functions.
- Dialogs: "Save this query" (field "Name, such as reports/fees"; a taken name is said on the field) Q:254; "Leave without saving?" (Leave/Stay) Q:168; "Name and path of …" (Key, Path max 255, Title max 200, "Save as a draft") `ResourceIdentity.tsx:130-300`.
- Parameters: a field per `$n`, hint = type; labels `$1` until saved, then `p1` (Q:85,128). Boolean accepts true/yes/y/1.
- Result line: "N rows, and there were more: the result was cut short · N ms · read tables"; empty: "The query ran and gave no rows."; refusal: "Line n, column n: …". Result is a read-only table: no chart, export or builder here.
- Permissions: Run needs `sql:read` (no wildcard gives it; built-in tenant_admin, workspace_admin, developer have it, migration 0078). List needs `resource:read`; save needs `resource:write` and a dev workspace. `data:read` per table; row policy applies; `data_all:read` bypasses policy (rq:105,247).
- Saved query by name: `GET …/queries/saved/<path>?params={json}&limit=` needs only `data:read` on its tables; unaudited (rq:449). A query reading no table needs workspace-level `data:read`. `POST …/queries/run` is audited `sql.run` (SQL, sha256, tables, row count; never results) rq:154.
- Others: `GET …/queries`, `/queries/schema` (tables, functions, `maySql`), `/queries/visual?query=` (JSON max 8000; returns `written` SQL).
- Limits: SQL 20,000 chars; run API 50 params, saved query 20 (mk:923-958); rows default 1,000, max 10,000; 5 MB (qry/run.ts:20-22); timeout `SQL_STATEMENT_TIMEOUT_MS` default 15 s, 1 s–10 min (config.ts:325); description 500.
- Parameter types text/integer/number/boolean/date/timestamp; misfit messages rq:536-562.
- Deploy checks: SELECT validity, parameter count equals the highest `$n`, unique names (`kernel/kinds.ts:193-225`). Table existence only at run.

**sql-reference.md**
One SELECT, rewritten from the parse tree. CTEs incl. RECURSIVE, set operations, windows, subqueries OK. Refused: other statements, INTO, FOR UPDATE, SEARCH/CYCLE, TABLESAMPLE, system columns, schema-qualified names, CURRENT_USER-like keywords, unlisted functions/casts (qry/parse.ts:66-135; lists qry/allowed.ts). Tables named by path, double-quoted when containing `/` or `-`. Every table has `id, created_at, updated_at`. Tables with paths over 63 bytes cannot be queried (qry/views.ts:16).

**visual-queries.md**
- Schema mp:68-136: joins 6 (reference columns, one hop, left join), filters 20, groupBy 4, measures 8, columns 50, sort 4, limit 10,000.
- Operators eq, ne, gt, gte, lt, lte, in (1–200), contains, is_null, not_null, last {count 1–1000, unit}, between. Functions count, count_distinct, sum, avg (4 decimals), min, max. Buckets day, week, month, quarter, year; result named `column_bucket`.
- Filters are AND only. Days are UTC. json/file/enum_list cannot be grouped, and take only empty/not-empty (or in/contains as text).

**data-sources.md**
- Columns Source, For, Points to (`db on host, as user`, or unbound), Password (Set/None), Health. Row actions "Test" ("Testing…"), "Change", "Unbind" D:2498-2557.
- "Connect database" fields: Source (picker of *declared* sources), Host, Port (5432), Database, User, Password, Schema ("public"), "Encrypt the connection" (No/Yes) D:2370-2392. "Change" keeps the password if blank; it closes the pool at once.
- Source page: table list left (`?item=`), rows right: per-column filter/sort, Keys, Columns menu (Lock the first column), Compact rows/Standard rows, inspector, Add row, Delete row; 50 per page. No CSV, saved views, totals or multi-delete (D:230-275).
- Postgres only (mk:1215). Base tables only, no views (src:203). Unsupported types are shown, not writable. Tables without a single-column primary key cannot be edited/deleted.
- Pool 4, connect 5 s, idle 30 s, fixed 15 s statement timeout; TLS verifies certificates, so private CAs/self-signed fail (`packages/db/src/external.ts:42`).
- Health: every ~10 min, 5 s timeout, up to 10 per minute per replica (`kernel/data/health.ts`). Errors 502 `source_unreachable`/`source_refused`, 504 `source_slow` (src:144).
- Egress: private, loopback, link-local refused unless `EGRESS_ALLOW` (docs/self-hosting.md:299).
- Permissions: `data_source:read` (list, browse, test), `data_source:write` (bind, rows). workspace_admin has `data_source:*`; developer/viewer read only. Password encrypted, never returned, per workspace; config/password are not in code, but are copied on workspace clone (`kernel/tenancy/clone.ts:99`).
- API: `data-source-bindings/*`, `data-source-checks/*`, `data-source-tables/*`, `source-rows/:table/*` (limit 1–1,000, insert 1–1,000), `source-row/:table/:key/*`. `password:null` clears it. Audit: bound, rebound, unbound, checked; row changes are not audited.
- Scripts: declare `uses.sources`, `ctx.source(path).table(name)` (find, get, insert, update, delete, aggregate), routes/worker.ts:925.

**dashboards.md**
- Columns Dashboard (tag "Resource"), Whose ("The workspace's"/"Yours"/name), Seen by ("Everyone here"/groups/"Only you"), Changed DB:106-135. "New dashboard" → Name → opens `?edit=1`. Max 20 per member per workspace (rd:22); title 1–100.
- View: "Last refreshed … · Refreshes every 5 minutes · N widgets could not be read", "Refresh now", Share, Edit, "⋯": "Rename…", "Keep it as a resource of the workspace…", "Delete…" DB:326-395,505-535. Filters in `?f=` JSON; `?edit=1`.
- Share dialog: "Show it to everyone in this workspace"; "Or show it to these groups" (max 50 groups; hidden if none) DB:398-420. Saves instantly. Viewers look only, see own rows, need `dashboard:read` and `data:read`.
- Refresh: off, 1, 5 (default), 15, 60; set in edit mode; stops while editing.
- Download menu on a widget frame: "Download as CSV" / "Download as a spreadsheet" (.xlsx), up to 10,000 rows; not on a stat (`packages/screens/src/Frame.tsx`).
- `dashboard:read`/`write`; members only, not service accounts or end users, for list and edit (rd:72). 409 when the revision is stale.

**dashboard-builder.md**
- Toolbar: Undo/Redo, "Refreshes", Share, ⋯, "Done", status "Saved." On narrow screens, behind ⋯. Saves immediately.
- Widgets: Table, List, Stat, Chart, Pivot, Text, Section, Tabs, Search and filter, plus labs "Goal" (`packages/widgets-core/src/index.ts`, widgets-labs). Max 30 widgets, 8 filters, 16 bindings, height 40, 12 columns (sp:173-186).
- Keys: `A` Add to page (PE:618), arrows move, Shift+arrow size, Delete, Mod+Z / Shift+Mod+Z / Ctrl+Y (e2e/dashboards.spec.ts:343).
- Source picker "Where it reads from" ("Find a table or query"): table, saved query, "SQL written here" (only with `sql:read`) `kit/inspector/rowsItUses.tsx:170-260`. A list takes table or query, not SQL.
- Steps: "Filter the page", "Show a message", "Show the rows behind" (`actionModel.ts:75-87`).
- Filter types date_range, choice, text, number, search (10 words, 200 letters; 10 columns per binding); choice offers 200 values; ranges sp:125-135; "All time", "Any", "Clear", "Clear filters". An unset date binding on SQL passes null.
- Trend bucket auto: ≤45 days day, ≤200 week, else month (qry/widget.ts:140).

**dashboard-resources.md**
Keep as a resource: field "Its path, such as boards/lending"; copy drafted, deploy from Releases; visible to all with `dashboard:read`; description "Kept by the workspace, at …". Follow rules: alias 90 days then recorded key; rename drafts console dashboards/interfaces; discard removes untouched drafts only (`kernel/dashboard-queries.ts`, dashboard-follow.test.ts:176-254).

**files.md**
`GET/POST …/files?name=`, `/files/:id`, `/content`, DELETE; raw body; 25 MB; list newest 200; always attachment; `file:read`/`file:write` (rs:430-646).

**data-as-code.md**
`defineQuery` (packages/sdk/src/index.ts:665), `defineDataSource` (:1030; it is not `defineSource`), `defineDashboard` (:1213, schemaVersion 3). YAML `<name>.query.yaml`, `.data_source.yaml`, `.dashboard.yaml`.

## C. Gotchas
- Same-named columns collapse; zero-row results have no columns (qry/run.ts:14-18).
- "Two people, different numbers" is intentional: policies apply as viewer, including saved queries and shared dashboards.
- Widgets pass unvalidated saved-query parameters and ignore `required` (qry/widget.ts:278).
- A deploy of a dashboard fails on an unfinished widget or unknown table; a member's dashboard saves with them.
- Opening an app's page refuses SQL sources.
- A widget may read `<source path>/<table>` (list/table only, no totals, joins or policies), though menus do not offer it (qry/inputs.ts:534).
- "Rows behind" works only for table sources, not saved query/SQL.
- Last-N ranges include today; filter days are UTC.

## D. Docs wrong, stale or missing
- dashboard-builder.md: "saved as a draft as you go" (saves live); title and description "in its settings" (rename is in ⋯, no description UI); "shared from the dashboards screen" (from the dashboard); **Phone/Tablet header, View as and restoring a draft do not exist here** (DB:443-476 passes no `frame`/`layout`); "Reset" is now "Clear"; step names now "Filter the page" and "Show the rows behind"; filters are in Display, not Data; Goal missing.
- data-sources.md: "A reference column in a source's rows is named…" is false (API returns no references). No connect, network, TLS or permission text. Says "reads"; it also writes.
- queries.md: one line, nothing on running, parameters or limits. Rename also covers interfaces.
- docs/sdk-guide.md:192-230: dashboard YAML is v1/v2 (`type: pivot`, `options`); current is schemaVersion 3 `core/*`. It claims `sql:read` is needed to deploy widget SQL; no such check found on drafts or deploys.
- Built-in role/permission tables are missing.

## E. Likely bugs and open questions
1. **Opening a drafted query shows the deployed SQL** (rq list returns deployed; Q:199 never reads the draft) and Save sends neither revision nor `create`, so it silently replaces the draft.
2. Saving from Queries drops a parameter's `required` (Q:127-132). Description and parameter name/type/label/default cannot be edited.
3. Save and "New dashboard" are shown without write permission; Save also in prod workspaces.
4. No console editor for `data_source` or a resource dashboard (`ResourceEditor.tsx:36` lists neither): sources must be declared by code or API, or "Connect database" offers nothing. A kept dashboard cannot be updated from the console.
5. No-primary-key note says rows can be "added", but Add row is hidden (D `canChange`).
6. Possible **permission gap**: widget reads of a bound source check workspace `data:read`, not `data_source:read`; `dashboards.ts` saves skip `missingTables`, so `dashboard:write` + `data:read` could read any bound source.
7. "Change" to a new host keeps the old password, sending it there.
8. Refresh timer ignores tab visibility (DB:233); "while it is on show" is loose.
9. Encryption defaults to No.
10. `MAX_SEARCH_COLUMNS` is 12 in visual.ts, schema says 10; periodEnd has no quarter branch, so **"rows behind" a quarter covers a year** (qry/inputs.ts:175-182).
11. Saved query's title is not shown in the Queries list.

## F. Screenshots and examples
Screenshots: Queries with a result and parameters; refusal with line/column; rename dialog with affected dashboards; Connect database; source browser; dashboards list; viewed dashboard with freshness; Share dialog; editor with Source picker; rows-behind sheet; Download menu. Examples: `examples/higher-ed-devices/platform/reports/lending.dashboard.yaml` and `loans-by-month.query.yaml`; `examples/fernhill/src/operations.ts:48` (defineQuery); curl for `queries/saved`; visual JSON from queries.test.ts `feesByDevice`; SQL with optional parameter `($1::date is null or due >= $1::date)`.
