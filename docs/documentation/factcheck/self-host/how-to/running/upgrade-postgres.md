# Fact-check: self-host/how-to/running/upgrade-postgres.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Restore into a new server; the roles are made again. | `restore.test.ts`; run of the restore | writer, 2026-11-23 | holds for the restore; NOT RUN as a major-version move |
| `pg_upgrade` does the same. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |
