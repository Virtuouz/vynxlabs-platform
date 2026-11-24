# Fact-check: self-host/how-to/running/upgrade-an-instance.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `GET /api/v1/instance` has `coreVersion` and `migrationLevel`. | run | writer, 2026-11-23 | holds |
| `migrate` prints "The database is up to date, at level N." | run: level 99 | writer, 2026-11-23 | holds |
| Migrations forward only; checksums; newer-database refusal. | `packages/db/src/migrate.ts:81,134`; `errors.ts` | writer, 2026-11-23 | holds |
| An upgrade from any earlier version works. | `docs/self-hosting.md` (tests) | writer, 2026-11-23 | carried; not run |
| Oldest bundle core. | `kernel/execution/deploy.ts:161` | writer, 2026-11-23 | holds (0.2.0) |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).
