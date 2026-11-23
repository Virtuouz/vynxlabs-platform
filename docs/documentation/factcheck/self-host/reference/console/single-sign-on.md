# Fact-check record: self-host/reference/console/single-sign-on

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Instance page description and empty state | `apps/console/src/screens/SingleSignOn.tsx:1600` | second agent, code, 2026-11-23 | holds |
| No audience choice on the instance | `apps/console/src/screens/SingleSignOn.tsx:217` | second agent, code, 2026-11-23 | holds |
| Instance domains: 'It needs no proof here' | `apps/console/src/screens/SingleSignOn.tsx:482` | second agent, code, 2026-11-23 | holds |
| No Groups tab on the instance | `apps/console/src/screens/SingleSignOn.tsx:1333` | second agent, code, 2026-11-23 | holds |
| No role picker on the instance | `apps/console/src/screens/SingleSignOn.tsx:1203` | second agent, code, 2026-11-23 | holds |
| Instance provision hint: no access until an operator gives it | `apps/console/src/screens/SingleSignOn.tsx:1196` | second agent, code, 2026-11-23 | holds |
| Instance provisioning text: disabled everywhere | `apps/console/src/screens/Provisioning.tsx:260` | second agent, code, 2026-11-23 | holds |
| Needs instance:write | `apps/console/src/screens/SingleSignOn.tsx:1366` | second agent, code, 2026-11-23 | holds |
| Operator admin keeps a password | `apps/control-plane/src/kernel/sso/people.ts:581` | second agent, code, 2026-11-23 | holds |
| no_account words | `apps/console/src/screens/SignIn.tsx:31` | second agent, run, 2026-11-23 | holds |
