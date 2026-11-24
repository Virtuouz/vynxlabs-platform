# Fact-check: self-host/how-to/running/restore-an-instance.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `pg_restore --no-owner` into an empty database reports 5 errors, all `vxd_` role references; exit 1. | run: `restore.errors`: 1 CREATE POLICY and 4 GRANT/REVOKE; "errors ignored on restore: 5" | writer, 2026-11-23 | holds |
| `--exit-on-error` stops at the first and leaves no policies. | run: first attempt stopped at the CREATE POLICY | writer, 2026-11-23 | holds |
| At start: "row policies now read the signed claim" with a count. | run log of the restored stack; `kernel/data/apply.ts` | writer, 2026-11-23 | holds |
| After the restore a tenant, its rows, its file and a new row work; sign-in with the old password works. | run | writer, 2026-11-23 | holds |
| Under another database name. | `apps/control-plane/src/restore.test.ts` test 2 | writer, 2026-11-23 | holds by test; not in the run |
| A wrong `MASTER_KEY` stops boot. | run | writer, 2026-11-23 | holds |
| Newer-database message text. | `packages/db/src/errors.ts:4-5` | writer, 2026-11-23 | holds |
| The rate-limit table is unlogged. | `packages/db/migrations/0046_rate_limit.sql:4` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Restored again in the Postgres upgrade run (5 expected errors, exit 1, before the role step). fault fixed (fd): see the next line.

## Fault fixed (lane fd, 2026-11-23)

Step 3 makes the `vxd_` role first: reproduced on a throwaway postgres:18 by lane fd, the restore then ends with no error and exit 0, the table, rows and policy back; the role's name is `vxd_` and the first 20 hex digits of the database name's SHA-256 (packages/db/src/datastore.ts:35), and the instance sets its password at start. The upgrade-postgres page points here. fault: self-host restore exit status — closed.
