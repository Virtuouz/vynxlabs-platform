# Fact-check record: develop/reference/releases/refusals

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer; nothing here has been checked by a second agent yet. Other pages of the area hold the line-by-line records of every label: `console/reference/screens/operate/releases`, `console/reference/screens/operate/git-sync`, `administer/reference/screens/repository`, `administer/reference/screens/workspaces`, `console/reference/screens/configure/settings`. `Dep` = `apps/control-plane/src/kernel/execution/deploy.ts`, `Auth` = `apps/control-plane/src/kernel/authoring.ts`, `CPgit` = `apps/control-plane/src/kernel/git.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| incompatible_bundle two texts; oldest core 0.2.0 | `Dep:158,274-290` | writer | holds |
| kind_changed text | `Dep:340-348` | writer | holds |
| rename_suspected text and what it names (runs, access given to it, rows) | `Dep:358-372,722-790` | writer | holds |
| path_taken deploy text | `Dep:380-392`; draft texts `Auth:204,237` | writer | holds |
| breaking_changes text; only promotion to production | `Dep:617-628` | writer | holds |
| bindings_missing text; four messages; dev warns, production and promotion refuse; only a clone skips | `Dep:32-135,630-650`, `apps/control-plane/src/kernel/tenancy/clone.ts:347` | writer | holds (not run: needs a script that uses a connection) |
| bindings_invalid text | `Dep:655-668` | writer | holds |
| nothing_to_deploy | `Auth:588` | writer | holds |
| production_workspace texts | `Auth:87,125-131`, `CPgit:714` | writer | holds |
| draft_changed texts | `Auth:298-315` | writer | holds |
| console_code_off, 403 | `apps/control-plane/src/routes/authoring.ts:211-226` | writer | holds |
| no_branch, git_busy (120 s), git_paused, no_repository, repository_unreachable | `CPgit:88,481-515,937-942,710,151,583` | writer | holds |
| Outcomes and suspected | `apps/control-plane/src/routes/git.ts:285-295,545-575` | writer | holds |
| CLI flags --allow-delete, --confirm-breaking; promote --preview exits 4 | `packages/cli/src/commands.ts:106-119` | writer | holds |
| The preview is the deploy carried out and taken back | `apps/control-plane/src/routes/authoring.ts:1030-1060` | writer | holds |
