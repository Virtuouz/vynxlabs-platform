# Fact-check record: administer/how-to/sso/require-single-sign-on

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer (area `sso`). Each line number is the first line of the file that holds the quoted text. "run" means the writer saw it on the throwaway instance (http://localhost:8091, tenant `sso-wave`); "code" means it was read in the code only. The second agent has not checked this page yet.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Recovery codes dialog | `apps/console/src/screens/Account.tsx:104` | writer, code only, 2026-11-23 | holds (not run) |
| Ten codes | `apps/control-plane/src/kernel/sso/recovery.ts:6` | writer, code only, 2026-11-23 | holds (not run) |
| Owner = direct tenant_admin | `apps/control-plane/src/kernel/sso/recovery.ts:62` | writer, code only, 2026-11-23 | holds (not run) |
| Require dialog text | `apps/console/src/screens/SingleSignOn.tsx:1425` | writer, run, 2026-11-23 | holds |
| Required toast | `apps/console/src/screens/SingleSignOn.tsx:1436` | writer, run, 2026-11-23 | holds |
| Operator admin keeps password | `apps/control-plane/src/kernel/sso/people.ts:581` | writer, code only, 2026-11-23 | holds (not run) |
| End users covered | `apps/control-plane/src/kernel/sso/people.ts:587` | writer, code only, 2026-11-23 | holds (not run) |
| Password refused text for members | `apps/control-plane/src/kernel/member-reset.ts:153` | writer, code only, 2026-11-23 | holds (not run) |
| Recovery sign-in button | `apps/console/src/screens/SignIn.tsx:238` | writer, code only, 2026-11-23 | holds (not run) |
| Wrong password spends the code | `apps/console/src/screens/SignIn.tsx:141` | writer, code only, 2026-11-23 | holds (not run) |
| Stop requiring dialog | `apps/console/src/screens/SingleSignOn.tsx:1417` | writer, run, 2026-11-23 | holds |
| enforced audit action | `packages/manifest/src/audit.ts:114` | writer, code only, 2026-11-23 | holds (not run) |
