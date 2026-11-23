# Fact-check record: administer/explanation/sso/how-single-sign-on-works

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Found by subject; email once | `apps/control-plane/src/kernel/sso/people.ts:68` | writer, code only, 2026-11-23 | holds (not run) |
| Domain for members | `apps/control-plane/src/kernel/sso/people.ts:110` | writer, code only, 2026-11-23 | holds (not run) |
| trustEmail | `apps/control-plane/src/kernel/sso/people.ts:162` | writer, code only, 2026-11-23 | holds (not run) |
| email_verified false refused | `apps/control-plane/src/kernel/sso/people.ts:104` | writer, code only, 2026-11-23 | holds (not run) |
| syncGroups | `apps/control-plane/src/kernel/sso/people.ts:435` | writer, code only, 2026-11-23 | holds (not run) |
| runs_instance | `apps/control-plane/src/kernel/sso/people.ts:36` | writer, code only, 2026-11-23 | holds (not run) |
| SCIM refuses instance holders | `apps/control-plane/src/kernel/sso/scim.ts:696` | writer, code only, 2026-11-23 | holds (not run) |
| SAML replay | `apps/control-plane/src/kernel/sso/saml.ts:41` | writer, code only, 2026-11-23 | holds (not run) |
| 10 minutes | `apps/control-plane/src/kernel/sso/saml.ts:9` | writer, code only, 2026-11-23 | holds (not run) |
| Recovery code spent first | `apps/console/src/screens/SignIn.tsx:141` | writer, code only, 2026-11-23 | holds (not run) |
| Audience | `apps/control-plane/src/kernel/sso/providers.ts:85` | writer, code only, 2026-11-23 | holds (not run) |
