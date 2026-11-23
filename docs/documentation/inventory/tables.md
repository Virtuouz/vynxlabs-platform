# Inventory: tables

Read from the code at `270e509` on 2026-11-22. A report, not checked prose: what it calls a bug is settled in [the findings](../findings.md).

Read-only, at `270e509`. I ran no code or tests: **E** items come from reading the code unless marked "tested". Paths are from ``. Short names: `Data` = `apps/console/src/screens/Data.tsx`, `Rules` = `apps/console/src/screens/RowRules.tsx`, `rd` = `apps/control-plane/src/routes/data.ts`, `kd` = `apps/control-plane/src/kernel/data`, `T` = `packages/manifest/src/table.ts`, `K` = `packages/manifest/src/kinds.ts`, `Grid` = `packages/ui/src/Grid.tsx`.

## A. Pages

Only topic `data-tables` exists. F1 opens it from both the list and a table (`apps/console/src/help/Help.test.tsx:94`).

| Path under `packages/docs/content` | State | Purpose |
|---|---|---|
| `data/tables.md` | existing, `data-tables` | Hub: list, create, anatomy of a table |
| `data/table-rows.md` | new | Grid, filters, inspector, adding, CSV, views |
| `data/table-definition.md` | new | Columns, choices, references, display, undo |
| `data/column-types.md` | new | 12 types: storage, filter, edit, limits |
| `data/row-rules.md` | new | Who sees rows |
| `data/retired-data.md` | new | Retire, bring back, Delete for good |
| `data/files.md` | new | File columns, storage, history |
| `build/defining-tables.md` | new | `defineTable`, YAML, change rules |
| `build/rows-in-scripts.md` | new | `ctx.table`, `ctx.source`, `ctx.files` |
| `build/rows-api.md` | new | REST rows, totals, export, errors |
| `instance/databases.md` | existing stub | Dedicated databases |

Keep one row per field in the generated reference (`packages/docs/generated/kinds/table.md`) and link to it. Data health covers only external sources (`kd/health.ts`), so it belongs on `data/data-sources.md`. **There are no column masks, no computed columns, no row validation rules, and no CSV import** (`generated/…/import` is tenant import).

## B. Per page

**data/tables.md** (`Data:1170-1250`)
- List columns: Table (with "retired" pill), What it holds, Managed in (Repository/Console), Who sees rows, Columns, Rows. Empty state "No tables yet".
- **Create table** fields: Name ("Lowercase letters, digits and dashes."), First column, It holds (reference omitted).
- Type labels (`Data:55-68`): Text, Whole number, Number, Yes or no, Date and time, Date, JSON, ID, Row of another table, File, One of a list, Several of a list.
- Table header: description, row count, policy sentence, "Managed in the repository/console". Attached documentation pages appear through `AttachedPages` (`Data:1277+`).
- Tabs **Rows** and **Definition** (`?view=`). A retired table shows a notice with **Delete for good**.
- System columns: `id`, `created_at`, `updated_at` (`K:1023`).
- Permissions (`packages/manifest/src/permissions.ts:75-134`): `table:read/write` (write = Delete for good only), `data:read/write`, `data_all:read/write`, `file:read/write`. Saving a definition needs `resource:write` (`routes/workspaces.ts:596`). `data:*` can be granted at one table (`rd:226-281`).
- Built-in roles (`packages/db/migrations/0005_permissions.sql:20-30`, `0013_data_roles.sql`): workspace_admin has data/data_all/table/file `*`; developer has `*:read` plus data, data_all and file write; viewer has `*:read`.

**data/table-rows.md** (`Data:148-550`)
- Toolbar: **Keys** popover, **Columns** dialog (checkbox show/hide, drag handle, Up/Down arrows, "Lock the first column", "Show every column", **Done**; `apps/console/src/kit/views.tsx:195+`), **Compact rows/Standard rows**, saved-views bookmark menu, **CSV**, **Add row**. A keyless source table shows a read-only note.
- Saved views (`views.tsx`): Save this view…, Save over "X", Rename, Delete, Copy a link to this view. Private to the member; the link works for anyone. Not for source tables (`Data:2675`).
- URL state: sort, filter, cols, unlock, density, row (`Data:134`).
- Sort: header click cycles ascending, descending, none. Not json or enum_list. Filter: no json or ARRAY. 300 ms debounce. All filters are ANDed.
- Filter language (`Data:118`): text = contains (case-insensitive); `>= <= > <` then value; otherwise equals; `empty`/`null` = no value; one-of-list = exact value; several-of-list = has.
- Footer: "N rows on this page, of N that match"; Previous/Next; 50 per page (`Data:53`).
- Keys (`Grid:330-440`): arrows; Home/End, Ctrl+Home/End (whole grid); PageUp/Down = 10 rows; Enter or F2 edits, and Enter on a heading sorts; on a cell that cannot be edited Enter opens the row; Space checks; Escape cancels. Double-click edits. Enter, F2 or double-click toggles a yes/no cell.
- Checkboxes: batch bar "N rows checked", **Delete**, **Uncheck all**. Result text reports rows "gone already, or were not yours to delete". Bulk delete takes at most 1,000 ids.
- Column ⓘ shows the description. Glossary terms are underlined.
- Inspector "Row": **Save row**, **Discard**, **Delete row**, guard "Leave without saving?". Reference picker: 50 offered, "Type to find more", 250 ms (`Data:603-700`). Add row sheet: "Required"/"Optional" groups.

**data/table-definition.md** (`Data:1706-2320`)
- **Rename table**, **Describe the table** (500 characters), Undo/Redo (Mod+Z; Shift+Mod+Z or Ctrl+Y; 100 steps; not while typing in a field).
- Columns table: Column, Holds, Rules ("Required", "No two rows alike"), When not given. Row actions: **Values** or **On delete**, **Describe**, **Rename**, **Retire** (disabled on the last column).
- **Add column**: Name, It holds, Which table, When the row it points to is deleted (Refuse the deletion / Empty this column / Delete this row too), Values (comma-separated), Must every row have one?, Value when none is given.
- **Values** dialog: Value, Shown as, Color (None, 9 names, "One of your own"), move, Remove, Add a value, live "Rows that hold X will hold Y", and a notice naming values no longer offered.
- **What stands for a row**: not json, file or enum_list. If none is set: name, else title, else first text column (`T:displayGuess`).
- **Where it is stored** shows `schema.table`. **Retire table**.

**data/column-types.md** (`K:980-1095`, `kd/apply.ts:21-35`, `kd/rows.ts:346-396`)
- Postgres: text→text, integer→bigint (safe integers only), number→double precision, boolean, timestamp→timestamptz (stored as ISO UTC), date→date (YYYY-MM-DD), json→jsonb, uuid/reference/file→uuid, enum→text + check, enum_list→text[] + check.
- Names `^[a-z][a-z0-9_]*$`, 55 chars; 1-200 columns; 200 values of 1-100 chars, with no commas or newlines; 9 named colours or `#rrggbb`; descriptions 500 chars; 20 indexes of 1-5 columns.
- Defaults: none on reference or file (`T:defaultFits`). unique not on enum_list.

**data/row-rules.md** (`Rules`, `T`, `kd/apply.ts:590-665`)
- Policies: open; owner (uuid or text column); rules (1-20). UI modes: "Everyone with access sees every row", "Each person sees their own rows", "Rules decide".
- Who: Everyone with access / The person named in a column / A group named in a column / People with a matching attribute. May: Read / Read and change. Buttons: **Add a rule**, Remove, **Save who sees rows**.
- Column types allowed: uuid, text; attribute rules also integer. Attribute name `^[a-z][a-z0-9_]{0,62}$`.
- A read needs any matching rule; a write needs a `write`/`all` rule. A row inserted without an owner gets the writer's ID: the owner column, or the first `is: principal` rule that allows writing (`kd/rows.ts:950-970`).
- Enforced in Postgres through a signed claim. Groups and attributes are read on every request.
- **See it as** (end users only; first 20 rows; needs `data_all:read` and `end_user:read`). API: `as`, `asGroup`.

**data/retired-data.md**
- Retired tables and columns keep their data. "Retired columns" lists Held and Still holds; **Bring back**, **Delete for good** (type the name; audited `table.purged`). Purge refused while a foreign key points at the table ("Another table still refers to…").
- Retired enum values stay on rows and can still be filtered, but are not offered.
- Retention does not remove retired data.

**data/files.md**
- 25 MB; name 255 chars; download always as an attachment (`routes/sources.ts`). `GET /files` lists the newest 200. Audit `file.uploaded/deleted`.
- Replaced files are kept in `row_file_history` until audit retention ends (`kd/files.ts`, `kernel/retention.ts:255`).
- Deleting a row does not delete its file.

**build/defining-tables.md** (`packages/sdk/src/tables.ts`, `packages/sdk/src/index.ts:930-1022`; YAML `<path>.table.yaml`)
- Safe: add column; retire; rename with `renamedFrom`; widen (integer→number/text; number, boolean, uuid, date, timestamp or enum→text; `kd/plan.ts:114`); change default, policy, display, indexes or onDelete; enum values and value `renamedFrom`.
- Conditional: required (needs a default or no nulls); unique (no duplicates); text→enum (every row must fit; lists up to 5 strays). Refused: any other type change ("Add a new column and copy the values across in a script").
- Going back to an older definition renames columns back and restores retired ones, if the type matches. Applied in one transaction (tested in `data.test.ts:870-1148`). A dedicated database commits just before the platform.
- Deploy report lines: `describeChanges` (`kd/plan.ts:395`).
- Env var `DATA_STATEMENT_TIMEOUT_MS` 15000 (1,000-600,000); `DATA_POOL_SIZE` 10; `DATA_TENANT_CONNECTIONS`.

**build/rows-in-scripts.md** (`packages/sdk/src/tables.ts`, `apps/control-plane/src/routes/worker.ts:836`)
- `find` (limit default 50, max 1,000; `offset`), `get` (null if missing), `insert`, `insertMany` (max 1,000, all or nothing), `update`, `delete`, `aggregate`, `as(principalId)`. Without `as` the script sees every row. Declare `tables:` / `sources:`.
- Aggregate: 3 groups, 5 measures, 5 s limit, buckets day/week/month/year at midnight UTC.
- Events `platform/row-changed` `{table, change, id}`.

**build/rows-api.md** (`rd`)
- Routes under `/api/v1/tenants/:t/workspaces/:w`: `tables`, `rows/*`, `row/:id/*`, `rows-export/*`, `row-deletions/*`, `aggregate/*`, `column-values`, `column-counts`, `table-purges`.
- Filter operators: eq, ne, gt, gte, lt, lte, in (1-200), contains (text), is_null, has (enum_list); and/or; 50 conditions. limit 1-1000, default 50; opaque `cursor`; `expand` at most 5 columns.
- CSV max 100,000 rows; formulas get a leading `'`; lists joined with `;`. Guests 120/min (`kernel/http.ts:64`).
- Errors: 400 with field paths, 403 policy, 404 (also rows hidden by policy), 409 unique/reference, 422 `too_slow`, 503 busy.

**instance/databases.md**: a tenant's `dataLocation` is set only at creation; `routes/locations.ts`; the catalogue lives with the data (`kd/stores.ts`).

## C. Gotchas
- Built-in developer and viewer read every row, past the policy (`*:read` includes `data_all:read`; tested for viewer, `data.test.ts:705`).
- `ne` and comparisons skip empty values (SQL nulls). You cannot filter for the literal text "empty".
- Set enum, list, reference, file and key cells are not editable in place. An *empty* one is, by typing the raw value or ID (`Grid` cell `undefined` rule).
- Times: grid shows local time, Add row uses UTC, inline typing is parsed by the server.
- Retired-value rows: saving that field again is refused.
- A reference filter needs the full ID.
- Retiring a column drops required, unique and the reference rule. Bring back restores none of them, nor the default (`Data:1990+`).
- Row edits are not in the audit log (`rd:779`).
- Rename table saves a **draft**; other definition changes apply at once.
- The grid count and CSV follow the filters, not the checked rows.

## D. Existing docs
- `data/tables.md` "the table saves as you work": row rules need **Save who sees rows**; every other change saves by itself.
- It implies a row history can be opened. There is no screen or route that shows it.
- Missing: everything in B except scrolling, the picker, references and files.
- `data/index.md` is fine. `sdk-guide.md` "a row… matches what the group is called" is right, but comments in `T:RowCondition` and the SDK omit the group **key** (`kd/rows.ts:179`).
- `K:1063`/generated `table.md` say enum values are "offered and sorted" in order. Row sort is alphabetical (`kd/rows.ts:572`).
- SDK comment on `reference` sits on `enum` (`tables.ts`, `column`).

## E. Likely bugs and open questions
1. Paging by `created_at`/`updated_at` (or any microsecond timestamp): the cursor is truncated to milliseconds (`kd/rows.ts:399,600-612`). Rows inserted together (bulk insert) could be skipped (descending) or repeated (ascending), and CSV export could repeat rows up to the cap. Needs a test.
2. Sorting by an enum column whose page ends on a retired value: "The cursor is not valid".
3. Create table offers One/Several of a list but no Values field, so the save is refused (`Data:1230`, `T:checkTable`).
4. Column **Rename** does not update `display` or `indexes`, so the save is refused if either names the column (`Data:1877-1900`).
5. No UI for unique, indexes, changing required/default, or type.
6. Checked rows survive paging and filtering, so Delete can remove rows that are not shown (`Data:170`).
7. The total count is not reloaded after add or delete (`Data:200`).
8. SDK `Filter` lacks `has`; the server's error list lacks it too.
9. A bad date default, or widening a column a policy names (Postgres refuses it), may give a 500. Check.
10. Filter errors show all rows.
11. Definition buttons are not gated by permission.
12. Script row events use the old path after a rename (`worker.ts:970`).

## F. Screenshots and examples
Grid with filters and the Values chips; inspector with a reference and a file; Add column for an enum; Values dialog with a rename; Who sees rows with two rules plus See it as; Retired columns. Examples: `loans` from `docs/sdk-guide.md:154`; an owner policy and a groups rule; a `contains`+`or` filter URL; a widen and a refused change; `find`, `aggregate` and `as` in one script; a curl CSV export. Existing shot: `packages/docs/assets/screenshots/console/table-help.png`.
