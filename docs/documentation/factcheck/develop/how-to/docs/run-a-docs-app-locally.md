# Fact-check record: develop/how-to/docs/run-a-docs-app-locally.md

Lines are current at commit `14f7d5b9` (branch phase-31-write-the-docs). Paths are under `apps/console/src/screens/docs` (`D/`) unless they start with `apps/`, `packages/`. Written by the writer of the docs area; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `volvel dev [app] --tenant <slug> --workspace <slug> [--port <n>] [--no-strict]`. | packages/cli/src/commands.ts:98-101 | writer, run 2026-11-23 | holds as written |
| Default port 5174, next free one up to 20 above. | packages/cli/src/cli.ts:604; packages/cli/src/dev-site.ts:452-465 | writer, run 2026-11-23 | holds as written |
| With one app no name; "Say which app" lists apps with kinds ("handbook (docs)"). | packages/cli/src/dev.ts:58-81 | writer, run 2026-11-23 | holds as written |
| "This repository has no app at …" and "This repository defines no app." | packages/cli/src/dev.ts:63-77 | writer, run 2026-11-23 | holds as written |
| Printed lines: `<app> is at <url>`, the policy line, the workspace line. | run; packages/cli/src/dev.ts:160-200 | writer, run 2026-11-23 | holds as written |
| The notice across the top, verbatim. | packages/cli/src/dev-site.ts:117-118 | writer, run 2026-11-23 | holds as written |
| Reload by server-sent event on file change; a failed build shows "This app cannot be drawn yet". | packages/cli/src/dev-site.ts:195-241 | writer, run 2026-11-23 | holds as written |
| Strict policy unless `--no-strict`. | packages/cli/src/dev-site.ts; docs/documentation/fixed/p30-m1b.md | writer, run 2026-11-23 | holds as written |
| Not drawn: product terms, readers' answers, diagrams, moved-page redirects. | docs/documentation/fixed/p30-m1b.md ("Left"); dev-site.ts:117 | writer, run 2026-11-23 | holds as written |
