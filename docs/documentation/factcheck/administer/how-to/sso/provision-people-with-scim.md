# Fact-check record: administer/how-to/sso/provision-people-with-scim

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| SCIM base address | `apps/console/src/screens/Provisioning.tsx:109` | second agent, run, 2026-11-23 | holds |
| Token made once | `apps/console/src/screens/Provisioning.tsx:85` | second agent, run, 2026-11-23 | holds |
| Expiry choices | `apps/console/src/kit/expiry.ts:13` | second agent, code, 2026-11-23 | holds |
| How pushes are taken | `apps/console/src/screens/Provisioning.tsx:205` | second agent, run, 2026-11-23 | holds |
| Groups from | `apps/console/src/screens/Provisioning.tsx:235` | second agent, run, 2026-11-23 | holds |
| Saved toast | `apps/console/src/screens/Provisioning.tsx:91` | second agent, run, 2026-11-23 | holds |
| What has been pushed | `apps/console/src/screens/Provisioning.tsx:249` | second agent, run, 2026-11-23 | holds |
| Never deletes an account | `apps/console/src/screens/Provisioning.tsx:263` | second agent, run, 2026-11-23 | holds |
| Revoke dialog | `apps/console/src/screens/Provisioning.tsx:179` | second agent, run, 2026-11-23 | holds |
| Refused pushes explanation | `apps/console/src/screens/Provisioning.tsx:388` | second agent, run, 2026-11-23 | holds |
| Member added with default role | `apps/control-plane/src/kernel/sso/scim.ts:740` | second agent, code, 2026-11-23 | holds |
| scim audit actions | `packages/manifest/src/audit.ts:184` | second agent, code, 2026-11-23 | holds |
| Paused blocks pushes | `apps/control-plane/src/kernel/sso/scim.ts:124` | second agent, code, 2026-11-23 | holds |
