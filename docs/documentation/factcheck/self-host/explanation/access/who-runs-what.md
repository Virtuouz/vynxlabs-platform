# Fact-check: self-host/explanation/access/who-runs-what

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Grant rules | `apps/control-plane/src/routes/permissions.ts:660-740` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Last operator | `apps/control-plane/src/kernel/administer.ts` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Operator and tenant admin; grants 1 to 1440 minutes, reason 3 to 500 | `apps/console/src/screens/TenantPowers.tsx`; run | second agent, 2026-11-23 | holds; added the box 'Make me a member, as tenant admin' (`Tenants.tsx:192`) |
