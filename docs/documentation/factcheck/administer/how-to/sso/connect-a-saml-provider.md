# Fact-check record: administer/how-to/sso/connect-a-saml-provider

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Metadata address / Metadata; pasted wins | `apps/console/src/screens/SingleSignOn.tsx:291` | writer, run, 2026-11-23 | holds |
| Set up values for SAML | `apps/console/src/screens/SingleSignOn.tsx:332` | writer, run, 2026-11-23 | holds |
| Usual attribute names | `apps/control-plane/src/kernel/sso/saml.ts:233` | writer, code only, 2026-11-23 | holds (not run) |
| Name ID format options | `apps/console/src/screens/SingleSignOn.tsx:738` | writer, code only, 2026-11-23 | holds (not run) |
| Sign requests default on | `apps/console/src/screens/SingleSignOn.tsx:1079` | writer, code only, 2026-11-23 | holds (not run) |
| Encryption note | `apps/console/src/screens/SingleSignOn.tsx:1086` | writer, code only, 2026-11-23 | holds (not run) |
| SHA-1 and provider-begun sign-ins audited | `apps/console/src/screens/SingleSignOn.tsx:1093` | writer, code only, 2026-11-23 | holds (not run) |
| Transient refusal | `apps/control-plane/src/kernel/sso/saml.ts:244` | writer, code only, 2026-11-23 | holds (not run) |
| Assertion age 1 h | `apps/control-plane/src/kernel/sso/saml.ts:45` | writer, code only, 2026-11-23 | holds (not run) |
| Metadata 2 MB | `apps/control-plane/src/kernel/sso/metadata.ts:75` | writer, code only, 2026-11-23 | holds (not run) |
| SHA-1 too weak | `apps/control-plane/src/kernel/sso/saml.ts:132` | writer, code only, 2026-11-23 | holds (not run) |
| Recipient check | `apps/control-plane/src/kernel/sso/saml.ts:203` | writer, code only, 2026-11-23 | holds (not run) |
| Sign-in address works once on | `apps/console/src/screens/SingleSignOn.tsx:342` | writer, code only, 2026-11-23 | holds (not run) |
