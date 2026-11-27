# Run log: develop/how-to/api/start-a-run-from-a-webhook.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- In the dev workspace `api-docs` (triggers not paused): secret `HOOK_SECRET` (`POST secrets`), script `hooks/echo` and trigger `hooks/orders` (drafts, `create: true`), then `POST changes/deploy`. `GET triggers` gave `url` ending `/api/v1/hooks/vxh_…`.
- `sign.mjs` (the page's script, HMAC-SHA256 hex of `<timestamp>.<body>` with `sha256=`): 202 `{runId}`; the run succeeded with `trigger: {type: webhook, trigger: hooks/orders}`, `input` the body, `output {got: …}`, `idempotencyKey: order-A-1001`. Sent twice: the same `runId`.
- Timestamp 600 seconds old: 401 `signature_invalid` "The request's timestamp is too far from now." Wrong secret: 401 "The signature does not match." No headers: 401 "The X-Signature header is missing." Unknown token: 404 "The webhook was not found." Paused by batch: 503 `trigger_paused`.

## The page got wrong (and was corrected)
- None found in this run.

## Second check (2026-11-23, second agent)

The instance was http://localhost:8091 (a tenant of my own, `api-check2`, with a workspace `agent-ws`; keys and tokens revoked at the end).

- Run now: `respond: flow`, a form body, a text body, `hmac-sha1` and `base64`, `workspace_paused`, a missing timestamp header.
- Not run: nothing from the list.

The console key screen, the Agent tools tab and Members & access were walked at 1440 px, at 390 px and in dark (the key screen: create, one-time key, revoke; Agent tools: workspace choice, address, settings, Tools offered, Try): no overflow at 390 px, the settings block scrolls inside itself, dark has no contrast fault.

## Not run (before the second check)

`respond: flow`, a form or text body, `hmac-sha1` and `base64`, `workspace_paused`, a missing timestamp header ("…is missing or is not a time." is from the code).
