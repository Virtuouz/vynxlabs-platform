# Fact-check record: administer/how-to/sso/provision-people-with-scim

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| SCIM base address | `apps/console/src/screens/Provisioning.tsx:109` | writer, run, 2026-11-23 | holds |
| Token made once | `apps/console/src/screens/Provisioning.tsx:85` | writer, run, 2026-11-23 | holds |
| Expiry choices | `apps/console/src/kit/expiry.ts:13` | writer, code only, 2026-11-23 | holds (not run) |
| How pushes are taken | `apps/console/src/screens/Provisioning.tsx:205` | writer, run, 2026-11-23 | holds |
| Groups from | `apps/console/src/screens/Provisioning.tsx:235` | writer, run, 2026-11-23 | holds |
| Saved toast | `apps/console/src/screens/Provisioning.tsx:91` | writer, run, 2026-11-23 | holds |
| What has been pushed | `apps/console/src/screens/Provisioning.tsx:249` | writer, run, 2026-11-23 | holds |
| Never deletes an account | `apps/console/src/screens/Provisioning.tsx:263` | writer, run, 2026-11-23 | holds |
| Revoke dialog | `apps/console/src/screens/Provisioning.tsx:179` | writer, run, 2026-11-23 | holds |
| Refused pushes explanation | `apps/console/src/screens/Provisioning.tsx:388` | writer, run, 2026-11-23 | holds |
| Member added with default role | `apps/control-plane/src/kernel/sso/scim.ts:740` | writer, code only, 2026-11-23 | holds (not run) |
| scim audit actions | `packages/manifest/src/audit.ts:184` | writer, code only, 2026-11-23 | holds (not run) |
| Paused blocks pushes | `apps/control-plane/src/kernel/sso/scim.ts:124` | writer, code only, 2026-11-23 | holds (not run) |
