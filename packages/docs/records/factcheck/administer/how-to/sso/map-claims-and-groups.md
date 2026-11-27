# Fact-check record: administer/how-to/sso/map-claims-and-groups

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Claims fields, empty uses usual | `apps/console/src/screens/SingleSignOn.tsx:1159` | second agent, run, 2026-11-23 | holds |
| Dotted names | `apps/control-plane/src/kernel/sso/claims.ts:4` | second agent, code, 2026-11-23 | holds |
| Groups up to 1000 | `apps/control-plane/src/kernel/sso/claims.ts:33` | second agent, code, 2026-11-23 | holds |
| OIDC usual names | `apps/control-plane/src/kernel/sso/oidc.ts:148` | second agent, code, 2026-11-23 | holds |
| SAML usual names | `apps/control-plane/src/kernel/sso/saml.ts:235` | second agent, code, 2026-11-23 | holds |
| Groups: exactly the listed | `apps/console/src/screens/SingleSignOn.tsx:633` | second agent, run, 2026-11-23 | holds |
| Saved toast | `apps/console/src/screens/SingleSignOn.tsx:623` | second agent, run, 2026-11-23 | holds |
| Access change rows | `apps/console/src/screens/SingleSignOn.tsx:645` | second agent, code, 2026-11-23 | holds |
| Attributes max 50 | `apps/control-plane/src/kernel/sso/providers.ts:327` | second agent, code, 2026-11-23 | holds |
| Attributes hint | `apps/console/src/screens/SingleSignOn.tsx:1175` | second agent, code, 2026-11-23 | holds |
| User-info option | `apps/console/src/screens/SingleSignOn.tsx:1153` | second agent, code, 2026-11-23 | holds |
| No groups notice | `apps/console/src/screens/SingleSignOn.tsx:721` | second agent, code, 2026-11-23 | holds |
