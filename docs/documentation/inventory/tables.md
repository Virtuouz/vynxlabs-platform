# Inventory: tables

**Refreshed 2026-11-23** (branch `phase-30-docs-system`, after phase 29). First written at `270e509` on 2026-11-22, before the correction phase. Every line below was checked against the code as it is now; line numbers are the current ones. Changes in this refresh:

- Every `Data.tsx` line number moved (the file grew from about 2,700 to 3,707 lines).
- Built in phase 29 and now described: column rules (required, unique, default), Change type and Change table, Indexes, a fuller Create table, Bring back for a table made in the console, See it as a group, richer filters (`!x`, `a | b`, `10..20`, `!empty`, `!~x`), match every/any filter, sort by several columns, cell controls for list, reference, date and time cells, the Files screen, permission-gated buttons, time zones (D21), files tied to rows (D22), D27 and D28.
- Section E is now a settled list (what each old item became), plus what is still open.
- Not verified: nothing was run. I ran no browser walk, test or instance. Whether the owner's walk found anything after the lanes' own is not known to me. `retention` default of 400 days is taken from the existing page, not re-read.

Short names: `Data` = `apps/console/src/screens/Data.tsx`, `Rules` = `.../RowRules.tsx`, `Cols` = `.../ColumnControls.tsx`, `GF` = `.../gridFilter.ts`, `Files` = `.../Files.tsx`, `Views` = `apps/console/src/kit/views.tsx`, `rd` = `apps/control-plane/src/routes/data.ts`, `rs` = `.../routes/sources.ts`, `kd` = `apps/control-plane/src/kernel/data`, `T` = `packages/manifest/src/table.ts`, `K` = `packages/manifest/src/kinds.ts`, `Grid` = `packages/ui/src/Grid.tsx`. Write-ups of what phase 29 did: `fixed/tab.md`, `fixed/tab2.md`, `fixed/t3-tables.md`, `fixed/files.md`, `fixed/t3-data.md`, `fixed/t4-data.md`, `fixed/t2-walk-data.md`, `fixed/fix-gating.md`, `fixed/gate-roles.md`, `fixed/sweep-server.md`, `fixed/sweep-cols.md`, `fixed/fix-databuild.md`; owner decisions D21, D22, D27, D28 in `decisions.md`.

Vocabulary to hold to: Flow, Deploy (a development workspace) and Versions (production), canceled, American spelling (color). The console says "Tables", "Rows", "Definition", "Retire", "Bring back", "Delete for good", "Who sees rows".

## A. Pages

Only the topic `data-tables` exists as a help topic. F1 opens it from the list, a table, and the Files screen (`nav.ts:140,145`; `apps/console/src/help/Help.test.tsx:94-95`). A topic of its own for Files is for phase 31 (`nav.ts:144` says so); the Files page below should get one (`data-files`). Paths are under `packages/docs/content` and are proposals: phase 30 may move them.

| Page (path) | Collection | Type | Purpose | Sources |
|---|---|---|---|---|
| `data/tables.md` (existing, `data-tables`) | Console | explanation (hub) | What a table is; list, create, where tables are managed, how a table's parts fit | `Data:1520-1660`, `1705-1823` |
| `data/table-rows.md` | Console | how-to | Browse, filter, sort, edit, add, delete, export, save a view | `Data:207-718`, `Grid:466-570`, `GF`, `Views` |
| `data/table-definition.md` | Console | how-to | Add and change columns, rules, type, values, indexes, display, undo; retire | `Data:2333-3182`, `Cols` |
| `data/column-types.md` | Console | reference | The 12 column types: label, storage, filter, edit, limits | `K:1056-1250`, `kd/apply.ts:21-35` |
| `data/row-rules.md` | Console | how-to plus reference | Who sees rows; See it as a person or a group | `Rules`, `T:60-95`, `kd/apply.ts:632-740` |
| `data/retired-data.md` | Console | how-to | Retire, bring back, Delete for good (table and column) | `Data:1747-1770,1830-1928,2735-2800` |
| `data/files.md` | Console | how-to | Files screen; file columns; what keeps a file; retention | `Files`, `rs:538-740`, `kd/files.ts` |
| `data/table-tutorial.md` | Get started | tutorial | Make a table, add rows, filter, save a view (Fernhill) | worked example; see `tutorials-and-style.md` |
| `build/defining-tables.md` | Develop | how-to plus reference | `defineTable`, `<path>.table.yaml`, change rules, rename and retire | `packages/sdk/src/index.ts:1030-1090`, `kd/plan.ts` |
| `build/rows-in-scripts.md` | Develop | how-to | `ctx.table`, `ctx.source`, `ctx.files`, `as()`, events | `packages/sdk/src/context.ts:54-68`, `packages/sdk/src/tables.ts`, `routes/worker.ts:890-1010` |
| `build/rows-api.md` | Develop | reference | REST rows, totals, export, row deletions, errors | `rd:388-1169` |
| `data/why-tables-keep-data.md` | Console | explanation | Why nothing a deploy removes is dropped; D22 files rules; rows are not audited | `kd/plan.ts`, `kd/apply.ts`, decisions D22, D27, D28 |
| `data/data-sources.md` | Console | how-to | Data health covers only external sources (`kd/health.ts`), so it belongs here, not in tables | not this inventory |
| `instance/databases.md` (existing stub) | Self-host | how-to | Dedicated databases: `dataLocation` is set when a tenant is made | `routes/locations.ts` |

Keep one row per field in the generated reference (`packages/docs/generated/kinds/table.md`) and link to it; do not copy it. Say plainly what is not there: **no column masks, no computed columns, no row validation rules, no row history screen, no CSV import** (the API takes 1,000 rows at a time; the console only exports; CSV import is "later", `decisions.md` preamble). `generated/…/import` is tenant import. Not there either: "not containing" for non-text columns (`!~x` is text only), a visual join control is a widget matter, not a table one.

## B. Per page

### data/tables.md (`Data:1520-1660`, `1705-1823`)
- List (`Tables`): description "The data this workspace keeps. A table defined in the repository changes when a bundle is deployed. Nothing is ever dropped by a deploy: what leaves a definition is retired and its data kept." Columns: Table (with a "retired" pill that stays whole while the name gives way), What it holds, Managed in (Repository or Console; retired tables say it too, since sweep-cols), Who sees rows, Columns, Rows. Empty state "No tables yet" with the text about `defineTable`.
- **Create table** (needs `resource:write`; the button is greyed with the reason, `Data:1524`, gate-roles row 2). Fields: Name ("Lowercase letters, digits and dashes."), What it holds (optional, 500 characters), First column, It holds (all 12 types), Which table (for a row of another table), Values (comma-separated, for the two list types), More columns (each with its type, values or table, and Remove), Who sees rows ("Everyone who may use the table sees every row" or "Each person sees only the rows they added", which also adds an `owner_id` uuid column and an owner policy). A name already in use is refused on the dialog with `Something is already at "<name>". Choose another name, or change what is there.` (`Data:1643-1654`, TAB-05). A duplicate or empty column name, and a reference with no table, are said in the dialog and nothing is sent.
- Type labels (`Data:73-85`): Text, Whole number, Number, Yes or no, Date and time, Date, JSON, ID, Row of another table, File, One of a list, Several of a list.
- Table page header: description, row count, the policy sentence, "Managed in the repository/console" (a retired table says "Was managed in the ..."). Attached documentation pages show through `AttachedPages` (`Data:1746`); a column's description is shown on its heading and wherever a documentation page names the column (`K:1075-1080`).
- Tabs **Rows** and **Definition** (`?view=`; they sit in the toolbar of Rows). A retired table has no tabs: it shows a notice with **Bring back** (console tables only) and **Delete for good** (`Data:1747-1770`).
- System columns: `id`, `created_at`, `updated_at` (`K:1056`, `Data:1699`). A definition cannot declare them.
- Permissions (`packages/manifest/src/permissions.ts:354-420`, labels from the code): `table:read` ("See tables and their columns."), `table:write` ("Delete retired columns and tables for good."), `data:read`/`data:write` ("Rows", held to each table's row policy), `data_all:read`/`data_all:write` ("Rows past the row policy"), `file:read`/`file:write`. Saving a definition, creating a table, retiring and bringing back need `resource:write` (`PUT/DELETE resources/*`), not `table:write`. `data:*` can be granted on one table (`Data:1791-1796`).
- Built-in roles as the console knows them (`apps/console/src/builtinRoles.ts`, held to the database by `builtin-roles.test.ts`): `workspace_admin` holds `data:*`, `data_all:*`, `table:*`, `file:*`; `developer` holds `*:read` plus `data:write`, `data_all:write`, `file:write`, `resource:write` (not `table:write`); `viewer` holds `*:read`; `app_maintainer` and `doc_writer` hold `table:read` (the first also `data:*` read and write); `portal_reader` `data:read`; `portal_user` `data:read` and `data:write`.
- Buttons follow what the person holds: Add row is greyed with the reason when `data:write` on the table is missing (`Data:1791-1796`), the Definition editor is off with a line unless `resource:write` (`Data:2345-2350,2593`), batch and in-place edits follow the same answer (`fixed/fix-gating.md`, TAB-35).

### data/table-rows.md (`Data:207-718`)
- Toolbar, left to right: the Rows/Definition tabs; **Keys** popover (not shown for a read-only source); **Columns** dialog; **Compact rows / Standard rows**; "Rows must match: every filter / any filter" (appears only with two or more boxes in use, `Data:466-478`, address `match=any`); the saved-views bookmark menu; **CSV**; **Add row**. A keyless source table shows a read-only note instead of Keys.
- **Columns** dialog (`Views:202-330`): checkbox show/hide, drag handle, Move up and Move down arrows ("drag it, or press the up and down arrows"), "Lock the first column" (it stays in view when scrolled sideways), **Show every column**, **Done**.
- Saved views (`Views:40-165`; only for a workspace table, `Data:3694-3707`): "Save this view…", `Save over “X”`, `Rename “X”…`, `Delete “X”`, "Copy a link to this view". Views are private to the member; the link works for anyone. They belong to the table's ID, so a renamed table keeps them (TAB-38); views saved under the old name-based list name are not found.
- URL state (`Data:189-203`): `sort`, `filter`, `page`, `cols`, `hide` (older links, read only), `match`, `unlock`, `density`, `row`. A link to a row works only if the row is on the page shown (open, TAB-34).
- Sort: a click on a heading goes ascending, descending, none; **Shift with a click or Enter adds a column**, turns it, and takes it off; a number beside each arrow shows the order (`Data:171-186`, `Grid`). Not for json or a list of values (`Data:352`). A list of values sorts by spelling, not by the order it is offered (`K:1100`).
- Filter language (`GF:1-75`, and the Keys popover `Data:409-435`), one box a column, 300 ms after typing stops (`kit/addressBox.ts:17`):
  - text: contains (case-insensitive); other types: equals; an enum equals a value; a list has a value;
  - `> >= < <=` then a value; a range `10..20`, `10..`, `..20` (numbers, dates and times, both ends included);
  - `!x` or `not x`: not exactly x (`ne`); `!~x` or `not containing x`: text that does not hold x (text only);
  - `a | b`: a or b (one `in` when all are equals, otherwise `or`);
  - `empty` or `null`: no value; `!empty`: any value.
  - Not for json. A box that cannot be read is named in a red notice (column and reason), shows `aria-invalid`, and nothing is asked: no rows, and the CSV button is disabled (`Data:281-299,506-512`, TAB-13, TAB-20).
- Footer: "N rows on this page, of N that match"; Previous/Next; 50 a page (`Data:71`). Empty states: "This table has no rows yet." and "No rows match the filters."
- **Keys** (`Grid:466-570`): arrows; Home/End, Ctrl+Home/End (whole grid); PageUp/PageDown ten rows; Enter or F2 edits a cell, and on a heading sorts (with Shift, adds); on a cell that cannot be edited Enter opens the row; Space checks a row; Escape cancels. Double-click edits. A yes/no cell toggles with Enter, F2 or double-click, and where it may be empty goes yes, no, empty (`Grid:318-325`).
- Editing in place: a choice is a select; a list, a row of another table, a date and a moment open a small dialog with the inspector's own field (`Data:742-870`, TAB-31, TAB-P11). A file, `id`, `created_at`, `updated_at` are not edited in the grid. Escape puts the cell back.
- Checkboxes: batch bar "N rows checked", **Delete** (confirm "Delete these N rows?"), **Uncheck all**. Result text "N rows deleted." plus "N were gone already, or were not yours to delete." What is checked belongs to the page, sort and filter it was checked on, so a delete cannot take rows that are not shown (`Data:249-257`, TAB-10). The heading box is checked when every shown row is. Bulk delete takes at most 1,000 ids (`rd:1097-1102`).
- Column ⓘ shows the column's description. Glossary terms are underlined.
- Inspector "Row" (`Data:633-668`, `1113-1300`): fields as the type has them; **Save row**, **Discard**, **Delete row** (confirm), guard "Leave without saving?" (Leave/Stay). Reference picker: 50 offered, "Type to find more", search sent 250 ms after typing stops, text columns searched by contains, number or yes/no columns by equals, a column that cannot be searched offers nothing, and a table that cannot be read takes the ID typed (`Data:898-1030`, TAB-21). File field: Replace and Remove, each asks first (`Data:1029-1110`).
- **Add row** sheet (`Data:1302-1500`): "Required values first. A value left empty is stored as none, or the column's default."; groups "Required" and "Optional"; a file is uploaded when the row is saved.
- Times (D21, TAB-28): the grid, the inspector and Add row show and read the reader's own clock; hover or title gives the UTC instant (`Grid:150-215`). The API, in contrast, takes a time only as ISO 8601 with a zone, and a day only if it exists.
- A table that is slow to read: "too_slow" stops it with "An index on the columns you filter and sort by makes this faster. Add an index", a link to the Definition's Indexes (only for a table made in the console, `Data:518-528,1788-1790`, TAB-P4).

### data/table-definition.md (`Data:2333-3182`, `Cols`)
- Available only for a table made in the console and only with `resource:write`; a table from the repository shows "This table is defined in the tenant's repository. To change it, change `defineTable` there and deploy." (`Data:2587-2592`).
- Top: **Rename table** (saves a draft of the resource; the old path keeps answering for 90 days, `ResourceIdentity.tsx:94-100,164`), **Describe the table** (500 characters), Undo/Redo (Mod+Z; Shift+Mod+Z or Ctrl+Y; not while typing in a field). Undo and redo are for the definition, not for row rules' own text. Someone else's change since you opened the page: "Someone else changed {table} after you opened it. This page shows what is saved now, so undo and redo start again from there." (`Data:2413`, TAB-12).
- Columns table: Column (with its description), Holds, Rules ("Required", "No two rows alike"), When not given. Row actions: **Values** (list types) or **On delete** (references), **Rules**, **Change type** (or **Change table** for a reference), **Describe**, **Rename**, **Retire** (disabled on the last column). On a phone one menu holds them (`Data:2490-2583,2687-2726`).
- **Rules** dialog "Rules for X" (`Cols:249-285`): "Must every row have one?" (rows that have none now are given the value below; without one the change is refused), "Must every row's value be different?" ("Yes: no two rows alike"; refusal names up to three repeated values and how many rows hold each), "Value when none is given" in a control that fits the type (select for yes/no and a list, multi-select for a list of values, date field for a day and a moment). Saved together.
- **Change type** dialog (`Cols:292-440`): "It holds" offers only what keeps every value: the type itself, `COLUMN_WIDENINGS` (`T:37-46`: whole number to number or text; number, yes/no, ID, date, date and time and one-of-a-list to text) and text to one-of-a-list (allowed only when every row already holds one of the values you give). Hint "Only changes that keep every value are offered. For any other, add a new column and copy the values across in a script." For a reference the dialog is "Which table X points to".
- **Add column**: Name, It holds, Which table, "When the row it points to is deleted" (Refuse the deletion / Empty this column / Delete this row too), Values, "Must every row have one?", "Must every row's value be different?" (not for json, file, a list of values), "Value when none is given" (not for a reference or file). Done message "The column X was added." A name already taken is refused on the field (`Data:3082-3182`, TAB-06).
- **Values** dialog "Values of X" (`Data:2019-2200`): Value, Shown as, Color (None, the 9 names, "One of your own" as `#rrggbb`), move, Remove, **Add a value**, a live "Rows that hold X will hold Y" for a renamed value, and a notice naming values no longer offered ("will no longer be offered. Rows that hold ..."). Rows that still hold a retired value keep it and the Columns table says "No longer offered, kept on the rows that hold them".
- **Retired columns** table: Column, Held, Still holds ("N values"), **Bring back** and **Delete for good**. Bring back from here writes the column with its type, table and every value its rows may hold; required, unique, the default and the reference rule are not restored (`Data:2764-2782`).
- **What stands for a row**: a select "None: the row's ID" or a column (not json, file or a list of values). If none is set, the server uses `name`, else `title`, else the first text column (`T:displayGuess`); that is what the grid, the picker, CSV's `expanded` and the rows API use. Column order is alphabetical, not as defined, when columns were created in one deploy (open, TAB-30), so "first text column" goes by that order.
- **Indexes** (`Data:2840-2918`, `Cols:450-500`): list of "Columns, in order" with **Remove**; **Add an index** (up to 5 columns in the order chosen, `created_at`, `updated_at` and `id` included; at most 20, said when full); "No indexes. Only the ID is indexed." `?view=definition&at=indexes` scrolls to the heading. Renaming or retiring a column that an index, the display or a rule names carries the change along; a column a rule needs cannot be retired and the message says which rule (`moveColumn`, TAB-19).
- **Who sees rows**: see data/row-rules.md. **Where it is stored** shows `schema.table` ("It is your data: you can read it there directly at any time"). **Retire this table**: "Its rows are kept, and nothing can read or write them until it is brought back." Refused while another table refers to it, naming each table and column (D27; `kd/apply.ts:1071`, TAB-14).

### data/column-types.md (`K:1056-1250`, `kd/apply.ts:21-35`, `kd/rows.ts:365-440`)
- Postgres: text to text, integer to bigint (safe integers only), number to double precision, boolean, timestamp to timestamptz (an ISO 8601 time with a zone, stored in UTC), date to date (a day that exists), json to jsonb, uuid, reference and file to uuid, enum to text with a check, enum_list to text[] with a check. No NUL character in text or json; years 0001 to 9999.
- Limits: names `^[a-z][a-z0-9_]*$`, 55 characters; 1 to 200 columns; 1 to 200 values of 1 to 100 characters, with no commas or newlines; labels 100 characters; 9 named colors or `#rrggbb`; descriptions 500 characters; at most 20 indexes of 1 to 5 columns; at most 20 rules.
- Defaults: none on reference or file (`T:defaultFits`); a default must fit the type (a real day, an ISO time, an ID). Unique not on json, file or a list of values.
- A source's whole numbers over 2^53 are shown as the database's text, not as another number (TAB-32).

### data/row-rules.md (`Rules`, `T:60-95`, `kd/apply.ts:632-740`)
- Policies: open; owner (one uuid or text column); rules (1 to 20). The screen's three modes (`Rules:112-117`): "Everyone with access sees every row", "Each person sees their own rows", "Rules decide". The list and header sentences are "Everyone with access", "Each person sees their own rows (column)", "By N rules" (`Rules:33-40`).
- Who (`Rules:156-162`): Everyone with access; The person named in a column; A group named in a column; People with a matching attribute. May: Read, Read and change. Buttons: **Add a rule**, Remove (per rule), **Save who sees rows**. Row rules are saved by that button, not as you type, and are not in Undo.
- Column types: uuid or text; attribute rules also integer. Attribute name `^[a-z][a-z0-9_]{0,62}$`. A group is named in a uuid column by its ID or in a text column by its key (older rows by its name).
- A read needs any matching rule; a change needs a `write` or `all` rule. People who hold `data_all` see every row. A row inserted with no owner is given to whoever adds it: the owner column, or the first `is: principal` rule that allows writing (`kd/rows.ts:1090-1100`). An explicit empty owner is refused (403). A visitor who is nobody sees no row whose owner is empty (TAB-01, `kd/apply.ts:632`).
- Enforced in Postgres through a signed claim. Groups and attributes are read on every request.
- **See it as** (`Rules:290-438`; shown only when the policy is not open): "See it as" (an end user, searched by email on the server, so one past the first page is found; hint shows their groups) and **"See it as a group"** (groups of end users and groups of members, each with a hint; "Someone in this group who owns no row, by what is saved now"). Choosing one lets go of the other. Lists the first 20 rows, and for a group says "Someone in this group would see N rows in all." API: `as`, `asGroup` on rows and totals; both need `data_all:read` on the table. The console reads end users with `end_user:read` and groups with `group:read`, and says when it cannot ("The groups could not be read. Asking for access to read groups lets you check one here."). Open: a reference shows its ID in this list (TAB-40).

### data/retired-data.md
- A table or column that leaves its definition is retired; its data is kept. Retire from the console, or a deploy that no longer lists it. A retired table's rows still exist but cannot be read or written, and its references' keys are dropped and put back when it returns (`kd/apply.ts`, TAB-08).
- **Bring back** a table: only a table that was managed in the console (`Data:1752`). It saves the definition the catalog holds (columns, rules, defaults, references, values, who sees rows, display, indexes). What the catalog does not hold, the table's own description, comes back empty; retired columns stay retired (`Data:1830-1893`, TAB-P6). A repository table says "Deploying a definition with this name brings it back." A reference column whose rows hold IDs no longer in the table is refused, naming column, table and number of rows (`kd/apply.ts:862`, TAB-23).
- **Delete for good** (type the name; audited as `table.purged`, `rd:629`): needs `table:write`. Refused while a foreign key points at the table ("Another table still refers to…"). The retired page and column list offer it to anyone who can see them; a person without `table:write` is refused by the server (open, TAB-35's second half: `Data:1755,2787` carry no permission check).
- Two retired tables or columns of one name are told apart by ID (`?id=`, `columnId`, `tableId`); the list links the one it shows (`Data:1534`).
- Retired enum values stay on rows, can be filtered for (`has` finds a retired list value) and are not offered; saving a row that holds one keeps it.
- Retention does not remove retired data.

### data/files.md (`Files`, `rs:538-740`, `kd/files.ts`)
- **Files screen** (Data > Files; `nav.ts:145`): header "Files stored in this workspace: those put in a table's file column, those a script saved, and those uploaded here. A file that a row names cannot be deleted: change the row first." Search "Find a file by name", table Name (download link), Type, Size, Uploaded, Named by (which table and column, and how many rows; "No row" if none), **Delete** (confirm "The file is gone for good. Nothing that names it is left: no row holds it."), **Upload file**. Empty states "No files yet" and "No file has that in its name". Upload error text names a file over 25 MB or empty. Needs `file:write` to upload; Delete needs also `data_all:write`.
- API: `GET files` lists newest first, `limit` 1 to 200 (default 50), `cursor`, `search`, answers `nextCursor` and `namedBy: [{table, column, rows}]` for each file; needs `file:read` and `data_all:read`. A person with only `file:read` gets a file by ID through a row they may read or because they uploaded it, otherwise 404 (D22, DAT-05). `DELETE files/:id` is refused with 409 while any row of any workspace table, retired columns and dedicated databases included, names it.
- 25 MB; name 255 characters; download is always an attachment (`rs:692`, `kd/files.ts:21`). A file ID given to a row must be one the caller may already read (400 otherwise).
- Replaced files, files of deleted rows, and files of rows removed by a reference's `cascade` or by Delete for good are kept in `row_file_history` for the audit log's period (400 days unless retention says otherwise) and then removed with it (`kernel/retention.ts:229-285`, D22, TAB-09). Retention skips any file a row still names. Audit: `file.uploaded`, `file.deleted`.
- Deleting a row does not delete its file at once; see the line above.
- There is no screen to see a row's history or put a file back (Q5 chose "say nothing of history").

### build/defining-tables.md (`packages/sdk/src/index.ts:1030-1090`, `kd/plan.ts`; YAML `<path>.table.yaml`)
- `defineTable({ columns, policy, indexes, display, renamedFrom })`; `indexes` may name `id`, `created_at`, `updated_at` (`index.ts:1046`). Columns by `column.text()` and so on (`packages/sdk/src/tables.ts:174`); a `reference` comment sits on `reference`.
- Safe: add column; retire; rename with `renamedFrom`; widen (`COLUMN_WIDENINGS`, `T:37-46`); change default, policy, display, indexes or onDelete; enum values and value `renamedFrom`.
- Conditional: required (needs a default or no nulls); unique (no duplicates; the refusal names repeated values); text to enum (every row must fit; lists up to 5 strays). Refused: any other type change ("Add a new column and copy the values across in a script", `kd/plan.ts:320`).
- Going back to an older definition renames columns back and restores retired ones, if the type matches. Applied in one transaction. A dedicated database commits just before the platform.
- A table saved alone that refers to a table the workspace lacks is 400; a bundle that drops both is fine; deleting a table that others refer to is refused and names them (D27). `PUT resources/*` takes `create: true` (409 `path_taken`) and `version` (409 `draft_changed`).
- Rows changed by a reference's `onDelete` rule are not announced as events (D28; said in the `onDelete` description `K:1075` and the SDK `ReferenceOptions` comment).
- A table's old address answers with `volvel-resource-moved` and `deprecation` headers after a rename (`rd`, TAB-25).
- Deploy report lines: `describeChanges` (`kd/plan.ts:390`).
- Env: `DATA_STATEMENT_TIMEOUT_MS` default 15000 (1,000 to 600,000), `DATA_POOL_SIZE` default 10 (2 to 500), `DATA_TENANT_CONNECTIONS` (default a third of the pool, at least 2) (`apps/control-plane/src/config.ts:347-349`, `config-vars.ts:69-79`; the generated settings reference carries these, link to it).

### build/rows-in-scripts.md (`packages/sdk/src/context.ts:54-68`, `packages/sdk/src/tables.ts:23-85`, `routes/worker.ts:890-1010`)
- `ctx.table(orders)` (or a path) gives a client with `find` (limit default 50, max 1,000; `offset`; `sort`), `get` (null if missing), `insert`, `insertMany` (1 to 1,000 rows, all or nothing), `update`, `delete`, `aggregate`, `as(principalId)`. `ctx.source(path).table(name)` gives the same for a data source's table. `ctx.files.put/get`. Without `as` the script sees every row; with `as` a file named by a row must be one that person may read. Declare `tables:` / `sources:`.
- Filter (`tables.ts:2-20`): `eq ne gt gte lt lte in has contains not_contains is_null`, and `and`/`or`.
- Aggregate: 3 groups, 5 measures, 5 s limit, buckets day/week/month/year at midnight UTC (`kd/rows.ts:756-773`).
- Event `platform/row-changed` `{table, change, id}` with `change` one of `inserted`, `updated`, `deleted`, one event a row; only insert, update and delete from scripts announce, an aggregate does not (`rd:205-245`, TAB-26).

### build/rows-api.md (`rd`)
- Routes under `/api/v1/tenants/:t/workspaces/:w`: `tables`, `tables/*` (`?id=` for one of two retired tables; answers `indexes`), `rows/*` (GET list, POST one or `{ "rows": [...] }`, a single row sent as itself; a row whose only column is `rows` is sent as `{ rows: [row] }`), `row/:id/*` (GET, PATCH, DELETE), `rows-export/*`, `row-deletions/*`, `aggregate/*`, `column-values`, `column-counts`, `table-purges`.
- Filter operators: `eq ne gt gte lt lte in` (1 to 200 values), `contains` and `not_contains` (text), `has` (list of values, any text), `is_null` (value false for not empty); `and`/`or`; at most 50 conditions (`kd/rows.ts:505-602`). `limit` 1 to 1,000, default 50; opaque `cursor`; `sort=a,-b`; `expand` at most 5 reference columns; `as`, `asGroup` (need `data_all:read`).
- CSV (`rd:134-155,1013-1075`): at most 100,000 rows then a last line "There were more than 100000 rows..."; text a spreadsheet would run as a formula (starts with `= + - @`, tab or return) gets a leading `'`; lists joined with `;`; a CSV holds IDs for references. A refused export (bad `sort`) answers 400 before the file starts (TAB-22). Guests 120 a minute (`kernel/http.ts:87`).
- Errors: 400 with field paths, 403 policy, 404 (also rows hidden by policy, and a malformed key), 409 unique/reference/`path_taken`/`draft_changed`, 422 `too_slow`, 503 `data_location_unavailable`.
- Times: ISO 8601 with a zone (`2026-06-01T09:00:00Z`); a bare day for a time column is refused by the API (the console and page actions turn it into midnight UTC where the page says so).
- Row edits are not written to the audit log (`rd:928`). The PATCH and DELETE route descriptions still say "Audited." (`rd:985,1143`): see E.

### instance/databases.md
A tenant's `dataLocation` is set only when it is made; `routes/locations.ts`; the catalog lives with the data (`kd/stores.ts`). A location that cannot be reached answers 503 `data_location_unavailable` (`kd/stores.ts:66-70`).

## C. Gotchas (all re-checked)
- Built-in `developer` and `viewer` read every row, past the policy (`*:read` includes `data_all:read`). Settled as phase 4's decision (TAB-42).
- `ne` and comparisons skip empty values (SQL nulls); you cannot filter for the literal text "empty" (`empty` means no value). Settled: document it.
- A set choice, list, reference or day/time cell is changed in the grid by its control (select or small dialog), by Enter, F2 or double-click; an empty one used to open a text box for a raw value and no longer does (TAB-31). File and key cells are not editable in the grid.
- Times: shown, typed and filtered in the reader's zone, UTC on hover (D21). The API still wants ISO 8601 with a zone.
- A reference filter needs the whole ID (the grid box takes an ID; the picker is for editing, not filtering). Open (TAB-36 half).
- Retiring a column drops its database default; the console's Bring back restores none of required, unique or default (`Data:2764-2782`); a deploy that lists the column restores from the catalog (TAB-29).
- Row edits are not in the audit log; API text disagrees (see E).
- Rename table saves a **draft**; other definition changes apply at once and are one step of Undo.
- The grid count and CSV follow the filters, not the checked rows.
- The grid total is current after every write (TAB-42).
- Rows removed or emptied by a reference's rule are not announced (D28).
- The Files screen borrows the `data-tables` help topic.

## D. Existing docs (`packages/docs/content/data/tables.md`)
- Says "the table saves as you work" and that **Undo** and **Redo** cover "its row rules". Wrong for rules: row rules need **Save who sees rows** and are not in Undo (`fixed/tab2.md` lines for docs).
- "stays in the row's history", "Replace and Remove ... stays in the row's history" implies a history screen. There is none; say "kept until the audit log's period ends" (Q5).
- "A reference cell ... Exports and the rows API's `expanded` use the same rule": a CSV holds IDs, not names (`rd:134-155`); only `expanded` and the grid and picker use the display rule.
- "Renaming moves its address, and the old one leads to the new one for a while": the console says 90 days (`ResourceIdentity.tsx:164`).
- Missing: everything in B except scrolling, the picker, references and files. No page for filters, saved views, column rules, Change type, indexes, See it as a group, bring back, the Files screen, or time zones.
- `data/index.md` lists `tables` first; add the new pages there.
- Comments that were wrong are fixed: `K` values "offered in their order, sorted by spelling" (`K:1100`, generated `table.md:22`), the SDK `reference` comment, the group **key** in `T:RowCondition` (TAB-41).
- Docs voice rules and vocabulary: `tutorials-and-style.md`.

## E. Findings, settled

Old list (written 2026-11-22) and what each became. "Fixed" cites the write-up; code lines are current.

1. Paging by `created_at`/`updated_at` repeating or skipping rows: **fixed**, TAB-03 (`fixed/tab.md`; `kd/rows.ts` `compareTime`, cursor carries the sorted time as written). CSV and `find` use the same function.
2. Sorting by an enum column ending on a retired value: **fixed**, TAB-17 (`fixed/tab2.md`).
3. Create table offering lists with no Values field: **fixed**, TAB-18 (`VALUES_FIELD`, `Data:92-99`).
4. Column Rename not updating `display` or `indexes`: **fixed**, TAB-19 (`moveColumn`).
5. No UI for unique, indexes, required/default, type: **built**, TAB-P1 to P4 (`fixed/t3-tables.md`): column Rules, Change type, Indexes.
6. Checked rows surviving paging: **fixed**, TAB-10 (`Data:249-257`).
7. Total not reloaded: **not a bug**, TAB-42.
8. SDK `Filter` lacking `has`: **fixed**, TAB-24; also `not_contains` (`sweep-server.md`).
9. 500 for a bad date default or a widening a policy names: **fixed**, TAB-15, TAB-16.
10. Filter errors showing all rows: **fixed**, TAB-13, TAB-20.
11. Definition buttons not gated: **fixed**, TAB-35 (`fix-gating.md`, `gate-roles.md`); `Delete for good` and `Bring back` on a retired table still carry no check (see data/retired-data.md).
12. Script row events using the old path after a rename: **fixed** by SCR-04, TAB-26.

Also settled in phase 29, and so not to be written as bugs: TAB-01 (empty owner), TAB-02, TAB-04, TAB-05 (Create table replacing a table), TAB-06, TAB-07 (two retired columns), TAB-08, TAB-09, TAB-11, TAB-12, TAB-14 (D27), TAB-21, TAB-22, TAB-23, TAB-25, TAB-27 (D28), TAB-28 (D21), TAB-29, TAB-32, TAB-38, TAB-39, TAB-40 (partly: people searched; references still show IDs), TAB-41, and missing parts P1 to P11 (`fixed/t3-tables.md`, `fixed/t3-data.md`; P10 is the Files screen).

**Still open, as the code stands** (no lane's write-up names a fix, and the code is unchanged where I looked):
- TAB-30: columns come back alphabetically within one deploy (`kd/rows.ts:90`, `kd/apply.ts:54-55` order by `created_at, name`), so the grid, Add row, CSV and the definition show them in that order, and "first text column" follows it.
- TAB-33: a malformed id in `row-deletions` is a 404 for the whole call, not an entry in `missing` (`kd/rows.ts:988-995`); the "row with a json column named `rows`" note is on the route.
- TAB-34: Previous goes to page 1 after a reload (`Data:246-247,684-688`); `?row=` opens only a row on the page shown (`Data:317`).
- TAB-36: names of referenced rows come for the first five reference columns of all columns, not of those shown (`Data:292`).
- TAB-37: a failed Add row uploads its file again on the next try (`Data:1340-1348`); field errors from the server are now put under their fields.
- The retired table's description is not kept; the cell dialog leaves without motion; the app form's picker searches a number-named display column by `contains` where that fails (fixed for pickers by `widget-choices.ts`, `t2-walk-data.md`).
- API text says "Audited." for PATCH row and DELETE row (`rd:985,1143`) while `rd:928` says rows are not written to the audit log. Needs the owner's answer on which is meant, or a one-line fix to the descriptions before the API reference is written.
- `Delete for good` and `Bring back` on a retired table are offered without a permission check (`Data:1752-1760`).

## F. Screenshots and examples
Grid with filters, a range and `!x`, and the Values chips; Shift-click on two headings (numbers beside the arrows); inspector with a reference and a file; Add column for an enum; Rules and Change type dialogs; Values dialog with a rename; Indexes section; Who sees rows with two rules plus See it as a person and as a group; a retired table with Bring back; Retired columns; the Files screen with a file named by a row. Examples: `loans` from `docs/sdk-guide.md`; an owner policy and a groups rule; a `contains`+`or` filter URL (`?match=any`); a widen and a refused change; `find`, `aggregate` and `as` in one script; a curl CSV export. Existing shot: `packages/docs/assets/screenshots/console/table-help.png`. The Fernhill example (`examples/fernhill/setup/setup.mjs`) has tables to use.
