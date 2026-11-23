# Fact-check record: self-host/how-to/sso/connect-an-identity-provider-for-operators

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| No audience on the instance | `apps/console/src/screens/SingleSignOn.tsx:217` | writer, code only, 2026-11-23 | holds (not run) |
| Domains need no proof | `apps/console/src/screens/SingleSignOn.tsx:482` | writer, code only, 2026-11-23 | holds (not run) |
| No access until an operator gives it | `apps/console/src/screens/SingleSignOn.tsx:1196` | writer, code only, 2026-11-23 | holds (not run) |
| No Groups tab | `apps/console/src/screens/SingleSignOn.tsx:1333` | writer, code only, 2026-11-23 | holds (not run) |
| Operator admin keeps password | `apps/control-plane/src/kernel/sso/people.ts:581` | writer, code only, 2026-11-23 | holds (not run) |
| Other roles do not | `apps/control-plane/src/kernel/sso/people.ts:581` | writer, code only, 2026-11-23 | holds (not run) |
| no_account words | `apps/console/src/screens/SignIn.tsx:31` | writer, run, 2026-11-23 | holds |
| Role check | `apps/control-plane/src/kernel/sso/providers.ts:461` | writer, code only, 2026-11-23 | holds (not run) |
