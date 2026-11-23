# Fact-check record: console/explanation/how-tables-work

Code as of commit `be324f78` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also done on the throwaway instance (`docs/documentation/runs/start/tutorials/your-first-table.md`, section "Extra probes"). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A table is a resource of a workspace; rows live in a Postgres table of their own, and the Definition tab says where and that you can read it directly | `Data.tsx:3068-3077` (**Where it is stored**), `apps/control-plane/src/kernel/kinds.ts:232-248` (kind `table`) | writer, run | holds |
| `id`, `created_at`, `updated_at` exist on every table; a definition cannot declare them | `Data.tsx:2836-2837`; `packages/manifest/src/kinds.ts:1056` | writer | holds |
| Managed in: Console or Repository; list column and header sentence | `Data.tsx:1654,1844` | writer, run | holds |
| Console tables are made with `ownership: "ui"` | `Data.tsx:1743-1746` | writer | holds |
| A repository table's Definition tab shows the notice quoted | `Data.tsx:2693-2697` | writer | holds |
| A resource is code-managed or UI-managed, never both | `apps/control-plane/src/kernel/resources.ts:127-130` | writer | holds |
| Adding a column or a rule applies at once | run (rows added after, "Live"); `Data.tsx:3193-3252` | writer, run | holds |
| The plan has no step that drops: "Nothing is ever dropped. What the definition no longer has is retired." | `apps/control-plane/src/kernel/data/plan.ts:150-156`, ops list `:72` onward; list description `Data.tsx:1625` | writer | holds |
| A deploy removes resources the bundle no longer has, only those owned by code (or carried); removing a table retires it | `apps/control-plane/src/kernel/execution/deploy.ts:350-353,394-402`; `kinds.ts:243-247`; `apply.ts:1129-1166` | writer | holds |
| A retired table keeps its rows; the keys of its references are dropped while it is away and put back when it returns | `apply.ts:1129-1166` (comment at 1136-1137); plan restore `plan.ts:207-212,377` | writer | holds |
| A retired column keeps its values, stops being required or unique, default dropped, catalog keeps the default | `apply.ts:385-397` (comment at 392-393) | writer | holds |
| **Retire table** on the Definition tab; confirm text "Its rows are kept, and nothing can read or write them until it is brought back." | `Data.tsx:3079-3092` | writer, run | holds |
| Retire is refused while another table refers to it, naming each table and column | `apply.ts:1071-1093`; `apps/control-plane/src/routes/workspaces.ts:938-948` | writer | holds (not run) |
| Retiring from the console needs `resource:write` (it is `DELETE resources/<name>`) | `Data.tsx:3086` (`api.delete(.../resources/...)`); route access in `routes/workspaces.ts` | writer | holds |
| Retired table page: "Bring back" only for a console table; for a repository table "Deploying a definition with this name brings it back." | `Data.tsx:1851-1868` | writer, run (console) | holds |
| Bring back needs `resource:write`; saves the active columns with required, unique, default, references, onDelete, values, description, plus policy, display, indexes; retired columns stay retired | `Data.tsx:1925-1990` | writer, run (rows came back) | holds |
| **Delete for good** is on a retired table or column, needs `table:write`, asks you to type the name, is the one action that destroys data | `Data.tsx:1998-2035`; `routes/data.ts:593-600`; `apply.ts:1176-1179` | writer, run | holds |
| Delete for good is audited as `table.purged` | `routes/data.ts:625-633` (`action: "table.purged"` at 629) | writer | holds |
| Permission `table:write` is described "Delete retired columns and tables for good." | `packages/manifest/src/permissions.ts:357-365` | writer | holds |
| Column rules: **Required**, "No two rows alike", default; a required change on rows lacking a value is refused unless a value is given | `Data.tsx:2779`; `ColumnControls.tsx:249-285` (hint at 261) | writer, run (required on empty table) | holds |
| Row rules: three forms, labels "Everyone with access sees every row", "Each person sees their own rows", "Rules decide" | `RowRules.tsx:112-117` | writer, run (Definition tab shows them) | holds |
| Creating with "Each person sees only the rows they added" adds `owner_id` | `Data.tsx:1707-1712,1742,1750` | writer | holds |
| Rules allow read or read and change by the person's ID, a group, or an attribute (and everyone) | `packages/manifest/src/table.ts:60-78` | writer | holds |
| At most 20 rules | `packages/manifest/src/table.ts:80` | writer | holds |
| `data_all` reads every row whatever the row rule says | `packages/manifest/src/permissions.ts:392-400` | writer | holds |
| Built-in `viewer` holds `*:read`, `developer` holds `*:read` too | `apps/console/src/builtinRoles.ts:19-20,49` | writer | holds |
| Row rules are saved with **Save who sees rows**, not as you type, and are not in Undo | `RowRules.tsx` (button); inventory `tables.md` B (row-rules, Undo) | writer | holds (button run, Undo claim from the inventory only) |
| A file is at most 25 MB | `apps/control-plane/src/kernel/data/files.ts:21` | writer | holds |
| A file a row names cannot be deleted; Files screen text | `apps/console/src/screens/Files.tsx:180`; `apps/control-plane/src/routes/sources.ts:715-723` | writer | holds |
| A file a row stops naming (replaced, removed, row deleted) is noted in `row_file_history`; a table deleted for good notes its files too | `kernel/data/files.ts:478-512`; `routes/data.ts:619-628` | writer | holds |
| The notes and the files go after the audit log's period, 400 days by default, a tenant's retention may change it | `apps/control-plane/src/kernel/retention.ts:229-290`; `config.ts:141,323`; `routes/identity.ts:313-314` | writer | holds |
| A file a row still names is kept by that clean-up | `retention.ts:276-277` (comment), `:278-279` (the named files are left) | writer | holds |
| No console screen lists a row's earlier files or puts one back | searched: `row_file_history` is read only in `kernel/data/files.ts`, `kernel/retention.ts`, `kernel/tenancy/tables.ts`; no route or console file | writer | holds |
| Row edits are not written to the audit log; "Rows are business data, not configuration" | `routes/data.ts:931` (insert comment), `:988` (PATCH description), `:1146` (DELETE description) | writer | holds |
| Each row change announces a `platform/row-changed` event | `routes/data.ts:988,1146` | writer | holds |
| Definition changes and retirements are in the audit log (`resource.updated`, `resource.deleted`, `table.purged`) | run: audit list of the tenant showed them; `routes/data.ts:625` | writer, run | holds |

The API text for PATCH row and DELETE row now says "Not written to the audit log" (`routes/data.ts:988,1146`), so the inventory's open item about "Audited." no longer applies.
