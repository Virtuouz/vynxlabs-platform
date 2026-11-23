# Fact-check: self-host/reference/running/retention.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Defaults and bounds. | `config.ts:137-141,320-323` | writer, 2026-11-23 | holds |
| Pass every ten minutes on one replica. | `background.ts:27` | writer, 2026-11-23 | holds |
| Audit months: partitions, export before removal, 50,000 rows a part, key names. | `kernel/retention.ts:29,360,401-427` | writer, 2026-11-23 | holds |
| `GET /api/v1/audit-export` needs `audit:read`. | openapi | writer, 2026-11-23 | holds |
| The restore snippet. | `docs/self-hosting.md` | writer, 2026-11-23 | NOT RUN |
