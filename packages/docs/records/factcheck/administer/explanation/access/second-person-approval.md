# Fact-check: administer/explanation/access/second-person-approval

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| What waits (run) | `packages/docs/records/runs/administer/explanation/access/second-person-approval.md` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Rules | `apps/control-plane/src/kernel/tenant/releases.ts:1100-1160` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| What waits and what applies at once; refusals | `apps/control-plane/src/routes/access-releases.ts`; Access changes tab on the instance | second agent, 2026-11-23 | holds; the tab was driven in the browser |
