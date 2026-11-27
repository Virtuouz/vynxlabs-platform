# Fact-check: develop/reference/access/mcp

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Tools, limits | `apps/control-plane/src/routes/mcp.ts:40-42,425-540,783-828` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Names | `packages/manifest/src/bundle.ts:31-55` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Endpoint, 401 text, 403 'This needs the workspace:read permission.', tools, limits | `apps/control-plane/src/routes/mcp.ts:838` | second agent, 2026-11-23 | holds; 401 and tools/list, tools/call confirmed on the instance. fault fixed (fa): the server names itself `volvel:<slug>`, and `agent_runner` at the whole workspace connects (`routes/mcp.ts`), confirmed in the code; the page now says the second |
