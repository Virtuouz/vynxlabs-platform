# Fact-check: self-host/how-to/running/back-up-an-instance.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `pg_dump --no-owner -Fc` of the bundled Postgres restores. | run: dump 349 KB, restored into a fresh stack | writer, 2026-11-23 | holds |
| Tar of the bundled object store's volume with the store stopped restores. | run: `objectstore.tgz` 5.4 KB, the file read back after restore | writer, 2026-11-23 | holds |
| A `pg_dump` is a backup (D59, HOST-01, HOST-02). | `docs/documentation/fixed/host.md`; `restore.test.ts` | writer, 2026-11-23 | holds |
| A tenant export holds secrets under a passphrase. | `docs/self-hosting.md` "Moving a tenant" | writer, 2026-11-23 | carried; not run |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).
