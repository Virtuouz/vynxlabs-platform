# Fact-check: administer/how-to/access/invite-end-users

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps | `apps/console/src/screens/EndUsers.tsx` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Days | `apps/control-plane/src/kernel/endusers.ts:10` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Invite dialog, link dialog texts, 7-day link, 2-hour reset | `apps/console/src/screens/EndUsers.tsx:100-175`; mail file in mail-31 | second agent, 2026-11-23 | holds; run on the instance, mailed case seen in the mail file, unmailed case read from the code |
| Attribute refusals | `apps/console/src/screens/EndUsers.tsx` (Attributes); run | second agent, 2026-11-23 | corrected: a bad name is refused after Save in a notice, not at the field; a repeated name is refused at the field. fault: instance (raw '/body/attributes/<name>: is not a usable name' in the notice, new, see report) |
| Status Invited -> Active after the link is used, Last signed in | `apps/console/src/screens/EndUsers.tsx:103-109` | second agent, 2026-11-23 | holds; confirmed in the browser through /portal/<slug>/set-password |
