# Fact-check: self-host/how-to/running/run-a-standalone-worker.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `POST /tenants/<id>/worker-credentials` with `name`, `pool`, `workspaceId`; needs `worker:write`; the token is returned. | openapi; run: 201 with `token` | writer, 2026-11-23 | holds |
| Flags `--token-file`, `--token-stdin`, `--url`, `--token`, `--concurrency`, `--idle-exit`. | `packages/worker/src/bin.ts:23-36` | writer, 2026-11-23 | holds |
| Compose file: secret `worker_token`, `read_only`, healthcheck on `volvel-worker-alive` under 90 s. | `deploy/worker/compose.yaml` | writer, 2026-11-23 | holds; run: healthy |
| The worker lists with `managed: false`. | run: `GET /tenants/<id>/workers` | writer, 2026-11-23 | holds |
| The log says "worker started". | run | writer, 2026-11-23 | holds |
| The run used an added `networks:` block to join the instance's network. | run log | writer, 2026-11-23 | a variation, not on the page |

## Second check (2026-11-23)

Run: credential with pool `plant`, worker from deploy/worker/compose.yaml (with a networks block), a draft script with `worker: "plant"` run through test-runs succeeded while the worker was up and stayed queued with the worker stopped. Merged in from the sso page: token options, uid 1000 note, ptrace warning. fault: sso/workers TASKS_SINCE (worker shows outdated at its own version).
