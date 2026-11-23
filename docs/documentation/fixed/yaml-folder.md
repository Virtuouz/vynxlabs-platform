# Lane yaml-folder (D65)

Branch `p29-yaml-folder`. One migration: `packages/db/migrations/0097_yaml_folder_in_force.sql` (`git_repository.file_folder`, `file_read_at`), not locked. It is 0097, not 0090, because 0090 to 0096 exist and the migrations must be consecutive. The integrator renumbers and locks it.

## D65: `volvel.yaml` `resources` wins over the Repository page's Folder

- `apps/control-plane/src/kernel/git.ts` `readRepository`: reads `resources` from the branch's `volvel.yaml`, and returns `folder` (in force) and `folderFrom`. Every sync site (push, pull, compare, release mirror, `sidesOf`, `mayRemove`, `docsRoots`) now uses `repository.folder`, not `remote.folder`. A `resources` that is not a folder inside the repository is a problem (`volvel.yaml: resources is "...", which is not a folder inside the repository...`) that stops the pull and the push, with no fallback.
- `rememberFolder` records what the file said after a pull, push or check (`checkRepository` reads the default branch). Changing the address or default branch clears it.
- Route `GET /tenants/:t/git-repository` (and PUT, check, workspace git status) answer `folderInForce`, `folderFrom` (`setting` or `volvel.yaml`) and `fileReadAt` (null: not read yet).
- Console `apps/console/src/screens/Git.tsx` `RepositorySettings`: Folder is read-only with "Set in volvel.yaml (resources)..." when the file names it; before a first read the hint says volvel.yaml has not been read yet. Save keeps the setting's own value. `packages/ui/src/Fields.tsx` `TextField` gained `readOnly`.
- `entry`: the page hint and `docs/sdk-guide.md` say sync never builds code and `entry` is for the command line.
- Tests (seen failing first): `apps/control-plane/src/git.test.ts` "the folder volvel.yaml names is where a push writes and a pull reads, and a bad one is said (D65)"; `apps/console/src/Git.test.tsx` "a folder volvel.yaml names is shown as read-only...", "a folder is edited here until a volvel.yaml has been read...".
- Siblings looked at: tenant access branch (`tenant/`, unaffected), release mirror (uses the same `sidesOf`), tenant export/import of `git_repository` (columns ride along; `export-not-carried`, `kernel` tests pass). `RepositorySettings` is used only by `Tenant.tsx`. Other `TextField` users unchanged.
- Not done: the CLI does not yet refuse a `..` in `resources` the same way (build.ts untouched).
- For `docs`/CHANGELOG: "A `resources` folder in `volvel.yaml` now decides where git sync writes console-made files, and the Repository page shows it read-only."

Screens to walk (not walked): Repository page at 1440/768/390, light and dark, keyboard (read-only Folder is focusable and selectable), reload. States: not read yet (editable, hint), read from file (read-only), read with no `resources` (editable). Lifecycle: the file is removed or edited on the branch, then a pull or check, and the field returns to editable.

Found: none.
