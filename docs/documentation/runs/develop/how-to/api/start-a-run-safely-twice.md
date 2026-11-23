# Run log: develop/how-to/api/start-a-run-safely-twice.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- `POST runs` for `appointments/free-times` in Sandbox with `idempotencyKey: api-docs-3`: first 201, second 200, same `id`. Same key with `clinic: hilltop` and another date: 200, same run. The run later `succeeded`; `GET runs/<id>` shows `idempotencyKey`.
- A key `api-docs-1` for `core/table-read` (first run failed on a missing declared table use; unrelated) also answered 201 then 200.
- `POST flow-runs` for `billing/chase-unpaid` with `idempotencyKey: api-docs-f1`: 201, `status: running`. The repeat of a flow run was not sent.
- A signed webhook delivery with `idempotency-key: order-A-1001` sent twice: both 202 with the same `runId`.
- MCP `tools/call` `run_hooks__echo` with `idempotencyKey: mcp-1`, then again with other arguments: the same `runId`.

## The page got wrong (and was corrected)
- None found in this run.

## Not run
The flow-run repeat (200), a rename between the two requests, a 400 for a key over 200 characters, a guest's 403.
