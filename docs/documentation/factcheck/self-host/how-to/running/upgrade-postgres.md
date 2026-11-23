# Fact-check: self-host/how-to/running/upgrade-postgres.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Restore into a new server; the roles are made again. | `restore.test.ts`; run of the restore | writer, 2026-11-23 | holds for the restore; NOT RUN as a major-version move |
| `pg_upgrade` does the same. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |

## Second check (2026-11-23)

Run: bundled postgres:16 to postgres:18 (pg_dump with the 18 client over the Compose network, volume removed, image changed, restore --no-owner, start): 5 expected `vxd_` errors, exit 1; the control plane logged the policies again; the 3 rows read. Page's 'written from the code' notice removed; the dump command corrected (new client over the network). 17 to 18 not run (no 17 image). fault: self-host restore exit status.
