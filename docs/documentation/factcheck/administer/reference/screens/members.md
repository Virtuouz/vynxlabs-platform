# Fact-check: administer/reference/screens/members

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Tabs Members, Groups, Roles, Access, Access changes; address slugs incl. `releases` | `apps/console/src/screens/Members.tsx:20-26` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Roles column: No access / Through groups only / N given directly | `apps/console/src/screens/Members.tsx:166-171` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| 50 per page, Load more; `?q=`, `?member=` | `apps/console/src/screens/Members.tsx:174-190` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Inspector buttons View access, Make a password reset link, Suspend/Resume, Remove; confirm texts | `apps/console/src/screens/Members.tsx:199-306` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Add member fields; 20 role pairs; password 12-128 | `apps/console/src/screens/Members.tsx:380-460; apps/control-plane/src/routes/tenants.ts:700-712` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Reset link: once, 2 hours, mailed or shown once, tenant-admin limits, refusals | `apps/control-plane/src/kernel/member-reset.ts:11-90; apps/control-plane/src/routes/member-resets.ts:30-70; apps/console/src/kit/MemberResetLink.tsx:30-80` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Suspend ends sessions; Remove deletes bindings, group memberships, identity links, SCIM record | `apps/control-plane/src/routes/tenants.ts:768-880` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Last-admin refusal text | `apps/control-plane/src/kernel/administer.ts:57-69` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| View access: sources, 'not while suspended', Find or check a permission, Allowed/Denied texts | `apps/console/src/screens/Access.tsx:60-321` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| View access needs binding:read or self | `apps/control-plane/src/routes/access.ts:99-103` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Run on instance 2026-11-23: members list, inspector buttons, reset link emailed, approval and direct bindings | `docs/documentation/runs/administer/reference/screens/members.md` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Denied texts of View access | `apps/console/src/screens/Access.tsx:205-225` | second agent, 2026-11-23 | corrected: second sentences added; confirmed on screen |
| Add member dialog, Remove title, reset link dialogs, suspend dialogs | `Members.tsx`, `MemberResetLink.tsx` | second agent, 2026-11-23 | holds; driven in the browser, 390 px and dark walked |
