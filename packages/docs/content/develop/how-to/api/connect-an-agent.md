---
title: Connect an agent to a workspace
description: Give an agent a service account's key, point it at the workspace's tool address, list its tools and call one, over the Model Context Protocol.
subjects: [api, agents]
---

## Connect an agent to a workspace

By the end an agent, or a script that speaks the Model Context Protocol, will have listed the tools of a workspace and started a script through one of them.

## Before you start

- A service account for the agent, with an API key, and a role that lets it start what you want it to start: `agent_runner` at one script or flow, or `workspace:read` in the workspace and a role that holds `run:write` or `flow_run:write`. To connect at all, the account needs `workspace:read` in the workspace, or a binding to a script or flow in it. See [Call the API with an API key](call-the-api-with-a-key) and the [service accounts screen](../../../administer/reference/screens/service-accounts).
- To make the setting for the agent, you need `service_account:read` on the tenant. To try a tool from the console you need `service_account:write`.
- The workspace has a deployed script. The example uses a script `hooks/echo` that returns what it is given.

## Connect

:::steps
1. Get the address and see the tools the account would be offered. Open the account's **Agent tools** tab and choose the workspace under **In the workspace**: the tab shows the address (**Copy the address**), the settings for an agent (**Copy the settings**) and the **Tools offered**, each with a **Try** button. Through the API:

   ```bash
   curl -s -H "authorization: Bearer $VOLVEL_KEY" \
     "$VOLVEL_URL/api/v1/tenants/$TENANT/service-accounts/$ACCOUNT/tools?workspace=$WORKSPACE"
   ```

   The answer has `address`, `reachable` (false when the account may not connect to the workspace at all) and the `tools`.
2. Put the address and one of the account's keys in the agent's settings. For an agent that reads `mcpServers`:

   ```json
   {
     "mcpServers": {
       "volvel": {
         "type": "http",
         "url": "<address>",
         "headers": { "Authorization": "Bearer <one of this account's API keys>" }
       }
     }
   }
   ```

   The address is `/api/v1/tenants/<tenant id>/workspaces/<workspace id>/mcp` on the instance.
3. To speak to it by hand, send JSON-RPC with `POST` to the address. Each request stands alone: there is no session to open or close.

   ```bash
   MCP="$VOLVEL_URL/api/v1/tenants/$TENANT/workspaces/$WORKSPACE/mcp"
   curl -s -X POST "$MCP" \
     -H "authorization: Bearer $SERVICE_KEY" -H 'content-type: application/json' \
     -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

4. Call a tool.

   ```bash
   curl -s -X POST "$MCP" \
     -H "authorization: Bearer $SERVICE_KEY" -H 'content-type: application/json' \
     -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"run_hooks__echo","arguments":{"hello":"agent","idempotencyKey":"mcp-1"}}}'
   ```

   ```json
   { "runId": "01a20a4c-420e-7570-96be-c43f7282f577", "script": "hooks/echo", "status": "succeeded", "output": { "got": { "hello": "agent" } } }
   ```

   The run is in `structuredContent` of the answer, and as text in `content`. Send the same call again with the same `idempotencyKey` and the first run comes back.
:::

## What an agent is offered

- A tool for each script the account may start, named `run_` and the script's path with `/` as `__` and `-` as `_` (`hooks/echo` is `run_hooks__echo`), and a tool for each flow with a manual trigger it may start, named `start_` the same way. A script or flow may name its own tool. Up to 200 are offered, and a name is at most 64 characters.
- A script's tool takes the script's own input schema. A flow's takes what its manual trigger declares. Each also takes an optional `idempotencyKey` (or the same name with underscores before it, when the script already uses that name).
- `get_run` and `get_flow_run` read a run the agent started, or any run in the workspace when the account holds `run:read` or `flow_run:read`.
- `list_approvals` and `decide_approval` are there when the account holds `approval:read` and `approval:write`. A rejection needs a comment.
- The tools are worked out for each request from what the account may do now, so a change of its roles shows on the next call.
- A tool waits up to 25 seconds for its run to end, then answers with the run ID. A flow that is still running says so, and the agent reads it later with `get_flow_run`.
- A run or approval of another person is masked as it is on screen. The account's own are given as they are.

Everything an agent does is the same as the API route that does it, with the same permission checks and the same audit log. The agent starts runs as the service account.

## The result

The agent lists the tools, and its calls start runs that you can see in the workspace's run list, started by the service account.

## If it does not work

- **401 "Send an API key to use this workspace's tools."** The request had no key.
- **403 or `reachable: false`.** The account has no `workspace:read` in the workspace and no binding to a script or flow in it. Give it a role: see the [access reference](../../../administer/reference/screens/access).
- **404 on a `GET` of the address.** The route takes `POST` only: no `GET`, and no server-sent events.
- **A tool is missing.** The account may not start that script or flow. Bind the `agent_runner` role to the account at that script or flow.
- **A tool answers `isError`.** The call was refused or the run failed. The text says why. A refusal is the account's, not the agent's.
- **A renamed script's tool says "Renamed: call `<new name>` instead."** The old name keeps working until the date it gives.
