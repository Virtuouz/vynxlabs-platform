# Fact-check record: administer/how-to/sso/prove-an-email-domain

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add domain message | `apps/console/src/screens/SingleSignOn.tsx:484` | writer, run, 2026-11-23 | holds |
| Record name and value | `apps/control-plane/src/kernel/apps/challenge.ts:15` | writer, run, 2026-11-23 | holds |
| Check failure text | `apps/control-plane/src/routes/sso.ts:485` | writer, run, 2026-11-23 | holds |
| Check now only with a record | `apps/console/src/screens/SingleSignOn.tsx:522` | writer, code only, 2026-11-23 | holds (not run) |
| One provider per domain of members | `apps/control-plane/src/kernel/sso/providers.ts:843` | writer, code only, 2026-11-23 | holds (not run) |
| Record gone: stays proved | `apps/console/src/screens/Domains.tsx:316` | writer, code only, 2026-11-23 | holds (not run) |
| Domain removal text | `apps/console/src/screens/SingleSignOn.tsx:536` | writer, code only, 2026-11-23 | holds (not run) |
| record_gone audit action | `packages/manifest/src/audit.ts:106` | writer, code only, 2026-11-23 | holds (not run) |
| Members need the domain | `apps/control-plane/src/kernel/sso/people.ts:110` | writer, code only, 2026-11-23 | holds (not run) |
