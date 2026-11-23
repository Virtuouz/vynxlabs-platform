# Fact-check record: administer/how-to/sso/replace-a-saml-certificate

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Read the metadata again section | `apps/console/src/screens/SingleSignOn.tsx:888` | writer, run, 2026-11-23 | holds |
| Dialog text | `apps/console/src/screens/SingleSignOn.tsx:853` | writer, run, 2026-11-23 | holds |
| Success toast | `apps/console/src/screens/SingleSignOn.tsx:876` | writer, run, 2026-11-23 | holds |
| Certificates hint | `apps/console/src/screens/SingleSignOn.tsx:1052` | writer, run, 2026-11-23 | holds |
| Certificates 1 to 10 (inventory; validated by the provider code) | `apps/control-plane/src/kernel/sso/providers.ts:62` | writer, code only, 2026-11-23 | holds (not run) |
| Entity ID change audit action | `apps/control-plane/src/kernel/sso/providers.ts:644` | writer, code only, 2026-11-23 | holds (not run) |
| Saved toast | `apps/console/src/screens/SingleSignOn.tsx:1008` | writer, run, 2026-11-23 | holds |
