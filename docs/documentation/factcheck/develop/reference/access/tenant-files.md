# Fact-check: develop/reference/access/tenant-files

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Schemas | `packages/manifest/src/tenant.ts:17-175, 291-345` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Kinds, folders, fields, limits | `packages/cli/src/access.ts`; `apps/control-plane/src/routes/access-releases.ts` | second agent, 2026-11-23 | checked against the source by a text match (a few quoted texts are built from templates); fault: access (`title` refused on role and binding files) |
