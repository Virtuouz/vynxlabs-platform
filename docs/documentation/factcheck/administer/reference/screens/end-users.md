# Fact-check: administer/reference/screens/end-users

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Columns, status rule, search, 50 per page | `apps/console/src/screens/EndUsers.tsx:100-400` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Links: invite 7 days, reset 2 hours | `apps/control-plane/src/kernel/endusers.ts:10-11` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Attributes: name pattern, 500 | `apps/control-plane/src/routes/endusers.ts:311-312` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Group dialogs | `apps/console/src/screens/Groups.tsx:385-684` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Sign-up switch label | `apps/console/src/screens/Branding.tsx:557` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Invite, inspector buttons, Attributes, Groups tab, link dialogs, statuses | `apps/console/src/screens/EndUsers.tsx`, `Groups.tsx` | second agent, 2026-11-23 | holds; driven in the browser (Rename, Delete not run) |
| Attribute name refused at the field | run | second agent, 2026-11-23 | partly: only a repeated name is refused at the field; a bad name is refused after Save in a notice. fault: instance (raw path in the notice, new) |
