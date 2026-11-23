# Fixed: lane ins

## INS-01 A changed tenant export can bring in rows and files that are not the tenant's own
- Commit: see git log, "(INS-01, INS-06)".
- Changed: `apps/control-plane/src/kernel/tenancy/import.ts` `checkLayout` (files this format has), `authenticate`, `validate` inside `importTenant` (tenant, workspace, parent, instance scope, member checks), the post-load role/resource check, the catalog checks, and the object checks (named by a row, never replace, only own writes removed on failure). `export.ts` writes format 2 with `authentication`; `crypto.ts` `manifestMac`/`manifestMacMatches`; `routes/portability.ts` inspection gains `formatVersion` and `authenticated`; console `Environments.tsx` check line says an older format has no signature.
- Test: `portability.test.ts` "an export that someone changed, who knows its passphrase" (one altered archive per class: other tenant's row, instance binding, foreign workspace, unknown tables/paths/schema, unnamed object and missing object, existing object kept, unsigned or changed list, check screen field). All failed before the fix (15 failures with the fix reversed).
- Siblings looked at: clone (`kernel/tenancy/clone.ts`) copies inside one database from its own selects and was not changed; member list left to lane gov (D5); `data/` catalog and schema names are held (identifier, column type, workspace).
- Contract: `docs/contracts/tenant-export.md` updated (format 2).
- Person sees: Import's check has a line saying the list of contents is signed, or that an older format has no signature; a changed file is refused with a plain reason.
- Left out: a row's references to rows of other tables in the same tenant (for example a binding's principal) are not held beyond the checks above; `storage.get` errors other than not-found are treated as "not stored".
- Screens to walk: Environments > Import a tenant, with a format 2 file, a format 1 file, with and without passphrase. Polish: states (unchecked/ok/failed pill), copy; keyboard unchanged.

## INS-06 An uploaded export waits on disk readable by every user of the machine
- Changed: `kernel/tenancy/staging.ts` `ensureStageDir` (0700, refuses a folder not ours or a link), `routes/portability.ts` upload file created `wx` mode 0600.
- Test: "an upload waits in a folder and a file only this user can open".
- Siblings: the direct import route already uses `mkdtemp`; nothing else writes tenant data to a fixed name.

## INS-08 Registering a location's name again points its tenants at another database, unchecked
- Changed: `routes/locations.ts` `requireCatalogOfTenants`, called by `PUT /instance/database-locations/:name`: for a name tenants use, the database now given must hold every `data_table` id of those tenants (read from the current database) and each workspace schema, else 409 naming the counts. The route description says so.
- Test: `data.test.ts` "registering a location's name again with another database is refused while it does not hold the tenants' tables" (run with `VX_DATA_MODE=dedicated`; failed before: 204 and every later test broke).
- Siblings: `DELETE` already refuses a used name. Same-address PUT and description edits still work.
- Left out, and why: a separate "Change address" action and `POST` that answers 409 for a taken name. The PUT with a check closes the harm without a new route and a console change; asking the owner whether the console form should split is open. When the current database cannot be reached there is nothing to compare, so the change is allowed (that is what a change of address is for).
- Screens: Environments, "Register database", a 409 now shows its detail in the form's error (walk it).

## INS-09 Other replicas keep the old database after a tenant is moved or a location's address changes
- Changed: `kernel/data/stores.ts`: a tenant's location is trusted for 2 s (`STALE_MS`) then read again; an open dedicated store compares `database_location.updated_at` every 2 s and is closed and reopened on a difference.
- Test: `data.test.ts` "a replica reopens a location whose address another replica changed, and rereads where a tenant lives" (writes the rows as another replica would, no `forget`). Failed before: same database name after the change.
- Siblings looked at: supervisor `#writers` and hosts were not changed (they key on tenants, not on a database address); `forget`/`forgetTenant` still act at once in their own process.
- Left out: no `NOTIFY`; staleness is up to 2 s.

## Found
- INS-11 neighbour: `inspectImport` still reads `counts.members`, which the export writes as `member` (this is INS-11, not mine).
- Format 1 files whose `formatVersion` is edited down from 2 lose their signature check by design; the check screen says an older format is unsigned.
- Members in an archive are created with the password hash given: left to lane gov (D5).
