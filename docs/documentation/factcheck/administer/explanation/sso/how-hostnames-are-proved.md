# Fact-check record: administer/explanation/sso/how-hostnames-are-proved

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Keyed hash | `apps/control-plane/src/kernel/apps/challenge.ts:16` | second agent, code, 2026-11-23 | holds |
| One record both | `apps/control-plane/src/kernel/apps/challenge.ts:11` | second agent, code, 2026-11-23 | holds |
| Stays verified | `apps/console/src/screens/Domains.tsx:316` | second agent, code, 2026-11-23 | holds |
| Not served here | `apps/control-plane/src/kernel/apps/front.ts:1457` | second agent, code, 2026-11-23 | holds |
| 30 s | `apps/control-plane/src/kernel/apps/hosts.ts:29` | second agent, code, 2026-11-23 | holds |
| Operator enables | `apps/console/src/screens/Domains.tsx:39` | second agent, code, 2026-11-23 | holds |
| No certificate | `apps/console/src/screens/Domains.tsx:485` | second agent, code, 2026-11-23 | holds |
| One provider per domain | `apps/control-plane/src/kernel/sso/providers.ts:843` | second agent, code, 2026-11-23 | holds |
