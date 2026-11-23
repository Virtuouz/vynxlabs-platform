# Lane files: fixed

Design: D22. Commit: see `git log p29-files`.

## DAT-05, DAT-10, TAB-02, TAB-09, GOV-11

- **DAT-05.** `routes/sources.ts`: list needs `data_all:read`; delete needs `data_all:write`; details and content go through `mayReadFile` (`kernel/data/files.ts`): uploaded by the caller, or `data_all:read`, or a row the caller may read (table policy applied) names it; otherwise 404. Permission words in `packages/manifest/src/permissions.ts` say so. Test: `data-access.test.ts` "DAT-05".
- **DAT-10.** Delete answers 409 "A row still names this file..." while any file column (active or retired, dedicated databases included) holds it (`namedFiles`). Test: "DAT-10". A file only noted (row gone) can still be deleted by `data_all:write`; its notes go with it (cascade).
- **TAB-09.** `retention.ts` `pruneFileHistory` skips files `namedFiles` finds; inserts clear notes (`insertRowsKeepingFiles`). Test: "TAB-09" (a) and (b).
- **TAB-02.** Notes are cleared by tenant, workspace and file; a file ID given to a row on insert or update must be a file of this workspace (400 otherwise, `assertFilesHere`). Test: "TAB-02".
- **D22, rows deleted.** `deleteRowKeepingFiles` / `deleteRowsKeepingFiles` note each file of a deleted row. Test: "a deleted row's files are kept...".
- **GOV-11.** Field hint (`Retention.tsx`), the confirmation, and the API descriptions (`routes/tenants.ts`) say the audit period also deletes replaced and deleted-row files. Test: `Retention.test.tsx` "GOV-11".
- Changed old tests: `data-access.test.ts` Bob now gets 404 for a file only Alice's row names and 403 on list; the "deleted file" test deletes its rows first (409 before); the unaudited-route guard allows `row-deletions`.

## Siblings looked at

Callers of insert/delete moved to the shared helpers: `routes/data.ts` (POST rows, DELETE row, row-deletions), `routes/worker.ts` (script insert/delete on own tables), `kernel/pages/act.ts` (page actions create/delete). Looked at and unchanged: scripts' `ctx.files` get/put (`routes/worker.ts`, trusted, whole workspace); `kernel/apps/front.ts` feedback insert (no file column); source tables (no file column); `routes/environments.ts` copy (internal, needs `file:read`+`data_all:read`); CSV export and widgets read file IDs only; console grid (`filesPath`) uploads only. End users read their own rows' files (tested with a member under an owner policy; same path for end users).

## Not done / Found

- Files of rows removed by cascade (reference rule) or table drop are not noted; a table drop leaves its files as before.
- A person who knows a file ID can attach it to a row they own and then read it (D22 accepts; IDs are not guessable).
- Console has no files screen (P10), nothing to walk. No migration.
- Screens to walk: Settings > Retention (hint, confirmation with Audit log shortened).
