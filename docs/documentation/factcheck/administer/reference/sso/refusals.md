# Fact-check record: administer/reference/sso/refusals

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Refusal words (every reason) as the sign-in screen has them | `apps/console/src/screens/SignIn.tsx:14` | second agent, code, 2026-11-23 | holds |
| Reasons list | `apps/control-plane/src/kernel/sso/people.ts:36` | second agent, code, 2026-11-23 | holds |
| wrong_browser reason and message | `apps/control-plane/src/kernel/sso/flow.ts:461` | second agent, code, 2026-11-23 | holds |
| sso.refused audit action with reason | `apps/control-plane/src/kernel/sso/flow.ts:297` | second agent, code, 2026-11-23 | holds |
| 10 minutes to answer | `apps/control-plane/src/kernel/sso/saml.ts:9` | second agent, code, 2026-11-23 | holds |
| 120 seconds for the last step | `apps/control-plane/src/kernel/sso/flow.ts:23` | second agent, code, 2026-11-23 | holds |
| 60 seconds skew and 1 hour age | `apps/control-plane/src/kernel/sso/saml.ts:44` | second agent, code, 2026-11-23 | holds |
| Metadata 2 MB | `apps/control-plane/src/kernel/sso/metadata.ts:5` | second agent, code, 2026-11-23 | holds |
| Member routes 60 a minute | `apps/control-plane/src/routes/sso.ts:155` | second agent, code, 2026-11-23 | holds |
| End users 30 starts and 300 answers per 60 s | `apps/control-plane/src/kernel/apps/front.ts:609` | second agent, code, 2026-11-23 | holds |
| Transient name ID refusal | `apps/control-plane/src/kernel/sso/saml.ts:243` | second agent, code, 2026-11-23 | holds |
| SHA-1 too weak message | `apps/control-plane/src/kernel/sso/saml.ts:132` | second agent, code, 2026-11-23 | holds |
| Unknown reason fallback | `apps/console/src/screens/SignIn.tsx:45` | second agent, code, 2026-11-23 | holds |
| An end user at a portal sees "You could not be signed in" with the refusal's own message, not the console's words | `apps/control-plane/src/kernel/apps/front.ts:643` | second agent, run, 2026-11-23 | page corrected; new product fault: the two sign-in screens word one reason differently |
