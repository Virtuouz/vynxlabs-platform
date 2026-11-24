# Fact-check record: administer/how-to/sso/prove-an-email-domain

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add domain message | `apps/console/src/screens/SingleSignOn.tsx:484` | second agent, run, 2026-11-23 | holds |
| Record name and value | `apps/control-plane/src/kernel/apps/challenge.ts:15` | second agent, run, 2026-11-23 | holds |
| Check failure text | `apps/control-plane/src/routes/sso.ts:485` | second agent, run, 2026-11-23 | holds |
| Check now only with a record | `apps/console/src/screens/SingleSignOn.tsx:522` | second agent, code, 2026-11-23 | holds |
| One provider per domain of members | `apps/control-plane/src/kernel/sso/providers.ts:843` | second agent, code, 2026-11-23 | holds |
| Record gone: stays proved | `apps/console/src/screens/Domains.tsx:316` | second agent, code, 2026-11-23 | holds |
| Domain removal text | `apps/console/src/screens/SingleSignOn.tsx:536` | second agent, code, 2026-11-23 | holds |
| record_gone audit action | `packages/manifest/src/audit.ts:106` | second agent, code, 2026-11-23 | holds |
| Members need the domain | `apps/control-plane/src/kernel/sso/people.ts:110` | second agent, code, 2026-11-23 | holds |
