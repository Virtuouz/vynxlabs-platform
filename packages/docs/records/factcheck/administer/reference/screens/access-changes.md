# Fact-check: administer/reference/screens/access-changes

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Statuses and origins | `apps/console/src/screens/AccessReleases.tsx:46-60` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Actions and dialog texts | `apps/console/src/screens/AccessReleases.tsx:150-420` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| approval_needs_two, own_release, release_stale, service account cannot decide | `apps/control-plane/src/routes/access-releases.ts:186-198; apps/control-plane/src/kernel/tenant/releases.ts:1100-1160` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Decline comment 1000 | `apps/control-plane/src/routes/access-releases.ts:412` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Withdraw by asker needs no permission | `apps/control-plane/src/routes/access-releases.ts:420-437` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Run: approve, decline (Superseded), withdraw, own_release | `packages/docs/records/runs/administer/reference/screens/access-changes.md` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Ask/Stop asking, Withdraw, Go back dialogs, waiting row texts | `apps/console/src/screens/AccessReleases.tsx` | second agent, 2026-11-23 | holds; run in the browser |
