# Fact-check record: develop/how-to/api/connect-an-agent.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The address is `/api/v1/tenants/<t>/workspaces/<w>/mcp`; `POST` only, stateless, JSON-RPC; a `GET` is 404. | `routes/mcp.ts:784-880`; run (GET: 404) | second agent, 2026-11-23 | checked |
| No key: 401 "Send an API key to use this workspace's tools." | `routes/mcp.ts:815-820`; run | second agent, 2026-11-23 | checked |
| Connecting needs `workspace:read` or a binding to a script or flow in the workspace. | `routes/mcp.ts:824-827,640-650` | second agent, 2026-11-23 | checked |
| `GET /tenants/:t/service-accounts/:id/tools?workspace=` answers `address`, `reachable`, `tools`; needs `service_account:read`. | `routes/mcp.ts:599-668`; run | second agent, 2026-11-23 | checked |
| `POST …/tool-calls` tries a tool; needs `service_account:write`. | `routes/mcp.ts:676-760` | second agent, 2026-11-23 | checked |
| The console tab is **Agent tools**; it has **In the workspace**, **Copy the address**, **Copy the settings**, **Tools offered**, **Try**; the settings use `mcpServers`/`volvel`/`type: http`. | `apps/console/src/screens/Tenant.tsx:1120-1124`; `AgentAccess.tsx:45-135` | second agent, 2026-11-23 | checked |
| Tool names `run_<path>` and `start_<path>`, `/` as `__`, `-` as `_`, at most 64 characters; 200 tools at most. | `packages/manifest/src/bundle.ts:32-35`; `routes/mcp.ts:42,288,353`; run (`run_hooks__echo`) | second agent, 2026-11-23 | checked |
| Script tools need `run:write`; flow tools need a manual trigger and `flow_run:write`. | `routes/mcp.ts:276-345` | second agent, 2026-11-23 | checked |
| `idempotencyKey` argument, with underscores before it if taken; repeat returns the first run. | `routes/mcp.ts:98-130,302`; run | second agent, 2026-11-23 | checked |
| `get_run`, `get_flow_run` (own runs, else run:read / flow_run:read), `list_approvals` (approval:read), `decide_approval` (approval:write, rejection needs a comment). | `routes/mcp.ts:431-540`; `packages/manifest/src/bundle.ts:38` | second agent, 2026-11-23 | checked |
| A tool waits 25 seconds, then answers the run ID. | `routes/mcp.ts:40-41` | second agent, 2026-11-23 | checked |
| Tools are worked out per request. | `routes/mcp.ts:832-835` | second agent, 2026-11-23 | checked |
| A renamed tool: "Renamed: call <name> instead. This name stops working on <date>." | `routes/mcp.ts:425` | second agent, 2026-11-23 | checked |
| `initialize` answers serverInfo `platform:<slug>`. | run (see report: product wording) | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run on the instance (`api-check2`/`agent-ws`, three service accounts: narrow `agent_runner` at one script, wide `workspace_admin` at the workspace, and `agent_runner` at the workspace): `tools` answer (`reachable` true/false), `initialize`, `tools/list`, a flow tool (`start_check__quick`, `start_check__open_ok`), a flow that fails (`isError`), `list_approvals`, `decide_approval` (reject without comment refused, approve, approve again refused), a step that names its approvers (hidden from the account; decide answers "Only the checkers group may decide this approval."), the 25-second wait (25.7 s, `status running` and a `note`), `POST …/tool-calls` (the console's Try), a tool hidden without `approval:write`.
- Corrected/added: `list_approvals` fields, `decide_approval` fields and refusals, the named-approvers rule, the running `note`, the Try dialog and the `tool-calls` route.
- fault fixed (fa): `agent_runner` for the whole workspace is enough to connect (`mayStartHere` in `routes/mcp.ts`), confirmed in the code; the page now says so and no longer sends the reader to one script or flow
- not a fault on the current build: the server names itself `volvel:<slug>` (`routes/mcp.ts`), confirmed in the code; the page never quoted the old name
