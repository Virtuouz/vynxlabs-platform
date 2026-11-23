# Fact-check record: administer/how-to/sso/serve-an-app-on-your-own-hostname

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add a hostname sheet | `apps/console/src/screens/Domains.tsx:151` | writer, run, 2026-11-23 | holds |
| Opens off and not verified | `apps/console/src/screens/Domains.tsx:329` | writer, run, 2026-11-23 | holds |
| TXT record shown | `apps/console/src/screens/Domains.tsx:433` | writer, run, 2026-11-23 | holds |
| Check failure text | `apps/control-plane/src/routes/apps.ts:903` | writer, run, 2026-11-23 | holds |
| Operator enables unverified | `apps/console/src/screens/Domains.tsx:39` | writer, run, 2026-11-23 | holds |
| Change what it serves | `apps/console/src/screens/Domains.tsx:261` | writer, code only, 2026-11-23 | holds (not run) |
| Disable and Remove end sign-ins | `apps/console/src/screens/Domains.tsx:355` | writer, code only, 2026-11-23 | holds (not run) |
| Not served here | `apps/control-plane/src/kernel/apps/front.ts:1457` | writer, code only, 2026-11-23 | holds (not run) |
| 30 seconds | `apps/control-plane/src/kernel/apps/hosts.ts:29` | writer, code only, 2026-11-23 | holds (not run) |
| No certificate | `apps/console/src/screens/Domains.tsx:485` | writer, code only, 2026-11-23 | holds (not run) |
| No apps hint | `apps/console/src/screens/Domains.tsx:106` | writer, code only, 2026-11-23 | holds (not run) |
