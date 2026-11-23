# Fact-check: self-host/how-to/running/run-a-standalone-worker.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `POST /tenants/<id>/worker-credentials` with `name`, `pool`, `workspaceId`; needs `worker:write`; the token is returned. | openapi; run: 201 with `token` | writer, 2026-11-23 | holds |
| Flags `--token-file`, `--token-stdin`, `--url`, `--token`, `--concurrency`, `--idle-exit`. | `packages/worker/src/bin.ts:23-36` | writer, 2026-11-23 | holds |
| Compose file: secret `worker_token`, `read_only`, healthcheck on `volvel-worker-alive` under 90 s. | `deploy/worker/compose.yaml` | writer, 2026-11-23 | holds; run: healthy |
| The worker lists with `managed: false`. | run: `GET /tenants/<id>/workers` | writer, 2026-11-23 | holds |
| The log says "worker started". | run | writer, 2026-11-23 | holds |
| The run used an added `networks:` block to join the instance's network. | run log | writer, 2026-11-23 | a variation, not on the page |
