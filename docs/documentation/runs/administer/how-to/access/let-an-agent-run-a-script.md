# Run: administer/how-to/access/let-an-agent-run-a-script

Instance http://localhost:8091 (Fernhill seeded), tenant `acc-main` made by the operator for this run; members acc-ann and acc-bob (tenant admins), acc-cy (viewer); commit 5ebf1c80 plus the working tree; 2026-11-23. Browser: Playwright, headless, 1440 px, light, signed in as acc-ann for the screens named; the rest through the API with the same session cookies. Not done: 768 and 390 px, dark, keyboard, reload.

Bound `agent_runner` to acc-agent at workspace acc-dev: `GET .../service-accounts/<id>/tools` answered `reachable:false`, and `tools/list` at the MCP address answered 403 "This needs the workspace:read permission." After binding `viewer` at the workspace too: `reachable:true`, and `tools/list` gave get_run, get_flow_run, list_approvals. No script or flow existed in the workspace, so no run_/start_ tool was listed or called, and Offer to an agent… and Try were not driven.
