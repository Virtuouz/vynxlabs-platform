# Fact-check: administer/how-to/access/add-a-member

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Steps and texts | `apps/console/src/screens/Members.tsx` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Reset link rules | `apps/control-plane/src/kernel/member-reset.ts` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Run: acc-cy added with viewer; reset link emailed (mail-31) | `docs/documentation/runs/administer/how-to/access/add-a-member.md` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Add member dialog fields; the notice after adding | `apps/console/src/screens/Members.tsx:380-460` | second agent, 2026-11-23 | holds; driven in the browser |
| Reset link emailed text; mail file | `apps/console/src/kit/MemberResetLink.tsx`; mail-31 | second agent, 2026-11-23 | holds |
