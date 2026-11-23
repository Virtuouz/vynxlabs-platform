# Fact-check record: administer/how-to/sso/connect-a-saml-provider

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Metadata address / Metadata; pasted wins | `apps/console/src/screens/SingleSignOn.tsx:291` | second agent, run, 2026-11-23 | holds |
| Set up values for SAML | `apps/console/src/screens/SingleSignOn.tsx:332` | second agent, run, 2026-11-23 | holds |
| Usual attribute names | `apps/control-plane/src/kernel/sso/saml.ts:233` | second agent, code, 2026-11-23 | holds |
| Name ID format options | `apps/console/src/screens/SingleSignOn.tsx:738` | second agent, code, 2026-11-23 | holds |
| Sign requests default on | `apps/console/src/screens/SingleSignOn.tsx:1079` | second agent, code, 2026-11-23 | holds |
| Encryption note | `apps/console/src/screens/SingleSignOn.tsx:1086` | second agent, code, 2026-11-23 | holds |
| SHA-1 and provider-begun sign-ins audited | `apps/console/src/screens/SingleSignOn.tsx:1093` | second agent, code, 2026-11-23 | holds |
| Transient refusal | `apps/control-plane/src/kernel/sso/saml.ts:244` | second agent, code, 2026-11-23 | holds |
| Assertion age 1 h | `apps/control-plane/src/kernel/sso/saml.ts:45` | second agent, code, 2026-11-23 | holds |
| Metadata 2 MB | `apps/control-plane/src/kernel/sso/metadata.ts:75` | second agent, code, 2026-11-23 | holds |
| SHA-1 too weak | `apps/control-plane/src/kernel/sso/saml.ts:132` | second agent, code, 2026-11-23 | holds |
| Recipient check | `apps/control-plane/src/kernel/sso/saml.ts:203` | second agent, code, 2026-11-23 | holds |
| Sign-in address works once on | `apps/console/src/screens/SingleSignOn.tsx:342` | second agent, code, 2026-11-23 | holds |
