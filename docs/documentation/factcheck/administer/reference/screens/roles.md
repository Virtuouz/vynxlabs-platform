# Fact-check: administer/reference/screens/roles

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Filters, columns, tags | `apps/console/src/screens/Roles.tsx (Roles)` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Name pattern, 63, description 500 | `apps/control-plane/src/routes/permissions.ts:44,183` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Picker texts, explicit kinds, app-facing label | `apps/console/src/screens/Roles.tsx (PermissionPicker)` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Delete disabled while held | `apps/console/src/screens/Roles.tsx (Inspector footer)` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| role:write | `apps/control-plane/src/routes/permissions.ts:174,250,301` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| A taken name refused at the field | run; `permissions.ts:181-195` | second agent, 2026-11-23 | corrected: notice above the buttons |
| List, inspector, picker texts | `apps/console/src/screens/Roles.tsx` | second agent, 2026-11-23 | holds; run |
