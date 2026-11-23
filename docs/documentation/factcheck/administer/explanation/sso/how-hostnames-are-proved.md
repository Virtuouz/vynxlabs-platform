# Fact-check record: administer/explanation/sso/how-hostnames-are-proved

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Keyed hash | `apps/control-plane/src/kernel/apps/challenge.ts:16` | writer, code only, 2026-11-23 | holds (not run) |
| One record both | `apps/control-plane/src/kernel/apps/challenge.ts:11` | writer, code only, 2026-11-23 | holds (not run) |
| Stays verified | `apps/console/src/screens/Domains.tsx:316` | writer, code only, 2026-11-23 | holds (not run) |
| Not served here | `apps/control-plane/src/kernel/apps/front.ts:1457` | writer, code only, 2026-11-23 | holds (not run) |
| 30 s | `apps/control-plane/src/kernel/apps/hosts.ts:29` | writer, code only, 2026-11-23 | holds (not run) |
| Operator enables | `apps/console/src/screens/Domains.tsx:39` | writer, code only, 2026-11-23 | holds (not run) |
| No certificate | `apps/console/src/screens/Domains.tsx:485` | writer, code only, 2026-11-23 | holds (not run) |
| One provider per domain | `apps/control-plane/src/kernel/sso/providers.ts:843` | writer, code only, 2026-11-23 | holds (not run) |
