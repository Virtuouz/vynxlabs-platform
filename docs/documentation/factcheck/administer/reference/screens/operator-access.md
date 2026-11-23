# Fact-check: administer/reference/screens/operator-access

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| List columns, End access | `apps/console/src/screens/Tenant.tsx:1300-1348` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Open operator access fields, durations, 1-1440 | `apps/console/src/screens/Tenant.tsx:120-215; apps/control-plane/src/routes/permissions.ts:683` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Strip and mark texts | `apps/console/src/kit/OperatorStrip.tsx:60-129` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Permissions | `apps/control-plane/src/routes/permissions.ts:643,742` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Access level choices; header mark | `apps/console/src/screens/TenantPowers.tsx` | second agent, 2026-11-23 | corrected: viewer (read only), developer, workspace_admin, tenant_admin; the mark reads 'Operator · ends in 1h' |
| An operator is not a member | `apps/console/src/screens/Tenants.tsx:192` | second agent, 2026-11-23 | corrected: unless made with 'Make me a member, as tenant admin' |
