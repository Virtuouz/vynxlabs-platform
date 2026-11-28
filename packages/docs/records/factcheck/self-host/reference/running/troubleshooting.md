# Fact-check: self-host/reference/running/troubleshooting.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Each message as quoted. | `packages/db/src/errors.ts`, `config.ts`, `host.ts:148,179,331`, `host-bin.ts:51,59,78`, run output | writer, 2026-11-23 | holds |
| 429 on the 21st sign-in a minute. | `proxy-trust.test.ts:50-51` | writer, 2026-11-23 | holds |
| 422 `too_slow`, 503 after 5 s. | `rows.ts`, `database.ts:12` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).

## Decision 0008 (apps isolation), 2026-11-28

The page was changed for decision 0008 (`docs/adr/0008-apps-written-as-code-are-sandboxed.md`). Lines are those of the working tree of branch `feat/apps-isolation`, before its commit. Read in code, not run.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `APPS_ON_CONSOLE_ADDRESS` is no longer read. | `git grep APPS_ON_CONSOLE_ADDRESS` finds it in no source file of `apps/` or `packages/` | writer, read in code, not run, 2026-11-28 | holds |
| A sandboxed page has no browser storage. | `packages/manifest/src/app-policy.ts` (`CODE_APP_SANDBOX`) | writer, read in code, not run, 2026-11-28 | holds |
