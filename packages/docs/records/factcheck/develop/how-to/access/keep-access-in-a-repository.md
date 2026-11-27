# Fact-check: develop/how-to/access/keep-access-in-a-repository

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Files and flags | `packages/cli/src/access.ts; packages/manifest/src/tenant.ts` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Run: plan, release, approve, rollback, approval | `packages/docs/records/runs/develop/how-to/access/keep-access-in-a-repository.md` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| CLI texts incl. 'Nothing changed yet...' | `packages/cli/src/access.ts:168` | second agent, 2026-11-23 | holds; the writer's run kept. fault fixed (fa): role and binding bodies take `title` (set aside on reading) and a schema refusal names the file (`manifest/tenant.ts`), confirmed in the code; the page now says so |
