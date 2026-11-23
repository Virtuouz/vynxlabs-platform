# Lane sweep-server: the final sweep, server side

No migration. Commits: 6ca88696 (D17), e7f61811 (instance log), 25f9418d (not-contains).

## D17, SCR-16, EXT-10, REL-18: `tenant.console_code` has a switch
- `CP/routes/tenants.ts`: `consoleCode` on every tenant answer (list, one, create, patch) and `PATCH /tenants/:t { consoleCode }` (`tenant:write`, so a tenant admin or an operator; both turn it either way). Audited as `tenant.updated` with `details.consoleCode`.
- Console: `ConsoleCodeButton` (`C/screens/Environments.tsx`), drawn by the tenant overview header (`TenantOverview.tsx`) and the Tenants inspector footer (`Tenants.tsx`), after a confirmation; hidden when `mayRename` is false or the server does not say.
- Tests: `authoring.test.ts` "a tenant admin and an operator switch writing code ... (D17)" (failed: no `consoleCode`); `TenantScreens.test.tsx` two tests (switch with confirmation; not offered without `tenant:write`).
- Siblings: the other readers of `console_code` are `mayWriteCode` only (`routes/authoring.ts`). Not built: a CLI command (the API takes it).
- Screens to walk: tenant overview header at 390 px (two buttons wrap), Tenants inspector, the confirm dialog by keyboard; both modes. Copy: "Turn off code in console".

## INS-28 (console and file parts; the log read itself was built by t4-instance-host)
- Dropped my own `deleted-tenants` routes when the phase branch brought theirs (the instance's log holds a deleted tenant's entries).
- `CP/routes/identity.ts`: `GET /audit/:id` and `GET /audit-export` for the instance (the console already asked for both and got 404); `auditCsv` is one helper for the tenant's and the instance's file (`routes/permissions.ts` uses it). `C/screens/Audit.tsx`: the entry link and the CSV button are no longer for tenant logs only.
- Tests: `environments.test.ts` "is read at the instance ..." (extended; 404 before), `Audit.test.tsx` GOV-P8 (CSV link).

## Not-contains in the filter language (t3-tables)
`not_contains` in the rows filter (`CP/kernel/data/rows.ts`; a row with no text is among those that do not contain it), the SDK and app client types, and `!~x` in a grid filter box (`C/screens/gridFilter.ts`, the Keys popover). Tests: `data.test.ts` (filter), `Data.test.tsx` (`toFilter`). Siblings: visual query conditions and widget conditions are a different language and have no not-contains.

## Already done, shown
- Approval title masked by value, flow run list error masked, event-filter refusals: fixed by t2-walk-flow (`fixed/t2-walk-flow.md`, "mask2 found"); tests `approval-links.test.ts`, `flows.test.ts` "an expression's failure that quotes a secret ...", `operations.test.ts` "a filter's failure that quotes a secret ...". Failure text is masked where it is made, so the list reads it masked.

## Left, and why
- CLI-MP7 `volvel dev` for file apps, interfaces and docs: not built. A code app is served by Vite from its source; an interface or docs app has no source: the platform draws it (`kernel/apps/docs.ts`, the interface pages). Two ways to serve one locally: (a) push the repository's files as drafts into the dev workspace and proxy the instance's `<app>/_draft` preview (docs only has that preview; interfaces would need one), which writes into a workspace on each save; (b) move the docs renderer and interface runtime out of the control plane into a package the CLI can use. Both are large and (a) changes a workspace. Needs the owner's choice.
- Git sync ignoring `entry`/`resources` of `volvel.yaml`: a git remote has its own folder setting; letting the file override it makes two answers to one question. Not changed; owner to say which wins.
- A binding older than the 200 newest uploads; a retired table's `managedIn`: each needs a column (a migration) holding what the catalog dropped. Not made.
- ACC-27 "others' operator grants": the row does not say what is wrong; unchanged.
- Audit-area test for actions written through a template: phase 30 M9.

## Lines for packages/docs/content and CHANGELOG
- Tenant API: `consoleCode` on a tenant, `PATCH /tenants/:t {consoleCode}`; `console_code_off` can be undone from the tenant overview.
- Instance audit: `GET /audit/{id}`, `GET /audit-export`.
- Rows filter: `not_contains`; grid filter `!~x`.
