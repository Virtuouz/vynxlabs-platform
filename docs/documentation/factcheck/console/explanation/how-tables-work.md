# Fact-check record: console/explanation/how-tables-work

Code as of commit `be324f78` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also done on the throwaway instance (`docs/documentation/runs/start/tutorials/your-first-table.md`, section "Extra probes"). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A table is a resource of a workspace; rows live in a Postgres table of their own, and the Definition tab says where and that you can read it directly | `Data.tsx:3068-3077` (**Where it is stored**), `apps/control-plane/src/kernel/kinds.ts:232-248` (kind `table`) | writer, run; second agent, 2026-11-23 | holds |
| `id`, `created_at`, `updated_at` exist on every table; a definition cannot declare them | `Data.tsx:2836-2837`; `packages/manifest/src/kinds.ts:1056` | writer; second agent, 2026-11-23 | holds |
| Managed in: Console or Repository; list column and header sentence | `Data.tsx:1654,1844` | writer, run; second agent, 2026-11-23 | holds |
| Console tables are made with `ownership: "ui"` | `Data.tsx:1743-1746` | writer; second agent, 2026-11-23 | holds |
| A repository table's Definition tab shows the notice quoted | `Data.tsx:2693-2697` | writer; second agent, 2026-11-23 | holds |
| A resource is code-managed or UI-managed, never both | `apps/control-plane/src/kernel/resources.ts:127-130` | writer; second agent, 2026-11-23 | holds |
| Adding a column or a rule applies at once | run (rows added after, "Live"); `Data.tsx:3193-3252` | writer, run; second agent, 2026-11-23 | holds |
| The plan has no step that drops: "Nothing is ever dropped. What the definition no longer has is retired." | `apps/control-plane/src/kernel/data/plan.ts:150-156`, ops list `:72` onward; list description `Data.tsx:1625` | writer; second agent, 2026-11-23 | holds |
| A deploy removes resources the bundle no longer has, only those owned by code (or carried); removing a table retires it | `apps/control-plane/src/kernel/execution/deploy.ts:350-353,394-402`; `kinds.ts:243-247`; `apply.ts:1129-1166` | writer; second agent, 2026-11-23 | holds |
| A retired table keeps its rows; the keys of its references are dropped while it is away and put back when it returns | `apply.ts:1129-1166` (comment at 1136-1137); plan restore `plan.ts:207-212,377` | writer; second agent, 2026-11-23 | holds |
| A retired column keeps its values, stops being required or unique, default dropped from the database | `apply.ts:385-397`; run 2026-11-23: after Retire and Bring back in the console the column had no Required and no default | second agent, 2026-11-23 | corrected: the page also said the catalog keeps the default "to put back"; the console's Bring back does not restore it, so the sentence now says so and links the how-to |
| **Retire table** on the Definition tab; confirm text "Its rows are kept, and nothing can read or write them until it is brought back." | `Data.tsx:3079-3092` | writer, run; second agent, 2026-11-23 | holds |
| Retire is refused while another table refers to it, naming each table and column | `apply.ts:1071-1093`; `apps/control-plane/src/routes/workspaces.ts:938-948` | writer; second agent, 2026-11-23 | holds (not run) |
| Retiring from the console needs `resource:write` (it is `DELETE resources/<name>`) | `Data.tsx:3086` (`api.delete(.../resources/...)`); route access in `routes/workspaces.ts` | writer; second agent, 2026-11-23 | holds |
| Retired table page: "Bring back" only for a console table; for a repository table "Deploying a definition with this name brings it back." | `Data.tsx:1851-1868` | writer, run (console); second agent, 2026-11-23 | holds |
| Bring back needs `resource:write`; saves the active columns with required, unique, default, references, onDelete, values, description, plus policy, display, indexes; retired columns stay retired | `Data.tsx:1925-1990` | writer, run (rows came back); second agent, 2026-11-23 | holds |
| **Delete for good** is on a retired table or column, needs `table:write`, asks you to type the name, is the one action that destroys data | `Data.tsx:1998-2035`; `routes/data.ts:593-600`; `apply.ts:1176-1179` | writer, run; second agent, 2026-11-23 | holds |
| Delete for good is audited as `table.purged` | `routes/data.ts:625-633` (`action: "table.purged"` at 629) | writer; second agent, 2026-11-23 | holds |
| Permission `table:write` is described "Delete retired columns and tables for good." | `packages/manifest/src/permissions.ts:357-365` | writer; second agent, 2026-11-23 | holds |
| Column rules: **Required**, "No two rows alike", default; a required change on rows lacking a value is refused unless a value is given | `Data.tsx:2779`; `ColumnControls.tsx:249-285` (hint at 261) | writer, run (required on empty table); second agent, 2026-11-23 | holds |
| Row rules: three forms, labels "Everyone with access sees every row", "Each person sees their own rows", "Rules decide" | `RowRules.tsx:112-117` | writer, run (Definition tab shows them); second agent, 2026-11-23 | holds |
| Creating with "Each person sees only the rows they added" adds `owner_id` | `Data.tsx:1707-1712,1742,1750` | writer; second agent, 2026-11-23 | holds |
| Rules allow read or read and change by the person's ID, a group, or an attribute (and everyone) | `packages/manifest/src/table.ts:60-78` | writer; second agent, 2026-11-23 | holds |
| At most 20 rules | `packages/manifest/src/table.ts:80` | writer; second agent, 2026-11-23 | holds |
| `data_all` reads every row whatever the row rule says | `packages/manifest/src/permissions.ts:392-400` | writer; second agent, 2026-11-23 | holds |
| Built-in `viewer` holds `*:read`, `developer` holds `*:read` too | `apps/console/src/builtinRoles.ts:19-20,49` | writer; second agent, 2026-11-23 | holds |
| Row rules are saved with **Save who sees rows**, not as you type; unsaved rules are not applied and Undo is off for them; once saved, the change is one undo step ("Undo the change to who sees rows") | `Data.tsx:3036-3040` (`change(..., {label: "the change to who sees rows"})` records history), `Data.tsx:2562-2580`; run 2026-11-23: Undo off before saving, on after, Undo returned "Everyone with access sees every row", Redo restored the rules | second agent, 2026-11-23 | corrected: the page said they were not part of Undo |
| A file is at most 25 MB | `apps/control-plane/src/kernel/data/files.ts:21` | writer; second agent, 2026-11-23 | holds |
| A file a row names cannot be deleted; Files screen text | `apps/console/src/screens/Files.tsx:180`; `apps/control-plane/src/routes/sources.ts:715-723` | writer; second agent, 2026-11-23 | holds |
| A file a row stops naming (replaced, removed, row deleted) is noted in `row_file_history`; a table deleted for good notes its files too | `kernel/data/files.ts:478-512`; `routes/data.ts:619-628` | writer; second agent, 2026-11-23 | holds |
| The notes and the files go after the audit log's period, 400 days by default, a tenant's retention may change it | `apps/control-plane/src/kernel/retention.ts:229-290`; `config.ts:141,323`; `routes/identity.ts:313-314` | writer; second agent, 2026-11-23 | holds |
| A file a row still names is kept by that clean-up | `retention.ts:276-277` (comment), `:278-279` (the named files are left) | writer; second agent, 2026-11-23 | holds |
| No console screen lists a row's earlier files or puts one back | searched: `row_file_history` is read only in `kernel/data/files.ts`, `kernel/retention.ts`, `kernel/tenancy/tables.ts`; no route or console file | writer; second agent, 2026-11-23 | holds |
| Row edits are not written to the audit log; "Rows are business data, not configuration" | `routes/data.ts:931` (insert comment), `:988` (PATCH description), `:1146` (DELETE description) | writer; second agent, 2026-11-23 | holds |
| Each row change announces a `platform/row-changed` event | `routes/data.ts:988,1146` | writer; second agent, 2026-11-23 | holds |
| Definition changes and retirements are in the audit log (`resource.updated`, `resource.deleted`, `table.purged`) | run: audit list of the tenant showed them; `routes/data.ts:625` | writer, run; second agent, 2026-11-23 | holds |

The API text for PATCH row and DELETE row now says "Not written to the audit log" (`routes/data.ts:988,1146`), so the inventory's open item about "Audited." no longer applies.

Checked by: second agent, 2026-11-23. Code re-read; the retire, bring back and delete for good behavior run on the instance. Corrected: row rules are one step of undo once saved (the page said they were not part of Undo); the claim that the catalog keeps a retired column's default to put back is replaced, because the console's Bring back does not restore it.

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Files and Code owners; take-over; production has no take-over. | `apps/console/src/screens/Data.tsx:2619-2630,2768-2790,2905-2925` | writer, 2026-11-24 | holds as read; walked by a6 (p34-a6.md) |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. Browser (Playwright, 1440 px, light): a Code table shows 'Managed as code.' and the notice; **Take over in the console** asks the quoted question; after it the Definition tab is editable, a reload keeps it, **Retire table** appears. Rows untouched (read). CORRECTED: the page said `volvel pull` brings a taken-over table back as a file. It does not: `pull` wrote `Pulled 0 files` because `resource-files` reads the active bundle's manifests (`apps/control-plane/src/kernel/authoring.ts:672`, ownership `ui`) and a take-over changes only the resource row; the pull still records the basis (`routes/authoring.ts:498` reads the rows), so the deploy after it passes and retires the column added in the console. The page now says to put the change into the definition by hand or deploy with `--force`. Product bug for the owner: pull should write the file for a taken-over table, or not record its basis.

### Fix check (a9), 2026-11-24

Lane a9 build, throwaway instance http://localhost:8729 (database a934), lane CLI `packages/cli/dist/bin.js`. The page now describes the fixed behaviour, run as written: a table in code deployed, taken over in the console with a column added in the same save (`PUT resources/desk`, `takeOver: true`); `volvel deploy` without a pull refused (`desk: changed in the console since the repository last had it`); `volvel pull` wrote `platform/desk.table.yaml` with the column, and printed `desk (table) was taken over in the console, and is still defined in code, by the name desk. Remove it from the TypeScript: until you do, a deploy is refused as defined twice, in the code and in platform/.`; `volvel deploy` then failed at the build with `desk is defined in src/index.ts and again in platform/desk.table.yaml`; with the definition removed from the code the deploy passed and the table kept the column (read). CORRECTED the passages that said a pull brings nothing in for a table (product bug fixed by lane a9).
