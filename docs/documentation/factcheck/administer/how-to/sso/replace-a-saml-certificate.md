# Fact-check record: administer/how-to/sso/replace-a-saml-certificate

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Read the metadata again section | `apps/console/src/screens/SingleSignOn.tsx:888` | second agent, run, 2026-11-23 | holds |
| Dialog text | `apps/console/src/screens/SingleSignOn.tsx:853` | second agent, run, 2026-11-23 | holds |
| Success toast | `apps/console/src/screens/SingleSignOn.tsx:876` | second agent, run, 2026-11-23 | holds |
| Certificates hint | `apps/console/src/screens/SingleSignOn.tsx:1052` | second agent, run, 2026-11-23 | holds |
| Certificates 1 to 10 (inventory; validated by the provider code) | `apps/control-plane/src/kernel/sso/providers.ts:62` | second agent, code, 2026-11-23 | holds |
| Entity ID change audit action | `apps/control-plane/src/kernel/sso/providers.ts:644` | second agent, code, 2026-11-23 | holds |
| Saved toast | `apps/console/src/screens/SingleSignOn.tsx:1008` | second agent, run, 2026-11-23 | holds |
| A real change of certificate: a new realm key at the provider makes a try fail with "Invalid signature"; reading the metadata lists both; removing the old by hand and saving still passes | `apps/control-plane/src/kernel/sso/saml.ts:128` | second agent, run, 2026-11-23 | holds (Keycloak; page's failure row corrected to the console's words) |
| At most 10 certificates | `apps/control-plane/src/kernel/sso/providers.ts:398` | second agent, code, 2026-11-23 | holds |
