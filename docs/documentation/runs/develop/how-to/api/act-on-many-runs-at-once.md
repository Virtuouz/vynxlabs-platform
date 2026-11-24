# Run log: develop/how-to/api/act-on-many-runs-at-once.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- `runs/batch` `rerun` with one run and one fake ID: 200, `done: 1`, `failed: 1`; result 1 `ok`, status 201, `runId`; result 2 404 "The run was not found." with `requestId`. `action: stop`: 400 `validation_failed`.
- `trigger-pauses/batch` `paused: true` with `hooks/orders` and `hooks/nope`: 204 and 404 "That trigger was not found."; the webhook then answered 503 `trigger_paused`; `paused: false`: 204.
- `flow-runs/batch` `cancel` of a finished flow run: 409 "The flow run already succeeded."
- `drafts/batch-discard` of `nothing/here`: 404 "A draft at nothing/here was not found."

## The page got wrong (and was corrected)
- The inventory names the routes ("runs, flow-runs, …") without their actions; the page gives each route's actions from the code (the runs batch cancels or runs again, it does not start).

## Second check (2026-11-23, second agent)

The instance was http://localhost:8091 (a tenant of my own, `api-check2`, with a workspace `agent-ws`; keys and tokens revoked at the end).

- Run now: `approvals/batch`, `drafts/batch`, a batch over 100 items, a service account's key on a batch.
- Not run: nothing from the list.

The console key screen, the Agent tools tab and Members & access were walked at 1440 px, at 390 px and in dark (the key screen: create, one-time key, revoke; Agent tools: workspace choice, address, settings, Tools offered, Try): no overflow at 390 px, the settings block scrolls inside itself, dark has no contrast fault.

## Not run (before the second check)

`approvals/batch`, `drafts/batch`, a batch over 100 items, a service account's key on any batch.
