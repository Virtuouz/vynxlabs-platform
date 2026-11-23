# Fact-check record: administer/explanation/sso/how-single-sign-on-works

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Found by subject; email once | `apps/control-plane/src/kernel/sso/people.ts:68` | second agent, code, 2026-11-23 | holds |
| Domain for members | `apps/control-plane/src/kernel/sso/people.ts:110` | second agent, code, 2026-11-23 | holds |
| trustEmail | `apps/control-plane/src/kernel/sso/people.ts:162` | second agent, code, 2026-11-23 | holds |
| email_verified false refused | `apps/control-plane/src/kernel/sso/people.ts:104` | second agent, code, 2026-11-23 | holds |
| syncGroups | `apps/control-plane/src/kernel/sso/people.ts:435` | second agent, code, 2026-11-23 | holds |
| runs_instance | `apps/control-plane/src/kernel/sso/people.ts:36` | second agent, code, 2026-11-23 | holds |
| SCIM refuses instance holders | `apps/control-plane/src/kernel/sso/scim.ts:696` | second agent, code, 2026-11-23 | holds |
| SAML replay | `apps/control-plane/src/kernel/sso/saml.ts:41` | second agent, code, 2026-11-23 | holds |
| 10 minutes | `apps/control-plane/src/kernel/sso/saml.ts:9` | second agent, code, 2026-11-23 | holds |
| Recovery code spent first | `apps/console/src/screens/SignIn.tsx:141` | second agent, code, 2026-11-23 | holds |
| Audience | `apps/control-plane/src/kernel/sso/providers.ts:85` | second agent, code, 2026-11-23 | holds |
