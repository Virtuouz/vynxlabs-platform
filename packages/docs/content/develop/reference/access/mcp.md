---
title: The MCP endpoint
description: "The Model Context Protocol endpoint of a workspace: how an agent connects, the tools it is offered, their names and limits."
subjects: [access, agents]
---

A workspace has an endpoint for agents that speak the Model Context Protocol. An agent connects with an API key, usually a service account's, and is offered the scripts and flows the key may start, plus tools to read runs and decide approvals.

## Endpoint

```text
POST /api/v1/tenants/<tenant-id>/workspaces/<workspace-id>/mcp
```

Streamable HTTP, with no session: each request stands alone. Authenticate with `Authorization: Bearer <key>`. The service account's **Agent tools** tab shows the address and the settings (see [Service accounts](../../../administer/reference/screens/service-accounts)). A request with no key is refused with 401: "Send an API key to use this workspace's tools."

To connect, the key needs `workspace:read` in the workspace, a binding to a script or flow in it (what **Offer to an agent…** gives, with the role `agent_runner`), or `run:write` or `flow_run:write` for the whole workspace, which `agent_runner` given there holds. With a binding to single scripts or flows, the agent is offered those alone. With `agent_runner` for the whole workspace, it is offered what it may start and reads nothing else of the workspace.

## Tools

| Tool | Offered when | What it does |
| --- | --- | --- |
| `run_<path>` | The key may start the script. | Runs the script with its own input schema. |
| `start_<path>` | The key may start the flow, and it has a manual trigger. | Starts the flow with the input its manual trigger declares. |
| `get_run` | Always. | Reads a run: status, and output or error once ended. Takes `runId`. |
| `get_flow_run` | Always. | Reads a flow run. Takes `flowRunId`. A flow can wait a long time for an approval. |
| `list_approvals` | The key holds `approval:read`. | Lists what is waiting for a person's approval in the workspace. |
| `decide_approval` | The key holds `approval:write`. | Approves or rejects a waiting approval. Takes `flowRunId`, `node`, `decision` (`approve` or `reject`) and `comment` (2000 characters at most). A rejection needs a comment. |

### Names

A tool's name is made from the resource's path: `run_` or `start_`, then the path with `/` written `__` and `-` written `_`, cut to 64 characters. An author can choose another with `mcp: { name }` in `defineScript` or `defineFlow`. The names `get_run`, `get_flow_run`, `list_approvals` and `decide_approval` are reserved.

### Limits

| Limit | Value |
| --- | --- |
| Tools offered | 200 scripts and flows at most, besides the fixed tools. |
| Wait for a run | 25 seconds. A run still going then answers with its `runId`, and the agent calls `get_run`. |
| `idempotencyKey` | An optional argument on `run_` and `start_` tools, 1 to 200 characters. The same key answers with the first run instead of starting another. If the input already has that name, the argument is written with underscores before it. |

## Who sees what

Another person's run, flow run or waiting approval is masked as it is on screen. The caller's own are given as they are. `decide_approval` is refused for a step with named approvers the key is not among, and a service account's decision is listed under its name. An agent's calls are in the audit log with `via: "mcp"`. **Try** on the **Agent tools** tab logs `service_account.tool_tried` against the member who pressed it.

## Related

- [Let an agent run a script](../../../administer/how-to/access/let-an-agent-run-a-script).
- [The API reference](../api/index).
