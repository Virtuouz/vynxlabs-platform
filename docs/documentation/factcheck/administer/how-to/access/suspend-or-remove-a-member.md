# Fact-check: administer/how-to/access/suspend-or-remove-a-member

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Behavior | `apps/control-plane/src/routes/tenants.ts:768-880` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Last admin | `apps/control-plane/src/kernel/administer.ts:57-69` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Suspend/Remove confirmations, Resume, View access 'not while suspended' | `apps/console/src/screens/Members.tsx` | second agent, 2026-11-23 | holds; run in the browser |
| You cannot suspend yourself; last-admin refusal | `apps/control-plane/src/routes/tenants.ts:785-790`; `kernel/administer.ts` | second agent, 2026-11-23 | holds; both answered by the instance (400, 409) |
| Remove deletes bindings, group memberships, links, SCIM record | `apps/control-plane/src/routes/tenants.ts:820-880` | second agent, 2026-11-23 | holds as read |
