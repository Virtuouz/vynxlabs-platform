# Fact-check record: develop/how-to/api/connect-an-agent.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The address is `/api/v1/tenants/<t>/workspaces/<w>/mcp`; `POST` only, stateless, JSON-RPC; a `GET` is 404. | `routes/mcp.ts:784-880`; run (GET: 404) | pending | pending |
| No key: 401 "Send an API key to use this workspace's tools." | `routes/mcp.ts:815-820`; run | pending | pending |
| Connecting needs `workspace:read` or a binding to a script or flow in the workspace. | `routes/mcp.ts:824-827,640-650` | pending | pending |
| `GET /tenants/:t/service-accounts/:id/tools?workspace=` answers `address`, `reachable`, `tools`; needs `service_account:read`. | `routes/mcp.ts:599-668`; run | pending | pending |
| `POST …/tool-calls` tries a tool; needs `service_account:write`. | `routes/mcp.ts:676-760` | pending | pending |
| The console tab is **Agent tools**; it has **In the workspace**, **Copy the address**, **Copy the settings**, **Tools offered**, **Try**; the settings use `mcpServers`/`volvel`/`type: http`. | `apps/console/src/screens/Tenant.tsx:1120-1124`; `AgentAccess.tsx:45-135` | pending | pending |
| Tool names `run_<path>` and `start_<path>`, `/` as `__`, `-` as `_`, at most 64 characters; 200 tools at most. | `packages/manifest/src/bundle.ts:32-35`; `routes/mcp.ts:42,288,353`; run (`run_hooks__echo`) | pending | pending |
| Script tools need `run:write`; flow tools need a manual trigger and `flow_run:write`. | `routes/mcp.ts:276-345` | pending | pending |
| `idempotencyKey` argument, with underscores before it if taken; repeat returns the first run. | `routes/mcp.ts:98-130,302`; run | pending | pending |
| `get_run`, `get_flow_run` (own runs, else run:read / flow_run:read), `list_approvals` (approval:read), `decide_approval` (approval:write, rejection needs a comment). | `routes/mcp.ts:431-540`; `packages/manifest/src/bundle.ts:38` | pending | pending |
| A tool waits 25 seconds, then answers the run ID. | `routes/mcp.ts:40-41` | pending | pending |
| Tools are worked out per request. | `routes/mcp.ts:832-835` | pending | pending |
| A renamed tool: "Renamed: call <name> instead. This name stops working on <date>." | `routes/mcp.ts:425` | pending | pending |
| `initialize` answers serverInfo `platform:<slug>`. | run (see report: product wording) | pending | pending |
