# Fact-check: administer/how-to/access/manage-groups

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps | `apps/console/src/screens/Groups.tsx` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| principal_in_use | `apps/control-plane/src/kernel/tenant/releases.ts:436-460` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Create group, Members, Give access flow, Rename keeps the key, Sign-in values, 50 values, Delete text | `apps/console/src/screens/Groups.tsx:60-340`; `apps/control-plane/src/routes/tenants.ts:106` | second agent, 2026-11-23 | holds; run in the browser |
| Take out | `apps/console/src/screens/Groups.tsx:135-150` | second agent, 2026-11-23 | corrected: asks 'Take <email> out of <group>?' first |
