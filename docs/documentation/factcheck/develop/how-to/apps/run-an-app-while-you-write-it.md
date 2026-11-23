# Fact-check record: develop/how-to/apps/run-an-app-while-you-write-it.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src` or `apps/control-plane/src` or `packages` as written. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Default port 5174, next free port when taken; --port 1 to 65535 with the quoted refusal. | `cli/src/cli.ts:593-604`; `dev-site.ts:~505`; run | writer, run on the instance 2026-11-23; second agent pending | holds as run (5200 taken -> 5201; 70000 refused) |
| Start output lines (is at, policy, reads and writes, as). | `cli/src/cli.ts:606-616` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| "Say which app: …", "no app at", "This repository defines no app." | `cli/src/dev.ts:47-67` | writer, run on the instance 2026-11-23; second agent pending | holds as run for the first two; third read |
| Proxy of /api and /portal to the instance with the key. | `dev.ts:150-190`; `dev-site.ts:forward` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Page context: base /, portal path, tenant.logo, app.title equals path for files, groups/attributes not filled. | `dev.ts:118-130` | writer, run on the instance 2026-11-23; second agent pending | holds as run (context read: title "desk") |
| Interface app drawn with screens carried by the CLI; SCREENS_DIR; refusal text if absent; field help "{}". | `dev-site.ts:75-90,230-240` | writer, run on the instance 2026-11-23; second agent pending | holds as run (with SCREENS_DIR set to a current build) |
| Reload when files change except node_modules, .git, .platform, dist; 150 ms. | `dev-site.ts:IGNORED, changed` | writer, run on the instance 2026-11-23; second agent pending | holds as run (docs edit appeared) |
| Problem page "This app cannot be drawn yet" and an entry like "src/index.ts:111: Unexpected \";\"". | `dev-site.ts` problemPage | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| Docs site: .md route, _search, notice text, pictures. | `dev-site.ts:DOCS_NOTICE, 300-340` | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| The policy used, with nonce and ws sources; --no-strict text. | `manifest/src/app-policy.ts`; `cli.ts:610` | writer, run on the instance 2026-11-23; second agent pending | holds as run (header read) |
| Docs site uses the docs policy (img https:). | `packages/docs-site/src/policy.ts` | writer, run on the instance 2026-11-23; second agent pending | holds as run (header read) |
| An inline script in index.html runs in dev because Vite adds the nonce. | run: title became "inline ran"; HTML shows nonce on the script | writer, run on the instance 2026-11-23; second agent pending | observed; reported as a fault |
| The remote stylesheet is refused with the quoted console text. | run in browser | writer, run on the instance 2026-11-23; second agent pending | holds as run |
| The invalid source ws://[::1]:* console warning. | run in browser; `app-policy.ts` development connect list | writer, run on the instance 2026-11-23; second agent pending | holds as run |
