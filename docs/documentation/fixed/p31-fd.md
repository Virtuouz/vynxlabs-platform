# Phase 31, lane fd

- SCIM audit actor: `writeAudit` now keeps the name of an actor that has no row (`details.actorName`, `apps/control-plane/src/kernel/audit.ts`); the audit page's `actorLabel` falls back to it (`routes/identity.ts`), so a push shows "SCIM: <provider>". Test: scim.test.ts, "a pushed person becomes a member". Commit a3efafdf. Other callers with a named system actor: none.
- Git, after a pull a resource made here shows Push 0: a pull recorded everything the workspace says as agreed; it now leaves a file that still differs from the branch as changed here (`kernel/git.ts` pull). Test: git.test.ts, "after a pull, a resource made here still counts". Commit c65b0e05.
- Git, volvel.yaml moves the folder: the last sync keeps its folder (migration `0100_fd_git_synced_folder.sql`, `workspace_git.synced_folder`; the integrator renumbers it); a file gone from the old folder and present in the new one is read as moved (`rebased`, used by push, pull and compare). Test: "a folder moved by volvel.yaml does not make an edited file changed on both sides".
- Git, push with drafts then Removed here / "Push 1 change": the rule that a plain push leaves drafted files on the branch is now one piece (`draftedFiles`, `keepDrafted`) used by push, compare and pull. Test: "after a push with drafts, the drafted file is not counted as removed here".
- Git, History says Push for a release commit: `GET .../git/operations` answers kind `release` when the operation's detail names a release branch (`routes/git.ts`); the console already words it "Release". Test: git.test.ts promotion test.
- Data source with Encrypt Yes against a server without SSL: `sourceFailure` answers 502 `source_refused`, "does not accept encrypted connections. Turn Encrypt off for it, or turn SSL on at the server." (`kernel/data/sources.ts`; covers the check, tables and rows routes and health). Test: source-failure.test.ts.
- Restore exits 1: reproduced in a throwaway postgres:18. With `--no-owner` four errors (grants and default privileges) and one (the policy) name the missing `vxd_` role; `--no-acl` leaves the policy error only. Exit 0 by making the role first. The page's step 3 should become:

  ```bash
  for role in $(docker compose -f deploy/compose/compose.yaml exec -T postgres \
      pg_restore -f - < platform.dump | grep -oE 'vxd_[0-9a-f]{20}' | sort -u); do
    docker compose -f deploy/compose/compose.yaml exec -T postgres \
      psql -U platform -d postgres -c "create role $role nologin"
  done
  docker compose -f deploy/compose/compose.yaml exec -T postgres \
    pg_restore -U platform -d platform --no-owner < platform.dump
  ```

  Run: exit 0, no errors, the table, row and policy back. The instance finds the role at start and sets its password (`alter role ... login password`, packages/db/src/datastore.ts). The "5 errors, exit 1, expected" paragraph can go; mention the loop is only needed for scripted restores, and that the plain command still works with exit 1.
- Tests timing out: not a fault. They were run from the package directory, where vitest does not read the root `vitest.config.ts` (30 s) and falls back to 5 s. The two worker tests wait on a 2 s limit plus the stop grace (about 6 s) and a cancel (about 4 s); the CLI test takes about 10 s. From the repository root all pass (38 of 38). Nothing changed; run them as `npx vitest run <path from root>`.

## Found

- Migration needed by the git row: `packages/db/migrations/0100_fd_git_synced_folder.sql` (not locked).
- A server that demands SSL against Encrypt No answers code 28000, which says "refused the user name or password" (`sourceFailure`): misleading, not changed.
- The CLI plus worker test run printed a V8 out-of-memory trace at exit though all tests passed; not investigated.
