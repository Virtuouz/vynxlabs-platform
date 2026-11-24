# Fact-check record: develop/how-to/cli/keep-in-step

Lines are current at commit `d619bfbd` plus the working tree (branch p34-a7, with lane a5 merged), 2026-11-24. Paths are from the repository root. Written by the A7 writer. Checked by: second agent (pending).

Run: instance on lane a7's build, database a734, port 8712, Fernhill seeded by `examples/fernhill/setup/setup.mjs` and its tenant `fernhill`; workspaces made for the run (`walk1` to `walk6`, `try-it`, `apps-docs`, `cli-start-dev`, `cli-start-live`). The CLI is `packages/cli/dist/bin.js` of the lane. Repositories made for the run are in `examples/a7*` (untracked, deleted at the end).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A deploy of the repository is refused with `console_changed` when the console changed a resource it would replace, or made one it would remove; no basis, no refusal. | `apps/control-plane/src/kernel/execution/deploy.ts:396-430`; `basis.ts:49-64` | writer, 2026-11-24 | holds as run (step 1) |
| Refusal text and the `--force` hint; exit 1; `--preview` says `It cannot be deployed.` | `packages/cli/src/cli.ts:138-160,527-545` | writer, 2026-11-24 | holds as run |
| `volvel pull` output `updated  platform/greeting.variable.yaml` and the `Pulled N files ... (version N and 0 drafts)` line. | `packages/cli/src/pull.ts`; run | writer, 2026-11-24 | holds as run |
| A kept file: the deploy is still refused; `pull --force` takes the console's version. | run on `walk2`: kept (exit 1, still refused), then `--force` replaced the file, then the deploy passed | writer, 2026-11-24 | holds as run |
| `--force` deploys, and writes audit `deployment.forced` with `paths` (`path`, `change`) and `bundleId`. | `apps/control-plane/src/kernel/execution/deploy.ts:793-805`; run: `GET /tenants/<id>/audit?action=deployment.forced` | writer, 2026-11-24 | holds as run |
| `--force` needs no permission beyond the deploy's. | `apps/control-plane/src/routes/execution.ts:794-842` (only `body.force`) | writer, 2026-11-24 | holds as read |
| Git push (not with drafts) and pull set the basis; a pull leaves out resources whose file still differs. | `apps/control-plane/src/kernel/git.ts:1084,1138`; docs/documentation/fixed/p34-a2.md | writer, 2026-11-24 | holds as read (not run: no Git remote on the instance) |
| The console's rollback and deploy ask `Roll back <workspace> anyway?` and list the paths; button **Roll back anyway** / **Deploy anyway**; audit. | `apps/console/src/screens/Execution.tsx:731-753` | writer, 2026-11-24 | holds as read; a2's walk (p34-a2.md) opened it at three widths |
| A promotion is not refused by this check. | `docs/documentation/fixed/p34-a2.md` ("Promotions never pass `repository`") | writer, 2026-11-24 | holds as read |
| Warning text when the instance did not take the pull's basis. | `packages/cli/src/pull.ts:290-293` | writer, 2026-11-24 | holds as read |
