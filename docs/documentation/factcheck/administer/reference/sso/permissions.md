# Fact-check record: administer/reference/sso/permissions

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| sso, portal, domain, worker, audit verbs | `packages/manifest/src/permissions.ts:180` | writer, code only, 2026-11-23 | holds (not run) |
| export:write | `packages/manifest/src/permissions.ts:67` | writer, code only, 2026-11-23 | holds (not run) |
| default role needs binding:write; group mapping needs group:write | `apps/control-plane/src/routes/sso.ts:278` | writer, code only, 2026-11-23 | holds (not run) |
| Can notice words | `apps/console/src/kit/Can.tsx:187` | writer, code only, 2026-11-23 | holds (not run) |
