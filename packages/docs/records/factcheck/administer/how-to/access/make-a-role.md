# Fact-check: administer/how-to/access/make-a-role

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps | `apps/console/src/screens/Roles.tsx` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Name rule | `apps/control-plane/src/routes/permissions.ts:44` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Create role sheet, picker, Create role disabled with no permission, notice text | `apps/console/src/screens/Roles.tsx:60-140,290-400` | second agent, 2026-11-23 | holds; run in the browser |
| A taken name is refused at the field | `apps/control-plane/src/routes/permissions.ts:181-195`; run | second agent, 2026-11-23 | corrected: refused in a notice above the buttons ('This tenant already has a role named <name>.'); only the pattern is refused at the field |
| Delete off while held, text on Delete | `apps/console/src/screens/Roles.tsx:520-560` | second agent, 2026-11-23 | holds; corrected with the tooltip text and the confirmation 'The role <name> is deleted. Nobody holds it.' |
