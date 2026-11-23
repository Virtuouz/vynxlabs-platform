# Fact-check record: develop/how-to/cli/deploy-a-repository.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Preview output shape and the sentence `Nothing was changed. Run it again without --preview to deploy.` | `cli/cli.ts:466-500`; run | writer, run on the instance 2026-11-23 | holds as run |
| `--preview` uploads app files and stores the bundle as a preview bundle (removed after 7 days); a refused preview prints `It cannot be deployed.` and exits 1. | `cli/cli.ts:459-485`; `bundles.ts:194`; run (refusal on production) | writer, run on the instance 2026-11-23 | holds as run |
| Deploy prints `Deployed version N to <ws> (<type>): ...` and lists changes. | `cli/cli.ts:513-523`; run | writer, run on the instance 2026-11-23 | holds as run |
| Counts are of resources; a change to a script's `run` body alone was `unchanged` in the run (observation). | run: version 2 deploy printed `0 updated ... 2 unchanged` | writer, run on the instance 2026-11-23 | holds as run |
| `--message` up to 500 chars (cut at 497 plus `...`); empty is refused; with `CI` set (not false/0) the last commit's subject is used. | `cli/cli.ts:167-185`; run: `Warm up the greeting` as message | writer, run on the instance 2026-11-23 | holds as run |
| `--json` prints one document; keys as shown. | `cli/cli.ts:540-553`; run | writer, run on the instance 2026-11-23 | holds as run |
| A deploy is atomic. | `apps/control-plane/src/kernel/execution/deploy.ts:222`; routes `execution.ts:762` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Console-resource refusal text; up to 10 named; `--allow-delete`; a bundle without a console file skips the check; pulled and deleted resources are allowed. | `cli/cli.ts:403-422,438-447`; run (`cli-extra`) | writer, run on the instance 2026-11-23 | holds as run |
| Drafts a pull carried are cleared: `1 console draft it carried is cleared: cli-ideas.` | `cli/cli.ts:522-530`; run | writer, run on the instance 2026-11-23 | holds as run |
| A new dev workspace starts with triggers paused. | `apps/control-plane/src/routes/workspaces.ts:260-300`; run (`triggersPaused:true`) | writer, run on the instance 2026-11-23 | holds as run |
| Bundle limit 20 MB; sources 4 MiB characters; 5,000 files. | `apps/control-plane/src/kernel/execution/bundles.ts:21`; `packages/manifest/src/bundle.ts:120-123` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Dev warns, production and promotions refuse for missing bindings; text; `bindings_invalid` refuses always. | `deploy.ts:628-668`; run (dev `Note:` lines, production refusal) | writer, run on the instance 2026-11-23 | holds as run |
| Texts of `rename_suspected`, `path_taken`, `kind_changed`, `incompatible_bundle`, `assets_missing`. | `deploy.ts:336-392`, `:262-290`; `bundles.ts:104-110` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `deployer` role is `*:read, bundle:*, deployment:*`; routes need `bundle:write`, `deployment:write`. | `packages/db/migrations/0009_execution_roles.sql:13-14`; `routes/execution.ts:558,708,756` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `The build failed:` with one problem per line. | `cli/cli.ts:1396-1401`; run | writer, run on the instance 2026-11-23 | holds as run |
