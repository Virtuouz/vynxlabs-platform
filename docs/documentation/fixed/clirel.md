# Fixed: lane clirel

## CLI-05, CLI-06, CLI-15 (commit "a local run builds its connections and input as a platform run does")
- Local run: `connectorOf` / `clientFor` in `packages/cli/src/local.ts` (~105-125). A connection or group names its connector in the bundle: `http` and `oauth2` come from the SDK, a connector the repository declares is created from the bundle's own export (as the worker's `connectorFor` does), and `smtp` says it needs a worker ("Mail connections live in a workspace ... Deploy to a dev workspace to try this script"; the mail client is in the worker and needs nodemailer, which the CLI does not carry). `ctx.connections(group)` has `get` and `keys`, read from a new `groups` section of `.platform/local.json`: `{ "groups": { "shops": { "acme": { "config": {}, "credential": "k", "label": "Acme" } } } }`. A group the script did not declare, a group without bindings, or a missing member each say so and name `local.json`.
- `--input @file`: `inputOf` moved from `cli.ts` to `packages/cli/src/input.ts`; the local run and the remote run call the same one.
- Tests: `packages/cli/src/local.test.ts` (all five failed before): "a connection uses the connector it names ...", "... cannot run on this machine says so", "connections(group) takes its members from local.json", "the local context has every key a worker's has" (compares `Object.keys(ctx)` with the worker's `buildContext`, now exported from `@volvel/worker`), "--input @file reads the file".
- Not done: the factory "shared in the SDK" (`sdk/context.ts`). The worker's context calls the control plane for each reach and the local one reads a file, so they share no body; the key-parity test holds them to the same keys instead.
- Siblings: `dev.ts` does not build a script context. `volvel run --remote` unchanged.
- Docs lines: the CLI page for `run` should say `local.json` has `connections`, `groups`, `secrets`, `variables`, that custom connectors run from the repository, and that `smtp` connections do not run locally; `--input` takes `@file` in both forms.

## CLI-07, CLI-08, CLI-09, CLI-10, CLI-11, CLI-12, CLI-14 (one commit with the rows above)
- CLI-07: `run()` in `cli.ts` (end): any error that is not a `CliError`, `BuildError` or argument error prints `Unexpected: <message>. Run again with VOLVEL_DEBUG=1 for the trace.` and exits 1 (the trace with VOLVEL_DEBUG). `whoami` checks the reply's shape ("did not answer like a platform instance"). The upload `fetch` and `tenant export`'s `fetch` say they could not reach the instance. `pull.ts` `readState` (shared by `readPulled` and `pullInto`) explains a `pulled.json` that is not JSON and how to start afresh.
- CLI-08: `volvel --version`, `-v`, `version` print `volvel <package version>` (from the `package.json` beside `dist`; the SDK version is the repository's own, so it is not printed). `<command> --help` or `-h` prints just that command's lines (`usage(only)` in `commands.ts`). `COMMAND_NOTES` mention both (the docs reference reads it).
- CLI-09: `wholeNumber(flag, value, min, max)` in `cli.ts`, used by `dev --port` (1 to 65535) and `runs cancel --older-than`; both are checked before the instance is asked.
- CLI-10 (D49): `promote --preview` on a production target with breaking changes and no `--confirm-breaking` prints the changes, says on stderr that promoting would be refused and what to add, and exits 4. `promote` now returns its exit code. With `--confirm-breaking` the preview exits 0.
- CLI-11 (D49): after a promotion, `release.status: "failed"` prints a warning on stderr with the problem and where to retry (Git sync); `done` prints the branch. Exit stays 0.
- CLI-12: `readRepositoryConfig` in `build.ts` throws `BuildError` on problems; `buildRepository` and `pull` both use it, and `pull` reads it before asking the instance.
- CLI-14: `init` writes a `tsconfig.json` and ends with five numbered steps: install dependencies, install the CLI, `login` (key from the account menu), run and build, deploy. The `^0.5.0` range matches `SDK_VERSION` and is left; whether the packages are on npm was not checked (no internet).
- Tests, all failed before: `cli.test.ts` "an unexpected reply is one line ... (CLI-07)", "a record of the last pull that is not JSON ... (CLI-07)", "--version and <command> --help ... (CLI-08)", "a port that is not a whole number ... (CLI-09)", "promote --preview says breaking changes need --confirm-breaking, and exits 4 (CLI-10, D49)", "promote shows a failed release push ... (CLI-11, D49)", "pull refuses a volvel.yaml that build refuses ... (CLI-12)", "init says how to install the CLI ... (CLI-14)". CLI-10 and 11 run `volvel promote` against a stand-in server that answers the routes (a real breaking promotion needs a renamed public script; the stand-in answers what the server answers).
- Left out: the two bare `fetch` calls (upload, export) are not tested; they are wrapped like `request`.
- Docs lines: the CLI page for `promote` should list exit 4 and the release warning (the `commands.ts` summary says it); `--version`, `--help`; `init`'s next steps.

## REL-15
- `GET .../drafts` (`apps/control-plane/src/routes/authoring.ts` ~325-350) looks up the deployed body by the resource's key, not by the draft's new path, so a renamed resource is described against what runs, not as "A new <kind>."
- Test: `authoring.test.ts` "a resource is renamed in the console, and is the same resource at its new path": the drafts list's `about` has no "A new". Failed before.
- Siblings: `routes/drift.ts` (two `describeChange` calls) compares two workspaces by path; a rename shows as two rows there by design (C8, not a bug), so not changed. The `Renamed` tag already used the key.
- A person sees: Release > review step, a renamed script says what changed in it, not "A new script".

## REL-16, REL-17
- REL-16: `supersedeWaiting` in `apps/control-plane/src/kernel/tenant/releases.ts` (before `rollbackAsks`), called after a release is applied directly and after one is approved: each waiting release asked against a different state of access is set to `superseded` (decided_at set, no decider) with an audit entry `access.release_superseded`. Approving it then answers 409 "This release was superseded already."; withdrawing it too. The status was declared and styled already (`AccessReleases.tsx:39`), and is now reached; docs and the status description on the route already list it.
- Test: `access-releases.test.ts` "with approval on, a release waits ..." (the stale step now expects `superseded` in the list; it was `awaiting_approval` before, and the withdraw that used to succeed is refused). Failed before.
- Behavior change to say in the docs: a waiting release made stale by another release is no longer withdrawn by hand; it is already finished. `release_stale` still guards the case a release was made stale by a change that did not go through a release (none known).
- REL-17: already fixed by tier 1 (ACC lane): `tenantHolders` (`kernel/administer.ts:31`) counts group members. Test added that shows it: `access-releases.test.ts` "two members who hold access:write through a group are two (REL-17)" (passes; it would have failed at the row's commit, which counted direct bindings only).
- Screens to walk: Releases (access) with approval on: a waiting release that another change superseded shows "Superseded" and no Approve/Decline/Withdraw buttons. Check the row actions of `AccessReleases.tsx` are shown only for `awaiting_approval` (they key on status). Walk not run.

## REL-12
- `apps/console/src/screens/AccessReleases.tsx` (`back`, ~200): reads the rollback's `status`. When it is `awaiting_approval` the toast says "Going back to release N is release M, and waits for a second person. Nothing has changed yet."; applied keeps the old text.
- Test: `AccessReleases.test.tsx` "going back says it waits for a second person when it does, and that it applied when it did (REL-12)". Failed before.
- Siblings: the screen's other action, `decide`, answers `applied` for an approval always (the API says so), declined and withdrawn say what they are; the approval switch says what it did. No other `releases` action toasts.
- A person sees: with a second person asked for, Go back says it waits. Screens to walk: Releases (access) with approval on and off, Go back. Polish gate: states: applied, waiting; lifecycle: go back, then the new release appears waiting in the list; keyboard and copy as before. Walk not run.

## REL-07
- `objectHref` (`apps/console/src/kit/objects.tsx`): query goes to `queries?query=<path>`, data source to `sources/<path>`, doc to `docs/<path>`, dashboard to the dashboards list (its page is by ID, which a path does not give). Any other kind without a page (theme, role, binding) goes to `resources`, and `resources/edit/<kind>` is only for the kinds the editor makes. `EDITED_KINDS`/`isEditedKind` moved here from `ResourceEditor.tsx` (re-exported there); new `hasHome(kind)`.
- The Resources list (`Tenant.tsx` ~705) links every kind that has a home through `objectHref`, and shows the title line for all.
- Test: `ObjectPages.test.tsx` "no kind is sent to an editor that does not exist for it (REL-07)". Failed before.
- Siblings: everything that calls `objectHref` gets it (Release review's `editLink`, Used by, Audit, Operate, Resources). The notice "There is no editor here for a <kind>" remains for a typed address.
- Screens to walk: Release > review with a query, doc, theme and data-source draft: each link opens its screen or the resources list; Resources list rows. Walk not run.

## REL-14
- `Release.tsx` (~135 and the render): the step from the address is used only when this workspace has it; else the first. `?step=review` in production shows Versions, `?step=promote` with nothing to promote to shows Review.
- Test: `Release.test.tsx` "an address that names a step this workspace does not have opens the first one (REL-14)". Failed before.
- Siblings: the other `useUrlParam("step")` users (`Flows.tsx:749`, `FlowEditor.tsx:624`) choose a flow step in a list, not a stepper, so are not clamped.
