# Fact-check: administer/explanation/access/how-access-works

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Check order, scopes, suspended, anonymous | `apps/control-plane/src/kernel/authorize.ts:107-215` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Built-in roles | `apps/console/src/builtinRoles.ts` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Built-in roles' permissions | `GET /tenants/<id>/roles` on the instance | second agent, 2026-11-23 | corrected: developer also holds `data_all:write`; the rest holds (agent_runner, viewer, portal_*, app_maintainer, doc_writer, deployer, tenant_admin) |
