# Lane m1fix (phase 31)

## Screenshots

- `e2e/screenshots.spec.ts`: two new scenes. The handbook workspace (Dev) also holds a console-made table `customers` (4 columns, a display column, an index, 2 rows), so `console/table-definition` (`tables/customers?view=definition`, 1440x1500 so Indexes and Who sees rows show) has the column actions that a repository table lacks. Scene `visit-notes`: a second dev workspace "Sandbox" with the console-made `visit-notes` as the tutorial builds it (summary and clinic required, clinic defaulting to Northside, five rows) and the saved view "Long visits" (filter `>=20`, sort `-minutes`) for the signed-in admin.
- `ready` looks now match names exactly ("Tables" matched "The Tables list" in the Help panel). Row IDs and the stored schema name are masked in `packages/docs/screenshots.mjs`.
- Taken on a throwaway instance (port 8095, because a stale p30 server of another lane holds 8094; database and bucket p31shots, dropped; server stopped by pid). Seen in light and dark. The 18 files are in `packages/docs/assets/screenshots/` of this worktree (ignored by git); the instance is gone, rerun with `pnpm docs:screenshots` against any instance.

## Product faults

1. File field in the inspector with no file offered "Replace" (`apps/console/src/screens/Data.tsx` `ChooseFileButton`, used by `FileField` and Add row). It says "Choose a file" with no file, adds the first file without the "old file stays in history" question, and says "File added." Test: `m1fix: a file field with no file offers choosing one`. Siblings: Add row's file field (same button now).
2. "Saved. It applies from the next request." vanished in rules mode: `Definition` restarted the rules editor when the table came back with the rule's keys in the store's order (`when` before `allow`); only owner mode happened to match. `sameJson` compares by content. Test: `m1fix: Who sees rows says it is saved in rules mode`.
3. Draft counter (no change): the counter is `count(resource_draft)` (`routes/summary.ts`). A console table change is `PUT /resources/<path>`, which writes the resource itself (`kernel/resources.ts putResource`) and creates no draft; a deploy has nothing of it to promote because it is already live. Seen on the screenshot instance: "Draft 0 changes" in both workspaces after tables were made, edited-by-API and filled. The counter rises only for drafts (pages, flows, apps, docs, and tables saved as drafts, as the handbook scene's `orders`). If a writer saw it rise, something else in that workspace was saved as a draft.
4. Description cut at 500 silently: the shared prompt (`packages/ui/src/Dialogs.tsx`) ignored `maxLength` for multiline and callers sliced. Now `FormField.maxLength` (`ListScreen.tsx`) and the multiline prompt use the shared count and refusal ("Use at most 500 characters. This is 501."), the save is refused past it, and the slices are gone in Create table, Describe table, Describe column and Groups' description. Server limit is 500 (`aboutIt`, column description): matches. Test: `m1fix: a table's description past 500 characters`.

Tests: `apps/console/src/Data.test.tsx`. Typecheck of console and ui, Data/Groups/CreateDialog/ListScreen and ui tests pass. No migration, no contract change.

Screens to walk: a table's Definition (Who sees rows, Describe), Create table, a row's inspector with a file column, Groups' Describe; 1440/768/390, light/dark.
