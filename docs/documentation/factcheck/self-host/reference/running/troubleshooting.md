# Fact-check: self-host/reference/running/troubleshooting.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Each message as quoted. | `packages/db/src/errors.ts`, `config.ts`, `host.ts:148,179,331`, `host-bin.ts:51,59,78`, run output | writer, 2026-11-23 | holds |
| 429 on the 21st sign-in a minute. | `proxy-trust.test.ts:50-51` | writer, 2026-11-23 | holds |
| 422 `too_slow`, 503 after 5 s. | `rows.ts`, `database.ts:12` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).
