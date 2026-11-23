# Fact-check: self-host/reference/running/requirements.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Node 24 image; Postgres 16 and 18 in CI; bundled `postgres:18`. | `Dockerfile:2`; `ci.yml:20`; `compose.yaml` | writer, 2026-11-23 | holds |
| Capabilities of the worker host. | `compose.yaml:109-112` | writer, 2026-11-23 | holds |
| S3 requests and timeouts. | `storage.ts:30,38-50` | writer, 2026-11-23 | holds |
| 2 GB. | `docs/self-hosting.md`; sizing | writer, 2026-11-23 | carried |
