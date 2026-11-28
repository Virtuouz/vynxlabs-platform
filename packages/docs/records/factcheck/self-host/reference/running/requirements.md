# Fact-check: self-host/reference/running/requirements.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Node 24 image; Postgres 16 and 18 in CI; bundled `postgres:18`. | `Dockerfile:2`; `ci.yml:20`; `compose.yaml` | writer, 2026-11-23 | holds |
| Capabilities of the worker host. | `compose.yaml:109-112` | writer, 2026-11-23 | holds |
| S3 requests and timeouts. | `storage.ts:30,38-50` | writer, 2026-11-23 | holds |
| 2 GB. | `docs/self-hosting.md`; sizing | writer, 2026-11-23 | carried |

## Second check (2026-11-23)

Every claim read against the code and matched; commands and messages were also run in the drill (see the run log).

## Changed on 2026-11-28: the first release (0.6.0)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The image `volvel/volvel:0.6.0` (and `latest`) is on Docker Hub from 0.6.0. | `.github/workflows/release.yml` (build step, `tags:`) | writer, 2026-11-28 | holds |
