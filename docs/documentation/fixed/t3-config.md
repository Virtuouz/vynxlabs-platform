# Lane t3-config

## CFG-MP4 = REL-MP5: run limit in Workspace settings
- Test: `Environments.test.tsx` "a workspace's run limit is set from its settings, from 1 to 1000, saved with the others (CFG-MP4)". Failed before (no "Runs at once" field).
- Change: `apps/console/src/screens/Environments.tsx` `WorkspaceSettings` (Run limit section, `NumberField`, saved by the same SaveBar as name and zone; PATCH sends `concurrencyLimit`). Route already took 1 to 1000; unchanged.
- Siblings: the only workspace settings page is this one; `Tenant.tsx` has no such field (the row's "verify" resolved: it was not there).
- Seen: a "Run limit" section below Time zone; 0 or 2000 shows "A whole number from 1 to 1000." and blocks Save.
- Polish: states: loading (empty until the workspace loads), invalid (error text), saving (bar); keyboard: native number input; copy plain. Walk: Workspace settings at 390/768/1440, light/dark, reload shows the saved value.

## CFG-MP1: Unbind on a connection's page
- Test: `ObjectPages.test.tsx` "a bound connection's page has Unbind ... (CFG-MP1)". Failed before.
- Change: `apps/console/src/screens/ObjectPages.tsx` `ConnectionPage` uses the shared `RemoveButton` and `useReferences`, as the list does (`Execution.tsx` ~840).
- Siblings: the list in Execution.tsx and the database-source list in Data.tsx:2804 already unbind. Not on the page: Variables, secrets pages.
- Seen: Unbind button next to "Change where it points"; confirmation names what uses it; afterwards the page says "Not set up here".
- Polish: refused/failed shows the error toast (RemoveButton); keyboard via dialog. Walk: a bound connection's page at 390 px (actions wrap).

## Found
- `ObjectPages.test.tsx` "no kind is sent to an editor that does not exist for it (REL-07)" fails on the phase branch already (objectHref of `connection_group` gives the connections list, test expects `resources/edit/connection_group/...`). Not mine.
