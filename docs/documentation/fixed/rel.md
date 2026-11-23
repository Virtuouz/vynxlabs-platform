# Fixed: lane rel

## REL-01 (commit "a production workspace changes only by deploy, promotion, or someone who may promote")
- Change: `PUT` and `DELETE .../resources/*` answer 409 `production_workspace` in a production workspace unless the caller holds `promotion:write` there. Guard `refuseDirectProductionWrite`, `apps/control-plane/src/kernel/authoring.ts:91`, beside `devWorkspace` (same message); called at `routes/workspaces.ts` (both routes).
- Test: `environments.test.ts` "is refused for a member who may not promote, and allowed for one who may (REL-01)". Failed before (201, not 409).
- Still changeable in production: anything a deploy or promotion writes (they call `putResource`/`deleteResource` directly, not these routes; so does clone), and every kind, by a caller with `promotion:write` (tenant admin). Not changeable by a developer or any role with only `resource:write`.
- Siblings looked at: the other callers of `putResource`/`deleteResource` are `deploy.ts`, `clone.ts` (kernel, unguarded on purpose). Drafts already refuse production. Fernhill setup writes `suppliers`, `supplier_contacts` into the dev workspace (`D`), unaffected. Control-plane suites apps, git, queries, mcp, data, interfaces, portability, upgrade, execution, authoring, renames, cli-routes, release, summary pass (404 tests). Sharing, themes and bindings use their own routes, not `resources/*` (not changed). The console edits production resources nowhere (ResourceEditor is read-only there).
- Left out: master-spec :460 says only code-managed resources change by deploy alone; this refuses console-managed ones too, as the row asks. Owner may want to say so in the spec.

## REL-02, REL-03
- Change: `visibleRequests` (`routes/promotion-requests.ts`, before `describeRequests`) is the list's rule (mine, or may decide); the list and `promotion-preview` (`routes/execution.ts` ~851) both use it. Console `screens/Promotion.tsx:68`: `waiting` is `pending && request.mine`; someone else's pending request shows who asked (existing `RequestState`) and the form to ask again.
- Tests: `release-access.test.ts` (REL-02, failed before: preview showed the request); `Promotion.test.tsx` (REL-03, failed before: Withdraw shown).
- Screens to walk: Release > promote step as a developer who may not promote: with no request; with own pending request (Withdraw shows); with a request by another (not shown now; for a promoter, the review). Polish gate: states: none, waiting-mine, decided; lifecycle: ask, withdraw, ask again; keyboard and copy unchanged. Walk not run.
- Left out: the "someone else's pending request" branch in the form cannot be reached by an API caller after REL-02, so it only guards.

## CLI-01 (D49)
- `loadSettings`, `packages/cli/src/cli.ts:36-70`: the saved token is used only when the URL equals the saved URL (trailing slashes ignored); else `VOLVEL_TOKEN` is required, said in the error. `status`, which sends no key, uses new `loadUrl`. `login` warns on stderr for plain http to a host other than localhost, 127.0.0.1, [::1].
- Tests: `cli.test.ts` (CLI-01, plain http warning). Failed before.
- Siblings: every command calls `loadSettings` (cli.ts, pull.ts); one change covers them.

## CLI-02, CLI-03, CLI-04
- `resourceOfFile` and `isFolderResourceFile` in `packages/manifest/src/files.ts` (next to `renderResourceFiles`), exported from the package. `pull.ts` uses them: a kept page leaves its draft out; `walk` includes `docs/**/*.md`, so a page the console deleted is removed (same "changed here" check); `--force` removes only files in `last` (pull.ts folder branch), a foreign file is kept with the existing message.
- Tests: `pull.test.ts` "a pull of pages and of a folder with files of its own". Failed before.
- Left out: a foreign `.md` under `platform/docs` that was never pulled is kept, as with `.yaml`.

## CLI-13
- `deploy` asks `resource-files?drafts=false` before upload and stops, naming up to 10 console resources the repo has no file for, unless `--allow-delete <path>` names each (`consoleResourcesLeft`, cli.ts). The server's `--allow-delete` covered only rename-suspected deletions, not console resources, so this check is CLI-side. No `--dry-run`. A 403 on the read skips the check.
- Test: `cli.test.ts` (pure function). Not an end-to-end deploy test.
- Known limit: matches by path, so a console resource renamed in the repo (same key, new path) is listed too and needs `--allow-delete`.
- Docs lines: deploy's usage text changed in `commands.ts`; the deploy page of the CLI docs should say the same.

## Found
- Git stash is shared across worktrees. I ran one `git stash push`/`pop` early; the pop applied another lane's stash (draft) into this tree. I reverted that, restored mine, and kept the draft lane's stash commit as `refs/recovery/draft-stash` in the shared repo (also my own as `refs/recovery/rel-stash`). The draft lane should check its tree.
