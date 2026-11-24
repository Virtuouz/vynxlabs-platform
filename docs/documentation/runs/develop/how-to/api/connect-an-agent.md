# Run log: develop/how-to/api/connect-an-agent.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- Made the service account `api-docs-agent`, bound `agent_runner` at `hooks/echo`, made a key. `GET …/service-accounts/<id>/tools?workspace=<api-docs>`: `address` `…/workspaces/<w>/mcp`, `reachable: true`, one tool `run_hooks__echo` with `idempotencyKey` in its schema and an `outputSchema`.
- JSON-RPC with curl: `initialize` 200 (protocol 2025-06-18, `serverInfo` name `platform:api-docs`); `tools/list` 200 with `run_hooks__echo`, `get_run`, `get_flow_run`; `tools/call` `run_hooks__echo` `{hello: agent, idempotencyKey: mcp-1}`: 200, `structuredContent` `{runId, script, status: succeeded, output: {got: {hello: agent}}}`; the same key again: the same `runId`.
- `GET` of the address: 404. `POST` with no key: 401 "Send an API key to use this workspace's tools."

## The page got wrong (and was corrected)
- The inventory gives the console's call route as `…/tools/call`; the code gives `POST …/service-accounts/<id>/tool-calls`. The page names it only in the permissions line.
- The server calls itself `platform:<slug>` (see the report).

## Second check (2026-11-23, second agent)

The instance was http://localhost:8091 (a tenant of my own, `api-check2`, with a workspace `agent-ws`; keys and tokens revoked at the end).

- Run now: the console's Agent tools tab (address, settings, Tools offered, Try → "Try <tool>", Call it) at 1440, 390 and dark; `list_approvals` and `decide_approval`; a flow tool; a service account with `workspace:read`; `reachable: false`.
- Not run: nothing from the list.

The console key screen, the Agent tools tab and Members & access were walked at 1440 px, at 390 px and in dark (the key screen: create, one-time key, revoke; Agent tools: workspace choice, address, settings, Tools offered, Try): no overflow at 390 px, the settings block scrolls inside itself, dark has no contrast fault.

## Not run (before the second check)

The console's **Agent tools** tab and **Try**, `list_approvals` and `decide_approval`, a flow tool, a service account with `workspace:read`, `reachable: false`.
