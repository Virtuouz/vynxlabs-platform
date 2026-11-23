# Fact-check record: administer/reference/screens/domains

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Page, description paragraphs, Add a hostname | `apps/console/src/screens/Domains.tsx:151` | second agent, run, 2026-11-23 | holds |
| List columns Hostname, Serves, State, Last check, Details | `apps/console/src/screens/Domains.tsx:531` | second agent, run, 2026-11-23 | holds |
| State pills incl. Verified, record gone | `apps/console/src/screens/Domains.tsx:49` | second agent, run, 2026-11-23 | holds |
| Empty state No hostnames yet | `apps/console/src/screens/Domains.tsx:558` | second agent, run, 2026-11-23 | holds |
| Add sheet: Workspace, Serves options, App, Hostname hint, buttons | `apps/console/src/screens/Domains.tsx:191` | second agent, run, 2026-11-23 | holds |
| No apps hint | `apps/console/src/screens/Domains.tsx:106` | second agent, run, 2026-11-23 | holds |
| Sheet sections 1 Point the name here / 2 Show the name agrees / 3 Check and enable | `apps/console/src/screens/Domains.tsx:420` | second agent, run, 2026-11-23 | holds |
| Step sentences (verified, record gone, not enabled...) | `apps/console/src/screens/Domains.tsx:328` | second agent, code, 2026-11-23 | holds |
| Disable confirm text | `apps/console/src/screens/Domains.tsx:376` | second agent, code, 2026-11-23 | holds |
| Remove confirm text | `apps/console/src/screens/Domains.tsx:355` | second agent, code, 2026-11-23 | holds |
| domain_not_verified text, operator may enable | `apps/console/src/screens/Domains.tsx:39` | second agent, run, 2026-11-23 | holds |
| Change what it serves | `apps/console/src/screens/Domains.tsx:261` | second agent, code, 2026-11-23 | holds |
| Needs domain:write; NotAllowed | `apps/console/src/screens/Domains.tsx:479` | second agent, code, 2026-11-23 | holds |
| TXT record name/value format | `apps/control-plane/src/kernel/apps/challenge.ts:16` | second agent, code, 2026-11-23 | holds |
| domain permissions words | `packages/manifest/src/permissions.ts:163` | second agent, code, 2026-11-23 | holds |
| State pills read On, Off, Verified, Not verified | `apps/console/src/kit/status.tsx:100` | second agent, run, 2026-11-23 | holds; the page was corrected (it had lower case) |
| Check now asks the instance for its check address; Disable adds the 404 answer; operator-enabled name says Serving. | `apps/control-plane/src/routes/apps.ts:900` | second agent, run, 2026-11-23 | holds; fault: sso unverified hostname |
