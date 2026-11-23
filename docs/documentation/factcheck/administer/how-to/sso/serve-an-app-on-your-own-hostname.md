# Fact-check record: administer/how-to/sso/serve-an-app-on-your-own-hostname

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Add a hostname sheet | `apps/console/src/screens/Domains.tsx:151` | second agent, run, 2026-11-23 | holds |
| Opens off and not verified | `apps/console/src/screens/Domains.tsx:329` | second agent, run, 2026-11-23 | holds |
| TXT record shown | `apps/console/src/screens/Domains.tsx:433` | second agent, run, 2026-11-23 | holds |
| Check failure text | `apps/control-plane/src/routes/apps.ts:903` | second agent, run, 2026-11-23 | holds |
| Operator enables unverified | `apps/console/src/screens/Domains.tsx:39` | second agent, run, 2026-11-23 | holds |
| Change what it serves | `apps/console/src/screens/Domains.tsx:261` | second agent, code, 2026-11-23 | holds |
| Disable and Remove end sign-ins | `apps/console/src/screens/Domains.tsx:355` | second agent, code, 2026-11-23 | holds |
| Not served here | `apps/control-plane/src/kernel/apps/front.ts:1457` | second agent, code, 2026-11-23 | holds |
| 30 seconds | `apps/control-plane/src/kernel/apps/hosts.ts:29` | second agent, code, 2026-11-23 | holds |
| No certificate | `apps/console/src/screens/Domains.tsx:485` | second agent, code, 2026-11-23 | holds |
| No apps hint | `apps/console/src/screens/Domains.tsx:106` | second agent, code, 2026-11-23 | holds |
| Merged from give-an-app-a-hostname: Domains read-only text, state labels On, Off, Verified, Not verified | `apps/console/src/kit/Can.tsx:176`, `apps/console/src/kit/status.tsx:100` | second agent, run, 2026-11-23 | holds; the page said **on**/**verified** in lower case and was corrected |
| Check now also asks the instance for its check address; failure text kept and the name stays verified | `apps/control-plane/src/routes/apps.ts:900` | second agent, code, 2026-11-23 | holds |
| Verified and off answers 404 "This hostname is not served here. Its registration is turned off."; a name never verified opens the instance's own address | `apps/control-plane/src/kernel/apps/hosts.ts:130`, `front.ts:1450` | second agent, run, 2026-11-23 | holds (request with the name in Host) |
| Operator enables an unverified name: it is served, the step says "Serving." | `apps/control-plane/src/routes/apps.ts:985` | second agent, run, 2026-11-23 | holds; fault: sso unverified hostname (the words are true today; revisit when the fix lands) |
| Verified, then record gone after Check now; Disable and Remove confirmations; Change what it serves | `apps/console/src/screens/Domains.tsx:355` | second agent, run, 2026-11-23 | holds (verified_at set in the database, no DNS here) |
| Refusals: not a hostname, instance's own address, already registered, held by another tenant | `apps/control-plane/src/routes/apps.ts:774` | second agent, run, 2026-11-23 | holds (API); the console shows the same words |
| App row Address, inspector Hostname / Hostname (off); rename redirects with 308 | `apps/console/src/screens/Apps.tsx:581`, `front.ts:888` | second agent, code, 2026-11-23 | holds |
| Walked at 390 px, dark and light, 1440 px | - | second agent, run, 2026-11-23 | holds; no horizontal scroll |
