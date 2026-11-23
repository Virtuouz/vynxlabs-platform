# Fact-check record: administer/reference/sso/refusals

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Refusal words (every reason) as the sign-in screen has them | `apps/console/src/screens/SignIn.tsx:14` | writer, code only, 2026-11-23 | holds (not run) |
| Reasons list | `apps/control-plane/src/kernel/sso/people.ts:36` | writer, code only, 2026-11-23 | holds (not run) |
| wrong_browser reason and message | `apps/control-plane/src/kernel/sso/flow.ts:461` | writer, code only, 2026-11-23 | holds (not run) |
| sso.refused audit action with reason | `apps/control-plane/src/kernel/sso/flow.ts:297` | writer, code only, 2026-11-23 | holds (not run) |
| 10 minutes to answer | `apps/control-plane/src/kernel/sso/saml.ts:9` | writer, code only, 2026-11-23 | holds (not run) |
| 120 seconds for the last step | `apps/control-plane/src/kernel/sso/flow.ts:23` | writer, code only, 2026-11-23 | holds (not run) |
| 60 seconds skew and 1 hour age | `apps/control-plane/src/kernel/sso/saml.ts:44` | writer, code only, 2026-11-23 | holds (not run) |
| Metadata 2 MB | `apps/control-plane/src/kernel/sso/metadata.ts:5` | writer, code only, 2026-11-23 | holds (not run) |
| Member routes 60 a minute | `apps/control-plane/src/routes/sso.ts:155` | writer, code only, 2026-11-23 | holds (not run) |
| End users 30 starts and 300 answers per 60 s | `apps/control-plane/src/kernel/apps/front.ts:609` | writer, code only, 2026-11-23 | holds (not run) |
| Transient name ID refusal | `apps/control-plane/src/kernel/sso/saml.ts:243` | writer, code only, 2026-11-23 | holds (not run) |
| SHA-1 too weak message | `apps/control-plane/src/kernel/sso/saml.ts:132` | writer, code only, 2026-11-23 | holds (not run) |
| Unknown reason fallback | `apps/console/src/screens/SignIn.tsx:45` | writer, code only, 2026-11-23 | holds (not run) |
