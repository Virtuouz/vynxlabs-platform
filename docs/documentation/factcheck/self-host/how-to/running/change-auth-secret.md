# Fact-check: self-host/how-to/running/change-auth-secret.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `AUTH_SECRET` signs cookies and the `_vx-challenge` records; at least 32 characters. | `config.ts:203`; `docs/self-hosting.md` | writer, 2026-11-23 | carried for the records; not run |
| Everyone signs in again; API keys, bundles, secrets and runs are not affected. | `docs/self-hosting.md` | writer, 2026-11-23 | carried; not run |
