# Fact-check record: administer/how-to/sso/map-claims-and-groups

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Claims fields, empty uses usual | `apps/console/src/screens/SingleSignOn.tsx:1159` | writer, run, 2026-11-23 | holds |
| Dotted names | `apps/control-plane/src/kernel/sso/claims.ts:4` | writer, code only, 2026-11-23 | holds (not run) |
| Groups up to 1000 | `apps/control-plane/src/kernel/sso/claims.ts:33` | writer, code only, 2026-11-23 | holds (not run) |
| OIDC usual names | `apps/control-plane/src/kernel/sso/oidc.ts:148` | writer, code only, 2026-11-23 | holds (not run) |
| SAML usual names | `apps/control-plane/src/kernel/sso/saml.ts:235` | writer, code only, 2026-11-23 | holds (not run) |
| Groups: exactly the listed | `apps/console/src/screens/SingleSignOn.tsx:633` | writer, run, 2026-11-23 | holds |
| Saved toast | `apps/console/src/screens/SingleSignOn.tsx:623` | writer, run, 2026-11-23 | holds |
| Access change rows | `apps/console/src/screens/SingleSignOn.tsx:645` | writer, code only, 2026-11-23 | holds (not run) |
| Attributes max 50 | `apps/control-plane/src/kernel/sso/providers.ts:327` | writer, code only, 2026-11-23 | holds (not run) |
| Attributes hint | `apps/console/src/screens/SingleSignOn.tsx:1175` | writer, code only, 2026-11-23 | holds (not run) |
| User-info option | `apps/console/src/screens/SingleSignOn.tsx:1153` | writer, code only, 2026-11-23 | holds (not run) |
| No groups notice | `apps/console/src/screens/SingleSignOn.tsx:721` | writer, code only, 2026-11-23 | holds (not run) |
