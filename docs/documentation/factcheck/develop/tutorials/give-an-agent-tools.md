# Fact-check record: develop/tutorials/give-an-agent-tools

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Service account tabs Identity, Keys, Access, Agent tools | `apps/console/src/screens/` (service account), run | writer, run | holds |
| **Offer to an agent…** is on a script's editor; dialog text | `apps/console/src/screens/OfferToAgent.tsx:25-75,249` | writer, run | holds |
| An offer gives the account the Agent runner role at that script alone | `OfferToAgent.tsx:25-28`, Access tab | writer, run | holds |
| API key: Name, Expires; shown once | run | writer, run | holds |
| Tool name `run_<path with / and - as _>`; plus `get_run`, `get_flow_run` | run (`tools/list`) | writer, run | holds |
| An unoffered tool answers "There is no tool …, or you may not use it." with `isError` | run | writer, run | holds |
| The MCP address is `/api/v1/tenants/<id>/workspaces/<id>/mcp` | Agent tools tab, run | writer, run | holds |
| **Try** makes a real call as the account | dialog text, run | writer, run | holds |
