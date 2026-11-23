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
