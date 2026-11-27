# Fact-check record: administer/how-to/sso/require-single-sign-on

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. Checked by: second agent, 2026-11-23. Method: every bold label, quoted text, permission, flag, setting name and cited line was matched to the code by script (none missing), the limits, refusal texts and sequences were read in the code, and what depends on the screen was run on the instance (see the run log). Rows below the table add what the second check found.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Recovery codes dialog | `apps/console/src/screens/Account.tsx:104` | second agent, code, 2026-11-23 | holds |
| Ten codes | `apps/control-plane/src/kernel/sso/recovery.ts:6` | second agent, code, 2026-11-23 | holds |
| Owner = direct tenant_admin | `apps/control-plane/src/kernel/sso/recovery.ts:62` | second agent, code, 2026-11-23 | holds |
| Require dialog text | `apps/console/src/screens/SingleSignOn.tsx:1425` | second agent, run, 2026-11-23 | holds |
| Required toast | `apps/console/src/screens/SingleSignOn.tsx:1436` | second agent, run, 2026-11-23 | holds |
| Operator admin keeps password | `apps/control-plane/src/kernel/sso/people.ts:581` | second agent, code, 2026-11-23 | holds |
| End users covered | `apps/control-plane/src/kernel/sso/people.ts:587` | second agent, code, 2026-11-23 | holds |
| Password refused text for members | `apps/control-plane/src/kernel/member-reset.ts:153` | second agent, code, 2026-11-23 | holds |
| Recovery sign-in button | `apps/console/src/screens/SignIn.tsx:238` | second agent, code, 2026-11-23 | holds |
| Wrong password spends the code | `apps/console/src/screens/SignIn.tsx:141` | second agent, code, 2026-11-23 | holds |
| Stop requiring dialog | `apps/console/src/screens/SingleSignOn.tsx:1417` | second agent, run, 2026-11-23 | holds |
| enforced audit action | `packages/manifest/src/audit.ts:114` | second agent, code, 2026-11-23 | holds |
| Dialog also says operators keep passwords; Stop requiring it asks "Stop requiring single sign-on?" and says "Passwords are allowed again."; recovery codes: ten, Copy all, I have kept them, reminder text | `apps/console/src/screens/SingleSignOn.tsx:1417`, `Account.tsx:104` | second agent, run, 2026-11-23 | holds (page corrected); a recovery-code sign-in was not run |
