# Fact-check: administer/how-to/access/let-an-agent-run-a-script

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Offer dialog | `apps/console/src/screens/OfferToAgent.tsx` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Connect rule | `apps/control-plane/src/routes/mcp.ts:783-828` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Run: workspace-wide agent_runner refused 403; with viewer lists tools | `docs/documentation/runs/administer/how-to/access/let-an-agent-run-a-script.md` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Offer to an agent… is on the script's code editor and the flow page, not the script's own page | `apps/console/src/screens/Authoring.tsx:857; Flows.tsx:455; Execution.tsx:349` | second agent, 2026-11-23 | corrected the step; confirmed in the browser |
| Offer dialog texts; 'This tenant has none yet.' | `apps/console/src/screens/OfferToAgent.tsx` | second agent, 2026-11-23 | corrected the empty text |
| agent_runner for the whole workspace does not let an account connect | `apps/control-plane/src/routes/mcp.ts`; run | second agent, 2026-11-23 | holds today. fault fixed (fa): agent_runner for the whole workspace now connects (mcp.ts mayStartHere, three sites), confirmed in the code; the "does not let it connect" bullet is replaced |
| Agent connects and runs run_hello; Try answers | MCP route; run | second agent, 2026-11-23 | confirmed with a service-account key (200 on tools/list and tools/call) |
